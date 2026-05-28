/**
 * Subprocess worker for the openDocument track-changes forwarding test.
 */
import { mock } from 'bun:test';

let editorOpenCalled = false;
let capturedTrackChanges: unknown;

const MockEditor = {
  open: mock(async (_source: unknown, options: Record<string, unknown> = {}) => {
    editorOpenCalled = true;
    capturedTrackChanges = (options.modules as { trackChanges?: unknown } | undefined)?.trackChanges;
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
  syncCommentEntitiesFromCollaboration: () => new Set<string>(),
}));

mock.module('@superdoc/document-api', () => ({
  createDocumentApi: () => ({}),
}));

mock.module('happy-dom', () => ({
  Window: class {
    document = {
      createElement: () => ({}),
      body: { appendChild: () => {}, innerHTML: '' },
    };
    happyDOM = { abort: () => {} };
    close() {}
  },
}));

async function main() {
  const { openDocument } = await import('../../lib/document');

  const io = {
    stdout: () => {},
    stderr: () => {},
    readStdinBytes: async () => new Uint8Array(),
  };

  let opened: { dispose(): void } | undefined;
  try {
    opened = await openDocument(undefined, io, {
      editorOpenOptions: {
        modules: {
          trackChanges: {
            replacements: 'independent',
          },
        },
      },
    });
  } finally {
    opened?.dispose();
  }

  console.log(JSON.stringify({ editorOpenCalled, capturedTrackChanges }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
