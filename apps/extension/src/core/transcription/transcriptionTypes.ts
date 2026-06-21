export type TranscriptSegment = {
  startMs: number;
  endMs: number;
  text: string;
};

export type FailedChunk = {
  chunkIndex: number;
  offsetMs: number;
  errorCode: string;
  errorMessage: string;
};

export type TranscriptJson = {
  recordingId: string;
  createdAt: string;
  durationMs: number;
  source: 'browser-tab';
  model: 'whisper-large-v3-turbo';
  language?: string;
  diarization: false;
  segments: TranscriptSegment[];
  failedChunks: FailedChunk[];
};

export type GroqTranscriptionSegment = {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
};

export type GroqVerboseJsonResponse = {
  task: 'transcribe';
  language: string;
  duration: number;
  text: string;
  segments: GroqTranscriptionSegment[];
  words?: unknown[];
};
