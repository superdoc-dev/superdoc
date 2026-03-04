import { test, describe, beforeAll, expect } from 'bun:test';
import { resolve } from 'node:path';
import { Editor, getStarterExtensions } from '../../../packages/superdoc/dist/super-editor.es.js';
import { extractExamples } from './lib/extract.ts';
import { transformCode, applyStubs } from './lib/transform.ts';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const docsRoot = resolve(import.meta.dir, '..');
const fixturePath = resolve(import.meta.dir, '../../../packages/super-editor/src/tests/data/complex2.docx');

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
          editor.commands.selectAll();
          const fn = new AsyncFunction('editor', code);
          await fn(editor);
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
