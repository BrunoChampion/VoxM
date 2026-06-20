import { getTabStreamFromStreamId } from '../audio/getTabStreamFromStreamId';
import { getMicrophoneStream } from '../audio/getMicrophoneStream';
import { createMixedAudioStream, preserveTabAudioPlayback } from '../audio/createMixedAudioStream';
import { VideoRecorder } from './VideoRecorder';
import { AudioChunkRecorder } from './AudioChunkRecorder';
import { saveVideoChunk, saveAudioChunk } from '../storage/chunkRepository';
import { updateRecording } from '../storage/recordingRepository';
import { AppError } from '../errors/AppError';
import type { Settings } from '../storage/settingsRepository';

export type RecordingStatus = {
  state: 'preparing' | 'recording' | 'stopping' | 'failed';
  durationMs: number;
  videoSizeBytes: number;
  audioChunkCount: number;
  videoChunkCount: number;
  tabAudioActive: boolean;
  micActive: boolean;
  error?: { code: string; message: string };
};

export type RecordingControllerOptions = {
  recordingId: string;
  streamId: string;
  sourceTabTitle?: string;
  sourceTabUrl?: string;
  settings: Settings;
  onStatusUpdate: (status: RecordingStatus) => void;
  onChunkPersisted: (type: 'video' | 'audio', index: number, sizeBytes: number) => void;
};

export class RecordingController {
  private tabStream?: MediaStream;
  private micStream?: MediaStream;
  private audioContext?: AudioContext;
  private mixedAudioStream?: MediaStream;
  private finalVideoStream?: MediaStream;
  private videoRecorder?: VideoRecorder;
  private audioRecorder?: AudioChunkRecorder;
  private startTime = 0;
  private videoSizeBytes = 0;
  private audioChunkCount = 0;
  private videoChunkCount = 0;
  private statusInterval?: number;
  private stopped = false;
  private failed = false;

  constructor(private options: RecordingControllerOptions) {}

  async start(): Promise<void> {
    try {
      this.emitStatus('preparing');
      await updateRecording(this.options.recordingId, { status: 'preparing' });

      this.tabStream = await getTabStreamFromStreamId(this.options.streamId);
      if (this.options.settings.captureMic) {
        this.micStream = await getMicrophoneStream();
      }

      const mixed = createMixedAudioStream(this.tabStream, this.micStream);
      this.audioContext = mixed.audioContext;
      this.mixedAudioStream = mixed.mixedAudioStream;
      preserveTabAudioPlayback(this.audioContext, mixed.tabAudioNode);

      const tabVideoTracks = this.tabStream.getVideoTracks();
      const mixedAudioTracks = this.mixedAudioStream.getAudioTracks();
      this.finalVideoStream = new MediaStream([...tabVideoTracks, ...mixedAudioTracks]);

      this.startTime = Date.now();
      this.startStatusUpdates();

      this.videoRecorder = new VideoRecorder(this.finalVideoStream, {
        bitsPerSecond: this.options.settings.videoBitsPerSecond,
        audioBitsPerSecond: this.options.settings.audioBitsPerSecond,
        timesliceMs: 10_000,
        onChunk: this.handleVideoChunk.bind(this),
        onError: this.handleVideoRecorderError.bind(this),
        onStop: () => undefined,
      });

      this.audioRecorder = new AudioChunkRecorder(this.mixedAudioStream, {
        bitsPerSecond: 64_000,
        timesliceMs: 3 * 60 * 1000,
        overlapMs: 1_000,
        onChunk: this.handleAudioChunk.bind(this),
        onError: this.handleAudioRecorderError.bind(this),
        onStop: () => undefined,
      });

      this.videoRecorder.start();
      this.audioRecorder.start();

      await updateRecording(this.options.recordingId, {
        status: 'recording',
        sourceTabTitle: this.options.sourceTabTitle,
        sourceTabUrl: this.options.sourceTabUrl,
        videoMimeType: this.videoRecorder.getMimeType(),
      });

      this.emitStatus('recording');
    } catch (error) {
      await this.fail(error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.stopped || this.failed) return;
    this.stopped = true;
    this.emitStatus('stopping');
    await updateRecording(this.options.recordingId, { status: 'stopping' });

    this.stopStatusUpdates();

    this.videoRecorder?.stop();
    this.audioRecorder?.stop();

    await Promise.all([
      this.videoRecorder?.waitUntilStopped() ?? Promise.resolve(),
      this.audioRecorder?.waitUntilStopped() ?? Promise.resolve(),
    ]);

    this.cleanup();
  }

  private cleanup(): void {
    this.videoRecorder = undefined;
    this.audioRecorder = undefined;

    this.finalVideoStream?.getTracks().forEach((track) => track.stop());
    this.finalVideoStream = undefined;

    this.mixedAudioStream?.getTracks().forEach((track) => track.stop());
    this.mixedAudioStream = undefined;

    this.tabStream?.getTracks().forEach((track) => track.stop());
    this.tabStream = undefined;

    this.micStream?.getTracks().forEach((track) => track.stop());
    this.micStream = undefined;

    void this.audioContext?.close();
    this.audioContext = undefined;
  }

  private startStatusUpdates(): void {
    this.statusInterval = window.setInterval(() => {
      if (!this.stopped && !this.failed) {
        this.emitStatus('recording');
      }
    }, 1000);
  }

  private stopStatusUpdates(): void {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = undefined;
    }
  }

  private emitStatus(state: RecordingStatus['state']): void {
    const durationMs = this.startTime === 0 ? 0 : Date.now() - this.startTime;
    this.options.onStatusUpdate({
      state,
      durationMs,
      videoSizeBytes: this.videoSizeBytes,
      audioChunkCount: this.audioChunkCount,
      videoChunkCount: this.videoChunkCount,
      tabAudioActive: this.tabStream
        ? this.tabStream.getAudioTracks().some((t) => t.enabled && t.readyState === 'live')
        : false,
      micActive: this.micStream
        ? this.micStream.getAudioTracks().some((t) => t.enabled && t.readyState === 'live')
        : false,
    });
  }

  private async handleVideoChunk(index: number, blob: Blob, mimeType: string): Promise<void> {
    try {
      this.videoSizeBytes += blob.size;
      this.videoChunkCount += 1;
      await saveVideoChunk({
        recordingId: this.options.recordingId,
        index,
        blob,
        sizeBytes: blob.size,
        mimeType,
      });
      this.options.onChunkPersisted('video', index, blob.size);
      this.emitStatus('recording');
    } catch (error) {
      await this.fail(error);
      throw error;
    }
  }

  private async handleAudioChunk(
    index: number,
    blob: Blob,
    mimeType: string,
    offsetMs: number,
  ): Promise<void> {
    try {
      this.audioChunkCount += 1;
      await saveAudioChunk({
        recordingId: this.options.recordingId,
        index,
        offsetMs,
        blob,
        sizeBytes: blob.size,
        mimeType,
      });
      this.options.onChunkPersisted('audio', index, blob.size);
      this.emitStatus('recording');
    } catch (error) {
      await this.fail(error);
      throw error;
    }
  }

  private handleVideoRecorderError(error: Error): void {
    void this.fail(error);
  }

  private handleAudioRecorderError(error: Error): void {
    void this.fail(error);
  }

  private async fail(error: unknown): Promise<void> {
    if (this.failed) return;
    this.failed = true;
    this.stopStatusUpdates();
    this.cleanup();

    const appError =
      error instanceof AppError
        ? error
        : new AppError(
            'UNKNOWN_ERROR',
            error instanceof Error ? error.message : 'Unknown recording error',
            error,
          );

    await updateRecording(this.options.recordingId, {
      status: 'failed',
      errorCode: appError.code,
      errorMessage: appError.message,
      stoppedAt: new Date().toISOString(),
      durationMs: this.startTime === 0 ? 0 : Date.now() - this.startTime,
    });

    this.emitStatus('failed');
  }
}
