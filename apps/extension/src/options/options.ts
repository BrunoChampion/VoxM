import { sendMessage } from '../core/messaging/sendMessage';
import { loadSettings, saveSettings, type Settings } from '../core/storage/settingsRepository';
import { getMicrophoneStream } from '../core/audio/getMicrophoneStream';
import { saveMicrophoneSetupComplete } from '../core/storage/microphonePermissionRepository';

const content = document.getElementById('content')!;

function render(settings: Settings, saved = false, error?: string, success?: string): void {
  const apiKeyMasked = settings.groqApiKey ? '•'.repeat(20) : '';

  content.innerHTML = `
    ${saved ? '<div class="success" style="margin-bottom: 12px;">Settings saved.</div>' : ''}
    ${success ? `<div class="success" style="margin-bottom: 12px;">${escapeHtml(success)}</div>` : ''}
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}

    <section class="section">
      <h2>Groq API Key</h2>
      <div class="field">
        <label for="api-key">API Key</label>
        <input type="password" id="api-key" value="${apiKeyMasked ? '********' : ''}" placeholder="gsk_..." />
        <p class="help-text">Your key is stored only on this computer and sent only to Groq.</p>
      </div>
      <div class="actions">
        <button class="btn-secondary" id="test-key">Test Key</button>
        <button class="btn-primary" id="save-key">Save Key</button>
        <button class="btn-danger" id="clear-key">Clear Key</button>
      </div>
    </section>

    <section class="section">
      <h2>Transcription</h2>
      <div class="field">
        <label for="model">Model</label>
        <select id="model" disabled>
          <option value="whisper-large-v3-turbo" selected>whisper-large-v3-turbo</option>
        </select>
      </div>
      <div class="field">
        <label for="language">Language</label>
        <input type="text" id="language" value="${settings.language ?? ''}" placeholder="auto (leave empty)" />
        <p class="help-text">Optional ISO-639-1 code (e.g., en, es, fr). Leave empty for auto-detection.</p>
      </div>
    </section>

    <section class="section">
      <h2>Recording</h2>
      <div class="checkbox-field">
        <input type="checkbox" id="capture-mic" checked disabled />
        <label for="capture-mic">Capture microphone (required)</label>
      </div>
      <div class="actions" style="margin-bottom: 12px;">
        <button class="btn-secondary" id="check-microphone">Check Microphone</button>
        <button class="btn-secondary" id="open-microphone-settings">Open Microphone Settings</button>
      </div>
      <div class="checkbox-field">
        <input type="checkbox" id="auto-download-video" ${settings.autoDownloadVideo ? 'checked' : ''} />
        <label for="auto-download-video">Auto-download video after stop</label>
      </div>
      <div class="checkbox-field">
        <input type="checkbox" id="auto-download-markdown" ${settings.autoDownloadMarkdown ? 'checked' : ''} />
        <label for="auto-download-markdown">Auto-download transcript Markdown</label>
      </div>
      <div class="checkbox-field">
        <input type="checkbox" id="auto-download-json" ${settings.autoDownloadJson ? 'checked' : ''} />
        <label for="auto-download-json">Auto-download transcript JSON</label>
      </div>
      <div class="checkbox-field">
        <input type="checkbox" id="show-consent" ${settings.showConsentReminder ? 'checked' : ''} />
        <label for="show-consent">Show consent reminder before recording</label>
      </div>
      <div class="checkbox-field">
        <input type="checkbox" id="keep-chunks" ${settings.keepInternalVideoChunksAfterExport ? 'checked' : ''} />
        <label for="keep-chunks">Keep internal video chunks after export</label>
      </div>
    </section>

    <section class="section danger-zone">
      <h2>Data Controls</h2>
      <p class="help-text" style="margin-bottom: 12px;">These actions cannot be undone.</p>
      <div class="actions">
        <button class="btn-danger" id="clear-api-key">Clear API Key</button>
        <button class="btn-danger" id="clear-recordings">Clear Local Recordings</button>
      </div>
    </section>
  `;

  document.getElementById('save-key')?.addEventListener('click', () => {
    void saveKey();
  });
  document.getElementById('clear-key')?.addEventListener('click', () => {
    void clearKey();
  });
  document.getElementById('test-key')?.addEventListener('click', () => {
    void testKey();
  });
  document.getElementById('check-microphone')?.addEventListener('click', () => {
    void checkMicrophone();
  });
  document.getElementById('open-microphone-settings')?.addEventListener('click', () => {
    void sendMessage({ type: 'OPEN_MICROPHONE_SETTINGS' });
  });

  document.getElementById('capture-mic')?.addEventListener('change', () => {
    void savePreferences();
  });
  document.getElementById('auto-download-video')?.addEventListener('change', () => {
    void savePreferences();
  });
  document.getElementById('auto-download-markdown')?.addEventListener('change', () => {
    void savePreferences();
  });
  document.getElementById('auto-download-json')?.addEventListener('change', () => {
    void savePreferences();
  });
  document.getElementById('show-consent')?.addEventListener('change', () => {
    void savePreferences();
  });
  document.getElementById('keep-chunks')?.addEventListener('change', () => {
    void savePreferences();
  });
  document.getElementById('language')?.addEventListener('change', () => {
    void savePreferences();
  });

  document.getElementById('clear-api-key')?.addEventListener('click', () => {
    void clearKey();
  });
  document.getElementById('clear-recordings')?.addEventListener('click', () => {
    void clearRecordings();
  });
}

async function saveKey(): Promise<void> {
  const input = document.getElementById('api-key') as HTMLInputElement;
  const value = input.value.trim();
  if (!value || value.includes('•')) {
    const current = await loadSettings();
    render(current, true);
    return;
  }
  try {
    const next = await saveSettings({ groqApiKey: value });
    render(next, true);
  } catch (error) {
    const current = await loadSettings();
    render(current, false, error instanceof Error ? error.message : 'Failed to save key');
  }
}

async function clearKey(): Promise<void> {
  try {
    await sendMessage({ type: 'CLEAR_API_KEY' });
    const next = await loadSettings();
    render(next, true);
  } catch (error) {
    const current = await loadSettings();
    render(current, false, error instanceof Error ? error.message : 'Failed to clear key');
  }
}

async function testKey(): Promise<void> {
  const input = document.getElementById('api-key') as HTMLInputElement;
  const value = input.value.trim();
  const current = await loadSettings();
  const key = value && !value.includes('•') ? value : current.groqApiKey;

  if (!key) {
    render(current, false, 'Enter an API key first.');
    return;
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (response.ok) {
      render(current, true);
    } else if (response.status === 401) {
      render(current, false, 'Invalid API key.');
    } else {
      render(current, false, `Groq returned ${response.status}.`);
    }
  } catch (error) {
    render(current, false, error instanceof Error ? error.message : 'Network error');
  }
}

async function checkMicrophone(): Promise<void> {
  const current = await loadSettings();
  try {
    const stream = await getMicrophoneStream();
    stream.getTracks().forEach((track) => track.stop());
    await saveMicrophoneSetupComplete();
    render(current, false, undefined, 'Microphone access looks good.');
  } catch (error) {
    render(
      current,
      false,
      error instanceof Error ? error.message : 'Microphone check failed.',
    );
  }
}

async function savePreferences(): Promise<void> {
  const autoDownloadVideo = (document.getElementById('auto-download-video') as HTMLInputElement)
    .checked;
  const autoDownloadMarkdown = (
    document.getElementById('auto-download-markdown') as HTMLInputElement
  ).checked;
  const autoDownloadJson = (document.getElementById('auto-download-json') as HTMLInputElement)
    .checked;
  const showConsentReminder = (document.getElementById('show-consent') as HTMLInputElement).checked;
  const keepInternalVideoChunksAfterExport = (
    document.getElementById('keep-chunks') as HTMLInputElement
  ).checked;
  const language = (document.getElementById('language') as HTMLInputElement).value.trim();

  try {
    const next = await saveSettings({
      captureMic: true,
      autoDownloadVideo,
      autoDownloadMarkdown,
      autoDownloadJson,
      showConsentReminder,
      keepInternalVideoChunksAfterExport,
      language: language || undefined,
    });
    render(next, true);
  } catch (error) {
    const current = await loadSettings();
    render(current, false, error instanceof Error ? error.message : 'Failed to save preferences');
  }
}

async function clearRecordings(): Promise<void> {
  if (!confirm('Delete all local recordings, transcripts, and chunks?')) return;
  try {
    await sendMessage({ type: 'CLEAR_LOCAL_RECORDINGS' });
    const current = await loadSettings();
    render(current, true);
  } catch (error) {
    const current = await loadSettings();
    render(current, false, error instanceof Error ? error.message : 'Failed to clear recordings');
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function init(): Promise<void> {
  const settings = await loadSettings();
  render(settings);
}

void init();
