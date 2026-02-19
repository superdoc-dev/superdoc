import '@testing-library/jest-dom/vitest';

const mockUpdateStructuredContentById = vi.fn();
const mockGetStructuredContentTags = vi.fn(() => []);
const mockDestroy = vi.fn();

const auditEvents: Array<{ type: string; data?: Record<string, unknown> }> = [];

export const resetAuditEvents = () => {
  auditEvents.length = 0;
};

export const recordAuditEvent = (type: string, data?: Record<string, unknown>) => {
  auditEvents.push({ type, data });
};

export const getAuditEventTypes = () => auditEvents.map((event) => event.type);

if (typeof window !== 'undefined') {
  (window as any).__SUPERDOC_AUDIT_MOCK__ = (event: { type: string; data?: Record<string, unknown> }) => {
    recordAuditEvent(event.type, event.data);
  };
}

vi.stubGlobal('__SUPERDOC_AUDIT_MOCK__', (event: { type: string; data?: Record<string, unknown> }) => {
  recordAuditEvent(event.type, event.data);
});

const mockAppendRowsToStructuredContentTable = vi.fn();
const mockGetStructuredContentTablesById = vi.fn(() => []);

const mockEditor = {
  commands: {
    updateStructuredContentById: mockUpdateStructuredContentById,
    appendRowsToStructuredContentTable: mockAppendRowsToStructuredContentTable,
  },
  helpers: {
    structuredContentCommands: {
      getStructuredContentTags: mockGetStructuredContentTags,
      getStructuredContentTablesById: mockGetStructuredContentTablesById,
    },
  },
  state: {},
  view: {
    dispatch: vi.fn(),
  },
};

let lastConstructorOptions: any = null;

const SuperDocMock = vi.fn((options: any = {}) => {
  lastConstructorOptions = options;

  if (options?.onReady) {
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(() => options.onReady());
    } else {
      Promise.resolve().then(() => options.onReady());
    }
  }

  return {
    destroy: mockDestroy,
    activeEditor: mockEditor,
    on: vi.fn(),
  };
});

export const getLastConstructorOptions = () => lastConstructorOptions;
export const resetLastConstructorOptions = () => {
  lastConstructorOptions = null;
};

(SuperDocMock as any).mockEditor = mockEditor;
(SuperDocMock as any).mockUpdateStructuredContentById = mockUpdateStructuredContentById;
(SuperDocMock as any).mockGetStructuredContentTags = mockGetStructuredContentTags;
(SuperDocMock as any).mockAppendRowsToStructuredContentTable = mockAppendRowsToStructuredContentTable;
(SuperDocMock as any).mockGetStructuredContentTablesById = mockGetStructuredContentTablesById;
(SuperDocMock as any).mockDestroy = mockDestroy;
(SuperDocMock as any).mockAuditEvents = auditEvents;
(SuperDocMock as any).resetAuditEvents = resetAuditEvents;
(SuperDocMock as any).recordAuditEvent = recordAuditEvent;
(SuperDocMock as any).getAuditEventTypes = getAuditEventTypes;

vi.mock('superdoc', () => ({
  SuperDoc: SuperDocMock,
}));

const canvasProto = globalThis.HTMLCanvasElement?.prototype;

if (canvasProto) {
  canvasProto.getContext = vi.fn(() => ({
    font: '',
    fillStyle: '',
    textAlign: '',
    textBaseline: '',
    measureText: () => ({ width: 100 }),
    fillText: () => undefined,
  })) as any;

  canvasProto.toDataURL = vi.fn(() => 'data:image/png;base64,mock');
}
