import { sendMessage } from '../core/messaging/sendMessage';
import type { RecordingStatusPayload } from '../core/messaging/messageTypes';
import type { RecordingState } from '../core/recording/recordingTypes';
import { formatDurationShort } from '../core/utils/formatDuration';
import { formatBytes } from '../core/utils/formatBytes';
import { loadSettings } from '../core/storage/settingsRepository';
import {
  clearMicrophoneSetupComplete,
  hasCompletedMicrophoneSetup,
} from '../core/storage/microphonePermissionRepository';
import type { StartRecordingRequestPayload } from '../core/messaging/messageTypes';

const content = document.getElementById('content')!;

let currentRecordingId: string | null = null;

function setLoading(): void {
  content.innerHTML = '<div class="spinner"></div>';
}

function renderNoApiKey(): void {
  content.innerHTML = `
    <p class="disclaimer">Add your Groq API key to start recording and transcribing meetings.</p>
    <div class="actions">
      <button class="btn-secondary full-width" id="open-recordings">Open Recordings</button>
      <button class="btn-primary full-width" id="open-options">Open Settings</button>
    </div>
  `;
  bindOpenRecordings();
  document.getElementById('open-options')?.addEventListener('click', () => {
    void sendMessage({ type: 'OPEN_OPTIONS' });
    window.close();
  });
}

function renderIdle(tabTitle?: string): void {
  content.innerHTML = `
    <div class="status-item" style="margin-bottom: 12px;">
      <label>Current tab</label>
      <div class="value">${escapeHtml(tabTitle ?? 'Unknown tab')}</div>
    </div>
    <p class="disclaimer">Use headphones for best quality. Without headphones, remote voices may be captured twice through your microphone.</p>
    <div class="actions">
      <button class="btn-secondary full-width" id="open-recordings">Open Recordings</button>
      <button class="btn-primary full-width" id="start-recording">Start Recording</button>
    </div>
  `;
  bindOpenRecordings();
  document.getElementById('start-recording')?.addEventListener('click', () => {
    void startRecording();
  });
}

function renderConsent(tabTitle?: string): void {
  content.innerHTML = `
    <h2 style="font-size: 16px; margin-bottom: 12px;">Recording reminder</h2>
    <p class="disclaimer">
      This extension records the selected browser tab and your microphone.
      The final video is saved locally on your computer.
      For transcription, audio chunks are sent to Groq using your own API key.
      No backend is used by this extension in V1.
      <br><br>
      Make sure meeting participants know the meeting is being recorded or transcribed.
    </p>
    <div class="actions">
      <button class="btn-secondary full-width" id="cancel">Cancel</button>
      <button class="btn-primary full-width" id="confirm-start">I understand - Start Recording</button>
    </div>
  `;
  document.getElementById('cancel')?.addEventListener('click', () => {
    renderIdle(tabTitle);
  });
  document.getElementById('confirm-start')?.addEventListener('click', () => {
    void confirmStartRecording();
  });
}

function renderPreparing(): void {
  content.innerHTML = `
    <div style="text-align: center; padding: 24px 0;">
      <div class="spinner" style="width: 32px; height: 32px; margin-bottom: 12px;"></div>
      <p>Preparing tab and microphone capture...</p>
    </div>
  `;
}

function renderRecording(status: RecordingStatusPayload): void {
  const duration = formatDurationShort(status.durationMs);
  const estimatedSize = formatBytes(status.videoSizeBytes);

  content.innerHTML = `
    <div class="recording-indicator">
      <span class="recording-dot"></span>
      Recording
    </div>
    <div class="status-grid">
      <div class="status-item">
        <label>Duration</label>
        <div class="value">${duration}</div>
      </div>
      <div class="status-item">
        <label>Estimated size</label>
        <div class="value">${estimatedSize}</div>
      </div>
      <div class="status-item">
        <label>Tab audio</label>
        <div class="value">${status.tabAudioActive ? 'Active' : 'Inactive'}</div>
      </div>
      <div class="status-item">
        <label>Microphone</label>
        <div class="value">${status.micActive ? 'Active' : 'Inactive'}</div>
      </div>
    </div>
    ${status.durationMs > 2 * 60 * 60 * 1000 ? '<div class="warning">Long recordings may use significant memory during export. Consider stopping soon.</div>' : ''}
    <button class="btn-danger full-width" id="stop-recording">Stop Recording</button>
  `;
  document.getElementById('stop-recording')?.addEventListener('click', () => {
    void stopRecording();
  });
}

function renderStopping(): void {
  content.innerHTML = `
    <div style="text-align: center; padding: 24px 0;">
      <div class="spinner" style="width: 32px; height: 32px; margin-bottom: 12px;"></div>
      <p>Stopping recording and assembling video...</p>
    </div>
  `;
}

function renderTranscribing(completed: number, total: number): void {
  content.innerHTML = `
    <div style="text-align: center; padding: 24px 0;">
      <div class="spinner" style="width: 32px; height: 32px; margin-bottom: 12px;"></div>
      <p>Transcribing chunk ${completed} of ${total}</p>
      <button class="btn-secondary full-width" id="open-recordings" style="margin-top: 12px;">Open Recordings</button>
    </div>
  `;
  bindOpenRecordings();
}

function renderCompleted(): void {
  content.innerHTML = `
    <div class="success" style="text-align: center; padding: 12px 0; font-weight: 600;">
      Recording and transcript saved.
    </div>
    <div class="actions">
      <button class="btn-secondary full-width" id="open-recordings">Open Recordings</button>
      <button class="btn-primary full-width" id="new-recording">Start New Recording</button>
    </div>
  `;
  bindOpenRecordings();
  document.getElementById('new-recording')?.addEventListener('click', () => {
    void refreshState();
  });
}

function renderFailed(message: string): void {
  content.innerHTML = `
    <div class="error">${escapeHtml(message)}</div>
    <div class="actions">
      <button class="btn-secondary full-width" id="open-recordings">Open Recordings</button>
      <button class="btn-secondary full-width" id="dismiss">Dismiss</button>
    </div>
  `;
  bindOpenRecordings();
  document.getElementById('dismiss')?.addEventListener('click', () => {
    void refreshState();
  });
}

function bindOpenRecordings(): void {
  document.getElementById('open-recordings')?.addEventListener('click', () => {
    void sendMessage({ type: 'OPEN_RECORDINGS' });
    window.close();
  });
}

async function refreshState(): Promise<void> {
  try {
    const state = await sendMessage<{
      recordingId: string | null;
      state: RecordingState;
      durationMs: number;
      videoSizeBytes: number;
      tabAudioActive: boolean;
      micActive: boolean;
    }>({ type: 'GET_RECORDING_STATE' });

    currentRecordingId = state.recordingId;

    const settings = await loadSettings();

    if (!settings.groqApiKey && state.state === 'idle') {
      renderNoApiKey();
      return;
    }

    switch (state.state) {
      case 'idle':
        {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          renderIdle(tab?.title);
        }
        break;
      case 'preparing':
        renderPreparing();
        break;
      case 'recording':
        renderRecording({
          recordingId: state.recordingId ?? undefined,
          state: state.state,
          durationMs: state.durationMs,
          videoSizeBytes: state.videoSizeBytes,
          tabAudioActive: state.tabAudioActive,
          micActive: state.micActive,
        });
        break;
      case 'stopping':
        renderStopping();
        break;
      case 'transcribing':
        renderTranscribing(0, 0);
        break;
      case 'completed':
        renderCompleted();
        break;
      case 'failed':
        renderFailed('Recording failed. Open recordings for details.');
        break;
    }
  } catch (error) {
    renderFailed(error instanceof Error ? error.message : 'Failed to load state');
  }
}

async function startRecording(): Promise<void> {
  const settings = await loadSettings();
  if (settings.showConsentReminder) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    renderConsent(tab?.title);
    return;
  }
  await confirmStartRecording();
}

async function confirmStartRecording(): Promise<void> {
  setLoading();
  try {
    const request = await getCurrentTabStartRequest();

    if (!(await hasCompletedMicrophoneSetup())) {
      await openMicrophoneSetup(request);
      return;
    }

    renderPreparing();
    const result = await sendMessage<{ recordingId: string }>({
      type: 'START_RECORDING',
      payload: request,
    });
    currentRecordingId = result.recordingId;
    renderPreparing();
  } catch (error) {
    const code = getErrorCode(error);
    if (
      code === 'MIC_PERMISSION_DENIED' ||
      code === 'MIC_NOT_FOUND' ||
      code === 'MIC_NOT_READABLE' ||
      code === 'MIC_SECURITY_BLOCKED' ||
      code === 'MIC_CAPTURE_FAILED'
    ) {
      await clearMicrophoneSetupComplete();
      await openMicrophoneSetup();
      return;
    }
    renderFailed(error instanceof Error ? error.message : 'Failed to start recording');
  }
}

async function getCurrentTabStartRequest(): Promise<StartRecordingRequestPayload> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('No active tab found.');
  }
  return {
    targetTabId: tab.id,
    sourceTabTitle: tab.title,
    sourceTabUrl: tab.url,
  };
}

async function openMicrophoneSetup(
  request?: StartRecordingRequestPayload,
): Promise<void> {
  const payload = request ?? (await getCurrentTabStartRequest());
  await sendMessage({ type: 'OPEN_MICROPHONE_SETUP', payload });
  window.close();
}

async function stopRecording(): Promise<void> {
  setLoading();
  renderStopping();
  try {
    await sendMessage({ type: 'STOP_RECORDING' });
  } catch (error) {
    renderFailed(error instanceof Error ? error.message : 'Failed to stop recording');
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getErrorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error
    ? String((error as Error & { code?: unknown }).code)
    : undefined;
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'BROADCAST_STATE') {
    const status = message.payload as RecordingStatusPayload;
    currentRecordingId = status.recordingId ?? currentRecordingId;

    if (status.state === 'recording') {
      renderRecording(status);
    } else if (status.state === 'transcribing') {
      renderTranscribing(status.audioChunkCount ?? 0, status.videoChunkCount ?? 0);
    } else if (status.state === 'failed') {
      renderFailed(status.error?.message ?? 'Recording failed');
    } else if (status.state === 'completed') {
      renderCompleted();
    }
  }
});

void refreshState();
