import type { TranscriptJson } from '../transcription/transcriptionTypes';
import type { RecordingStatus } from '../recording/recordingTypes';
import { getDB } from './db';

export type RecordingEntity = {
  id: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  stoppedAt?: string;
  durationMs?: number;

  status: RecordingStatus;

  sourceType: 'browser_tab';
  sourceTabTitle?: string;
  sourceTabUrl?: string;

  videoDownloadId?: number;
  videoFilename?: string;
  videoMimeType?: string;
  videoSizeBytes?: number;

  transcriptMarkdown?: string;
  transcriptJson?: TranscriptJson;

  transcriptMarkdownDownloadId?: number;
  transcriptJsonDownloadId?: number;

  modelProvider: 'groq';
  modelName: 'whisper-large-v3-turbo';
  language?: string;

  diarization: false;

  videoChunkCount?: number;
  audioChunkCount?: number;

  errorCode?: string;
  errorMessage?: string;
};

export async function createRecording(
  recording: Omit<RecordingEntity, 'createdAt' | 'updatedAt'>,
): Promise<RecordingEntity> {
  const now = new Date().toISOString();
  const entity: RecordingEntity = {
    ...recording,
    createdAt: now,
    updatedAt: now,
  };
  const db = await getDB();
  await db.put('recordings', entity);
  return entity;
}

export async function getRecording(id: string): Promise<RecordingEntity | undefined> {
  const db = await getDB();
  return db.get('recordings', id);
}

export async function updateRecording(
  id: string,
  partial: Partial<RecordingEntity>,
): Promise<RecordingEntity | undefined> {
  const db = await getDB();
  const existing = await db.get('recordings', id);
  if (!existing) return undefined;

  const updated: RecordingEntity = {
    ...existing,
    ...partial,
    id: existing.id,
    updatedAt: new Date().toISOString(),
  };
  await db.put('recordings', updated);
  return updated;
}

export async function listRecordings(): Promise<RecordingEntity[]> {
  const db = await getDB();
  return db.getAllFromIndex('recordings', 'createdAt');
}

export async function deleteRecording(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('recordings', id);
}
