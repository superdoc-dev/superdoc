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
  (window as any).__SUPERDOC_AUDIT_MOCK__ = (event: {
    type: string;
    data?: Record<string, unknown>;
  }) => {
    recordAuditEvent(event.type, event.data);
  };
}

vi.stubGlobal(
  '__SUPERDOC_AUDIT_MOCK__',
  (event: { type: string; data?: Record<string, unknown> }) => {
    recordAuditEvent(event.type, event.data);
  },
);

const mockEditor = {
  commands: {
    updateStructuredContentById: mockUpdateStructuredContentById,
  },
  helpers: {
    structuredContentCommands: {
      getStructuredContentTags: mockGetStructuredContentTags,
    },
  },
  state: {},
};

const SuperDocMock = vi.fn((options: any = {}) => {
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

(SuperDocMock as any).mockEditor = mockEditor;
(SuperDocMock as any).mockUpdateStructuredContentById = mockUpdateStructuredContentById;
(SuperDocMock as any).mockGetStructuredContentTags = mockGetStructuredContentTags;
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
