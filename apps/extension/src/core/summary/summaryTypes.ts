import type { TranscriptJson } from '../transcription/transcriptionTypes';

export type SummaryActionItem = {
  task: string;
  owner?: string;
  dueDate?: string;
  acceptanceCriteria?: string;
  linkedArtifacts?: string[];
  status?: 'open' | 'in_progress' | 'blocked' | 'done' | 'unknown';
  evidence?: string;
};

export type SummaryDecision = {
  decision: string;
  rationale?: string;
  evidence?: string;
};

export type SummaryOpenQuestion = {
  question: string;
  context?: string;
  owner?: string;
};

export type SummaryTopic = {
  title: string;
  summary: string;
  keyPoints?: string[];
  openIssues?: string[];
  evidence?: string;
};

export type MeetingSummaryJson = {
  recordingId: string;
  generatedAt: string;
  modelProvider: 'groq';
  modelName: 'llama-3.3-70b-versatile';
  transcriptStats: {
    durationMs: number;
    segmentCount: number;
    failedChunkCount: number;
  };
  metadata: {
    title?: string;
    date?: string;
    duration?: string;
    source?: string;
    minutesAuthor: 'VoxM';
  };
  attendance: {
    present: string[];
    absent: string[];
    notetaker?: string;
  };
  agenda: string[];
  executiveSummary: string;
  discussedTopics: SummaryTopic[];
  decisions: SummaryDecision[];
  actionItems: SummaryActionItem[];
  openQuestions: SummaryOpenQuestion[];
  parkingLot: Array<{
    item: string;
    nextStep?: string;
    suggestedOwner?: string;
  }>;
  risksAndBlockers: string[];
  followUpResearch: string[];
  nextMeetingTopics: string[];
  timelineHighlights: Array<{
    timestamp: string;
    note: string;
  }>;
  attachmentsAndReferences: string[];
  version: {
    value: '1.0';
    lastUpdated: string;
    changes: string;
  };
  confidenceNotes: string[];
};

export type MeetingSummaryInput = {
  recordingId: string;
  transcriptMarkdown: string;
  transcriptJson: TranscriptJson;
};
