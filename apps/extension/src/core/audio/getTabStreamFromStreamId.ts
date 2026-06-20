import { AppError } from '../errors/AppError';

export async function getTabStreamFromStreamId(streamId: string): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      } as MediaTrackConstraints,
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      } as MediaTrackConstraints,
    });
  } catch (error) {
    throw new AppError(
      'TAB_CAPTURE_FAILED',
      'Failed to capture the browser tab. Make sure the tab is still active and try again.',
      error,
    );
  }
}
