import { getSupportedVideoMimeType } from '../audio/mimeTypes';

export type VideoRecorderOptions = {
  bitsPerSecond: number;
  audioBitsPerSecond: number;
  timesliceMs: number;
  onChunk: (index: number, blob: Blob, mimeType: string) => Promise<void>;
  onError: (error: Error) => void;
  onStop: () => void;
};

export class VideoRecorder {
  private recorder: MediaRecorder;
  private mimeType: string;
  private index = 0;
  private stopped = false;
  private stoppedPromise: Promise<void>;
  private stoppedResolve!: () => void;
  private pendingWrites = new Set<Promise<void>>();
  private writeErrors: Error[] = [];

  constructor(
    stream: MediaStream,
    private options: VideoRecorderOptions,
  ) {
    this.mimeType = getSupportedVideoMimeType();
    this.recorder = new MediaRecorder(stream, {
      mimeType: this.mimeType,
      videoBitsPerSecond: options.bitsPerSecond,
      audioBitsPerSecond: options.audioBitsPerSecond,
    });

    this.stoppedPromise = new Promise((resolve) => {
      this.stoppedResolve = resolve;
    });

    this.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        const currentIndex = this.index;
        this.index += 1;
        this.trackChunkWrite(this.options.onChunk(currentIndex, event.data, this.mimeType));
      }
    };

    this.recorder.onerror = () => {
      this.options.onError(new Error('Video MediaRecorder encountered an error'));
    };

    this.recorder.onstop = () => {
      this.stopped = true;
      this.options.onStop();
      this.stoppedResolve();
    };
  }

  start(): void {
    if (this.stopped) return;
    this.recorder.start(this.options.timesliceMs);
  }

  stop(): void {
    if (this.recorder.state === 'inactive') return;
    this.recorder.stop();
  }

  async waitUntilStopped(): Promise<void> {
    if (this.recorder.state !== 'inactive') {
      await this.stoppedPromise;
    }
    await Promise.all(Array.from(this.pendingWrites));
    if (this.writeErrors[0]) {
      throw this.writeErrors[0];
    }
  }

  getMimeType(): string {
    return this.mimeType;
  }

  getState(): RecordingState {
    return this.recorder.state as RecordingState;
  }

  private trackChunkWrite(write: Promise<void>): void {
    const tracked = write.catch((error: unknown) => {
      const normalized = error instanceof Error ? error : new Error('Video chunk write failed');
      this.writeErrors.push(normalized);
      this.options.onError(normalized);
    });

    this.pendingWrites.add(tracked);
    tracked.finally(() => {
      this.pendingWrites.delete(tracked);
    });
  }
}

type RecordingState = 'inactive' | 'recording' | 'paused';
