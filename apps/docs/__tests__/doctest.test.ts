import { test, describe, beforeAll, expect } from 'bun:test';
import { resolve } from 'node:path';
import { Editor, getStarterExtensions } from '../../../packages/superdoc/dist/super-editor.es.js';

// Headless toolbar exports — loaded dynamically because they may not
// exist in the dist until the feature branch is merged and rebuilt.
let createHeadlessToolbar: any;
let headlessToolbarConstants: any;
let headlessToolbarHelpers: any;
try {
  const mod = await import('../../../packages/superdoc/dist/super-editor.es.js');
  createHeadlessToolbar = mod.createHeadlessToolbar;
  headlessToolbarConstants = mod.headlessToolbarConstants;
  headlessToolbarHelpers = mod.headlessToolbarHelpers;
} catch {
  // Not available yet — headless tests will be skipped
}
import { extractExamples } from './lib/extract.ts';
import { transformCode, applyStubs } from './lib/transform.ts';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const docsRoot = resolve(import.meta.dir, '..');
const fixturePath = resolve(import.meta.dir, '../../../packages/super-editor/src/editors/v1/tests/data/complex2.docx');

let fixtureBuffer: Buffer;

beforeAll(async () => {
  const bytes = await Bun.file(fixturePath).arrayBuffer();
  fixtureBuffer = Buffer.from(bytes);
});

/**
 * Returns true if the error indicates a real API breakage in the user's code
 * (method removed, renamed, or signature changed). Internal library errors
 * (where the broken reference doesn't appear in the transformed code) are
 * not considered API errors.
 */
function isApiError(err: unknown, code: string): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;

  if (msg.includes('is not a function')) {
    const match = msg.match(/^(.+?)\s+is not a function/);
    if (match) return code.includes(match[1].trim());
    return true;
  }

  if (msg.includes('Cannot read properties of undefined')) {
    const match = msg.match(/reading '([^']+)'/);
    if (match) return code.includes(match[1]);
    return true;
  }

  if (msg.includes('Cannot read property')) return true;
  if (msg.includes('Expected') && msg.includes('argument')) return true;

  return false;
}

function createMockSuperdocHost(editor: Editor) {
  const listeners = new Map<string, Set<Function>>();
  return {
    activeEditor: editor,
    on(event: string, fn: Function) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
    },
    off(event: string, fn: Function) {
      listeners.get(event)?.delete(fn);
    },
    superdocStore: {
      documents: [],
    },
    config: { rulers: false, documentMode: 'editing' },
    getZoom: () => 100,
    setZoom: () => {},
    toggleRuler: () => {},
    setDocumentMode: () => {},
  };
}

const examples = extractExamples(docsRoot);

const byFile = new Map<string, typeof examples>();
for (const ex of examples) {
  const list = byFile.get(ex.file) ?? [];
  list.push(ex);
  byFile.set(ex.file, list);
}

for (const [file, fileExamples] of byFile) {
  describe(file, () => {
    for (const example of fileExamples) {
      test(example.section, async () => {
        const transformed = transformCode(example);
        if (transformed === null) return;

        const code = applyStubs(transformed);

        const editor = await Editor.open(Buffer.from(fixtureBuffer), {
          extensions: getStarterExtensions(),
          suppressDefaultDocxStyles: true,
          telemetry: { enabled: false },
        });

        try {
          if (example.pattern === 'headless') {
            if (!createHeadlessToolbar) return; // skip until dist includes headless toolbar
            const superdoc = createMockSuperdocHost(editor);
            const toolbar = createHeadlessToolbar({
              superdoc,
              commands: [
                'bold',
                'italic',
                'underline',
                'strikethrough',
                'font-family',
                'font-size',
                'text-color',
                'highlight-color',
                'link',
                'text-align',
                'line-height',
                'linked-style',
                'bullet-list',
                'numbered-list',
                'indent-increase',
                'indent-decrease',
                'undo',
                'redo',
                'ruler',
                'zoom',
                'document-mode',
                'clear-formatting',
                'copy-format',
                'image',
                'track-changes-accept-selection',
                'track-changes-reject-selection',
                'table-insert',
              ],
            });
            const fn = new AsyncFunction(
              'toolbar',
              'headlessToolbarConstants',
              'headlessToolbarHelpers',
              'editor',
              code,
            );
            await fn(toolbar, headlessToolbarConstants, headlessToolbarHelpers, editor);
            toolbar.destroy();
          } else {
            editor.commands.selectAll();
            const fn = new AsyncFunction('editor', code);
            await fn(editor);
          }
        } catch (err) {
          if (isApiError(err, code)) {
            throw new Error(
              `API error in ${file} → ${example.section}:\n` +
                `  ${(err as Error).message}\n\n` +
                `Transformed code:\n${code}`,
            );
          }
        } finally {
          editor.destroy();
        }
      });
    }
  });
}

test('extracted examples count', () => {
  expect(examples.length).toBeGreaterThan(50);
});
