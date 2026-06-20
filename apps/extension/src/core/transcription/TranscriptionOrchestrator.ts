import { AppError } from '../errors/AppError';
import {
  listAudioChunksByRecordingId,
  updateAudioChunk,
  updateRecording,
  getRecording,
} from '../storage';
import { sleep } from '../utils/sleep';
import { createGroqTranscriptionProvider } from './GroqTranscriptionClient';
import { mergeTranscripts, type MergedTranscript } from './transcriptMerger';
import type { ErrorCode } from '../errors/errorCodes';
import type { TranscriptionProvider } from './TranscriptionProvider';

const INTER_CHUNK_TRANSCRIPTION_DELAY_MS = 1_500;

export type TranscriptionOrchestratorOptions = {
  recordingId: string;
  apiKey: string;
  language?: string;
  model?: string;
  onProgress?: (completed: number, total: number, currentIndex: number) => void;
  onChunkCompleted?: (chunkIndex: number) => void;
  onChunkFailed?: (chunkIndex: number, error: AppError) => void;
  provider?: TranscriptionProvider;
};

export class TranscriptionOrchestrator {
  private stopped = false;

  constructor(private options: TranscriptionOrchestratorOptions) {}

  stop(): void {
    this.stopped = true;
  }

  async run(): Promise<MergedTranscript> {
    const recording = await getRecording(this.options.recordingId);
    if (!recording) {
      throw new AppError('AUDIO_CHUNK_MISSING', 'Recording not found for transcription');
    }

    await updateRecording(this.options.recordingId, { status: 'transcribing' });

    const chunks = await listAudioChunksByRecordingId(this.options.recordingId);
    const ordered = [...chunks].sort((a, b) => a.index - b.index);

    for (let i = 0; i < ordered.length; i += 1) {
      if (ordered[i].index !== i) {
        throw new AppError(
          'AUDIO_CHUNK_SEQUENCE_BROKEN',
          `Missing or out-of-order audio chunk at index ${i}`,
        );
      }
    }

    let completedCount = 0;
    let anyFailed = false;
    let firstFailureCode: ErrorCode | undefined;
    let firstFailureMessage: string | undefined;
    const provider = this.options.provider ?? createGroqTranscriptionProvider();

    for (const chunk of ordered) {
      if (this.stopped) {
        anyFailed = true;
        break;
      }

      if (chunk.transcriptionStatus === 'completed') {
        completedCount += 1;
        this.options.onProgress?.(completedCount, ordered.length, chunk.index);
        continue;
      }

      await updateAudioChunk(chunk.id, { transcriptionStatus: 'transcribing' });
      this.options.onProgress?.(completedCount, ordered.length, chunk.index);

      try {
        const result = await provider.transcribeAudioChunk(chunk.blob, {
          apiKey: this.options.apiKey,
          model: this.options.model,
          language: this.options.language,
          retries: 3,
        });

        await updateAudioChunk(chunk.id, {
          transcriptionStatus: 'completed',
          transcriptionAttempts: chunk.transcriptionAttempts + 1,
          transcriptSegments: result.segments,
          groqRawResponse: {
            text: result.text,
            segments: result.segments,
            language: result.language,
          },
          errorCode: undefined,
          errorMessage: undefined,
        });

        completedCount += 1;
        this.options.onChunkCompleted?.(chunk.index);
      } catch (error) {
        const appError =
          error instanceof AppError
            ? error
            : new AppError(
                'GROQ_TRANSCRIPTION_FAILED',
                error instanceof Error ? error.message : 'Transcription failed',
                error,
              );

        await updateAudioChunk(chunk.id, {
          transcriptionStatus: 'failed',
          transcriptionAttempts: chunk.transcriptionAttempts + 1,
          errorCode: appError.code,
          errorMessage: appError.message,
        });

        anyFailed = true;
        firstFailureCode ??= appError.code;
        firstFailureMessage ??= appError.message;
        this.options.onChunkFailed?.(chunk.index, appError);

        if (
          appError.code === 'GROQ_INVALID_API_KEY' ||
          appError.code === 'GROQ_QUOTA_EXCEEDED' ||
          appError.code === 'GROQ_RATE_LIMITED'
        ) {
          await updateRecording(this.options.recordingId, {
            status: 'partial_transcript_failed',
            errorCode: appError.code,
            errorMessage: appError.message,
          });
          break;
        }
      }

      await sleep(INTER_CHUNK_TRANSCRIPTION_DELAY_MS);
    }

    const freshChunks = await listAudioChunksByRecordingId(this.options.recordingId);
    const merged = mergeTranscripts(
      recording.id,
      recording.createdAt,
      recording.durationMs ?? 0,
      freshChunks,
    );

    const finalStatus = anyFailed ? 'partial_transcript_failed' : 'completed';
    await updateRecording(this.options.recordingId, {
      status: finalStatus,
      transcriptMarkdown: merged.markdown,
      transcriptJson: merged.json,
      audioChunkCount: freshChunks.length,
      errorCode: anyFailed ? (firstFailureCode ?? 'GROQ_TRANSCRIPTION_FAILED') : undefined,
      errorMessage: anyFailed
        ? (firstFailureMessage ?? 'One or more audio chunks failed to transcribe')
        : undefined,
    });

    return merged;
  }
}
