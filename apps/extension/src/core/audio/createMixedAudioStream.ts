import { AppError } from '../errors/AppError';

export type MixedAudioResult = {
  mixedAudioStream: MediaStream;
  audioContext: AudioContext;
  tabAudioNode: MediaStreamAudioSourceNode;
  micAudioNode?: MediaStreamAudioSourceNode;
  destination: MediaStreamAudioDestinationNode;
};

export function createMixedAudioStream(
  tabStream: MediaStream,
  micStream?: MediaStream,
): MixedAudioResult {
  try {
    const audioContext = new AudioContext();
    const tabAudioNode = audioContext.createMediaStreamSource(tabStream);
    const destination = audioContext.createMediaStreamDestination();

    tabAudioNode.connect(destination);

    let micAudioNode: MediaStreamAudioSourceNode | undefined;
    if (micStream && micStream.getAudioTracks().length > 0) {
      micAudioNode = audioContext.createMediaStreamSource(micStream);
      micAudioNode.connect(destination);
    }

    return {
      mixedAudioStream: destination.stream,
      audioContext,
      tabAudioNode,
      micAudioNode,
      destination,
    };
  } catch (error) {
    throw new AppError('AUDIO_MIX_FAILED', 'Failed to mix tab and microphone audio.', error);
  }
}

export function preserveTabAudioPlayback(
  audioContext: AudioContext,
  tabAudioNode: MediaStreamAudioSourceNode,
): void {
  try {
    tabAudioNode.connect(audioContext.destination);
  } catch (error) {
    console.warn('VoxM: Failed to preserve tab audio playback', error);
  }
}
