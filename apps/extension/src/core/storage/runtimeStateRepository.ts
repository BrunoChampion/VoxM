import type { RecordingStatusPayload } from '../messaging/messageTypes';

const ACTIVE_RECORDING_ID_KEY = 'voxm:last-active-recording-id';
const LAST_RECORDING_STATUS_KEY = 'voxm:last-recording-status';

export type RuntimeRecordingState = {
  activeRecordingId?: string;
  lastStatus?: RecordingStatusPayload;
};

export async function loadRuntimeRecordingState(): Promise<RuntimeRecordingState> {
  const result = await chrome.storage.local.get([ACTIVE_RECORDING_ID_KEY, LAST_RECORDING_STATUS_KEY]);
  return {
    activeRecordingId: result[ACTIVE_RECORDING_ID_KEY] as string | undefined,
    lastStatus: result[LAST_RECORDING_STATUS_KEY] as RecordingStatusPayload | undefined,
  };
}

export async function saveActiveRecordingId(recordingId: string): Promise<void> {
  await chrome.storage.local.set({ [ACTIVE_RECORDING_ID_KEY]: recordingId });
}

export async function saveLastRecordingStatus(status: RecordingStatusPayload): Promise<void> {
  await chrome.storage.local.set({ [LAST_RECORDING_STATUS_KEY]: status });
}

export async function clearRuntimeRecordingState(): Promise<void> {
  await chrome.storage.local.remove([ACTIVE_RECORDING_ID_KEY, LAST_RECORDING_STATUS_KEY]);
}
