import 'fake-indexeddb/auto';
import { beforeEach, vi } from 'vitest';

const storage: Record<string, unknown> = {};

const chromeMock = {
  storage: {
    local: {
      get: (key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key];
        const result: Record<string, unknown> = {};
        for (const k of keys) {
          if (storage[k] !== undefined) result[k] = storage[k];
        }
        return Promise.resolve(result);
      },
      set: (items: Record<string, unknown>) => {
        Object.assign(storage, items);
        return Promise.resolve();
      },
      remove: (key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key];
        for (const k of keys) delete storage[k];
        return Promise.resolve();
      },
      clear: () => {
        for (const key of Object.keys(storage)) delete storage[key];
        return Promise.resolve();
      },
    },
  },
  runtime: {
    sendMessage: () => Promise.resolve({ success: true }),
    getURL: (path: string) => `chrome-extension://test/${path}`,
    getContexts: () => Promise.resolve([]),
    onMessage: {
      addListener: () => undefined,
    },
    onStartup: {
      addListener: () => undefined,
    },
    onInstalled: {
      addListener: () => undefined,
    },
    ContextType: {
      OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT',
    },
  },
  offscreen: {
    createDocument: () => Promise.resolve(),
  },
  downloads: {
    download: () => Promise.resolve(1),
  },
  action: {
    setBadgeText: () => Promise.resolve(),
    setBadgeBackgroundColor: () => Promise.resolve(),
    setTitle: () => Promise.resolve(),
    openPopup: () => Promise.resolve(),
  },
  tabs: {
    query: () => Promise.resolve([{ id: 1, title: 'Test', url: 'https://example.com' }]),
    get: () => Promise.resolve({ id: 1, title: 'Test', url: 'https://example.com' }),
    create: () => Promise.resolve(),
    sendMessage: () => Promise.resolve(),
  },
  tabCapture: {
    getMediaStreamId: (_options: unknown, callback: (streamId: string) => void) => {
      callback('test-stream-id');
    },
  },
};

Object.defineProperty(globalThis, 'chrome', {
  value: chromeMock,
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, 'crypto', {
  value: {
    randomUUID: () => `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  },
  writable: true,
  configurable: true,
});

class MediaRecorderMock {
  static isTypeSupported = () => true;
  state = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.onstop?.();
  }
}

Object.defineProperty(globalThis, 'MediaRecorder', {
  value: MediaRecorderMock,
  writable: true,
  configurable: true,
});

beforeEach(() => {
  for (const key of Object.keys(storage)) delete storage[key];
  vi.restoreAllMocks();
});
