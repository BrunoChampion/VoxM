import { AppError } from '../core/errors/AppError';
import {
  createRecording,
  getRecording,
  updateRecording,
  listRecordings,
  deleteRecording,
  listVideoChunksByRecordingId,
  deleteVideoChunksByRecordingId,
  deleteChunksByRecordingId,
  loadSettings,
  saveSettings,
  clearApiKey,
  loadRuntimeRecordingState,
  saveActiveRecordingId,
  saveLastRecordingStatus,
  clearRuntimeRecordingState,
  type RecordingEntity,
  type VideoChunkEntity,
} from '../core/storage';
import { sendMessage } from '../core/messaging/sendMessage';
import type {
  AnyMessage,
  RecordingStatusPayload,
  StartRecordingRequestPayload,
  StartRecordingPayload,
} from '../core/messaging/messageTypes';
import type { RecordingState } from '../core/recording/recordingTypes';
import { TranscriptionOrchestrator } from '../core/transcription/TranscriptionOrchestrator';
import { downloadTranscriptText, downloadVideoBlob } from '../core/downloads/downloadBlob';
import {
  getVideoFilename,
  getMarkdownFilename,
  getJsonFilename,
} from '../core/downloads/fileNaming';

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

let currentRecordingId: string | null = null;
let lastStatus: RecordingStatusPayload | null = null;
let transcriptionOrchestrator: TranscriptionOrchestrator | null = null;
let offscreenReady = false;
let offscreenReadyResolve: (() => void) | null = null;

function assertNoMissingVideoIndexes(chunks: VideoChunkEntity[]): void {
  for (let i = 0; i < chunks.length; i += 1) {
    if (chunks[i].index !== i) {
      throw new AppError(
        'VIDEO_CHUNK_SEQUENCE_BROKEN',
        `Missing or out-of-order video chunk at index ${i}`,
      );
    }
  }
}

async function hasOffscreenDocument(): Promise<boolean> {
  if (typeof chrome.runtime.getContexts === 'function') {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)],
    });
    return contexts.length > 0;
  }
  return false;
}

async function waitForOffscreenReady(): Promise<void> {
  if (offscreenReady) return;
  return new Promise((resolve) => {
    offscreenReadyResolve = resolve;
  });
}

async function setupOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) {
    offscreenReady = true;
    return;
  }
  offscreenReady = false;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: [
      chrome.offscreen.Reason.USER_MEDIA,
      chrome.offscreen.Reason.AUDIO_PLAYBACK,
      chrome.offscreen.Reason.DISPLAY_MEDIA,
    ],
    justification: 'Capture browser tab video and audio, and microphone audio for local recording.',
  });
}

function updateBadge(state: 'idle' | 'recording' | 'stopping' | 'transcribing'): void {
  if (state === 'recording') {
    void chrome.action.setBadgeText({ text: 'REC' });
    void chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    void chrome.action.setTitle({ title: 'Recording active' });
  } else if (state === 'transcribing') {
    void chrome.action.setBadgeText({ text: 'TXT' });
    void chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
    void chrome.action.setTitle({ title: 'Transcribing' });
  } else {
    void chrome.action.setBadgeText({ text: '' });
    void chrome.action.setTitle({ title: 'VoxM' });
  }
}

function isCaptureStatus(status: RecordingEntity['status']): boolean {
  return status === 'preparing' || status === 'recording' || status === 'stopping';
}

function isActiveWorkflowStatus(status: RecordingEntity['status']): boolean {
  return (
    status === 'preparing' ||
    status === 'recording' ||
    status === 'stopping' ||
    status === 'video_saved' ||
    status === 'transcribing'
  );
}

async function markInterruptedRecording(recordingId: string): Promise<void> {
  await updateRecording(recordingId, {
    status: 'failed',
    stoppedAt: new Date().toISOString(),
    errorCode: 'RECORDING_STOP_FAILED',
    errorMessage:
      'Recording was interrupted because the offscreen recorder is no longer available.',
  });
  currentRecordingId = null;
  lastStatus = null;
  await clearRuntimeRecordingState();
  updateBadge('idle');
}

async function getTargetTab(
  request?: StartRecordingRequestPayload,
): Promise<{
  id: number;
  title?: string;
  url?: string;
}> {
  if (!request?.targetTabId) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new AppError('TAB_CAPTURE_FAILED', 'No active tab found.');
    }
    return { id: tab.id, title: tab.title, url: tab.url };
  }

  try {
    const tab = await chrome.tabs.get(request.targetTabId);
    return {
      id: request.targetTabId,
      title: tab.title ?? request.sourceTabTitle,
      url: tab.url ?? request.sourceTabUrl,
    };
  } catch {
    return {
      id: request.targetTabId,
      title: request.sourceTabTitle,
      url: request.sourceTabUrl,
    };
  }
}

async function openMicrophoneSetup(request: StartRecordingRequestPayload): Promise<void> {
  if (!request.targetTabId) {
    throw new AppError('TAB_CAPTURE_FAILED', 'No active tab found.');
  }

  const params = new URLSearchParams({ targetTabId: String(request.targetTabId) });
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`mic-setup.html?${params.toString()}`),
  });
}

async function startRecording(
  request?: StartRecordingRequestPayload,
): Promise<{ recordingId: string }> {
  const runtimeState = await loadRuntimeRecordingState();
  const activeRecordingId = currentRecordingId ?? runtimeState.activeRecordingId;
  if (activeRecordingId) {
    const activeRecording = await getRecording(activeRecordingId);
    if (!activeRecording || isActiveWorkflowStatus(activeRecording.status)) {
      currentRecordingId = activeRecordingId;
      if (runtimeState.lastStatus) {
        lastStatus = runtimeState.lastStatus;
      }
      updateBadge(activeRecording?.status === 'transcribing' ? 'transcribing' : 'recording');
      throw new AppError('RECORDING_STOP_FAILED', 'A recording is already active.');
    }
    await clearRuntimeRecordingState();
  }

  if (currentRecordingId) {
    throw new AppError('RECORDING_STOP_FAILED', 'A recording is already active.');
  }

  const settings = { ...(await loadSettings()), captureMic: true };
  if (!settings.groqApiKey) {
    throw new AppError('NO_API_KEY', 'Add your Groq API key in settings to start recording.');
  }

  const tab = await getTargetTab(request);

  const streamId = await new Promise<string>((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (result) => {
      if (chrome.runtime.lastError) {
        reject(
          new AppError(
            'TAB_CAPTURE_FAILED',
            chrome.runtime.lastError.message ?? 'Failed to capture tab',
          ),
        );
      } else {
        resolve(result);
      }
    });
  });

  const recording = await createRecording({
    id: globalThis.crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    status: 'preparing',
    sourceType: 'browser_tab',
    sourceTabTitle: tab.title,
    sourceTabUrl: tab.url,
    modelProvider: 'groq',
    modelName: 'whisper-large-v3-turbo',
    language: settings.language,
    diarization: false,
  });

  currentRecordingId = recording.id;
  await saveActiveRecordingId(recording.id);
  updateBadge('recording');

  await setupOffscreenDocument();
  await waitForOffscreenReady();

  const payload: StartRecordingPayload = {
    recordingId: recording.id,
    streamId,
    sourceTabTitle: tab.title,
    sourceTabUrl: tab.url,
    settings,
  };

  await sendMessage({ type: 'OFFSCREEN_START_RECORDING', payload });

  return { recordingId: recording.id };
}

async function stopRecording(): Promise<void> {
  const runtimeState = currentRecordingId ? null : await loadRuntimeRecordingState();
  const recordingId = currentRecordingId ?? runtimeState?.activeRecordingId;
  if (!recordingId) return;
  updateBadge('stopping');

  if (!(await hasOffscreenDocument())) {
    const recording = await getRecording(recordingId);
    if (recording && isCaptureStatus(recording.status)) {
      await markInterruptedRecording(recordingId);
      throw new AppError(
        'RECORDING_STOP_FAILED',
        'Recording was interrupted because the offscreen recorder is no longer available.',
      );
    }
  }

  await sendMessage({ type: 'OFFSCREEN_STOP_RECORDING', payload: { recordingId } });
  await finalizeRecording(recordingId);

  currentRecordingId = null;
  lastStatus = null;
  await clearRuntimeRecordingState();
}

export async function finalizeRecording(recordingId: string): Promise<void> {
  const recording = await getRecording(recordingId);
  if (!recording) return;

  const stoppedAt = new Date().toISOString();
  const durationMs = new Date(stoppedAt).getTime() - new Date(recording.startedAt).getTime();

  await updateRecording(recordingId, {
    stoppedAt,
    durationMs,
    status: 'video_saved',
  });

  const settings = await loadSettings();

  try {
    const chunks = await listVideoChunksByRecordingId(recordingId);
    chunks.sort((a, b) => a.index - b.index);
    assertNoMissingVideoIndexes(chunks);

    if (chunks.length === 0) {
      throw new AppError('VIDEO_CHUNK_MISSING', 'No video chunks were recorded.');
    }

    const mimeType = recording.videoMimeType ?? chunks[0].mimeType;
    const finalBlob = new Blob(
      chunks.map((chunk) => chunk.blob),
      { type: mimeType },
    );
    const filename = getVideoFilename(new Date(recording.startedAt));
    const downloadResult = settings.autoDownloadVideo
      ? await downloadVideoBlob(finalBlob, filename)
      : undefined;

    await updateRecording(recordingId, {
      videoDownloadId: downloadResult?.downloadId,
      videoFilename: settings.autoDownloadVideo ? filename : undefined,
      videoMimeType: mimeType,
      videoSizeBytes: finalBlob.size,
      status: 'transcribing',
      videoChunkCount: chunks.length,
    });

    if (!settings.keepInternalVideoChunksAfterExport) {
      await deleteVideoChunksByRecordingId(recordingId);
    }
  } catch (error) {
    const appError =
      error instanceof AppError
        ? error
        : new AppError(
            'UNKNOWN_ERROR',
            error instanceof Error ? error.message : 'Unknown error during finalization',
            error,
          );

    await updateRecording(recordingId, {
      status: 'partial_video_failed',
      errorCode: appError.code,
      errorMessage: appError.message,
    });

    currentRecordingId = null;
    lastStatus = null;
    updateBadge('idle');
    await clearRuntimeRecordingState();
    throw appError;
  }

  await runTranscription(recordingId, settings);
}

async function runTranscription(
  recordingId: string,
  settings: Awaited<ReturnType<typeof loadSettings>>,
): Promise<void> {
  if (!settings.groqApiKey) {
    await updateRecording(recordingId, {
      status: 'partial_transcript_failed',
      errorCode: 'NO_API_KEY',
      errorMessage: 'Groq API key is missing. Add it in settings and retry.',
    });
    updateBadge('idle');
    await clearRuntimeRecordingState();
    return;
  }

  updateBadge('transcribing');

  transcriptionOrchestrator = new TranscriptionOrchestrator({
    recordingId,
    apiKey: settings.groqApiKey,
    language: settings.language,
    model: settings.modelName,
    onProgress: (completed, total, _currentIndex) => {
      lastStatus = {
        recordingId,
        state: 'transcribing',
        durationMs: lastStatus?.durationMs ?? 0,
        videoSizeBytes: lastStatus?.videoSizeBytes ?? 0,
        tabAudioActive: false,
        micActive: false,
      };
      void saveLastRecordingStatus(lastStatus);
      void chrome.action.setBadgeText({ text: `${completed}/${total}` });
    },
  });

  try {
    const recording = await getRecording(recordingId);
    if (!recording) return;

    const merged = await transcriptionOrchestrator.run();

    let mdDownloadId: number | undefined;
    let jsonDownloadId: number | undefined;

    if (settings.autoDownloadMarkdown) {
      const mdFilename = getMarkdownFilename(new Date(recording.startedAt));
      const result = await downloadTranscriptText(merged.markdown, mdFilename);
      mdDownloadId = result.downloadId;
    }

    if (settings.autoDownloadJson) {
      const jsonFilename = getJsonFilename(new Date(recording.startedAt));
      const result = await downloadTranscriptText(JSON.stringify(merged.json, null, 2), jsonFilename);
      jsonDownloadId = result.downloadId;
    }

    await updateRecording(recordingId, {
      transcriptMarkdownDownloadId: mdDownloadId,
      transcriptJsonDownloadId: jsonDownloadId,
    });

    updateBadge('idle');
    await clearRuntimeRecordingState();
  } catch (error) {
    const appError =
      error instanceof AppError
        ? error
        : new AppError(
            'UNKNOWN_ERROR',
            error instanceof Error ? error.message : 'Unknown transcription error',
            error,
          );
    await updateRecording(recordingId, {
      status: 'partial_transcript_failed',
      errorCode: appError.code,
      errorMessage: appError.message,
    });
    currentRecordingId = null;
    lastStatus = null;
    updateBadge('idle');
    await clearRuntimeRecordingState();
    throw appError;
  } finally {
    transcriptionOrchestrator = null;
  }
}

async function retryVideoDownload(recordingId: string): Promise<void> {
  const recording = await getRecording(recordingId);
  if (!recording) return;

  const chunks = await listVideoChunksByRecordingId(recordingId);
  if (chunks.length === 0) {
    throw new AppError('VIDEO_CHUNK_MISSING', 'No video chunks available to reassemble.');
  }

  chunks.sort((a, b) => a.index - b.index);
  assertNoMissingVideoIndexes(chunks);

  const mimeType = recording.videoMimeType ?? chunks[0].mimeType;
  const finalBlob = new Blob(
    chunks.map((chunk) => chunk.blob),
    { type: mimeType },
  );
  const filename = getVideoFilename(new Date(recording.startedAt));
  const { downloadId } = await downloadVideoBlob(finalBlob, filename);

  await updateRecording(recordingId, {
    videoDownloadId: downloadId,
    videoFilename: filename,
    videoSizeBytes: finalBlob.size,
  });
}

async function retryTranscription(recordingId: string): Promise<void> {
  const settings = await loadSettings();
  if (!settings.groqApiKey) {
    throw new AppError('NO_API_KEY', 'Add your Groq API key in settings to retry.');
  }

  await updateRecording(recordingId, {
    status: 'transcribing',
    errorCode: undefined,
    errorMessage: undefined,
  });

  await runTranscription(recordingId, settings);
}

export async function getRecordingState(): Promise<{
  recordingId: string | null;
  state: RecordingState;
  durationMs: number;
  videoSizeBytes: number;
  tabAudioActive: boolean;
  micActive: boolean;
}> {
  const runtimeState = await loadRuntimeRecordingState();
  const activeRecordingId = currentRecordingId ?? runtimeState.activeRecordingId ?? null;

  if (activeRecordingId) {
    const recording = await getRecording(activeRecordingId);
    if (recording && isCaptureStatus(recording.status) && !(await hasOffscreenDocument())) {
      await markInterruptedRecording(activeRecordingId);
      return {
        recordingId: null,
        state: 'failed',
        durationMs: recording.durationMs ?? 0,
        videoSizeBytes: recording.videoSizeBytes ?? 0,
        tabAudioActive: false,
        micActive: false,
      };
    }
  }

  if (currentRecordingId && lastStatus) {
    return {
      recordingId: currentRecordingId,
      state: lastStatus.state,
      durationMs: lastStatus.durationMs,
      videoSizeBytes: lastStatus.videoSizeBytes,
      tabAudioActive: lastStatus.tabAudioActive,
      micActive: lastStatus.micActive,
    };
  }

  if (currentRecordingId) {
    const recording = await getRecording(currentRecordingId);
    if (recording) {
      return {
        recordingId: currentRecordingId,
        state: statusToState(recording.status),
        durationMs: recording.durationMs ?? 0,
        videoSizeBytes: recording.videoSizeBytes ?? 0,
        tabAudioActive: false,
        micActive: false,
      };
    }
  }

  if (runtimeState.activeRecordingId) {
    const recording = await getRecording(runtimeState.activeRecordingId);
    if (recording) {
      const status = runtimeState.lastStatus;
      return {
        recordingId: runtimeState.activeRecordingId,
        state: status?.state ?? statusToState(recording.status),
        durationMs: status?.durationMs ?? recording.durationMs ?? 0,
        videoSizeBytes: status?.videoSizeBytes ?? recording.videoSizeBytes ?? 0,
        tabAudioActive: status?.tabAudioActive ?? false,
        micActive: status?.micActive ?? false,
      };
    }
  }

  return {
    recordingId: null,
    state: 'idle',
    durationMs: 0,
    videoSizeBytes: 0,
    tabAudioActive: false,
    micActive: false,
  };
}

function statusToState(status: RecordingEntity['status']): RecordingState {
  switch (status) {
    case 'preparing':
      return 'preparing';
    case 'recording':
      return 'recording';
    case 'stopping':
    case 'video_saved':
      return 'stopping';
    case 'transcribing':
      return 'transcribing';
    case 'completed':
      return 'completed';
    case 'failed':
    case 'partial_video_failed':
    case 'partial_transcript_failed':
      return 'failed';
    default:
      return 'idle';
  }
}

async function handleMessage(message: AnyMessage): Promise<unknown> {
  switch (message.type) {
    case 'GET_RECORDING_STATE':
      return getRecordingState();

    case 'START_RECORDING':
      return startRecording(message.payload);

    case 'STOP_RECORDING':
      await stopRecording();
      return { success: true };

    case 'OPEN_OPTIONS':
      await chrome.runtime.openOptionsPage();
      return { success: true };

    case 'OPEN_RECORDINGS':
      await chrome.tabs.create({ url: chrome.runtime.getURL('recordings.html') });
      return { success: true };

    case 'OPEN_MICROPHONE_SETUP':
      await openMicrophoneSetup(message.payload);
      return { success: true };

    case 'OPEN_MICROPHONE_SETTINGS':
      await chrome.tabs.create({ url: 'chrome://settings/content/microphone' });
      return { success: true };

    case 'GET_SETTINGS':
      return loadSettings();

    case 'SAVE_SETTINGS':
      return saveSettings(message.payload);

    case 'CLEAR_API_KEY':
      await clearApiKey();
      return { success: true };

    case 'CLEAR_LOCAL_RECORDINGS':
      {
        const recordings = await listRecordings();
        for (const recording of recordings) {
          await deleteChunksByRecordingId(recording.id);
          await deleteRecording(recording.id);
        }
      }
      return { success: true };

    case 'GET_RECORDINGS':
      return listRecordings();

    case 'GET_RECORDING':
      return getRecording(message.payload.recordingId);

    case 'DELETE_RECORDING':
      {
        const { recordingId } = message.payload;
        await deleteChunksByRecordingId(recordingId);
        await deleteRecording(recordingId);
      }
      return { success: true };

    case 'RETRY_TRANSCRIPTION':
      await retryTranscription(message.payload.recordingId);
      return { success: true };

    case 'RETRY_VIDEO_DOWNLOAD':
      await retryVideoDownload(message.payload.recordingId);
      return { success: true };

    case 'OFFSCREEN_READY':
      offscreenReady = true;
      offscreenReadyResolve?.();
      offscreenReadyResolve = null;
      return { success: true };

    case 'OFFSCREEN_RECORDING_STARTED':
      return { success: true };

    case 'OFFSCREEN_RECORDING_STOPPED':
      return { success: true };

    case 'OFFSCREEN_ERROR':
      {
        const { recordingId, code, message: errorMessage } = message.payload;
        currentRecordingId = null;
        lastStatus = null;
        updateBadge('idle');
        await clearRuntimeRecordingState();
        await updateRecording(recordingId, {
          status: 'failed',
          errorCode: code,
          errorMessage,
          stoppedAt: new Date().toISOString(),
        });
      }
      return { success: true };

    case 'OFFSCREEN_CHUNK_PERSISTED':
      return { success: true };

    case 'BROADCAST_STATE':
      {
        const status = message.payload;
        lastStatus = status;
        if (status.recordingId) {
          await saveLastRecordingStatus(status);
        }
      }
      return { success: true };

    default:
      return { success: false, error: { code: 'UNKNOWN_ERROR', message: 'Unknown message type' } };
  }
}

chrome.runtime.onMessage.addListener((message: AnyMessage, _sender, sendResponse) => {
  handleMessage(message)
    .then((data) => sendResponse({ success: true, data }))
    .catch((error: unknown) => {
      const code = error instanceof AppError ? error.code : 'UNKNOWN_ERROR';
      const messageText = error instanceof Error ? error.message : 'Unknown error';
      sendResponse({ success: false, error: { code, message: messageText } });
    });
  return true;
});

chrome.runtime.onStartup.addListener(() => {
  updateBadge('idle');
});

chrome.runtime.onInstalled.addListener(() => {
  updateBadge('idle');
});
