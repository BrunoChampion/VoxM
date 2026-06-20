import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveAudioChunk, saveSettings, saveVideoChunk } from '../../src/core/storage';
import { createRecording } from '../../src/core/storage/recordingRepository';
import {
  saveActiveRecordingId,
  saveLastRecordingStatus,
} from '../../src/core/storage/runtimeStateRepository';
import { getDB } from '../../src/core/storage/db';

describe('service worker recording finalization', () => {
  beforeEach(async () => {
    vi.resetModules();
    const db = await getDB();
    await db.clear('recordings');
    await db.clear('videoChunks');
    await db.clear('audioChunks');
  });

  it('does not download video when autoDownloadVideo is disabled', async () => {
    const downloadSpy = vi.spyOn(chrome.downloads, 'download');
    await saveSettings({
      autoDownloadVideo: false,
      autoDownloadMarkdown: false,
      autoDownloadJson: false,
    });
    await createRecording({
      id: 'rec-1',
      startedAt: new Date('2026-06-19T10:00:00.000Z').toISOString(),
      status: 'recording',
      sourceType: 'browser_tab',
      modelProvider: 'groq',
      modelName: 'whisper-large-v3-turbo',
      diarization: false,
      videoMimeType: 'video/webm',
    });
    await saveVideoChunk({
      recordingId: 'rec-1',
      index: 0,
      blob: new Blob(['video'], { type: 'video/webm' }),
      sizeBytes: 5,
      mimeType: 'video/webm',
    });
    await saveAudioChunk({
      recordingId: 'rec-1',
      index: 0,
      offsetMs: 0,
      blob: new Blob(['audio'], { type: 'audio/webm' }),
      sizeBytes: 5,
      mimeType: 'audio/webm',
    });

    const { finalizeRecording } = await import('../../src/background/service-worker');
    await finalizeRecording('rec-1');

    expect(downloadSpy).not.toHaveBeenCalled();
  });

  it('recovers transcribing state from runtime storage', async () => {
    await createRecording({
      id: 'rec-1',
      startedAt: new Date('2026-06-19T10:00:00.000Z').toISOString(),
      status: 'transcribing',
      sourceType: 'browser_tab',
      modelProvider: 'groq',
      modelName: 'whisper-large-v3-turbo',
      diarization: false,
      durationMs: 60_000,
      videoSizeBytes: 2048,
    });
    await saveActiveRecordingId('rec-1');
    await saveLastRecordingStatus({
      recordingId: 'rec-1',
      state: 'transcribing',
      durationMs: 60_000,
      videoSizeBytes: 2048,
      tabAudioActive: false,
      micActive: false,
    });

    const { getRecordingState } = await import('../../src/background/service-worker');
    const state = await getRecordingState();

    expect(state).toMatchObject({
      recordingId: 'rec-1',
      state: 'transcribing',
      durationMs: 60_000,
      videoSizeBytes: 2048,
    });
  });
});
