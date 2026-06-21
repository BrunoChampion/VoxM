import { sendMessage } from '../core/messaging/sendMessage';
import { getRecording, type RecordingEntity } from '../core/storage/recordingRepository';
import { formatBytes } from '../core/utils/formatBytes';
import { formatDuration } from '../core/utils/formatDuration';
import {
  getMarkdownFilename,
  getJsonFilename,
  getSummaryDebugFilename,
  getSummaryMarkdownFilename,
  getVideoFilename,
} from '../core/downloads/fileNaming';

type RecordingsTab = 'summary' | 'transcript' | 'debug';
type CurrentSummary = NonNullable<RecordingEntity['summaryJson']>;
type RecordingListItem = Omit<
  RecordingEntity,
  'videoBlob' | 'transcriptMarkdown' | 'transcriptJson' | 'summaryMarkdown' | 'summaryJson'
> & {
  hasTranscript: boolean;
  hasSummary: boolean;
};

const content = document.getElementById('content')!;

let recordings: RecordingListItem[] = [];
let selectedRecordingId: string | null = null;
let selectedRecording: RecordingEntity | null = null;
let selectedTab: RecordingsTab = 'summary';
let videoObjectUrl: string | null = null;

function statusClass(status: RecordingEntity['status']): string {
  return `status-${status}`;
}

function statusLabel(status: RecordingEntity['status']): string {
  switch (status) {
    case 'preparing':
      return 'Preparing';
    case 'recording':
      return 'Recording';
    case 'stopping':
      return 'Stopping';
    case 'video_saved':
      return 'Video saved';
    case 'transcribing':
      return 'Transcribing';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'partial_video_failed':
      return 'Video export failed';
    case 'partial_transcript_failed':
      return 'Transcription incomplete';
    default:
      return status;
  }
}

function renderShell(): void {
  if (recordings.length === 0) {
    revokeVideoUrl();
    content.innerHTML = `
      <section class="empty-state">
        <div class="empty-mark">VX</div>
        <h2>No recordings yet</h2>
        <p>Start from the VoxM popup while your meeting tab is active. Finished meetings will appear here with video, transcript, summary, retries, and downloads.</p>
        <button class="btn-primary" id="open-popup">Open VoxM</button>
      </section>
    `;
    document.getElementById('open-popup')?.addEventListener('click', () => {
      void chrome.action.openPopup();
    });
    return;
  }

  content.innerHTML = `
    <div class="recordings-shell">
      <aside class="recording-sidebar" aria-label="Recordings">
        <div class="sidebar-head">
          <div>
            <p class="eyebrow">Local archive</p>
            <h2>Recordings</h2>
          </div>
          <span class="count-pill">${recordings.length}</span>
        </div>
        <div class="recording-nav">
          ${recordings.map(renderSidebarItem).join('')}
        </div>
      </aside>
      <section class="recording-detail" aria-live="polite">
        ${selectedRecording ? renderRecordingDetail(selectedRecording) : renderLoadingDetail()}
      </section>
    </div>
  `;

  content.querySelectorAll<HTMLButtonElement>('[data-select-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.selectId;
      if (!id || id === selectedRecordingId) return;
      selectedRecordingId = id;
      selectedTab = 'summary';
      void loadSelectedRecording();
    });
  });

  content.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedTab = button.dataset.tab as RecordingsTab;
      renderShell();
    });
  });

  content.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.action;
      if (!action || !selectedRecordingId) return;
      void handleAction(action, selectedRecordingId);
    });
  });
}

function renderSidebarItem(recording: RecordingListItem): string {
  const active = recording.id === selectedRecordingId;
  const title = recording.sourceTabTitle ?? 'Untitled recording';
  const created = new Date(recording.createdAt);
  return `
    <button class="recording-nav-item ${active ? 'is-active' : ''}" data-select-id="${recording.id}" type="button">
      <span class="nav-item-topline">
        <span class="recording-title">${escapeHtml(title)}</span>
        <span class="status-dot ${statusClass(recording.status)}" aria-hidden="true"></span>
      </span>
      <span class="nav-item-meta">
        <span>${escapeHtml(created.toLocaleDateString())}</span>
        <span>${escapeHtml(created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span>
        <span>${formatDuration(recording.durationMs ?? 0)}</span>
      </span>
      <span class="nav-item-assets">
        <span class="${recording.hasTranscript ? 'asset-ready' : ''}">Transcript</span>
        <span class="${recording.hasSummary ? 'asset-ready' : ''}">Summary</span>
      </span>
    </button>
  `;
}

function renderRecordingDetail(recording: RecordingEntity): string {
  const title = recording.sourceTabTitle ?? 'Untitled recording';
  const createdAt = new Date(recording.createdAt);
  const videoUrl = getVideoUrl(recording);

  return `
    <header class="detail-header">
      <div>
        <p class="eyebrow">${escapeHtml(createdAt.toLocaleString())}</p>
        <h1>${escapeHtml(title)}</h1>
        <div class="detail-meta">
          <span class="status-badge ${statusClass(recording.status)}">${statusLabel(recording.status)}</span>
          <span>${formatDuration(recording.durationMs ?? 0)}</span>
          ${recording.videoSizeBytes ? `<span>${formatBytes(recording.videoSizeBytes)}</span>` : ''}
          ${recording.audioChunkCount ? `<span>${recording.audioChunkCount} audio chunks</span>` : ''}
        </div>
      </div>
      <div class="detail-actions">
        ${getUsableVideoBlob(recording) ? '<button class="btn-secondary" data-action="download-video">Download WebM</button>' : ''}
        <button class="btn-secondary" data-action="retry-video">Retry Video Export</button>
        <button class="btn-danger" data-action="delete">Delete</button>
      </div>
    </header>

    <section class="video-panel">
      ${
        videoUrl
          ? `<video class="recording-video" controls preload="metadata" src="${videoUrl}"></video>`
          : `<div class="video-empty">
              <strong>Video preview is not available.</strong>
              <span>Retry export if internal chunks still exist, or keep internal chunks enabled for future tests.</span>
            </div>`
      }
    </section>

    ${renderWarnings(recording)}

    <nav class="detail-tabs" aria-label="Recording sections">
      ${renderTabButton('summary', 'Summary', Boolean(recording.summaryMarkdown))}
      ${renderTabButton('transcript', 'Transcript', Boolean(recording.transcriptMarkdown))}
      ${renderTabButton('debug', 'Debug', Boolean(recording.transcriptJson || recording.summaryJson))}
    </nav>

    <section class="detail-body">
      ${renderSelectedTab(recording)}
    </section>
  `;
}

function renderWarnings(recording: RecordingEntity): string {
  const warnings: string[] = [];
  if (recording.errorMessage) {
    warnings.push(`<div class="notice warning"><strong>${escapeHtml(recording.errorCode ?? 'Warning')}</strong><span>${escapeHtml(recording.errorMessage)}</span></div>`);
  }
  if (recording.summaryErrorMessage) {
    warnings.push(`<div class="notice warning"><strong>${escapeHtml(recording.summaryErrorCode ?? 'Summary issue')}</strong><span>${escapeHtml(recording.summaryErrorMessage)}</span></div>`);
  }
  return warnings.join('');
}

function renderTabButton(tab: RecordingsTab, label: string, ready: boolean): string {
  return `
    <button class="tab-button ${selectedTab === tab ? 'is-active' : ''}" data-tab="${tab}" type="button">
      ${label}
      <span>${ready ? 'Ready' : 'Pending'}</span>
    </button>
  `;
}

function renderSelectedTab(recording: RecordingEntity): string {
  if (selectedTab === 'summary') return renderSummary(recording);
  if (selectedTab === 'transcript') return renderTranscript(recording);
  return renderDebug(recording);
}

function renderSummary(recording: RecordingEntity): string {
  if (!recording.summaryJson || !recording.summaryMarkdown) {
    return `
      <div class="section-empty">
        <h2>No summary yet</h2>
        <p>Generate a meeting summary from the transcript using Groq llama-3.3-70b-versatile.</p>
        <button class="btn-primary" data-action="retry-summary">Generate Summary</button>
      </div>
    `;
  }

  if (!hasCurrentSummarySchema(recording.summaryJson)) {
    return `
      <div class="section-empty">
        <h2>Summary needs regeneration</h2>
        <p>This recording does not have summary data produced by the current meeting-minutes pipeline.</p>
        <button class="btn-primary" data-action="retry-summary">Regenerate Summary</button>
      </div>
    `;
  }

  const summary = recording.summaryJson;
  return `
    <article class="minutes-document">
      <header class="minutes-header">
        <div>
          <p class="eyebrow">Meeting minutes</p>
          <h2>${escapeHtml(summary.metadata.title ?? recording.sourceTabTitle ?? 'Untitled recording')}</h2>
          <p>${escapeHtml(summary.metadata.date ?? new Date(recording.createdAt).toLocaleDateString())} / ${formatDuration(recording.durationMs ?? summary.transcriptStats.durationMs)}</p>
        </div>
        <div class="minutes-actions">
          <button class="btn-secondary" data-action="copy-summary">Copy Summary</button>
          <button class="btn-secondary" data-action="download-summary-md">Download Summary MD</button>
          <button class="btn-secondary" data-action="retry-summary">Regenerate Summary</button>
        </div>
      </header>

      <section class="summary-lead">
        <h3>Summary</h3>
        <p>${escapeHtml(summary.executiveSummary)}</p>
      </section>

      ${renderStructuredList('Agenda', summary.agenda, 'No agenda inferred.')}
      ${renderStructuredList('Decisions', summary.decisions.map((item) => formatDecision(item)), 'No decisions identified.')}
      ${renderActionItems(summary)}
      ${renderTopics(summary.discussedTopics)}
      ${renderStructuredList('Open Questions', summary.openQuestions.map((item) => formatOpenQuestion(item)), 'No open questions identified.')}
      ${renderStructuredList('Parking Lot / Unresolved Items', summary.parkingLot.map((item) => formatParkingLot(item)), 'No unresolved parking-lot items identified.')}
      ${renderStructuredList('Risks And Blockers', summary.risksAndBlockers, 'No risks identified.')}
      ${renderStructuredList('Follow-Up Research', summary.followUpResearch, 'No follow-up research identified.')}
      ${renderStructuredList('Next Meeting Topics', summary.nextMeetingTopics, 'No next meeting topics identified.')}
      ${renderTimeline(summary.timelineHighlights)}
      ${renderStructuredList('Confidence Notes', summary.confidenceNotes, 'No confidence notes.')}
    </article>
  `;
}

function hasCurrentSummarySchema(summary: RecordingEntity['summaryJson']): summary is CurrentSummary {
  if (!summary) return false;
  const candidate = summary as Record<string, unknown>;
  const metadata = candidate.metadata as Record<string, unknown> | undefined;
  const transcriptStats = candidate.transcriptStats as Record<string, unknown> | undefined;
  const version = candidate.version as Record<string, unknown> | undefined;

  return (
    typeof candidate.recordingId === 'string' &&
    typeof candidate.generatedAt === 'string' &&
    candidate.modelProvider === 'groq' &&
    candidate.modelName === 'llama-3.3-70b-versatile' &&
    typeof candidate.executiveSummary === 'string' &&
    Boolean(metadata) &&
    metadata?.minutesAuthor === 'VoxM' &&
    Boolean(transcriptStats) &&
    typeof transcriptStats?.durationMs === 'number' &&
    typeof transcriptStats?.segmentCount === 'number' &&
    typeof transcriptStats?.failedChunkCount === 'number' &&
    Boolean(version) &&
    version?.value === '1.0' &&
    Array.isArray(candidate.attendance ? (candidate.attendance as Record<string, unknown>).present : undefined) &&
    Array.isArray(candidate.attendance ? (candidate.attendance as Record<string, unknown>).absent : undefined) &&
    Array.isArray(candidate.agenda) &&
    Array.isArray(candidate.discussedTopics) &&
    Array.isArray(candidate.decisions) &&
    Array.isArray(candidate.actionItems) &&
    Array.isArray(candidate.openQuestions) &&
    Array.isArray(candidate.parkingLot) &&
    Array.isArray(candidate.risksAndBlockers) &&
    Array.isArray(candidate.followUpResearch) &&
    Array.isArray(candidate.nextMeetingTopics) &&
    Array.isArray(candidate.timelineHighlights) &&
    Array.isArray(candidate.attachmentsAndReferences) &&
    Array.isArray(candidate.confidenceNotes)
  );
}

function renderActionItems(summary: CurrentSummary): string {
  const items = summary.actionItems;
  if (items.length === 0) {
    return renderStructuredList('Action Items', [], 'No action items identified.');
  }

  return `
    <section class="summary-section">
      <h2>Action Items</h2>
      <div class="action-list">
        ${items
          .map(
            (item) => `
              <div class="action-row">
                <strong>${escapeHtml(item.task)}</strong>
                <span>${escapeHtml(formatActionMeta(item))}</span>
                ${item.acceptanceCriteria ? `<p>${escapeHtml(item.acceptanceCriteria)}</p>` : ''}
              </div>
            `,
          )
          .join('')}
      </div>
    </section>
  `;
}

function renderTopics(topics: NonNullable<RecordingEntity['summaryJson']>['discussedTopics']): string {
  if (topics.length === 0) {
    return renderStructuredList('Notes By Topic', [], 'No topic notes identified.');
  }

  return `
    <section class="summary-section topic-notes">
      <h2>Notes By Topic</h2>
      ${topics
        .map(
          (topic) => `
            <article class="topic-note">
              <h3>${escapeHtml(topic.title)}</h3>
              <p>${escapeHtml(topic.summary)}</p>
              ${
                topic.keyPoints && topic.keyPoints.length > 0
                  ? `<ul>${topic.keyPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ul>`
                  : ''
              }
              ${
                topic.openIssues && topic.openIssues.length > 0
                  ? `<div class="topic-open"><strong>Open issues</strong><ul>${topic.openIssues
                      .map((issue) => `<li>${escapeHtml(issue)}</li>`)
                      .join('')}</ul></div>`
                  : ''
              }
            </article>
          `,
        )
        .join('')}
    </section>
  `;
}

function renderStructuredList(
  title: string,
  items: string[],
  emptyText: string,
  className = '',
): string {
  return `
    <section class="summary-section ${className}">
      <h2>${escapeHtml(title)}</h2>
      ${
        items.length > 0
          ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
          : `<p class="muted">${escapeHtml(emptyText)}</p>`
      }
    </section>
  `;
}

function renderTimeline(
  items: NonNullable<RecordingEntity['summaryJson']>['timelineHighlights'],
): string {
  if (items.length === 0) {
    return renderStructuredList('Timeline Highlights', [], 'No timeline highlights identified.');
  }

  return `
    <section class="summary-section timeline-section">
      <h2>Timeline Highlights</h2>
      <ol>
        ${items.map((item) => `<li><span>${escapeHtml(item.timestamp)}</span>${escapeHtml(item.note)}</li>`).join('')}
      </ol>
    </section>
  `;
}

function formatDecision(item: NonNullable<RecordingEntity['summaryJson']>['decisions'][number]): string {
  return [item.decision, item.rationale, item.evidence].filter(Boolean).join(' - ');
}

function formatOpenQuestion(
  item: NonNullable<RecordingEntity['summaryJson']>['openQuestions'][number],
): string {
  return [item.question, item.context, item.owner ? `Owner: ${item.owner}` : undefined]
    .filter(Boolean)
    .join(' - ');
}

function formatParkingLot(
  item: NonNullable<RecordingEntity['summaryJson']>['parkingLot'][number],
): string {
  return [
    item.item,
    item.nextStep ? `Next step: ${item.nextStep}` : undefined,
    item.suggestedOwner ? `Suggested owner: ${item.suggestedOwner}` : undefined,
  ]
    .filter(Boolean)
    .join(' - ');
}

function formatActionMeta(
  item: NonNullable<RecordingEntity['summaryJson']>['actionItems'][number],
): string {
  const parts = [
    item.owner ? `Owner: ${item.owner}` : undefined,
    item.dueDate ? `Due: ${item.dueDate}` : undefined,
    item.status && item.status !== 'unknown' ? `Status: ${item.status}` : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : 'Owner and date not specified';
}

function renderTranscript(recording: RecordingEntity): string {
  if (!recording.transcriptMarkdown) {
    return `
      <div class="section-empty">
        <h2>No transcript yet</h2>
        <p>Retry transcription when audio chunks are available.</p>
        <button class="btn-primary" data-action="retry-transcription">Retry Transcription</button>
      </div>
    `;
  }

  return `
    <div class="document-toolbar">
      <button class="btn-secondary" data-action="copy-transcript">Copy Transcript</button>
      <button class="btn-secondary" data-action="download-transcript-md">Download Transcript MD</button>
      <button class="btn-secondary" data-action="retry-transcription">Retry Transcription</button>
    </div>
    <pre class="document-viewer">${escapeHtml(recording.transcriptMarkdown)}</pre>
  `;
}

function renderDebug(recording: RecordingEntity): string {
  const debug = {
    recording: {
      id: recording.id,
      status: recording.status,
      createdAt: recording.createdAt,
      startedAt: recording.startedAt,
      stoppedAt: recording.stoppedAt,
      durationMs: recording.durationMs,
      videoFilename: recording.videoFilename,
      videoMimeType: recording.videoMimeType,
      videoSizeBytes: recording.videoSizeBytes,
      audioChunkCount: recording.audioChunkCount,
      videoChunkCount: recording.videoChunkCount,
      errorCode: recording.errorCode,
      errorMessage: recording.errorMessage,
    },
    transcript: recording.transcriptJson,
    summary: recording.summaryJson,
    summaryError: recording.summaryErrorMessage
      ? { code: recording.summaryErrorCode, message: recording.summaryErrorMessage }
      : undefined,
  };

  return `
    <div class="document-toolbar">
      <button class="btn-secondary" data-action="download-transcript-json">Download Transcription Debug JSON</button>
      ${
        recording.summaryJson
          ? '<button class="btn-secondary" data-action="download-summary-json">Download Summary Debug JSON</button>'
          : ''
      }
    </div>
    <pre class="document-viewer">${escapeHtml(JSON.stringify(debug, null, 2))}</pre>
  `;
}

function renderLoadingDetail(): string {
  return `
    <div class="section-empty">
      <h2>Loading recording</h2>
      <p>Fetching local recording details.</p>
    </div>
  `;
}

async function handleAction(action: string, recordingId: string): Promise<void> {
  const recording = selectedRecording;
  try {
    switch (action) {
      case 'copy-summary':
        await copyText(recording?.summaryMarkdown, 'Summary copied.');
        break;
      case 'copy-transcript':
        await copyText(recording?.transcriptMarkdown, 'Transcript copied.');
        break;
      case 'download-summary-md':
        downloadLocalText(recording?.summaryMarkdown, getSummaryMarkdownFilename(recordingDate(recording)), 'text/markdown');
        break;
      case 'download-summary-json':
        downloadLocalText(
          recording?.summaryJson ? JSON.stringify(recording.summaryJson, null, 2) : undefined,
          getSummaryDebugFilename(recordingDate(recording)),
          'application/json',
        );
        break;
      case 'download-transcript-md':
        downloadLocalText(recording?.transcriptMarkdown, getMarkdownFilename(recordingDate(recording)), 'text/markdown');
        break;
      case 'download-transcript-json':
        downloadLocalText(
          recording?.transcriptJson ? JSON.stringify(recording.transcriptJson, null, 2) : undefined,
          getJsonFilename(recordingDate(recording)),
          'application/json',
        );
        break;
      case 'download-video':
        downloadLocalBlob(getUsableVideoBlob(recording), recording?.videoFilename ?? getVideoFilename(recordingDate(recording)));
        break;
      case 'retry-summary':
        await sendMessage({ type: 'RETRY_SUMMARY', payload: { recordingId } });
        await loadSelectedRecording();
        await loadRecordings(false);
        break;
      case 'retry-transcription':
        await sendMessage({ type: 'RETRY_TRANSCRIPTION', payload: { recordingId } });
        await loadSelectedRecording();
        await loadRecordings(false);
        break;
      case 'retry-video':
        await sendMessage({ type: 'RETRY_VIDEO_DOWNLOAD', payload: { recordingId } });
        await loadSelectedRecording();
        await loadRecordings(false);
        break;
      case 'delete':
        await deleteRecording(recordingId);
        break;
    }
  } catch (error) {
    alert(error instanceof Error ? error.message : 'Action failed');
  }
}

async function copyText(text: string | undefined, message: string): Promise<void> {
  if (!text) return;
  await navigator.clipboard.writeText(text);
  alert(message);
}

function downloadLocalText(text: string | undefined, filename: string, type: string): void {
  if (!text) return;
  downloadLocalBlob(new Blob([text], { type: `${type};charset=utf-8` }), filename);
}

function downloadLocalBlob(blob: Blob | undefined, filename: string): void {
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function deleteRecording(recordingId: string): Promise<void> {
  if (
    !confirm(
      'Delete local recording metadata, transcript, summary, video preview, and stored chunks? Already downloaded files on your computer will not be removed.',
    )
  ) {
    return;
  }

  await sendMessage({ type: 'DELETE_RECORDING', payload: { recordingId } });
  selectedRecording = null;
  selectedRecordingId = null;
  await loadRecordings();
}

async function loadRecordings(shouldRender = true): Promise<void> {
  const loaded = await sendMessage<RecordingListItem[]>({ type: 'GET_RECORDINGS' });
  recordings = [...loaded].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  if (!selectedRecordingId || !recordings.some((recording) => recording.id === selectedRecordingId)) {
    selectedRecordingId = recordings[0]?.id ?? null;
  }

  if (selectedRecordingId) {
    await loadSelectedRecording(false);
  }

  if (shouldRender) {
    renderShell();
  }
}

async function loadSelectedRecording(shouldRender = true): Promise<void> {
  if (!selectedRecordingId) {
    selectedRecording = null;
    revokeVideoUrl();
    if (shouldRender) renderShell();
    return;
  }

  selectedRecording = (await getRecording(selectedRecordingId)) ?? null;
  revokeVideoUrl();
  if (shouldRender) renderShell();
}

function getVideoUrl(recording: RecordingEntity): string | null {
  const blob = getUsableVideoBlob(recording);
  if (!blob) return null;
  if (!videoObjectUrl) {
    videoObjectUrl = URL.createObjectURL(blob);
  }
  return videoObjectUrl;
}

function getUsableVideoBlob(recording: RecordingEntity | null | undefined): Blob | undefined {
  return recording?.videoBlob instanceof Blob ? recording.videoBlob : undefined;
}

function revokeVideoUrl(): void {
  if (!videoObjectUrl) return;
  URL.revokeObjectURL(videoObjectUrl);
  videoObjectUrl = null;
}

function recordingDate(recording: RecordingEntity | null): Date {
  return recording ? new Date(recording.startedAt) : new Date();
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'BROADCAST_STATE') {
    void loadRecordings();
  }
});

void loadRecordings();
