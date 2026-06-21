import { describe, expect, it } from 'vitest';
import { buildSummaryPrompt } from '../../src/core/summary/GroqSummaryClient';
import type { MeetingSummaryInput } from '../../src/core/summary/summaryTypes';

describe('GroqSummaryClient', () => {
  it('instructs Groq to summarize in the transcript language', () => {
    const input: MeetingSummaryInput = {
      recordingId: 'rec-1',
      transcriptMarkdown: '# Meeting Transcript\n\n[00:00:00] Hola, revisemos el plan.',
      transcriptJson: {
        recordingId: 'rec-1',
        createdAt: '2026-06-20T10:00:00.000Z',
        durationMs: 60_000,
        source: 'browser-tab',
        model: 'whisper-large-v3-turbo',
        language: 'es',
        diarization: false,
        segments: [{ startMs: 0, endMs: 1000, text: 'Hola, revisemos el plan.' }],
        failedChunks: [],
      },
    };

    const prompt = buildSummaryPrompt(input);

    expect(prompt).toContain('Output language: es');
    expect(prompt).toContain('Do not translate the meeting into English');
  });
});
