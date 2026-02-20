#!/usr/bin/env node
/**
 * Extract ProseMirror JSON from DOCX input.
 *
 * Run via Vite's Node runner so Super Editor's path aliases resolve:
 *   npx vite-node --config ../../super-editor/vite.config.js --mode test \
 *     scripts/extract-pm-json.mjs --input ../../super-editor/src/tests/data/your.docx
 *
 * The script loads the DOCX file using the Super Editor import machinery
 * and writes a ProseMirror JSON fixture file.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname, resolve, basename } from 'path';
import { fileURLToPath } from 'url';
import { createDocumentJson } from "@superdoc/super-editor/src/core/super-converter/v2/importer/docxImporter.js";
import DocxZipper from "@superdoc/super-editor/src/core/DocxZipper.js";
import { parseXmlToJson } from "@superdoc/super-editor/src/core/super-converter/v2/docxHelper.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const EXTENSIONS_TO_CONVERT = new Set(['.xml', '.rels']);

function readFilesRecursively(xmlFiles) {
  const fileDataMap = {};

  try {
    xmlFiles.forEach((entry) => {
      const { name, content } = entry;
      const extension = name.slice(name.lastIndexOf('.'));
      if (EXTENSIONS_TO_CONVERT.has(extension)) {
        fileDataMap[name] = parseXmlToJson(content);
      } else {
        fileDataMap[name] = content;
      }
    });
  } catch (err) {
    console.error(`Error reading file:`, err);
  }

  return fileDataMap;
}

function parseArgs(argv) {
  const args = { input: null, output: null };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === '--input' || arg === '-i') && argv[i + 1]) {
      args.input = argv[i + 1];
      i += 1;
      continue;
    }
    if ((arg === '--output' || arg === '-o') && argv[i + 1]) {
      args.output = argv[i + 1];
      i += 1;
    }
  }

  return args;
}

async function extractPMJson() {
  const { input, output } = parseArgs(process.argv.slice(2));

  const defaultDocxPath = join(
    __dirname,
    '../../../super-editor/src/tests/data/basic-paragraph.docx'
  );
  const docxPath = resolve(input ?? defaultDocxPath);
  const fixtureName =
    output ??
    (docxPath.endsWith('.docx')
      ? `${basename(docxPath, '.docx')}.json`
      : 'basic-paragraph.json');

  console.log(`Loading DOCX from ${docxPath}...`);

  const fileBuffer = await readFile(docxPath);

  // Unzip and parse
  const zipper = new DocxZipper();
  const xmlFiles = await zipper.getDocxData(fileBuffer, true);
  const docx = readFilesRecursively(xmlFiles);

  console.log('Converting to ProseMirror JSON...');

  // Convert to PM JSON
  const converter = {
    docHiglightColors: new Set(),
  };

  const editor = {
    options: {},
    emit: () => {},
  };

  const result = createDocumentJson(docx, converter, editor);

  if (!result || !result.pmDoc) {
    throw new Error('Failed to extract PM JSON');
  }

  console.log('Extracted PM document with', result.pmDoc.content?.length || 0, 'nodes');

  // Write to fixtures directory
  const fixturesDir = join(__dirname, '../src/fixtures');
  await mkdir(fixturesDir, { recursive: true });

  const outputPath = join(fixturesDir, fixtureName);
  await writeFile(outputPath, JSON.stringify(result.pmDoc, null, 2));

  console.log('✓ Written to:', outputPath);

  // Also log a preview
  console.log('\nPreview:');
  console.log(JSON.stringify(result.pmDoc, null, 2).slice(0, 500) + '...');
}

extractPMJson().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
