import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getSupportedVideoMimeType,
  getSupportedAudioMimeType,
} from '../../src/core/audio/mimeTypes';
import { AppError } from '../../src/core/errors/AppError';

describe('mimeTypes', () => {
  let originalIsTypeSupported: typeof MediaRecorder.isTypeSupported;

  beforeEach(() => {
    originalIsTypeSupported = MediaRecorder.isTypeSupported;
  });

  afterEach(() => {
    MediaRecorder.isTypeSupported = originalIsTypeSupported;
  });

  describe('getSupportedVideoMimeType', () => {
    it('selects the first supported video MIME type', () => {
      vi.stubGlobal('MediaRecorder', {
        isTypeSupported: (type: string) => type === 'video/webm;codecs=vp8,opus',
      });

      expect(getSupportedVideoMimeType()).toBe('video/webm;codecs=vp8,opus');
    });

    it('falls back to plain video/webm when codecs are unsupported', () => {
      vi.stubGlobal('MediaRecorder', {
        isTypeSupported: (type: string) => type === 'video/webm',
      });

      expect(getSupportedVideoMimeType()).toBe('video/webm');
    });

    it('throws VIDEO_RECORDER_UNSUPPORTED when nothing is supported', () => {
      vi.stubGlobal('MediaRecorder', {
        isTypeSupported: () => false,
      });

      expect(() => getSupportedVideoMimeType()).toThrow(AppError);
      expect(() => getSupportedVideoMimeType()).toThrow('No supported video MIME type');
    });
  });

  describe('getSupportedAudioMimeType', () => {
    it('selects the first supported audio MIME type', () => {
      vi.stubGlobal('MediaRecorder', {
        isTypeSupported: (type: string) => type === 'audio/webm',
      });

      expect(getSupportedAudioMimeType()).toBe('audio/webm');
    });

    it('throws AUDIO_RECORDER_UNSUPPORTED when nothing is supported', () => {
      vi.stubGlobal('MediaRecorder', {
        isTypeSupported: () => false,
      });

      expect(() => getSupportedAudioMimeType()).toThrow(AppError);
      expect(() => getSupportedAudioMimeType()).toThrow('No supported audio MIME type');
    });
  });
});
