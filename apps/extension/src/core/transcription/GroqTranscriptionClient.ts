import { AppError } from '../errors/AppError';
import type { ErrorCode } from '../errors/errorCodes';
import { sleep } from '../utils/sleep';
import type { GroqTranscriptionSegment, GroqVerboseJsonResponse } from './transcriptionTypes';
import type { TranscriptionProvider } from './TranscriptionProvider';

export type GroqTranscribeOptions = {
  apiKey: string;
  model?: string;
  language?: string;
  prompt?: string;
  retries?: number;
};

export type GroqTranscribeResult = {
  text: string;
  segments: GroqTranscriptionSegment[];
  language: string;
};

const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return undefined;
}

function classifyGroqError(status: number): { code: ErrorCode; message: string } {
  if (status === 401) {
    return {
      code: 'GROQ_INVALID_API_KEY',
      message: 'Invalid Groq API key. Please check your API key in settings.',
    };
  }
  if (status === 429) {
    return {
      code: 'GROQ_RATE_LIMITED',
      message:
        'Groq rate limit reached. Your audio chunks were saved locally. Retry transcription later.',
    };
  }
  if (status === 402 || status === 403) {
    return {
      code: 'GROQ_QUOTA_EXCEEDED',
      message: 'Groq quota or billing issue. Please check your Groq account.',
    };
  }
  return {
    code: 'GROQ_TRANSCRIPTION_FAILED',
    message: `Groq transcription failed (${status}). Please try again or check the recording chunk.`,
  };
}

export async function transcribeAudioChunk(
  audioBlob: Blob,
  options: GroqTranscribeOptions,
): Promise<GroqTranscribeResult> {
  const model = options.model ?? 'whisper-large-v3-turbo';
  const maxAttempts = Math.max(1, options.retries ?? 3);
  const delays = [0, 2_000, 8_000];

  let lastError: { code: ErrorCode; message: string } | null = null;
  let nextRetryDelayMs: number | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await sleep(nextRetryDelayMs ?? delays[attempt] ?? 8_000);
      nextRetryDelayMs = undefined;
    }

    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'chunk.webm');
      formData.append('model', model);
      formData.append('response_format', 'verbose_json');
      formData.append('temperature', '0');
      formData.append('timestamp_granularities[]', 'segment');

      if (options.language) {
        formData.append('language', options.language);
      }
      if (options.prompt) {
        formData.append('prompt', options.prompt);
      }

      const response = await fetch(GROQ_TRANSCRIPTION_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        await response.text().catch(() => '');
        const error = classifyGroqError(response.status);
        lastError = error;

        if (response.status === 401 || response.status === 402 || response.status === 403) {
          throw new AppError(error.code, error.message);
        }

        if (isRetryableStatus(response.status) && attempt < maxAttempts - 1) {
          if (response.status === 429) {
            const retryAfterMs = parseRetryAfterMs(response.headers?.get('retry-after') ?? null);
            if (retryAfterMs !== undefined) {
              nextRetryDelayMs = retryAfterMs;
            }
          }
          continue;
        }

        throw new AppError(error.code, error.message);
      }

      const data = (await response.json()) as GroqVerboseJsonResponse;
      return {
        text: data.text ?? '',
        segments: data.segments ?? [],
        language: data.language ?? 'auto',
      };
    } catch (error) {
      if (error instanceof AppError) {
        lastError = { code: error.code, message: error.message };
        if (
          error.code === 'GROQ_INVALID_API_KEY' ||
          error.code === 'GROQ_QUOTA_EXCEEDED' ||
          error.code === 'GROQ_RATE_LIMITED'
        ) {
          throw error;
        }
        if (attempt === maxAttempts - 1) {
          throw error;
        }
        continue;
      }

      const message = error instanceof Error ? error.message : 'Network or unknown error';
      lastError = {
        code: 'GROQ_TRANSCRIPTION_FAILED',
        message,
      };

      if (attempt === maxAttempts - 1) {
        throw new AppError('GROQ_TRANSCRIPTION_FAILED', message, error);
      }
    }
  }

  throw new AppError(
    lastError?.code ?? 'GROQ_TRANSCRIPTION_FAILED',
    lastError?.message ?? 'Transcription failed after retries',
  );
}

export function createGroqTranscriptionProvider(): TranscriptionProvider {
  return {
    id: 'groq',
    transcribeAudioChunk,
  };
}
