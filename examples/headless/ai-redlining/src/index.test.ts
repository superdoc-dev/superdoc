/**
 * Tests for headless ai-redlining workflow.
 * Verifies the core Editor.open → edit → export pipeline without an LLM call.
 */

import { readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Editor } from 'superdoc/super-editor';

const SAMPLE = new URL('../sample.docx', import.meta.url).pathname;
const OUTPUT = new URL('../test-output.docx', import.meta.url).pathname;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

async function run() {
  console.log('headless ai-redlining tests\n');

  await test('opens a DOCX headlessly', async () => {
    const docx = await readFile(SAMPLE);
    const editor = await Editor.open(docx, { documentMode: 'suggesting' });
    const text = editor.state.doc.textContent;
    if (!text || text.length === 0) throw new Error('Document text is empty');
    editor.destroy();
  });

  await test('search finds text in the document', async () => {
    const docx = await readFile(SAMPLE);
    const editor = await Editor.open(docx, { documentMode: 'suggesting' });
    const text = editor.state.doc.textContent;
    // Search for the first word that's at least 3 chars
    const word = text.match(/\b\w{3,}\b/)?.[0];
    if (!word) throw new Error('No searchable word found');
    const matches = editor.commands.search(word, { highlight: false });
    if (!matches.length) throw new Error(`search("${word}") returned no matches`);
    if (matches[0].from == null || matches[0].to == null) throw new Error('Match missing from/to');
    editor.destroy();
  });

  await test('inserts a tracked change', async () => {
    const docx = await readFile(SAMPLE);
    const editor = await Editor.open(docx, { documentMode: 'suggesting' });
    const text = editor.state.doc.textContent;
    const word = text.match(/\b\w{3,}\b/)?.[0];
    if (!word) throw new Error('No searchable word found');
    const matches = editor.commands.search(word, { highlight: false });

    editor.commands.insertTrackedChange({
      from: matches[0].from,
      to: matches[0].to,
      text: 'REPLACED',
      user: { name: 'Test', email: 'test@test.com' },
      comment: 'Test change',
    });

    // Verify the replacement text is in the doc
    const newText = editor.state.doc.textContent;
    if (!newText.includes('REPLACED')) throw new Error('Tracked change text not found in document');
    editor.destroy();
  });

  await test('exports a valid DOCX buffer', async () => {
    const docx = await readFile(SAMPLE);
    const editor = await Editor.open(docx, { documentMode: 'suggesting' });

    const result = await editor.exportDocx();
    if (!result) throw new Error('exportDocx returned undefined');
    const buf = Buffer.isBuffer(result) ? result : Buffer.from(result as any);
    if (!buf.length) throw new Error('Export produced empty buffer');
    if (buf.length < 100) throw new Error(`Output too small: ${buf.length} bytes`);

    // Verify it starts with PK (zip/docx magic bytes)
    if (buf[0] !== 0x50 || buf[1] !== 0x4b) {
      throw new Error('Output does not start with PK zip header');
    }

    await writeFile(OUTPUT, buf);
    if (!existsSync(OUTPUT)) throw new Error('Output file was not written');
    await unlink(OUTPUT);

    editor.destroy();
  });

  console.log('');
}

run();
