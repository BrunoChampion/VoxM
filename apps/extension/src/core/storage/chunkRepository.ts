import type { GroqTranscriptionSegment } from '../transcription/transcriptionTypes';
import { getDB } from './db';

export type VideoChunkEntity = {
  id: string;
  recordingId: string;
  index: number;
  createdAt: string;
  blob: Blob;
  sizeBytes: number;
  mimeType: string;
};

export type AudioChunkEntity = {
  id: string;
  recordingId: string;
  index: number;
  offsetMs: number;
  durationMs?: number;
  createdAt: string;
  blob: Blob;
  sizeBytes: number;
  mimeType: string;

  transcriptionStatus: 'pending' | 'transcribing' | 'completed' | 'failed';
  transcriptionAttempts: number;
  groqRawResponse?: unknown;
  transcriptSegments?: GroqTranscriptionSegment[];
  errorCode?: string;
  errorMessage?: string;
};

type StoredBlob = {
  __voxmBlob: true;
  buffer: ArrayBuffer;
  type: string;
  size: number;
};

type PersistedVideoChunk = Omit<VideoChunkEntity, 'blob'> & { blob: StoredBlob | Blob };
type PersistedAudioChunk = Omit<AudioChunkEntity, 'blob'> & { blob: StoredBlob | Blob };

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function shouldStoreBlobDirectly(): boolean {
  return typeof chrome !== 'undefined' && typeof chrome.runtime?.id === 'string';
}

async function blobToStored(blob: Blob): Promise<StoredBlob> {
  const buffer = await (blob.arrayBuffer?.() ?? blobToArrayBufferFallback(blob));
  return {
    __voxmBlob: true,
    buffer,
    type: blob.type,
    size: blob.size,
  };
}

function blobToArrayBufferFallback(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

async function toPersistedBlob(blob: Blob): Promise<Blob | StoredBlob> {
  return shouldStoreBlobDirectly() ? blob : blobToStored(blob);
}

function storedToBlob(stored: StoredBlob | Blob): Blob {
  if (stored instanceof Blob) {
    return stored;
  }
  return new Blob([stored.buffer], { type: stored.type });
}

function reviveVideoChunk(chunk: PersistedVideoChunk): VideoChunkEntity {
  return {
    ...chunk,
    blob: storedToBlob(chunk.blob),
  };
}

function reviveAudioChunk(chunk: PersistedAudioChunk): AudioChunkEntity {
  return {
    ...chunk,
    blob: storedToBlob(chunk.blob),
  };
}

export async function saveVideoChunk(
  chunk: Omit<VideoChunkEntity, 'id' | 'createdAt'>,
): Promise<VideoChunkEntity> {
  const entity: VideoChunkEntity = {
    ...chunk,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };

  const persisted: PersistedVideoChunk = {
    ...entity,
    blob: await toPersistedBlob(entity.blob),
  };

  const db = await getDB();
  await db.put('videoChunks', persisted as unknown as VideoChunkEntity);
  return entity;
}

export async function listVideoChunksByRecordingId(
  recordingId: string,
): Promise<VideoChunkEntity[]> {
  const db = await getDB();
  const index = db.transaction('videoChunks').store.index('recordingId+index');
  const range = IDBKeyRange.bound([recordingId, 0], [recordingId, Number.MAX_SAFE_INTEGER]);
  const raw: PersistedVideoChunk[] = [];
  let cursor = await index.openCursor(range);
  while (cursor) {
    raw.push(cursor.value as PersistedVideoChunk);
    cursor = await cursor.continue();
  }
  return raw.map(reviveVideoChunk);
}

export async function countVideoChunks(recordingId: string): Promise<number> {
  const chunks = await listVideoChunksByRecordingId(recordingId);
  return chunks.length;
}

export async function deleteVideoChunksByRecordingId(recordingId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('videoChunks', 'readwrite');
  const index = tx.store.index('recordingId+index');
  const range = IDBKeyRange.bound([recordingId, 0], [recordingId, Number.MAX_SAFE_INTEGER]);
  let cursor = await index.openCursor(range);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function saveAudioChunk(
  chunk: Omit<
    AudioChunkEntity,
    'id' | 'createdAt' | 'transcriptionStatus' | 'transcriptionAttempts'
  >,
): Promise<AudioChunkEntity> {
  const entity: AudioChunkEntity = {
    ...chunk,
    id: generateId(),
    createdAt: new Date().toISOString(),
    transcriptionStatus: 'pending',
    transcriptionAttempts: 0,
  };

  const persisted: PersistedAudioChunk = {
    ...entity,
    blob: await toPersistedBlob(entity.blob),
  };

  const db = await getDB();
  await db.put('audioChunks', persisted as unknown as AudioChunkEntity);
  return entity;
}

export async function getAudioChunk(id: string): Promise<AudioChunkEntity | undefined> {
  const db = await getDB();
  const raw = (await db.get('audioChunks', id)) as PersistedAudioChunk | undefined;
  return raw ? reviveAudioChunk(raw) : undefined;
}

export async function updateAudioChunk(
  id: string,
  partial: Partial<AudioChunkEntity>,
): Promise<AudioChunkEntity | undefined> {
  const db = await getDB();
  const existing = await db.get('audioChunks', id);
  if (!existing) return undefined;
  const revivedExisting = reviveAudioChunk(existing as unknown as PersistedAudioChunk);

  const updated: AudioChunkEntity = {
    ...revivedExisting,
    ...partial,
    id: revivedExisting.id,
  };

  const persisted: PersistedAudioChunk = {
    ...updated,
    blob: await toPersistedBlob(updated.blob),
  };

  await db.put('audioChunks', persisted as unknown as AudioChunkEntity);
  return updated;
}

export async function listAudioChunksByRecordingId(
  recordingId: string,
): Promise<AudioChunkEntity[]> {
  const db = await getDB();
  const index = db.transaction('audioChunks').store.index('recordingId+index');
  const range = IDBKeyRange.bound([recordingId, 0], [recordingId, Number.MAX_SAFE_INTEGER]);
  const raw: PersistedAudioChunk[] = [];
  let cursor = await index.openCursor(range);
  while (cursor) {
    raw.push(cursor.value as PersistedAudioChunk);
    cursor = await cursor.continue();
  }
  return raw.map(reviveAudioChunk);
}

export async function listPendingAudioChunks(recordingId: string): Promise<AudioChunkEntity[]> {
  const all = await listAudioChunksByRecordingId(recordingId);
  return all.filter(
    (chunk) => chunk.transcriptionStatus === 'pending' || chunk.transcriptionStatus === 'failed',
  );
}

export async function deleteAudioChunksByRecordingId(recordingId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('audioChunks', 'readwrite');
  const index = tx.store.index('recordingId+index');
  const range = IDBKeyRange.bound([recordingId, 0], [recordingId, Number.MAX_SAFE_INTEGER]);
  let cursor = await index.openCursor(range);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function deleteChunksByRecordingId(recordingId: string): Promise<void> {
  await deleteVideoChunksByRecordingId(recordingId);
  await deleteAudioChunksByRecordingId(recordingId);
}
