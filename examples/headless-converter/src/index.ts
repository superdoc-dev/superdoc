/**
 * Headless Converter
 *
 * Convert DOCX to HTML, JSON, text, or Markdown using SuperEditor.
 * Usage: npx tsx src/index.ts <input.docx> [--format html|json|text|md]
 */

import { readFile } from 'fs/promises';
import { JSDOM } from 'jsdom';
import { Editor, getStarterExtensions } from 'superdoc/super-editor';

type OutputFormat = 'html' | 'json' | 'text' | 'md';

async function processDocx(filePath: string, format: OutputFormat) {
  const buffer = await readFile(filePath);

  const { window } = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  const { document } = window;

  const [content, media, mediaFiles, fonts] = await Editor.loadXmlData(buffer, true);

  const editor = new Editor({
    mode: 'docx',
    documentId: 'headless',
    element: document.createElement('div'),
    extensions: getStarterExtensions(),
    fileSource: buffer,
    content,
    media,
    mediaFiles,
    fonts,
    isHeadless: true,
    mockDocument: document,
    mockWindow: window,
  });

  switch (format) {
    case 'html':
      console.log(editor.getHTML());
      break;
    case 'json':
      console.log(JSON.stringify(editor.getJSON(), null, 2));
      break;
    case 'md':
      console.log(await editor.getMarkdown());
      break;
    case 'text':
    default:
      console.log(editor.state.doc.textContent);
  }

  editor.destroy();
}

// Parse args
const args = process.argv.slice(2);
const formatIndex = args.findIndex((a) => a === '--format' || a === '-f');
const format = formatIndex !== -1 ? (args[formatIndex + 1] as OutputFormat) : 'text';
const inputPath = args.find((a) => !a.startsWith('-') && a !== format);

if (!inputPath) {
  console.error('Usage: npx tsx src/index.ts <input.docx> [--format html|json|text|md]');
  process.exit(1);
}

processDocx(inputPath, format).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
