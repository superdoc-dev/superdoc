/**
 * Subprocess worker for the collab password forwarding test.
 * Runs in isolation so mock.module doesn't leak across test files.
 */
import { mock } from 'bun:test';

// Track what gets passed to Editor.open
let editorOpenCalled = false;
let capturedPassword: string | undefined;

const MockEditor = {
  open: mock(async (_source: unknown, options: Record<string, unknown> = {}) => {
    editorOpenCalled = true;
    capturedPassword = options.password as string | undefined;
    return {
      destroy: () => {},
      exportDocument: async () => new Uint8Array(),
    };
  }),
};

mock.module('superdoc/super-editor', () => ({
  Editor: MockEditor,
  BLANK_DOCX_BASE64: '',
  DocxEncryptionError: class DocxEncryptionError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  getDocumentApiAdapters: () => ({}),
  markdownToPmDoc: () => null,
  initPartsRuntime: () => ({ dispose: () => {} }),
}));

mock.module('happy-dom', () => ({
  Window: class {
    document = {
      createElement: () => ({}),
      body: { appendChild: () => {}, innerHTML: '' },
    };
    close() {}
  },
}));

const mockYArray = { observe: () => {}, toArray: () => [], toJSON: () => [], length: 0 };
const mockYMap = { observe: () => {}, get: () => undefined, set: () => {} };
const mockYDoc = {
  getXmlFragment: () => ({ toArray: () => [] }),
  getArray: () => mockYArray,
  getMap: () => mockYMap,
  transact: (fn: () => void) => fn(),
};

mock.module('../../lib/collaboration', () => ({
  createCollaborationRuntime: () => ({
    waitForSync: async () => {},
    ydoc: mockYDoc,
    provider: { destroy: () => {} },
    dispose: () => {},
  }),
}));

mock.module('../../lib/bootstrap', () => ({
  DEFAULT_BOOTSTRAP_SETTLING_MS: 0,
  waitForContentSettling: async () => {},
  detectRoomState: () => 'empty' as const,
  resolveBootstrapDecision: () => ({ action: 'seed' as const, source: 'doc' as const }),
  claimBootstrap: async () => ({ granted: true }),
  clearBootstrapMarker: () => {},
  writeBootstrapMarker: () => {},
  detectBootstrapRace: async () => ({ raceDetected: false }),
}));

async function main() {
  const { openCollaborativeDocument } = await import('../../lib/document');
  const { join } = await import('path');

  const repoRoot = join(import.meta.dir, '../../../../..');
  const encryptedDoc = join(
    repoRoot,
    'packages/super-editor/src/editors/v1/core/ooxml-encryption/fixtures/encrypted-advanced-text.docx',
  );

  const io = {
    stdout: () => {},
    stderr: () => {},
    readStdinBytes: async () => new Uint8Array(),
  };

  const profile = {
    documentId: 'test-doc-id',
    serverUrl: 'ws://localhost:1234',
  };

  try {
    // Pass a real encrypted file path to exercise the file-backed seed branch:
    // openCollaborativeDocument → shouldSeed=true → docForEditor=encryptedDoc
    // → openDocument(encryptedDoc, ...) → Editor.open(buffer, { password })
    await openCollaborativeDocument(encryptedDoc, io, profile, {
      editorOpenOptions: { password: 'collab-test-secret' },
    });
  } catch {
    // May fail on export or other subsystem — we only care about Editor.open call
  }

  console.log(JSON.stringify({ editorOpenCalled, capturedPassword }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
