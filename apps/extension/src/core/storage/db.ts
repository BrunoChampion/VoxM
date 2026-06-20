import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { RecordingEntity } from './recordingRepository';
import type { VideoChunkEntity, AudioChunkEntity } from './chunkRepository';

export const DB_NAME = 'voxm_v1';
export const DB_VERSION = 1;

interface VoxmDB extends DBSchema {
  recordings: {
    key: string;
    value: RecordingEntity;
    indexes: { createdAt: string };
  };
  videoChunks: {
    key: string;
    value: VideoChunkEntity;
    indexes: { 'recordingId+index': [string, number] };
  };
  audioChunks: {
    key: string;
    value: AudioChunkEntity;
    indexes: {
      'recordingId+index': [string, number];
      transcriptionStatus: string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<VoxmDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<VoxmDB>> {
  if (!dbPromise) {
    dbPromise = openDB<VoxmDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('recordings')) {
          const recordingsStore = db.createObjectStore('recordings', { keyPath: 'id' });
          recordingsStore.createIndex('createdAt', 'createdAt');
        }

        if (!db.objectStoreNames.contains('videoChunks')) {
          const videoStore = db.createObjectStore('videoChunks', { keyPath: 'id' });
          videoStore.createIndex('recordingId+index', ['recordingId', 'index'], {
            unique: true,
          });
        }

        if (!db.objectStoreNames.contains('audioChunks')) {
          const audioStore = db.createObjectStore('audioChunks', { keyPath: 'id' });
          audioStore.createIndex('recordingId+index', ['recordingId', 'index'], {
            unique: true,
          });
          audioStore.createIndex('transcriptionStatus', 'transcriptionStatus');
        }
      },
    });
  }
  return dbPromise;
}

export async function closeDB(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
}
