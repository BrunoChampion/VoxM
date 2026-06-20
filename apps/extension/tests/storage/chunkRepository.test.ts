import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveVideoChunk,
  listVideoChunksByRecordingId,
  deleteVideoChunksByRecordingId,
  saveAudioChunk,
  listAudioChunksByRecordingId,
  updateAudioChunk,
  deleteChunksByRecordingId,
} from '../../src/core/storage/chunkRepository';
import { getDB } from '../../src/core/storage/db';

describe('chunkRepository', () => {
  beforeEach(async () => {
    const db = await getDB();
    await db.clear('videoChunks');
    await db.clear('audioChunks');
  });

  describe('video chunks', () => {
    it('saves video chunks with increasing indexes', async () => {
      await saveVideoChunk({
        recordingId: 'rec-1',
        index: 0,
        blob: new Blob(['a'], { type: 'video/webm' }),
        sizeBytes: 1,
        mimeType: 'video/webm',
      });
      await saveVideoChunk({
        recordingId: 'rec-1',
        index: 1,
        blob: new Blob(['b'], { type: 'video/webm' }),
        sizeBytes: 1,
        mimeType: 'video/webm',
      });

      const chunks = await listVideoChunksByRecordingId('rec-1');
      expect(chunks.map((c) => c.index)).toEqual([0, 1]);
    });

    it('lists video chunks sorted by index even if inserted out of order', async () => {
      await saveVideoChunk({
        recordingId: 'rec-1',
        index: 2,
        blob: new Blob(['c']),
        sizeBytes: 1,
        mimeType: 'video/webm',
      });
      await saveVideoChunk({
        recordingId: 'rec-1',
        index: 0,
        blob: new Blob(['a']),
        sizeBytes: 1,
        mimeType: 'video/webm',
      });
      await saveVideoChunk({
        recordingId: 'rec-1',
        index: 1,
        blob: new Blob(['b']),
        sizeBytes: 1,
        mimeType: 'video/webm',
      });

      const chunks = await listVideoChunksByRecordingId('rec-1');
      expect(chunks.map((c) => c.index)).toEqual([0, 1, 2]);
    });

    it('detects missing chunk index when validating sequence', async () => {
      await saveVideoChunk({
        recordingId: 'rec-1',
        index: 0,
        blob: new Blob(['a']),
        sizeBytes: 1,
        mimeType: 'video/webm',
      });
      await saveVideoChunk({
        recordingId: 'rec-1',
        index: 2,
        blob: new Blob(['c']),
        sizeBytes: 1,
        mimeType: 'video/webm',
      });

      const chunks = await listVideoChunksByRecordingId('rec-1');
      expect(() => assertNoMissingIndexes(chunks)).toThrow('Missing or out-of-order video chunk');
    });

    it('assembles final Blob from chunks sorted by ascending index', async () => {
      await saveVideoChunk({
        recordingId: 'rec-1',
        index: 0,
        blob: new Blob(['hello ']),
        sizeBytes: 6,
        mimeType: 'video/webm',
      });
      await saveVideoChunk({
        recordingId: 'rec-1',
        index: 1,
        blob: new Blob(['world']),
        sizeBytes: 5,
        mimeType: 'video/webm',
      });

      const chunks = await listVideoChunksByRecordingId('rec-1');
      chunks.sort((a, b) => a.index - b.index);
      assertNoMissingIndexes(chunks);

      const finalBlob = new Blob(
        chunks.map((c) => c.blob),
        { type: 'video/webm' },
      );
      const text = await finalBlob.text();
      expect(text).toBe('hello world');
    });

    it('deletes video chunks by recording id', async () => {
      await saveVideoChunk({
        recordingId: 'rec-1',
        index: 0,
        blob: new Blob(['a']),
        sizeBytes: 1,
        mimeType: 'video/webm',
      });
      await deleteVideoChunksByRecordingId('rec-1');
      const chunks = await listVideoChunksByRecordingId('rec-1');
      expect(chunks).toEqual([]);
    });

    it('reads legacy stored blob wrappers', async () => {
      const db = await getDB();
      await db.put('videoChunks', {
        id: 'legacy-1',
        recordingId: 'rec-1',
        index: 0,
        createdAt: new Date().toISOString(),
        blob: {
          __voxmBlob: true,
          buffer: new TextEncoder().encode('legacy').buffer,
          type: 'video/webm',
          size: 6,
        },
        sizeBytes: 6,
        mimeType: 'video/webm',
      } as never);

      const chunks = await listVideoChunksByRecordingId('rec-1');
      expect(await chunks[0].blob.text()).toBe('legacy');
    });
  });

  describe('audio chunks', () => {
    it('saves audio chunks with increasing indexes and offsetMs', async () => {
      await saveAudioChunk({
        recordingId: 'rec-1',
        index: 0,
        offsetMs: 0,
        blob: new Blob(['a']),
        sizeBytes: 1,
        mimeType: 'audio/webm',
      });
      await saveAudioChunk({
        recordingId: 'rec-1',
        index: 1,
        offsetMs: 180_000,
        blob: new Blob(['b']),
        sizeBytes: 1,
        mimeType: 'audio/webm',
      });

      const chunks = await listAudioChunksByRecordingId('rec-1');
      expect(chunks.map((c) => c.index)).toEqual([0, 1]);
      expect(chunks[1].offsetMs).toBe(180_000);
    });

    it('updates audio chunk transcription status and preserves for retry', async () => {
      const chunk = await saveAudioChunk({
        recordingId: 'rec-1',
        index: 0,
        offsetMs: 0,
        blob: new Blob(['a']),
        sizeBytes: 1,
        mimeType: 'audio/webm',
      });

      await updateAudioChunk(chunk.id, {
        transcriptionStatus: 'failed',
        transcriptionAttempts: 1,
        errorCode: 'GROQ_TRANSCRIPTION_FAILED',
        errorMessage: 'Network error',
      });

      const updated = await listAudioChunksByRecordingId('rec-1');
      expect(updated[0].transcriptionStatus).toBe('failed');
      expect(updated[0].blob).toBeDefined();
    });

    it('deletes all chunks by recording id', async () => {
      await saveVideoChunk({
        recordingId: 'rec-1',
        index: 0,
        blob: new Blob(['v']),
        sizeBytes: 1,
        mimeType: 'video/webm',
      });
      await saveAudioChunk({
        recordingId: 'rec-1',
        index: 0,
        offsetMs: 0,
        blob: new Blob(['a']),
        sizeBytes: 1,
        mimeType: 'audio/webm',
      });

      await deleteChunksByRecordingId('rec-1');
      expect(await listVideoChunksByRecordingId('rec-1')).toEqual([]);
      expect(await listAudioChunksByRecordingId('rec-1')).toEqual([]);
    });
  });
});

function assertNoMissingIndexes(chunks: { index: number }[]): void {
  for (let i = 0; i < chunks.length; i += 1) {
    if (chunks[i].index !== i) {
      throw new Error(`Missing or out-of-order video chunk at index ${i}`);
    }
  }
}
