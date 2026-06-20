import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { transcribeAudioChunk } from '../../src/core/transcription/GroqTranscriptionClient';
import { AppError } from '../../src/core/errors/AppError';

describe('GroqTranscriptionClient', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it('builds correct multipart request with required fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          task: 'transcribe',
          language: 'en',
          duration: 10,
          text: 'Hello world',
          segments: [{ id: 0, start: 0, end: 10, text: 'Hello world' }],
        }),
    });
    globalThis.fetch = fetchMock;

    await transcribeAudioChunk(new Blob(['audio']), {
      apiKey: 'gsk_test',
      model: 'whisper-large-v3-turbo',
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ Authorization: 'Bearer gsk_test' });

    const body = options.body as FormData;
    expect(body.get('model')).toBe('whisper-large-v3-turbo');
    expect(body.get('response_format')).toBe('verbose_json');
    expect(body.get('temperature')).toBe('0');
    expect(body.get('timestamp_granularities[]')).toBe('segment');
  });

  it('includes language only when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          task: 'transcribe',
          language: 'es',
          duration: 5,
          text: 'Hola',
          segments: [],
        }),
    });
    globalThis.fetch = fetchMock;

    await transcribeAudioChunk(new Blob(['audio']), {
      apiKey: 'gsk_test',
      language: 'es',
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = options.body as FormData;
    expect(body.get('language')).toBe('es');
  });

  it('does not include language when omitted', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          task: 'transcribe',
          language: 'en',
          duration: 5,
          text: 'Hello',
          segments: [],
        }),
    });
    globalThis.fetch = fetchMock;

    await transcribeAudioChunk(new Blob(['audio']), { apiKey: 'gsk_test' });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = options.body as FormData;
    expect(body.get('language')).toBeNull();
  });

  it('throws GROQ_INVALID_API_KEY on 401 without retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    });
    globalThis.fetch = fetchMock;

    await expect(
      transcribeAudioChunk(new Blob(['audio']), { apiKey: 'bad_key', retries: 3 }),
    ).rejects.toThrow(AppError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 and eventually succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limited'),
      })
      .mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            task: 'transcribe',
            language: 'en',
            duration: 5,
            text: 'Hello',
            segments: [],
          }),
      });
    globalThis.fetch = fetchMock;

    const result = await transcribeAudioChunk(new Blob(['audio']), {
      apiKey: 'gsk_test',
      retries: 3,
    });
    expect(result.text).toBe('Hello');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses retry-after header for 429 retries', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ 'retry-after': '3' }),
        text: () => Promise.resolve('Rate limited'),
      })
      .mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            task: 'transcribe',
            language: 'en',
            duration: 5,
            text: 'Hello',
            segments: [],
          }),
      });
    globalThis.fetch = fetchMock;

    const resultPromise = transcribeAudioChunk(new Blob(['audio']), {
      apiKey: 'gsk_test',
      retries: 2,
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(2_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    const result = await resultPromise;
    expect(result.text).toBe('Hello');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('retries on 5xx errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: () => Promise.resolve('Service unavailable'),
      })
      .mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            task: 'transcribe',
            language: 'en',
            duration: 5,
            text: 'Hello',
            segments: [],
          }),
      });
    globalThis.fetch = fetchMock;

    const result = await transcribeAudioChunk(new Blob(['audio']), {
      apiKey: 'gsk_test',
      retries: 3,
    });
    expect(result.text).toBe('Hello');
  });

  it('redacts API key in error messages', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    });
    globalThis.fetch = fetchMock;

    try {
      await transcribeAudioChunk(new Blob(['audio']), { apiKey: 'gsk_secret' });
    } catch (error) {
      expect(error instanceof AppError).toBe(true);
      expect((error as AppError).message).not.toContain('gsk_secret');
    }
  });

  it('does not expose raw Groq error body in messages', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('provider body with gsk_secret and internal details'),
    });
    globalThis.fetch = fetchMock;

    try {
      await transcribeAudioChunk(new Blob(['audio']), { apiKey: 'gsk_secret', retries: 1 });
    } catch (error) {
      expect(error instanceof AppError).toBe(true);
      expect((error as AppError).message).not.toContain('provider body');
      expect((error as AppError).message).not.toContain('gsk_secret');
      expect((error as AppError).message).toContain('Groq transcription failed (500)');
    }
  });

  it('returns a retry-later message when rate limited after retries', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers(),
      text: () => Promise.resolve('Rate limited'),
    });
    globalThis.fetch = fetchMock;

    await expect(
      transcribeAudioChunk(new Blob(['audio']), { apiKey: 'gsk_test', retries: 1 }),
    ).rejects.toMatchObject({
      code: 'GROQ_RATE_LIMITED',
      message:
        'Groq rate limit reached. Your audio chunks were saved locally. Retry transcription later.',
    });
  });
});
