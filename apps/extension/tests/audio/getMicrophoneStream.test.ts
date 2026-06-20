import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getMicrophonePermissionState,
  getMicrophoneStream,
} from '../../src/core/audio/getMicrophoneStream';

function mockGetUserMedia(errorName?: string): void {
  const getUserMedia = errorName
    ? vi.fn().mockRejectedValue(new DOMException('mock error', errorName))
    : vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
      });

  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  });
}

describe('getMicrophoneStream', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a microphone stream when permission is granted', async () => {
    mockGetUserMedia();

    await expect(getMicrophoneStream()).resolves.toBeDefined();
  });

  it.each([
    ['NotAllowedError', 'MIC_PERMISSION_DENIED'],
    ['NotFoundError', 'MIC_NOT_FOUND'],
    ['NotReadableError', 'MIC_NOT_READABLE'],
    ['SecurityError', 'MIC_SECURITY_BLOCKED'],
  ])('maps %s to %s', async (errorName, code) => {
    mockGetUserMedia(errorName);

    await expect(getMicrophoneStream()).rejects.toMatchObject({ code });
  });

  it('reads microphone permission state when supported', async () => {
    Object.defineProperty(navigator, 'permissions', {
      value: {
        query: vi.fn().mockResolvedValue({ state: 'denied' }),
      },
      configurable: true,
    });

    await expect(getMicrophonePermissionState()).resolves.toBe('denied');
  });

  it('returns unsupported when permissions query is unavailable', async () => {
    Object.defineProperty(navigator, 'permissions', {
      value: undefined,
      configurable: true,
    });

    await expect(getMicrophonePermissionState()).resolves.toBe('unsupported');
  });
});
