/* @vitest-environment node */

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distRoot = resolve(__dirname, '../../dist');
const distPath = resolve(distRoot, 'super-editor.es.js');
const DIST_EXISTS = existsSync(distPath);

/** Recursively collect every emitted JS bundle file (entry + chunks) under dist/. */
function collectDistJsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectDistJsFiles(full));
    } else if (/\.(es\.js|cjs|js)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('templates.apply dist bundle', () => {
  it.skipIf(!DIST_EXISTS)('applies a deflated DOCX template in Node ESM without globalThis.require', async () => {
    const { JSDOM } = await import('jsdom');

    expect(globalThis.require).toBeUndefined();

    const distUrl = pathToFileURL(distPath).href;
    const bundle = await import(distUrl);
    const goalPath = resolve(__dirname, '../../../super-editor/src/editors/v1/tests/data/blank-doc.docx');
    const goalBuffer = readFileSync(goalPath);
    const { window: mockWindow } = new JSDOM('<!doctype html><html><body></body></html>');

    const editor = await bundle.Editor.open(Buffer.from(bundle.BLANK_DOCX_BASE64, 'base64'), {
      documentId: 'templates-apply-dist-test.docx',
      document: mockWindow.document,
      isHeadless: true,
      telemetry: { enabled: false },
      user: { id: 'test', name: 'Test' },
    });

    try {
      const receipt = await editor.doc.invoke({
        operationId: 'templates.apply',
        input: {
          source: {
            kind: 'base64',
            data: Buffer.from(goalBuffer).toString('base64'),
            filename: 'blank-doc.docx',
          },
          bodyPolicy: 'preserve',
        },
      });

      expect(receipt.success).toBe(true);

      const pathReceipt = await editor.doc.invoke({
        operationId: 'templates.apply',
        input: {
          source: {
            kind: 'path',
            path: goalPath,
          },
          bodyPolicy: 'preserve',
        },
      });

      expect(pathReceipt.success).toBe(true);
    } finally {
      editor.destroy?.();
      mockWindow.close();
    }
  });

  it.skipIf(!DIST_EXISTS)('does not bundle node:zlib / inflateRawSync for templates.apply', () => {
    // SD-3247: templates.apply now loads source packages via the async JSZip
    // path (pako), so the bespoke synchronous reader and its node:zlib /
    // inflateRawSync dependency — plus the vite `zlib` polyfill workaround — are
    // gone. Scan every emitted bundle file (entry + chunks) to guard against a
    // regression that reintroduces them.
    const offenders: string[] = [];
    for (const file of collectDistJsFiles(distRoot)) {
      const source = readFileSync(file, 'utf8');
      if (source.includes('inflateRawSync') || source.includes('unzipSyncMinimal')) {
        offenders.push(file);
      }
    }
    expect(offenders, `Found synchronous zip-reader artifacts in: ${offenders.join(', ')}`).toEqual([]);
  });
});
