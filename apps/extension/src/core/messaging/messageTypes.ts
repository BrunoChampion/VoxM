import type { RecordingState } from '../recording/recordingTypes';
import type { Settings } from '../storage/settingsRepository';

export type RecordingStatusPayload = {
  recordingId?: string;
  state: RecordingState;
  durationMs: number;
  videoSizeBytes: number;
  audioChunkCount?: number;
  videoChunkCount?: number;
  tabAudioActive: boolean;
  micActive: boolean;
  error?: { code: string; message: string };
};

export type OffscreenErrorPayload = {
  recordingId: string;
  code: string;
  message: string;
};

export type OffscreenChunkPersistedPayload = {
  recordingId: string;
  chunkType: 'video' | 'audio';
  index: number;
  sizeBytes: number;
};

export type OffscreenTranscriptionProgressPayload = {
  recordingId: string;
  completedChunks: number;
  totalChunks: number;
  currentChunkIndex: number;
};

export type StartRecordingPayload = {
  recordingId: string;
  streamId: string;
  sourceTabTitle?: string;
  sourceTabUrl?: string;
  settings: Settings;
};

export type StartRecordingRequestPayload = {
  targetTabId?: number;
  sourceTabTitle?: string;
  sourceTabUrl?: string;
};

export type PopupMessage =
  | { type: 'GET_RECORDING_STATE' }
  | { type: 'START_RECORDING'; payload?: StartRecordingRequestPayload }
  | { type: 'STOP_RECORDING' }
  | { type: 'OPEN_OPTIONS' }
  | { type: 'OPEN_RECORDINGS' }
  | { type: 'OPEN_MICROPHONE_SETUP'; payload: StartRecordingRequestPayload }
  | { type: 'OPEN_MICROPHONE_SETTINGS' };

export type OptionsMessage =
  | { type: 'GET_SETTINGS' }
  | { type: 'SAVE_SETTINGS'; payload: Partial<Settings> }
  | { type: 'CLEAR_API_KEY' }
  | { type: 'CLEAR_LOCAL_RECORDINGS' };

export type RecordingsPageMessage =
  | { type: 'GET_RECORDINGS' }
  | { type: 'GET_RECORDING'; payload: { recordingId: string } }
  | { type: 'DELETE_RECORDING'; payload: { recordingId: string } }
  | { type: 'RETRY_TRANSCRIPTION'; payload: { recordingId: string } }
  | { type: 'RETRY_VIDEO_DOWNLOAD'; payload: { recordingId: string } };

export type OffscreenMessage =
  | { type: 'OFFSCREEN_READY' }
  | { type: 'OFFSCREEN_RECORDING_STARTED'; payload: { recordingId: string } }
  | { type: 'OFFSCREEN_RECORDING_STOPPED'; payload: { recordingId: string } }
  | { type: 'OFFSCREEN_ERROR'; payload: OffscreenErrorPayload }
  | { type: 'OFFSCREEN_CHUNK_PERSISTED'; payload: OffscreenChunkPersistedPayload }
  | { type: 'OFFSCREEN_TRANSCRIPTION_PROGRESS'; payload: OffscreenTranscriptionProgressPayload };

export type BackgroundMessage =
  | PopupMessage
  | OptionsMessage
  | RecordingsPageMessage
  | { type: 'OFFSCREEN_START_RECORDING'; payload: StartRecordingPayload }
  | { type: 'OFFSCREEN_STOP_RECORDING'; payload: { recordingId: string } }
  | { type: 'BROADCAST_STATE'; payload: RecordingStatusPayload }
  | { type: 'REQUEST_TRANSCRIPTION'; payload: { recordingId: string } };

export type AnyMessage = BackgroundMessage | OffscreenMessage;

export type MessageResponse<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

export function isOffscreenMessage(message: AnyMessage): message is OffscreenMessage {
  return (
    message.type === 'OFFSCREEN_READY' ||
    message.type === 'OFFSCREEN_RECORDING_STARTED' ||
    message.type === 'OFFSCREEN_RECORDING_STOPPED' ||
    message.type === 'OFFSCREEN_ERROR' ||
    message.type === 'OFFSCREEN_CHUNK_PERSISTED' ||
    message.type === 'OFFSCREEN_TRANSCRIPTION_PROGRESS'
  );
}
