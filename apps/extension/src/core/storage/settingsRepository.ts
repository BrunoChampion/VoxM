const SETTINGS_KEY = 'voxm:settings';

export type Settings = {
  groqApiKey?: string;
  modelProvider: 'groq';
  modelName: 'whisper-large-v3-turbo';
  language?: string;
  captureMic: boolean;
  autoDownloadVideo: boolean;
  autoDownloadMarkdown: boolean;
  autoDownloadJson: boolean;
  showConsentReminder: boolean;
  keepInternalVideoChunksAfterExport: boolean;
  videoBitsPerSecond: number;
  audioBitsPerSecond: number;
};

export const DEFAULT_SETTINGS: Settings = {
  modelProvider: 'groq',
  modelName: 'whisper-large-v3-turbo',
  captureMic: true,
  autoDownloadVideo: true,
  autoDownloadMarkdown: true,
  autoDownloadJson: true,
  showConsentReminder: true,
  keepInternalVideoChunksAfterExport: false,
  videoBitsPerSecond: 1_500_000,
  audioBitsPerSecond: 96_000,
};

export async function loadSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const stored = result[SETTINGS_KEY] as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(partial: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const next: Settings = { ...current, ...partial };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function clearApiKey(): Promise<void> {
  await saveSettings({ groqApiKey: undefined });
}
