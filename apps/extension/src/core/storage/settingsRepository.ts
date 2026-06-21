const SETTINGS_KEY = 'voxm:settings';
const SETTINGS_VERSION = 2;

export type Settings = {
  settingsVersion: number;
  groqApiKey?: string;
  modelProvider: 'groq';
  modelName: 'whisper-large-v3-turbo';
  language?: string;
  captureMic: boolean;
  autoDownloadVideo: boolean;
  autoDownloadMarkdown: boolean;
  autoDownloadJson: boolean;
  autoGenerateSummary: boolean;
  autoDownloadSummaryMarkdown: boolean;
  autoDownloadSummaryJson: boolean;
  showConsentReminder: boolean;
  keepInternalVideoChunksAfterExport: boolean;
  videoBitsPerSecond: number;
  audioBitsPerSecond: number;
};

export const DEFAULT_SETTINGS: Settings = {
  modelProvider: 'groq',
  modelName: 'whisper-large-v3-turbo',
  settingsVersion: SETTINGS_VERSION,
  captureMic: true,
  autoDownloadVideo: true,
  autoDownloadMarkdown: false,
  autoDownloadJson: false,
  autoGenerateSummary: true,
  autoDownloadSummaryMarkdown: false,
  autoDownloadSummaryJson: false,
  showConsentReminder: true,
  keepInternalVideoChunksAfterExport: false,
  videoBitsPerSecond: 1_500_000,
  audioBitsPerSecond: 96_000,
};

export async function loadSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const stored = result[SETTINGS_KEY] as Partial<Settings> | undefined;
  const migrated = migrateSettings(stored);
  return { ...DEFAULT_SETTINGS, ...migrated };
}

export async function saveSettings(partial: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const next: Settings = { ...current, ...partial, settingsVersion: SETTINGS_VERSION };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function clearApiKey(): Promise<void> {
  await saveSettings({ groqApiKey: undefined });
}

function migrateSettings(stored: Partial<Settings> | undefined): Partial<Settings> | undefined {
  if (!stored) return undefined;

  if ((stored.settingsVersion ?? 1) < 2) {
    return {
      ...stored,
      settingsVersion: SETTINGS_VERSION,
      autoDownloadMarkdown: false,
      autoDownloadJson: false,
      autoDownloadSummaryMarkdown: false,
      autoDownloadSummaryJson: false,
    };
  }

  return stored;
}
