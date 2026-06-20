import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/core/errors/AppError';
import { saveAudioChunk } from '../../src/core/storage/chunkRepository';
import { getDB } from '../../src/core/storage/db';
import { createRecording, getRecording } from '../../src/core/storage/recordingRepository';
import { TranscriptionOrchestrator } from '../../src/core/transcription/TranscriptionOrchestrator';
import type { TranscriptionProvider } from '../../src/core/transcription/TranscriptionProvider';

describe('TranscriptionOrchestrator', () => {
  beforeEach(async () => {
    const db = await getDB();
    await db.clear('recordings');
    await db.clear('audioChunks');
  });

  it('uses the provided transcription adapter and stores completed chunks', async () => {
    await createRecording({
      id: 'rec-1',
      startedAt: new Date('2026-06-19T10:00:00.000Z').toISOString(),
      status: 'transcribing',
      sourceType: 'browser_tab',
      modelProvider: 'groq',
      modelName: 'whisper-large-v3-turbo',
      diarization: false,
    });
    await saveAudioChunk({
      recordingId: 'rec-1',
      index: 0,
      offsetMs: 0,
      blob: new Blob(['audio']),
      sizeBytes: 5,
      mimeType: 'audio/webm',
    });

    const provider: TranscriptionProvider = {
      id: 'groq',
      transcribeAudioChunk: vi.fn().mockResolvedValue({
        text: 'Hello',
        language: 'en',
        segments: [
          {
            id: 0,
            seek: 0,
            start: 0,
            end: 1,
            text: 'Hello',
            tokens: [],
            temperature: 0,
            avg_logprob: 0,
            compression_ratio: 1,
            no_speech_prob: 0,
          },
        ],
      }),
    };

    const result = await new TranscriptionOrchestrator({
      recordingId: 'rec-1',
      apiKey: 'gsk_test',
      provider,
    }).run();

    expect(provider.transcribeAudioChunk).toHaveBeenCalledTimes(1);
    expect(result.markdown).toContain('Hello');
    expect((await getRecording('rec-1'))?.status).toBe('completed');
  });

  it('preserves GROQ_RATE_LIMITED on recording and failed chunk state', async () => {
    await createRecording({
      id: 'rec-1',
      startedAt: new Date('2026-06-19T10:00:00.000Z').toISOString(),
      status: 'transcribing',
      sourceType: 'browser_tab',
      modelProvider: 'groq',
      modelName: 'whisper-large-v3-turbo',
      diarization: false,
    });
    await saveAudioChunk({
      recordingId: 'rec-1',
      index: 0,
      offsetMs: 0,
      blob: new Blob(['audio']),
      sizeBytes: 5,
      mimeType: 'audio/webm',
    });

    const provider: TranscriptionProvider = {
      id: 'groq',
      transcribeAudioChunk: vi
        .fn()
        .mockRejectedValue(
          new AppError(
            'GROQ_RATE_LIMITED',
            'Groq rate limit reached. Your audio chunks were saved locally. Retry transcription later.',
          ),
        ),
    };

    await new TranscriptionOrchestrator({
      recordingId: 'rec-1',
      apiKey: 'gsk_test',
      provider,
    }).run();

    const recording = await getRecording('rec-1');
    expect(recording?.status).toBe('partial_transcript_failed');
    expect(recording?.errorCode).toBe('GROQ_RATE_LIMITED');
    expect(recording?.errorMessage).toContain('Retry transcription later');
  });
});
