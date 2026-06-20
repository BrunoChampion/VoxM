import type { AudioChunkEntity } from '../storage/chunkRepository';
import type {
  TranscriptSegment,
  TranscriptJson,
  FailedChunk,
  GroqTranscriptionSegment,
} from './transcriptionTypes';
import { formatDuration } from '../utils/formatDuration';

function normalizeSegment(segment: GroqTranscriptionSegment, offsetMs: number): TranscriptSegment {
  return {
    startMs: Math.max(0, Math.round(offsetMs + segment.start * 1000)),
    endMs: Math.max(0, Math.round(offsetMs + segment.end * 1000)),
    text: segment.text.trim(),
  };
}

export type MergedTranscript = {
  markdown: string;
  json: TranscriptJson;
  plainText: string;
};

type TranscriptEntry =
  | { kind: 'segment'; startMs: number; endMs: number; text: string }
  | { kind: 'failed'; startMs: number; text: string };

export function assertNoMissingAudioIndexes(chunks: AudioChunkEntity[]): void {
  for (let i = 0; i < chunks.length; i += 1) {
    if (chunks[i].index !== i) {
      throw new Error(`Missing or out-of-order audio chunk at index ${i}`);
    }
  }
}

function formatTimestamp(ms: number): string {
  return formatDuration(ms);
}

function normalizeTextForDedupe(text: string): string {
  return text.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function removeOverlapDuplicates(segments: TranscriptSegment[]): TranscriptSegment[] {
  const deduped: TranscriptSegment[] = [];

  for (const segment of segments) {
    const normalized = normalizeTextForDedupe(segment.text);
    const duplicate = deduped
      .slice(-6)
      .some(
        (candidate) =>
          Math.abs(candidate.startMs - segment.startMs) <= 3_000 &&
          normalizeTextForDedupe(candidate.text) === normalized,
      );

    if (!duplicate) {
      deduped.push(segment);
    }
  }

  return deduped;
}

export function mergeTranscripts(
  recordingId: string,
  createdAt: string,
  durationMs: number,
  chunks: AudioChunkEntity[],
): MergedTranscript {
  const ordered = [...chunks].sort((a, b) => a.index - b.index);
  assertNoMissingAudioIndexes(ordered);

  const rawSegments: TranscriptSegment[] = [];
  const failedChunks: FailedChunk[] = [];
  const failedEntries: TranscriptEntry[] = [];

  for (const chunk of ordered) {
    if (chunk.transcriptionStatus === 'completed' && chunk.transcriptSegments) {
      for (const rawSegment of chunk.transcriptSegments) {
        const segment = normalizeSegment(rawSegment as GroqTranscriptionSegment, chunk.offsetMs);
        if (segment.text) {
          rawSegments.push(segment);
        }
      }
    } else {
      failedChunks.push({
        chunkIndex: chunk.index,
        offsetMs: chunk.offsetMs,
        errorCode: chunk.errorCode ?? 'GROQ_TRANSCRIPTION_FAILED',
        errorMessage: chunk.errorMessage ?? 'Transcription failed for this audio segment',
      });
      failedEntries.push({
        kind: 'failed',
        startMs: chunk.offsetMs,
        text: '[Transcription failed for this audio segment]',
      });
    }
  }

  const segments = removeOverlapDuplicates(
    rawSegments.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs),
  );
  const entries: TranscriptEntry[] = [
    ...segments.map((segment) => ({
      kind: 'segment' as const,
      startMs: segment.startMs,
      endMs: segment.endMs,
      text: segment.text,
    })),
    ...failedEntries,
  ].sort((a, b) => a.startMs - b.startMs);
  const plainText = entries
    .map((entry) => `[${formatTimestamp(entry.startMs)}] ${entry.text}`)
    .join('\n');

  const markdown = `# Meeting Transcript

- Date: ${createdAt.slice(0, 10)}
- Duration: ${formatTimestamp(durationMs)}
- Source: Browser tab recording
- Model: Groq whisper-large-v3-turbo
- Diarization: Not included in V1

## Transcript

${plainText || '(No transcribed speech)'}
`;

  const json: TranscriptJson = {
    recordingId,
    createdAt,
    durationMs,
    source: 'browser-tab',
    model: 'whisper-large-v3-turbo',
    diarization: false,
    segments,
    failedChunks,
  };

  return { markdown, json, plainText };
}
