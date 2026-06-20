import { RecordingController } from '../core/recording/RecordingController';
import { sendMessage } from '../core/messaging/sendMessage';
import type {
  BackgroundMessage,
  RecordingStatusPayload,
  StartRecordingPayload,
} from '../core/messaging/messageTypes';

let controller: RecordingController | null = null;
let currentRecordingId: string | null = null;

function sendStatusUpdate(status: Omit<RecordingStatusPayload, 'recordingId'>): void {
  if (!currentRecordingId) return;
  void sendMessage({
    type: 'BROADCAST_STATE',
    payload: { recordingId: currentRecordingId, ...status },
  });
}

async function startRecording(payload: StartRecordingPayload): Promise<void> {
  if (controller) {
    await controller.stop();
    controller = null;
  }

  currentRecordingId = payload.recordingId;

  try {
    controller = new RecordingController({
      recordingId: payload.recordingId,
      streamId: payload.streamId,
      sourceTabTitle: payload.sourceTabTitle,
      sourceTabUrl: payload.sourceTabUrl,
      settings: payload.settings,
      onStatusUpdate: sendStatusUpdate,
      onChunkPersisted: (type, index, sizeBytes) => {
        void sendMessage({
          type: 'OFFSCREEN_CHUNK_PERSISTED',
          payload: {
            recordingId: payload.recordingId,
            chunkType: type,
            index,
            sizeBytes,
          },
        });
      },
    });

    await controller.start();
    await sendMessage({
      type: 'OFFSCREEN_RECORDING_STARTED',
      payload: { recordingId: payload.recordingId },
    });
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : 'UNKNOWN_ERROR';
    await sendMessage({
      type: 'OFFSCREEN_ERROR',
      payload: {
        recordingId: payload.recordingId,
        code,
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
    throw error;
  }
}

async function stopRecording(recordingId: string): Promise<void> {
  try {
    await controller?.stop();
    await sendMessage({
      type: 'OFFSCREEN_RECORDING_STOPPED',
      payload: { recordingId },
    });
  } catch (error) {
    await sendMessage({
      type: 'OFFSCREEN_ERROR',
      payload: {
        recordingId,
        code: 'RECORDING_STOP_FAILED',
        message: error instanceof Error ? error.message : 'Failed to stop recording',
      },
    });
  } finally {
    controller = null;
    currentRecordingId = null;
  }
}

chrome.runtime.onMessage.addListener((message: BackgroundMessage, _sender, sendResponse) => {
  if (message.type === 'OFFSCREEN_START_RECORDING') {
    void startRecording(message.payload).then(
      () => sendResponse({ success: true }),
      (error: unknown) =>
        sendResponse({
          success: false,
          error: {
            code: error instanceof Error && 'code' in error ? String(error.code) : 'UNKNOWN_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        }),
    );
    return true;
  }

  if (message.type === 'OFFSCREEN_STOP_RECORDING') {
    void stopRecording(message.payload.recordingId).then(
      () => sendResponse({ success: true }),
      (error: unknown) =>
        sendResponse({
          success: false,
          error: {
            code: error instanceof Error && 'code' in error ? String(error.code) : 'UNKNOWN_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        }),
    );
    return true;
  }

  return false;
});

void sendMessage({ type: 'OFFSCREEN_READY' });
