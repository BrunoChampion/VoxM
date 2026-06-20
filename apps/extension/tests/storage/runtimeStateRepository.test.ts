import { describe, expect, it } from 'vitest';
import {
  clearRuntimeRecordingState,
  loadRuntimeRecordingState,
  saveActiveRecordingId,
  saveLastRecordingStatus,
} from '../../src/core/storage/runtimeStateRepository';

describe('runtimeStateRepository', () => {
  it('saves and loads active recording runtime state', async () => {
    await saveActiveRecordingId('rec-1');
    await saveLastRecordingStatus({
      recordingId: 'rec-1',
      state: 'recording',
      durationMs: 10_000,
      videoSizeBytes: 1024,
      tabAudioActive: true,
      micActive: true,
    });

    const state = await loadRuntimeRecordingState();

    expect(state.activeRecordingId).toBe('rec-1');
    expect(state.lastStatus?.state).toBe('recording');
    expect(state.lastStatus?.durationMs).toBe(10_000);
  });

  it('clears active recording runtime state', async () => {
    await saveActiveRecordingId('rec-1');
    await saveLastRecordingStatus({
      recordingId: 'rec-1',
      state: 'recording',
      durationMs: 10_000,
      videoSizeBytes: 1024,
      tabAudioActive: true,
      micActive: true,
    });

    await clearRuntimeRecordingState();

    expect(await loadRuntimeRecordingState()).toEqual({});
  });
});
