import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRecording,
  getRecording,
  updateRecording,
  listRecordings,
  deleteRecording,
} from '../../src/core/storage/recordingRepository';
import { getDB, DB_NAME, DB_VERSION } from '../../src/core/storage/db';

describe('recordingRepository', () => {
  beforeEach(async () => {
    const db = await getDB();
    await db.clear('recordings');
  });

  it('creates a recording with timestamps', async () => {
    const recording = await createRecording({
      id: 'rec-1',
      startedAt: new Date().toISOString(),
      status: 'preparing',
      sourceType: 'browser_tab',
      modelProvider: 'groq',
      modelName: 'whisper-large-v3-turbo',
      diarization: false,
    });

    expect(recording.id).toBe('rec-1');
    expect(recording.createdAt).toBeDefined();
    expect(recording.updatedAt).toBeDefined();
  });

  it('retrieves a recording by id', async () => {
    await createRecording({
      id: 'rec-1',
      startedAt: new Date().toISOString(),
      status: 'recording',
      sourceType: 'browser_tab',
      modelProvider: 'groq',
      modelName: 'whisper-large-v3-turbo',
      diarization: false,
    });

    const found = await getRecording('rec-1');
    expect(found?.status).toBe('recording');
  });

  it('updates a recording and refreshes updatedAt', async () => {
    const created = await createRecording({
      id: 'rec-1',
      startedAt: new Date().toISOString(),
      status: 'recording',
      sourceType: 'browser_tab',
      modelProvider: 'groq',
      modelName: 'whisper-large-v3-turbo',
      diarization: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    const updated = await updateRecording('rec-1', { status: 'completed' });

    expect(updated?.status).toBe('completed');
    expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(created.updatedAt).getTime(),
    );
  });

  it('lists recordings sorted by creation time', async () => {
    await createRecording({
      id: 'rec-1',
      startedAt: new Date().toISOString(),
      status: 'completed',
      sourceType: 'browser_tab',
      modelProvider: 'groq',
      modelName: 'whisper-large-v3-turbo',
      diarization: false,
    });
    await createRecording({
      id: 'rec-2',
      startedAt: new Date().toISOString(),
      status: 'completed',
      sourceType: 'browser_tab',
      modelProvider: 'groq',
      modelName: 'whisper-large-v3-turbo',
      diarization: false,
    });

    const list = await listRecordings();
    expect(list.map((r) => r.id)).toEqual(['rec-1', 'rec-2']);
  });

  it('deletes a recording', async () => {
    await createRecording({
      id: 'rec-1',
      startedAt: new Date().toISOString(),
      status: 'completed',
      sourceType: 'browser_tab',
      modelProvider: 'groq',
      modelName: 'whisper-large-v3-turbo',
      diarization: false,
    });
    await deleteRecording('rec-1');
    const found = await getRecording('rec-1');
    expect(found).toBeUndefined();
  });

  it('uses the expected database name and version', () => {
    expect(DB_NAME).toBe('voxm_v1');
    expect(DB_VERSION).toBe(1);
  });
});
