import { describe, it, expect } from 'vitest';
import {
  getVideoFilename,
  getMarkdownFilename,
  getJsonFilename,
  getSummaryDebugFilename,
  getSummaryMarkdownFilename,
  getTranscriptionDebugFilename,
  formatTimestampForFilename,
} from '../../src/core/downloads/fileNaming';

describe('fileNaming', () => {
  it('generates safe filenames with timestamp', () => {
    const date = new Date(2026, 5, 19, 14, 30, 45);
    expect(getVideoFilename(date)).toMatch(/^voxm-recording_2026-06-19_14-30-45\.webm$/);
  });

  it('generates markdown transcript filename', () => {
    const date = new Date(2026, 5, 19, 14, 30, 45);
    expect(getMarkdownFilename(date)).toMatch(/^voxm-transcript_2026-06-19_14-30-45\.md$/);
  });

  it('generates json transcript filename', () => {
    const date = new Date(2026, 5, 19, 14, 30, 45);
    expect(getJsonFilename(date)).toMatch(
      /^voxm-transcription-debug_2026-06-19_14-30-45\.json$/,
    );
    expect(getTranscriptionDebugFilename(date)).toMatch(
      /^voxm-transcription-debug_2026-06-19_14-30-45\.json$/,
    );
  });

  it('generates summary filenames', () => {
    const date = new Date(2026, 5, 19, 14, 30, 45);
    expect(getSummaryMarkdownFilename(date)).toMatch(/^voxm-summary_2026-06-19_14-30-45\.md$/);
    expect(getSummaryDebugFilename(date)).toMatch(
      /^voxm-summary-debug_2026-06-19_14-30-45\.json$/,
    );
  });

  it('removes unsafe characters from filenames', () => {
    const dirty = getVideoFilename(new Date());
    expect(dirty).not.toMatch(/[<>:"/\\|?*]/);
  });

  it('does not include meeting URL or participant names', () => {
    const filename = getVideoFilename(new Date());
    expect(filename).not.toContain('meet');
    expect(filename).not.toContain('zoom');
    expect(filename).not.toContain('teams');
  });

  it('formats timestamp correctly', () => {
    expect(formatTimestampForFilename(new Date(2026, 0, 2, 3, 4, 5))).toBe('2026-01-02_03-04-05');
  });
});
