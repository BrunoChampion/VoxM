import { sendMessage } from '../core/messaging/sendMessage';
import type { RecordingEntity } from '../core/storage/recordingRepository';
import { formatDuration } from '../core/utils/formatDuration';

const content = document.getElementById('content')!;

let recordings: RecordingEntity[] = [];
let expandedRecordingId: string | null = null;

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

function renderList(): void {
  if (recordings.length === 0) {
    content.innerHTML = `
      <div class="empty-state">
        <p>No recordings yet.</p>
        <button class="btn-primary" id="open-popup">Open VoxM</button>
      </div>
    `;
    document.getElementById('open-popup')?.addEventListener('click', () => {
      void chrome.action.openPopup();
    });
    return;
  }

  content.innerHTML = `
    <div class="recording-list">
      ${recordings
        .map(
          (recording) => `
        <div class="recording-card" data-id="${recording.id}">
          <h3>${escapeHtml(recording.sourceTabTitle ?? 'Untitled recording')}</h3>
          <div class="recording-meta">
            <span>${new Date(recording.createdAt).toLocaleString()}</span>
            <span>${formatDuration(recording.durationMs ?? 0)}</span>
            <span class="status-badge ${statusClass(recording.status)}">${statusLabel(recording.status)}</span>
            ${recording.videoFilename ? `<span>${escapeHtml(recording.videoFilename)}</span>` : ''}
          </div>
          <div class="actions">
            ${recording.transcriptMarkdown ? `<button class="btn-secondary" data-action="view" data-id="${recording.id}">View Transcript</button>` : ''}
            ${recording.transcriptMarkdown ? `<button class="btn-secondary" data-action="copy" data-id="${recording.id}">Copy Transcript</button>` : ''}
            ${recording.transcriptMarkdown ? `<button class="btn-secondary" data-action="download-md" data-id="${recording.id}">Download MD</button>` : ''}
            ${recording.transcriptJson ? `<button class="btn-secondary" data-action="download-json" data-id="${recording.id}">Download JSON</button>` : ''}
            <button class="btn-secondary" data-action="retry-transcription" data-id="${recording.id}">Retry Transcription</button>
            <button class="btn-secondary" data-action="retry-video" data-id="${recording.id}">Retry Video Export</button>
            <button class="btn-danger" data-action="delete" data-id="${recording.id}">Delete Local Data</button>
          </div>
          <div id="transcript-${recording.id}" class="transcript-viewer" style="display: ${expandedRecordingId === recording.id ? 'block' : 'none'};"></div>
        </div>
      `,
        )
        .join('')}
    </div>
  `;

  content.querySelectorAll('button[data-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const target = event.currentTarget as HTMLButtonElement;
      const action = target.dataset.action;
      const id = target.dataset.id;
      if (!action || !id) return;
      void handleAction(action, id);
    });
  });
}

async function handleAction(action: string, recordingId: string): Promise<void> {
  switch (action) {
    case 'view':
      await viewTranscript(recordingId);
      break;
    case 'copy':
      await copyTranscript(recordingId);
      break;
    case 'download-md':
      await downloadMarkdown(recordingId);
      break;
    case 'download-json':
      await downloadJson(recordingId);
      break;
    case 'retry-transcription':
      await retryTranscription(recordingId);
      break;
    case 'retry-video':
      await retryVideoDownload(recordingId);
      break;
    case 'delete':
      await deleteRecording(recordingId);
      break;
  }
}

async function viewTranscript(recordingId: string): Promise<void> {
  const recording = recordings.find((r) => r.id === recordingId);
  if (!recording?.transcriptMarkdown) return;

  expandedRecordingId = expandedRecordingId === recordingId ? null : recordingId;
  renderList();

  const viewer = document.getElementById(`transcript-${recordingId}`);
  if (viewer) {
    viewer.textContent = recording.transcriptMarkdown;
  }
}

async function copyTranscript(recordingId: string): Promise<void> {
  const recording = recordings.find((r) => r.id === recordingId);
  if (!recording?.transcriptMarkdown) return;

  try {
    await navigator.clipboard.writeText(recording.transcriptMarkdown);
    alert('Transcript copied to clipboard.');
  } catch {
    alert('Failed to copy transcript.');
  }
}

async function downloadMarkdown(recordingId: string): Promise<void> {
  const recording = recordings.find((r) => r.id === recordingId);
  if (!recording?.transcriptMarkdown) return;

  const blob = new Blob([recording.transcriptMarkdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `voxm-transcript_${recording.id.slice(0, 8)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadJson(recordingId: string): Promise<void> {
  const recording = recordings.find((r) => r.id === recordingId);
  if (!recording?.transcriptJson) return;

  const text = JSON.stringify(recording.transcriptJson, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `voxm-transcript_${recording.id.slice(0, 8)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function retryTranscription(recordingId: string): Promise<void> {
  try {
    await sendMessage({ type: 'RETRY_TRANSCRIPTION', payload: { recordingId } });
    await loadRecordings();
  } catch (error) {
    alert(error instanceof Error ? error.message : 'Retry failed');
  }
}

async function retryVideoDownload(recordingId: string): Promise<void> {
  try {
    await sendMessage({ type: 'RETRY_VIDEO_DOWNLOAD', payload: { recordingId } });
    await loadRecordings();
  } catch (error) {
    alert(error instanceof Error ? error.message : 'Retry failed');
  }
}

async function deleteRecording(recordingId: string): Promise<void> {
  if (
    !confirm(
      'Delete local metadata and transcript for this recording? Already downloaded files on your computer will not be removed.',
    )
  ) {
    return;
  }

  try {
    await sendMessage({ type: 'DELETE_RECORDING', payload: { recordingId } });
    await loadRecordings();
  } catch (error) {
    alert(error instanceof Error ? error.message : 'Delete failed');
  }
}

async function loadRecordings(): Promise<void> {
  recordings = await sendMessage<RecordingEntity[]>({ type: 'GET_RECORDINGS' });
  renderList();
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
