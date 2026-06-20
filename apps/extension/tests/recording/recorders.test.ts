import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioChunkRecorder } from '../../src/core/recording/AudioChunkRecorder';
import { VideoRecorder } from '../../src/core/recording/VideoRecorder';

class ControlledMediaRecorder {
  static instances: ControlledMediaRecorder[] = [];
  static isTypeSupported = () => true;

  state: RecordingState = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;

  constructor() {
    ControlledMediaRecorder.instances.push(this);
  }

  start(): void {
    this.state = 'recording';
  }

  stop(): void {
    this.state = 'inactive';
    this.onstop?.();
  }
}

type RecordingState = 'inactive' | 'recording' | 'paused';

function stubMediaRecorder(): void {
  ControlledMediaRecorder.instances = [];
  vi.stubGlobal('MediaRecorder', ControlledMediaRecorder);
}

describe('recorders', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits for async video chunk writes before resolving stopped state', async () => {
    stubMediaRecorder();
    let releaseWrite!: () => void;
    let stopped = false;

    const recorder = new VideoRecorder({} as MediaStream, {
      bitsPerSecond: 1,
      audioBitsPerSecond: 1,
      timesliceMs: 10_000,
      onChunk: () =>
        new Promise<void>((resolve) => {
          releaseWrite = resolve;
        }),
      onError: vi.fn(),
      onStop: vi.fn(),
    });

    recorder.start();
    ControlledMediaRecorder.instances[0].ondataavailable?.({
      data: new Blob(['video'], { type: 'video/webm' }),
    });
    recorder.stop();

    const stoppedPromise = recorder.waitUntilStopped().then(() => {
      stopped = true;
    });

    await Promise.resolve();
    expect(stopped).toBe(false);

    releaseWrite();
    await stoppedPromise;
    expect(stopped).toBe(true);
  });

  it('propagates async video chunk write failures', async () => {
    stubMediaRecorder();
    const onError = vi.fn();
    const writeError = new Error('IndexedDB write failed');

    const recorder = new VideoRecorder({} as MediaStream, {
      bitsPerSecond: 1,
      audioBitsPerSecond: 1,
      timesliceMs: 10_000,
      onChunk: () => Promise.reject(writeError),
      onError,
      onStop: vi.fn(),
    });

    recorder.start();
    ControlledMediaRecorder.instances[0].ondataavailable?.({
      data: new Blob(['video'], { type: 'video/webm' }),
    });
    recorder.stop();

    await expect(recorder.waitUntilStopped()).rejects.toThrow('IndexedDB write failed');
    expect(onError).toHaveBeenCalledWith(writeError);
  });

  it('creates independent overlapping audio chunks with planned start offsets', async () => {
    vi.useFakeTimers();
    stubMediaRecorder();
    const offsets: number[] = [];

    const recorder = new AudioChunkRecorder({} as MediaStream, {
      bitsPerSecond: 1,
      timesliceMs: 180_000,
      onChunk: (_index, _blob, _mimeType, offsetMs) => {
        offsets.push(offsetMs);
        return Promise.resolve();
      },
      onError: vi.fn(),
      onStop: vi.fn(),
    });

    recorder.start();
    expect(ControlledMediaRecorder.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(179_000);
    expect(ControlledMediaRecorder.instances).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(ControlledMediaRecorder.instances[0].state).toBe('inactive');
    ControlledMediaRecorder.instances[0].ondataavailable?.({
      data: new Blob(['audio-1'], { type: 'audio/webm' }),
    });

    ControlledMediaRecorder.instances[1].ondataavailable?.({
      data: new Blob(['audio-2'], { type: 'audio/webm' }),
    });
    recorder.stop();
    await recorder.waitUntilStopped();

    expect(offsets).toEqual([0, 179_000]);
  });
});
