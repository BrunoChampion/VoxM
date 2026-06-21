import { describe, expect, it } from 'vitest';
import { renderSummaryMarkdown } from '../../src/core/summary/summaryMarkdown';
import type { MeetingSummaryJson } from '../../src/core/summary/summaryTypes';

describe('summaryMarkdown', () => {
  it('renders operational meeting sections', () => {
    const summary: MeetingSummaryJson = {
      recordingId: 'rec-1',
      generatedAt: '2026-06-20T10:00:00.000Z',
      modelProvider: 'groq',
      modelName: 'llama-3.3-70b-versatile',
      transcriptStats: {
        durationMs: 3_600_000,
        segmentCount: 12,
        failedChunkCount: 0,
      },
      metadata: {
        title: 'Launch review',
        date: '2026-06-20',
        duration: '1:00:00',
        source: 'Browser tab recording',
        minutesAuthor: 'VoxM',
      },
      attendance: {
        present: [],
        absent: [],
        notetaker: 'VoxM',
      },
      agenda: ['Launch plan'],
      executiveSummary: 'The team aligned on the launch plan.',
      discussedTopics: [
        { title: 'Launch', summary: 'Launch timing was reviewed.', keyPoints: ['Timing is ready.'] },
      ],
      decisions: [{ decision: 'Ship the MVP this week.' }],
      actionItems: [
        {
          task: 'Prepare release notes',
          owner: 'Bruno',
          status: 'open',
          acceptanceCriteria: 'Release notes cover setup and known limits.',
        },
      ],
      openQuestions: [{ question: 'Who owns the support inbox?' }],
      parkingLot: [{ item: 'Enterprise rollout', nextStep: 'Review after launch' }],
      risksAndBlockers: ['Groq quota may limit testing.'],
      followUpResearch: ['Check diarization providers.'],
      nextMeetingTopics: ['Review launch metrics.'],
      timelineHighlights: [{ timestamp: '00:10:00', note: 'Launch discussion started.' }],
      attachmentsAndReferences: ['Transcript'],
      version: {
        value: '1.0',
        lastUpdated: '2026-06-20T10:00:00.000Z',
        changes: 'Initial minutes.',
      },
      confidenceNotes: ['No failed chunks.'],
    };

    const markdown = renderSummaryMarkdown(summary);

    expect(markdown).toContain('# Meeting Minutes');
    expect(markdown).toContain('## Decisions');
    expect(markdown).toContain('## Action Items');
    expect(markdown).toContain('llama-3.3-70b-versatile');
  });
});
