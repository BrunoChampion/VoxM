import { describe, it, expect } from 'vitest';
import {
  loadSettings,
  saveSettings,
  clearApiKey,
  DEFAULT_SETTINGS,
} from '../../src/core/storage/settingsRepository';

describe('settingsRepository', () => {
  it('loads default settings when none exist', async () => {
    const settings = await loadSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('saves and loads settings', async () => {
    await saveSettings({ groqApiKey: 'gsk_test' });
    const settings = await loadSettings();
    expect(settings.groqApiKey).toBe('gsk_test');
  });

  it('clears API key', async () => {
    await saveSettings({ groqApiKey: 'gsk_test' });
    await clearApiKey();
    const settings = await loadSettings();
    expect(settings.groqApiKey).toBeUndefined();
  });

  it('merges partial updates without overwriting other fields', async () => {
    await saveSettings({ groqApiKey: 'gsk_test', language: 'en' });
    await saveSettings({ captureMic: false });
    const settings = await loadSettings();
    expect(settings.groqApiKey).toBe('gsk_test');
    expect(settings.language).toBe('en');
    expect(settings.captureMic).toBe(false);
  });

  it('migrates old auto-download document settings off by default', async () => {
    await chrome.storage.local.set({
      'voxm:settings': {
        modelProvider: 'groq',
        modelName: 'whisper-large-v3-turbo',
        autoDownloadVideo: true,
        autoDownloadMarkdown: true,
        autoDownloadJson: true,
        autoDownloadSummaryMarkdown: true,
        autoDownloadSummaryJson: true,
      },
    });

    const settings = await loadSettings();

    expect(settings.autoDownloadVideo).toBe(true);
    expect(settings.autoDownloadMarkdown).toBe(false);
    expect(settings.autoDownloadJson).toBe(false);
    expect(settings.autoDownloadSummaryMarkdown).toBe(false);
    expect(settings.autoDownloadSummaryJson).toBe(false);
  });
});
