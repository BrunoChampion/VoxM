import { AppError } from '../errors/AppError';

export function getSupportedVideoMimeType(): string {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

  for (const mimeType of candidates) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  throw new AppError(
    'VIDEO_RECORDER_UNSUPPORTED',
    'No supported video MIME type found for this browser.',
  );
}

export function getSupportedAudioMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

  for (const mimeType of candidates) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  throw new AppError(
    'AUDIO_RECORDER_UNSUPPORTED',
    'No supported audio MIME type found for this browser.',
  );
}
