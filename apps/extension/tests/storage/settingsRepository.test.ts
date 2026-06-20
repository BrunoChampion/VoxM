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
});
