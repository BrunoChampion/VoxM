const MICROPHONE_SETUP_COMPLETE_KEY = 'voxm:microphone-setup-complete';

export async function hasCompletedMicrophoneSetup(): Promise<boolean> {
  const result = await chrome.storage.local.get(MICROPHONE_SETUP_COMPLETE_KEY);
  return result[MICROPHONE_SETUP_COMPLETE_KEY] === true;
}

export async function saveMicrophoneSetupComplete(): Promise<void> {
  await chrome.storage.local.set({ [MICROPHONE_SETUP_COMPLETE_KEY]: true });
}

export async function clearMicrophoneSetupComplete(): Promise<void> {
  await chrome.storage.local.remove(MICROPHONE_SETUP_COMPLETE_KEY);
}
