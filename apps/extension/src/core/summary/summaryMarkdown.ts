import { formatDuration } from '../utils/formatDuration';
import type { MeetingSummaryJson } from './summaryTypes';

export function renderSummaryMarkdown(summary: MeetingSummaryJson): string {
  const lines: string[] = [
    '# Meeting Minutes',
    '',
    '## Metadata',
    '',
    `- Title: ${summary.metadata.title ?? 'TBD'}`,
    `- Date: ${summary.metadata.date ?? 'TBD'}`,
    `- Duration: ${summary.metadata.duration ?? formatDuration(summary.transcriptStats.durationMs)}`,
    `- Source: ${summary.metadata.source ?? 'Browser tab recording'}`,
    `- Minutes author: ${summary.metadata.minutesAuthor}`,
    `- Model: ${summary.modelProvider} ${summary.modelName}`,
    `- Transcript segments: ${summary.transcriptStats.segmentCount}`,
    `- Failed transcript chunks: ${summary.transcriptStats.failedChunkCount}`,
    `- Generated: ${new Date(summary.generatedAt).toLocaleString()}`,
    '',
    '## Attendance',
    '',
    `- Present: ${summary.attendance.present.length > 0 ? summary.attendance.present.join(', ') : 'TBD'}`,
    `- Absent: ${summary.attendance.absent.length > 0 ? summary.attendance.absent.join(', ') : 'TBD'}`,
    `- Notetaker / recorder: ${summary.attendance.notetaker ?? 'VoxM'}`,
    '',
  ];

  addStringList(lines, 'Agenda', summary.agenda);

  lines.push(
    '## Executive Summary',
    '',
    summary.executiveSummary || 'No summary was generated.',
    '',
  );

  addDecisions(lines, summary.decisions);
  addActionItems(lines, summary.actionItems);
  addTopics(lines, 'Notes By Agenda Item', summary.discussedTopics);
  addOpenQuestions(lines, summary.openQuestions);
  addParkingLot(lines, summary.parkingLot);
  addStringList(lines, 'Risks And Blockers', summary.risksAndBlockers);
  addStringList(lines, 'Follow-Up Research', summary.followUpResearch);
  addStringList(lines, 'Next Meeting Topics', summary.nextMeetingTopics);
  addTimeline(lines, summary.timelineHighlights);
  addStringList(lines, 'Attachments And References', summary.attachmentsAndReferences);
  addStringList(lines, 'Confidence Notes', summary.confidenceNotes);
  lines.push(
    '## Version And Change Log',
    '',
    `- Version: ${summary.version.value}`,
    `- Last updated: ${summary.version.lastUpdated}`,
    `- Changes: ${summary.version.changes}`,
    '',
  );

  return `${lines.join('\n').trim()}\n`;
}

function addTopics(lines: string[], title: string, topics: MeetingSummaryJson['discussedTopics']): void {
  lines.push(`## ${title}`, '');
  if (topics.length === 0) {
    lines.push('- None identified.', '');
    return;
  }
  for (const topic of topics) {
    lines.push(`### ${topic.title}`, '', topic.summary);
    if (topic.keyPoints && topic.keyPoints.length > 0) {
      lines.push('', 'Key points:');
      for (const point of topic.keyPoints) {
        lines.push(`- ${point}`);
      }
    }
    if (topic.openIssues && topic.openIssues.length > 0) {
      lines.push('', 'Open issues / questions:');
      for (const issue of topic.openIssues) {
        lines.push(`- ${issue}`);
      }
    }
    if (topic.evidence) {
      lines.push('', `Evidence: ${topic.evidence}`);
    }
    lines.push('');
  }
}

function addDecisions(lines: string[], decisions: MeetingSummaryJson['decisions']): void {
  lines.push('## Decisions', '');
  if (decisions.length === 0) {
    lines.push('- None identified.', '');
    return;
  }
  for (const item of decisions) {
    const details = [item.rationale, item.evidence].filter(Boolean).join(' Evidence: ');
    lines.push(`- ${item.decision}${details ? ` - ${details}` : ''}`);
  }
  lines.push('');
}

function addActionItems(lines: string[], items: MeetingSummaryJson['actionItems']): void {
  lines.push('## Action Items', '');
  if (items.length === 0) {
    lines.push('- None identified.', '');
    return;
  }
  for (const item of items) {
    const meta = [
      item.owner ? `Owner: ${item.owner}` : undefined,
      item.dueDate ? `Due: ${item.dueDate}` : undefined,
      item.status ? `Status: ${item.status}` : undefined,
      item.acceptanceCriteria ? `Acceptance criteria: ${item.acceptanceCriteria}` : undefined,
      item.linkedArtifacts && item.linkedArtifacts.length > 0
        ? `Linked artifacts: ${item.linkedArtifacts.join(', ')}`
        : undefined,
      item.evidence ? `Evidence: ${item.evidence}` : undefined,
    ].filter(Boolean);
    lines.push(`- ${item.task}${meta.length > 0 ? ` (${meta.join('; ')})` : ''}`);
  }
  lines.push('');
}

function addParkingLot(lines: string[], items: MeetingSummaryJson['parkingLot']): void {
  lines.push('## Parking Lot / Unresolved Items', '');
  if (items.length === 0) {
    lines.push('- None identified.', '');
    return;
  }
  for (const item of items) {
    const meta = [
      item.nextStep ? `Next step: ${item.nextStep}` : undefined,
      item.suggestedOwner ? `Suggested owner: ${item.suggestedOwner}` : undefined,
    ].filter(Boolean);
    lines.push(`- ${item.item}${meta.length > 0 ? ` (${meta.join('; ')})` : ''}`);
  }
  lines.push('');
}

function addOpenQuestions(lines: string[], questions: MeetingSummaryJson['openQuestions']): void {
  lines.push('## Open Questions', '');
  if (questions.length === 0) {
    lines.push('- None identified.', '');
    return;
  }
  for (const item of questions) {
    const meta = [item.owner ? `Owner: ${item.owner}` : undefined, item.context].filter(Boolean);
    lines.push(`- ${item.question}${meta.length > 0 ? ` - ${meta.join('; ')}` : ''}`);
  }
  lines.push('');
}

function addStringList(lines: string[], title: string, items: string[]): void {
  lines.push(`## ${title}`, '');
  if (items.length === 0) {
    lines.push('- None identified.', '');
    return;
  }
  for (const item of items) {
    lines.push(`- ${item}`);
  }
  lines.push('');
}

function addTimeline(lines: string[], items: MeetingSummaryJson['timelineHighlights']): void {
  lines.push('## Timeline Highlights', '');
  if (items.length === 0) {
    lines.push('- None identified.', '');
    return;
  }
  for (const item of items) {
    lines.push(`- [${item.timestamp}] ${item.note}`);
  }
  lines.push('');
}
