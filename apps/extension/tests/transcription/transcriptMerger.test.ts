import { describe, it, expect } from 'vitest';
import { mergeTranscripts } from '../../src/core/transcription/transcriptMerger';
import type { AudioChunkEntity } from '../../src/core/storage/chunkRepository';
import type { GroqTranscriptionSegment } from '../../src/core/transcription/transcriptionTypes';

function makeChunk(
  index: number,
  offsetMs: number,
  status: AudioChunkEntity['transcriptionStatus'],
  segments: GroqTranscriptionSegment[] = [],
  language?: string,
): AudioChunkEntity {
  return {
    id: `chunk-${index}`,
    recordingId: 'rec-1',
    index,
    offsetMs,
    createdAt: new Date().toISOString(),
    blob: new Blob(),
    sizeBytes: 1,
    mimeType: 'audio/webm',
    transcriptionStatus: status,
    transcriptionAttempts: status === 'completed' ? 1 : 0,
    transcriptSegments: segments,
    groqRawResponse: language ? { language } : undefined,
    errorCode: status === 'failed' ? 'GROQ_TRANSCRIPTION_FAILED' : undefined,
    errorMessage: status === 'failed' ? 'Failed' : undefined,
  };
}

describe('transcriptMerger', () => {
  it('merges chunks in order and applies offset to timestamps', () => {
    const chunks = [
      makeChunk(0, 0, 'completed', [
        {
          id: 0,
          seek: 0,
          start: 0,
          end: 5,
          text: 'Hello',
          tokens: [],
          temperature: 0,
          avg_logprob: 0,
          compression_ratio: 1,
          no_speech_prob: 0,
        },
      ]),
      makeChunk(1, 180_000, 'completed', [
        {
          id: 1,
          seek: 0,
          start: 0,
          end: 4,
          text: 'World',
          tokens: [],
          temperature: 0,
          avg_logprob: 0,
          compression_ratio: 1,
          no_speech_prob: 0,
        },
      ]),
    ];

    const merged = mergeTranscripts('rec-1', '2026-06-19T10:00:00.000Z', 190_000, chunks);

    expect(merged.json.segments).toEqual([
      { startMs: 0, endMs: 5_000, text: 'Hello' },
      { startMs: 180_000, endMs: 184_000, text: 'World' },
    ]);
    expect(merged.plainText).toContain('[00:00:00] Hello');
    expect(merged.plainText).toContain('[00:03:00] World');
  });

  it('sorts out-of-order chunks by index', () => {
    const chunks = [
      makeChunk(1, 180_000, 'completed', [
        {
          id: 0,
          seek: 0,
          start: 0,
          end: 4,
          text: 'Second',
          tokens: [],
          temperature: 0,
          avg_logprob: 0,
          compression_ratio: 1,
          no_speech_prob: 0,
        },
      ]),
      makeChunk(0, 0, 'completed', [
        {
          id: 1,
          seek: 0,
          start: 0,
          end: 5,
          text: 'First',
          tokens: [],
          temperature: 0,
          avg_logprob: 0,
          compression_ratio: 1,
          no_speech_prob: 0,
        },
      ]),
    ];

    const merged = mergeTranscripts('rec-1', '2026-06-19T10:00:00.000Z', 190_000, chunks);
    expect(merged.json.segments[0].text).toBe('First');
    expect(merged.json.segments[1].text).toBe('Second');
  });

  it('throws when chunk sequence is broken', () => {
    const chunks = [
      makeChunk(0, 0, 'completed', [
        {
          id: 0,
          seek: 0,
          start: 0,
          end: 1,
          text: 'First',
          tokens: [],
          temperature: 0,
          avg_logprob: 0,
          compression_ratio: 1,
          no_speech_prob: 0,
        },
      ]),
      makeChunk(2, 180_000, 'completed', [
        {
          id: 1,
          seek: 0,
          start: 0,
          end: 1,
          text: 'Third',
          tokens: [],
          temperature: 0,
          avg_logprob: 0,
          compression_ratio: 1,
          no_speech_prob: 0,
        },
      ]),
    ];

    expect(() => mergeTranscripts('rec-1', '2026-06-19T10:00:00.000Z', 190_000, chunks)).toThrow(
      'Missing or out-of-order audio chunk',
    );
  });

  it('includes explicit gap marker for failed chunks', () => {
    const chunks = [
      makeChunk(0, 0, 'completed', [
        {
          id: 0,
          seek: 0,
          start: 0,
          end: 1,
          text: 'First',
          tokens: [],
          temperature: 0,
          avg_logprob: 0,
          compression_ratio: 1,
          no_speech_prob: 0,
        },
      ]),
      makeChunk(1, 180_000, 'failed'),
    ];

    const merged = mergeTranscripts('rec-1', '2026-06-19T10:00:00.000Z', 190_000, chunks);

    expect(merged.markdown).toContain('[00:03:00] [Transcription failed for this audio segment]');
    expect(merged.json.failedChunks).toEqual([
      {
        chunkIndex: 1,
        offsetMs: 180_000,
        errorCode: 'GROQ_TRANSCRIPTION_FAILED',
        errorMessage: 'Failed',
      },
    ]);
  });

  it('handles empty chunks gracefully', () => {
    const chunks: AudioChunkEntity[] = [];
    const merged = mergeTranscripts('rec-1', '2026-06-19T10:00:00.000Z', 0, chunks);
    expect(merged.json.segments).toEqual([]);
    expect(merged.markdown).toContain('(No transcribed speech)');
  });

  it('persists the dominant transcription language', () => {
    const segment: GroqTranscriptionSegment = {
      id: 0,
      seek: 0,
      start: 0,
      end: 1,
      text: 'Hola',
      tokens: [],
      temperature: 0,
      avg_logprob: 0,
      compression_ratio: 1,
      no_speech_prob: 0,
    };
    const chunks = [
      makeChunk(0, 0, 'completed', [segment], 'es'),
      makeChunk(1, 180_000, 'completed', [{ ...segment, text: 'seguimos' }], 'es'),
      makeChunk(2, 360_000, 'completed', [{ ...segment, text: 'hello' }], 'en'),
    ];

    const merged = mergeTranscripts('rec-1', '2026-06-19T10:00:00.000Z', 370_000, chunks);

    expect(merged.json.language).toBe('es');
    expect(merged.markdown).toContain('- Language: es');
  });
});
