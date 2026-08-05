import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { applyUpdateMock, createLoggerMock } = vi.hoisted(() => ({
  applyUpdateMock: vi.fn(),
  createLoggerMock: vi.fn(),
}));

vi.mock('yjs', () => ({
  applyUpdate: applyUpdateMock,
}));

vi.mock('../internal-logger/logger.js', () => ({
  createLogger: createLoggerMock,
}));

vi.mock('../shared-doc/index.js', () => {
  const SharedSuperDoc = vi.fn(function (documentId: string) {
    const doc = {
      name: documentId,
      conns: new Map<CollaborationWebSocket, Set<number>>(),
      listeners: {} as Record<string, (...args: unknown[]) => void>,
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        doc.listeners[event] = handler;
      }),
    } as unknown as MockSharedDoc;
    return doc;
  });

  return { SharedSuperDoc };
});

import { DocumentManager } from '../document-manager/manager.js';
import { SharedSuperDoc } from '../shared-doc/index.js';
import type { SharedSuperDoc as SharedSuperDocType } from '../shared-doc/shared-doc.js';
import type { CollaborationWebSocket } from '../types/service-types.js';

const createSocket = (): CollaborationWebSocket => ({
  readyState: 1,
  send: vi.fn(),
  close: vi.fn(),
  on: vi.fn(),
});

type MockSharedDoc = SharedSuperDocType & {
  listeners: Record<string, (...args: unknown[]) => void>;
};

describe('DocumentManager', () => {
  let loggerSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    loggerSpy = vi.fn();
    createLoggerMock.mockReturnValue(loggerSpy);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('creates document once, applies loaded updates, and schedules debounced autosave', async () => {
    const loadMock = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    const autoSaveMock = vi.fn();
    const manager = new DocumentManager({
      hooks: { load: loadMock, autoSave: autoSaveMock },
      debounce: 25,
      documentExpiryMs: 100,
    });

    const userParams = { documentId: 'doc-1', userId: 'alice' };
    const doc = (await manager.getDocument('doc-1', userParams)) as MockSharedDoc;

    expect(SharedSuperDoc).toHaveBeenCalledTimes(1);
    expect(SharedSuperDoc).toHaveBeenCalledWith('doc-1');
    expect(loggerSpy).toHaveBeenCalledWith('Tracking new document: doc-1');
    expect(loadMock).toHaveBeenCalledWith(userParams);
    expect(applyUpdateMock).toHaveBeenCalledWith(doc, new Uint8Array([1, 2, 3]));
    expect(manager.get('doc-1')).toBe(doc);
    expect(manager.get('missing')).toBeNull();
    expect(manager.has('doc-1')).toBe(true);

    const sameDoc = await manager.getDocument('doc-1', userParams);
    expect(sameDoc).toBe(doc);

    // trigger autosave via debounced update
    doc.listeners.update?.();
    expect(autoSaveMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(25);
    expect(autoSaveMock).toHaveBeenCalledWith(userParams);
  });

  test('autosaves immediately when debounce is zero and load returns nothing', async () => {
    const loadMock = vi.fn().mockResolvedValue(null);
    const autoSaveMock = vi.fn();
    const manager = new DocumentManager({
      hooks: { load: loadMock, autoSave: autoSaveMock },
      debounce: 0,
    });
    const params = { documentId: 'doc-2', locale: 'en' };

    await manager.getDocument('doc-2', params);

    expect(loadMock).toHaveBeenCalledWith(params);
    expect(applyUpdateMock).not.toHaveBeenCalled();
    expect(autoSaveMock).toHaveBeenCalledWith(params);
  });

  test('releaseConnection schedules cleanup and purges document after expiry', async () => {
    const manager = new DocumentManager({
      hooks: {},
      documentExpiryMs: 50,
    });
    const doc = await manager.getDocument('doc-3', { documentId: 'doc-3' });
    const socket = createSocket();
    doc.conns.set(socket, new Set());

    manager.releaseConnection('doc-3', socket);
    expect(doc.conns.size).toBe(0);

    vi.advanceTimersByTime(50);
    expect(loggerSpy).toHaveBeenCalledWith('🗑️  Cleaning up document "doc-3" from memory.');
    expect(manager.has('doc-3')).toBe(false);
  });

  test('cleanup timer aborts when connections return before expiry', async () => {
    const manager = new DocumentManager({
      hooks: {},
      documentExpiryMs: 75,
    });
    const doc = await manager.getDocument('doc-keep', { documentId: 'doc-keep' });
    const socket = createSocket();
    doc.conns.set(socket, new Set());

    manager.releaseConnection('doc-keep', socket);
    doc.conns.set(createSocket(), new Set());

    vi.advanceTimersByTime(75);
    const loggedCleanup = loggerSpy.mock.calls.some((call) => {
      const [message] = call;
      return typeof message === 'string' && message.includes('Cleaning up document');
    });
    expect(loggedCleanup).toBe(false);
    expect(manager.has('doc-keep')).toBe(true);
  });

  test('releaseConnection ignores unknown documents and leaves active docs untouched', async () => {
    const manager = new DocumentManager({
      hooks: {},
    });

    manager.releaseConnection('missing', createSocket());

    const doc = await manager.getDocument('doc-4', { documentId: 'doc-4' });
    const socketA = createSocket();
    const socketB = createSocket();
    doc.conns.set(socketA, new Set());
    doc.conns.set(socketB, new Set());

    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    manager.releaseConnection('doc-4', socketA);
    expect(doc.conns.has(socketA)).toBe(false);
    expect(doc.conns.has(socketB)).toBe(true);
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
  });

  test('clears pending cleanup timers when document is requested again', async () => {
    const manager = new DocumentManager({
      hooks: {},
      documentExpiryMs: 100,
    });
    const userContext = { user: 'retry', documentId: 'doc-5' };
    const doc = await manager.getDocument('doc-5', userContext);
    const socket = createSocket();
    doc.conns.set(socket, new Set());

    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    manager.releaseConnection('doc-5', socket);
    const cleanupTimer = setTimeoutSpy.mock.results.at(-1)?.value;
    expect(cleanupTimer).toBeDefined();

    await manager.getDocument('doc-5', userContext);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(cleanupTimer);
    expect(manager.has('doc-5')).toBe(true);

    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  });
});
