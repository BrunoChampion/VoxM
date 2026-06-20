import type { GroqTranscriptionSegment } from './transcriptionTypes';

export type TranscriptionProviderOptions = {
  apiKey: string;
  model?: string;
  language?: string;
  prompt?: string;
  retries?: number;
};

export type TranscriptionProviderResult = {
  text: string;
  segments: GroqTranscriptionSegment[];
  language: string;
};

export type TranscriptionProvider = {
  id: 'groq';
  transcribeAudioChunk: (
    audioBlob: Blob,
    options: TranscriptionProviderOptions,
  ) => Promise<TranscriptionProviderResult>;
};
