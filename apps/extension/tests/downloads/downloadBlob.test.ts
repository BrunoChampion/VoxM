import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/core/errors/AppError';
import {
  downloadSummaryJson,
  downloadTranscriptJson,
  downloadTranscriptText,
  downloadVideoBlob,
} from '../../src/core/downloads/downloadBlob';

describe('downloadBlob helpers', () => {
  it('uses a valid data URL media type when object URLs are unavailable', async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    Object.defineProperty(URL, 'createObjectURL', {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: undefined,
      configurable: true,
    });
    const downloadSpy = vi.spyOn(chrome.downloads, 'download').mockResolvedValue(1 as never);

    try {
      await downloadVideoBlob(
        new Blob(['video'], { type: 'video/webm;codecs=vp8,opus' }),
        'video.webm',
      );
    } finally {
      Object.defineProperty(URL, 'createObjectURL', {
        value: originalCreateObjectURL,
        configurable: true,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        value: originalRevokeObjectURL,
        configurable: true,
      });
    }

    expect(downloadSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringMatching(/^data:video\/webm;base64,/),
      }),
    );
  });

  it('uses VIDEO_DOWNLOAD_FAILED for failed video downloads', async () => {
    vi.spyOn(chrome.downloads, 'download').mockResolvedValue(undefined as never);

    await expect(downloadVideoBlob(new Blob(['video']), 'video.webm')).rejects.toMatchObject({
      code: 'VIDEO_DOWNLOAD_FAILED',
    } satisfies Partial<AppError>);
  });

  it('uses TRANSCRIPT_DOWNLOAD_FAILED for failed transcript downloads', async () => {
    vi.spyOn(chrome.downloads, 'download').mockResolvedValue(undefined as never);

    await expect(downloadTranscriptText('hello', 'transcript.md')).rejects.toMatchObject({
      code: 'TRANSCRIPT_DOWNLOAD_FAILED',
    } satisfies Partial<AppError>);
  });

  it('uses markdown and json media types for text downloads when object URLs are unavailable', async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    Object.defineProperty(URL, 'createObjectURL', {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: undefined,
      configurable: true,
    });
    const downloadSpy = vi.spyOn(chrome.downloads, 'download').mockResolvedValue(1 as never);

    try {
      await downloadTranscriptText('# Transcript', 'transcript.md');
      await downloadTranscriptJson('{"ok":true}', 'debug.json');
      await downloadSummaryJson('{"ok":true}', 'summary-debug.json');
    } finally {
      Object.defineProperty(URL, 'createObjectURL', {
        value: originalCreateObjectURL,
        configurable: true,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        value: originalRevokeObjectURL,
        configurable: true,
      });
    }

    expect(downloadSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ url: expect.stringMatching(/^data:text\/markdown;base64,/) }),
    );
    expect(downloadSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ url: expect.stringMatching(/^data:application\/json;base64,/) }),
    );
    expect(downloadSpy).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ url: expect.stringMatching(/^data:application\/json;base64,/) }),
    );
  });
});
