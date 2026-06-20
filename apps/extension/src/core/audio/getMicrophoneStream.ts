import { AppError } from '../errors/AppError';

export type MicrophoneConstraints = {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
};

export type MicrophonePermissionState = PermissionState | 'unsupported';

export async function getMicrophonePermissionState(): Promise<MicrophonePermissionState> {
  try {
    if (!navigator.permissions?.query) {
      return 'unsupported';
    }

    const status = await navigator.permissions.query({
      name: 'microphone' as PermissionName,
    });
    return status.state;
  } catch {
    return 'unsupported';
  }
}

export async function getMicrophoneStream(
  constraints: Partial<MicrophoneConstraints> = {},
): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: constraints.echoCancellation ?? true,
        noiseSuppression: constraints.noiseSuppression ?? true,
        autoGainControl: constraints.autoGainControl ?? true,
      },
      video: false,
    });
  } catch (error) {
    if (error instanceof DOMException) {
      switch (error.name) {
        case 'NotAllowedError':
          throw new AppError(
            'MIC_PERMISSION_DENIED',
            'Microphone permission was denied or blocked. Allow microphone access in Chrome settings and try again.',
            error,
          );
        case 'NotFoundError':
          throw new AppError(
            'MIC_NOT_FOUND',
            'No microphone was found. Connect or enable a microphone, then try again.',
            error,
          );
        case 'NotReadableError':
          throw new AppError(
            'MIC_NOT_READABLE',
            'Chrome could not read from the microphone. Close other apps using it or check Windows microphone permissions.',
            error,
          );
        case 'SecurityError':
          throw new AppError(
            'MIC_SECURITY_BLOCKED',
            'Microphone access is blocked by browser, system, or policy settings.',
            error,
          );
      }
    }
    throw new AppError('MIC_CAPTURE_FAILED', 'Failed to capture microphone audio.', error);
  }
}
