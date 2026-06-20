import { getMicrophoneStream } from '../core/audio/getMicrophoneStream';
import { sendMessage } from '../core/messaging/sendMessage';
import type { StartRecordingRequestPayload } from '../core/messaging/messageTypes';
import {
  clearMicrophoneSetupComplete,
  saveMicrophoneSetupComplete,
} from '../core/storage/microphonePermissionRepository';

const content = document.getElementById('content')!;

const params = new URLSearchParams(window.location.search);
const targetTabId = Number(params.get('targetTabId'));

function renderSetup(): void {
  content.innerHTML = `
    <section class="setup-panel">
      <h2>Enable microphone recording</h2>
      <p class="setup-copy">
        VoxM needs microphone access to record your local voice with the meeting tab.
      </p>
      <button class="btn-primary" id="allow-start">Allow Microphone & Start</button>
    </section>
  `;

  document.getElementById('allow-start')?.addEventListener('click', () => {
    void allowMicrophoneAndStart();
  });
}

function renderWorking(message: string): void {
  content.innerHTML = `
    <section class="setup-panel">
      <div class="status-row">
        <span class="spinner"></span>
        <span>${escapeHtml(message)}</span>
      </div>
    </section>
  `;
}

function renderStarted(): void {
  content.innerHTML = `
    <section class="setup-panel">
      <h2>Recording started</h2>
      <p class="setup-copy">
        You can return to the meeting tab. VoxM will keep recording in the background.
      </p>
      <div class="actions">
        <button class="btn-secondary" id="open-recordings">Open Recordings</button>
        <button class="btn-primary" id="close-page">Close</button>
      </div>
    </section>
  `;

  document.getElementById('open-recordings')?.addEventListener('click', () => {
    void sendMessage({ type: 'OPEN_RECORDINGS' });
  });
  document.getElementById('close-page')?.addEventListener('click', () => {
    window.close();
  });
}

function renderError(title: string, body: string): void {
  content.innerHTML = `
    <section class="setup-panel">
      <div class="error">${escapeHtml(title)}</div>
      <p class="setup-copy">${escapeHtml(body)}</p>
      <div class="actions">
        <button class="btn-primary" id="try-again">Try Again</button>
        <button class="btn-secondary" id="open-mic-settings">Open Microphone Settings</button>
      </div>
    </section>
  `;

  document.getElementById('try-again')?.addEventListener('click', () => {
    void allowMicrophoneAndStart();
  });
  document.getElementById('open-mic-settings')?.addEventListener('click', () => {
    void sendMessage({ type: 'OPEN_MICROPHONE_SETTINGS' });
  });
}

async function allowMicrophoneAndStart(): Promise<void> {
  if (!Number.isInteger(targetTabId) || targetTabId <= 0) {
    renderError('No meeting tab was selected.', 'Return to the meeting tab and start VoxM again.');
    return;
  }

  try {
    renderWorking('Waiting for microphone permission...');
    const stream = await getMicrophoneStream();
    stream.getTracks().forEach((track) => track.stop());
    await saveMicrophoneSetupComplete();

    renderWorking('Starting recording...');
    const payload: StartRecordingRequestPayload = { targetTabId };
    await sendMessage<{ recordingId: string }>({ type: 'START_RECORDING', payload });
    renderStarted();
  } catch (error) {
    const code = getErrorCode(error);
    if (isMicrophoneError(code)) {
      await clearMicrophoneSetupComplete();
    }
    const details = getMicrophoneErrorDetails(code);
    renderError(details.title, details.body);
  }
}

function isMicrophoneError(code?: string): boolean {
  return (
    code === 'MIC_PERMISSION_DENIED' ||
    code === 'MIC_NOT_FOUND' ||
    code === 'MIC_NOT_READABLE' ||
    code === 'MIC_SECURITY_BLOCKED' ||
    code === 'MIC_CAPTURE_FAILED'
  );
}

function getMicrophoneErrorDetails(code?: string): { title: string; body: string } {
  switch (code) {
    case 'MIC_PERMISSION_DENIED':
      return {
        title: 'Microphone access is blocked.',
        body:
          'Allow microphone access for Chrome and VoxM, then try again. If Chrome did not show a prompt, check Chrome microphone settings and Windows microphone privacy settings.',
      };
    case 'MIC_NOT_FOUND':
      return {
        title: 'No microphone was found.',
        body: 'Connect or enable a microphone in Windows and Chrome, then try again.',
      };
    case 'MIC_NOT_READABLE':
      return {
        title: 'Chrome could not read the microphone.',
        body:
          'Close other apps that may be using the microphone, check Windows privacy permissions for Chrome, then try again.',
      };
    case 'MIC_SECURITY_BLOCKED':
      return {
        title: 'Microphone access is blocked by security settings.',
        body: 'Check Chrome, Windows, or managed browser policy settings, then try again.',
      };
    default:
      return {
        title: 'Recording could not start.',
        body: errorMessageFallback(code),
      };
  }
}

function errorMessageFallback(code?: string): string {
  if (code === 'TAB_CAPTURE_FAILED') {
    return 'Return to the meeting tab and start VoxM again.';
  }
  if (code === 'NO_API_KEY') {
    return 'Add your Groq API key in VoxM settings, then try again.';
  }
  return 'Check microphone access and try again.';
}

function getErrorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error
    ? String((error as Error & { code?: unknown }).code)
    : undefined;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

renderSetup();
