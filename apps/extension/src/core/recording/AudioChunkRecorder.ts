import { getSupportedAudioMimeType } from '../audio/mimeTypes';

export type AudioChunkRecorderOptions = {
  bitsPerSecond: number;
  timesliceMs: number;
  overlapMs?: number;
  onChunk: (index: number, blob: Blob, mimeType: string, offsetMs: number) => Promise<void>;
  onError: (error: Error) => void;
  onStop: () => void;
};

type AudioRecorderSession = {
  index: number;
  offsetMs: number;
  recorder: MediaRecorder;
  nextTimer?: number;
  stopTimer?: number;
};

export class AudioChunkRecorder {
  private mimeType: string;
  private index = 0;
  private stopped = true;
  private stopping = false;
  private stoppedPromise: Promise<void> = Promise.resolve();
  private stoppedResolve: () => void = () => undefined;
  private pendingWrites = new Set<Promise<void>>();
  private writeErrors: Error[] = [];
  private sessions = new Map<number, AudioRecorderSession>();
  private overlapMs: number;

  constructor(
    private stream: MediaStream,
    private options: AudioChunkRecorderOptions,
  ) {
    this.mimeType = getSupportedAudioMimeType();
    this.overlapMs = Math.min(options.overlapMs ?? 1_000, Math.max(0, options.timesliceMs - 1));
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.stopping = false;
    this.stoppedPromise = new Promise((resolve) => {
      this.stoppedResolve = resolve;
    });
    this.startSession(0);
  }

  stop(): void {
    if (this.stopped || this.stopping) return;
    this.stopping = true;

    for (const session of Array.from(this.sessions.values())) {
      this.clearSessionTimers(session);
      this.stopSession(session);
    }

    if (this.sessions.size === 0) {
      this.finishStop();
    }
  }

  async waitUntilStopped(): Promise<void> {
    if (!this.stopped) {
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
    return this.stopped ? 'inactive' : 'recording';
  }

  private startSession(index: number): void {
    if (this.stopped || this.stopping) return;

    const offsetMs = this.getOffsetMs(index);
    const recorder = new MediaRecorder(this.stream, {
      mimeType: this.mimeType,
      audioBitsPerSecond: this.options.bitsPerSecond,
    });
    const session: AudioRecorderSession = {
      index,
      offsetMs,
      recorder,
    };

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.trackChunkWrite(this.options.onChunk(index, event.data, this.mimeType, offsetMs));
      }
    };

    recorder.onerror = () => {
      this.options.onError(new Error('Audio MediaRecorder encountered an error'));
    };

    recorder.onstop = () => {
      this.clearSessionTimers(session);
      this.sessions.delete(index);
      if (this.stopping && this.sessions.size === 0) {
        this.finishStop();
      }
    };

    this.sessions.set(index, session);
    this.index = Math.max(this.index, index + 1);
    recorder.start();

    const nextDelayMs =
      index === 0 ? this.options.timesliceMs - this.overlapMs : this.options.timesliceMs;
    const stopDelayMs =
      index === 0 ? this.options.timesliceMs : this.options.timesliceMs + this.overlapMs;

    session.nextTimer = window.setTimeout(() => {
      this.startSession(index + 1);
    }, nextDelayMs);

    session.stopTimer = window.setTimeout(() => {
      this.stopSession(session);
    }, stopDelayMs);
  }

  private getOffsetMs(index: number): number {
    if (index === 0) return 0;
    return index * this.options.timesliceMs - this.overlapMs;
  }

  private stopSession(session: AudioRecorderSession): void {
    if (session.recorder.state === 'inactive') return;
    session.recorder.stop();
  }

  private clearSessionTimers(session: AudioRecorderSession): void {
    if (session.nextTimer !== undefined) {
      clearTimeout(session.nextTimer);
      session.nextTimer = undefined;
    }
    if (session.stopTimer !== undefined) {
      clearTimeout(session.stopTimer);
      session.stopTimer = undefined;
    }
  }

  private finishStop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.stopping = false;
    this.options.onStop();
    this.stoppedResolve();
  }

  private trackChunkWrite(write: Promise<void>): void {
    const tracked = write.catch((error: unknown) => {
      const normalized = error instanceof Error ? error : new Error('Audio chunk write failed');
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
