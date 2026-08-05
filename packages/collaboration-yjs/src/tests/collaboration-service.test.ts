import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { CollaborationWebSocket, SocketRequest } from '../types/service-types.js';

vi.mock('../internal-logger/logger.js', () => ({
  createLogger: vi.fn(),
}));

vi.mock('../document-manager/manager.js', () => ({
  DocumentManager: vi.fn(),
}));

vi.mock('../connection-handler/handler.js', () => ({
  ConnectionHandler: vi.fn(),
}));

vi.mock('../collaboration/helpers.js', () => ({
  generateParams: vi.fn(),
}));

import { createLogger as createLoggerMock } from '../internal-logger/logger.js';
import { DocumentManager as DocumentManagerMock } from '../document-manager/manager.js';
import { ConnectionHandler as ConnectionHandlerMock } from '../connection-handler/handler.js';
import { generateParams as generateParamsMock } from '../collaboration/helpers.js';
import { SuperDocCollaboration } from '../collaboration/collaboration.js';

describe('SuperDocCollaboration', () => {
  let handleSpy: ReturnType<typeof vi.fn>;
  let loggerSpy: ReturnType<typeof vi.fn>;
  const documentManagerCtor = DocumentManagerMock as unknown as ReturnType<typeof vi.fn>;
  const connectionHandlerCtor = ConnectionHandlerMock as unknown as ReturnType<typeof vi.fn>;
  const generateParamsFn = generateParamsMock as unknown as ReturnType<typeof vi.fn>;
  const createLoggerFn = createLoggerMock as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    handleSpy = vi.fn();
    loggerSpy = vi.fn();

    createLoggerFn.mockImplementation(() => loggerSpy);

    documentManagerCtor.mockImplementation(function DocumentManagerStub(
      this: {
        config: unknown;
        has: ReturnType<typeof vi.fn>;
      },
      config: unknown
    ) {
      this.config = config;
      this.has = vi.fn();
    });

    connectionHandlerCtor.mockImplementation(function ({ documentManager, hooks }) {
      return {
        handle: handleSpy,
        documentManager,
        hooks,
      };
    });

    generateParamsFn.mockImplementation(() => ({
      documentId: 'doc-123',
      params: {},
    }));
  });

  test('constructs with provided config and wires dependencies', () => {
    const hooks = { load: vi.fn() };
    const config = { name: 'alpha', hooks, debounce: 10, documentExpiryMs: 5000 };

    const service = new SuperDocCollaboration(config);

    expect(service.config).toBe(config);
    expect(DocumentManagerMock).toHaveBeenCalledWith(config);
    expect(ConnectionHandlerMock).toHaveBeenCalledWith({
      documentManager: documentManagerCtor.mock.instances[0],
      hooks,
    });
    expect(service.documentManager).toBe(documentManagerCtor.mock.instances[0]);
    expect(createLoggerMock).toHaveBeenCalledWith('SuperDocCollaboration');
  });

  test('name getter returns configured name or default', () => {
    const service = new SuperDocCollaboration({ hooks: {} });

    expect(service.name).toBe('SuperDocCollaboration');

    service.config.name = 'beta';
    expect(service.name).toBe('beta');
  });

  test('welcome logs and delegates to connection handler', async () => {
    const config = { hooks: {} };
    const service = new SuperDocCollaboration(config);
    const socket = {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
      on: vi.fn(),
    } as CollaborationWebSocket;
    const request: SocketRequest = { url: '/collab/doc-1', params: { documentId: 'doc-1' } };
    const params = { documentId: 'doc-999', params: { user: 'alice' } };

    generateParamsFn.mockReturnValueOnce(params);

    await service.welcome(socket, request);

    expect(generateParamsMock).toHaveBeenCalledWith(request, service);
    expect(loggerSpy).toHaveBeenCalledWith('New connection request', params.documentId);
    expect(handleSpy).toHaveBeenCalledWith(socket, request, params);
  });

  test('has proxies to the document manager instance', () => {
    const service = new SuperDocCollaboration({ hooks: {} });
    const manager = documentManagerCtor.mock.instances[0] as { has: ReturnType<typeof vi.fn> };
    manager.has.mockReturnValueOnce(true);

    expect(service.has('doc-007')).toBe(true);
    expect(manager.has).toHaveBeenCalledWith('doc-007');
  });
});
