import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveListDocFixture, resolveTableDocFixture } from './fixtures';

/** Minimal type for the subset of the JSZip API used in this fixture. */
interface JsZipInstance {
  file(path: string): { async(type: string): Promise<string> } | null;
  file(path: string, data: string): void;
  generateAsync(options: { type: string }): Promise<Buffer>;
}

interface JsZipConstructor {
  loadAsync(data: Buffer | Uint8Array): Promise<JsZipInstance>;
}

const REPO_ROOT = path.resolve(import.meta.dir, '../../../..');
const require = createRequire(import.meta.url);

let jsZipPromise: Promise<JsZipConstructor> | null = null;

async function loadJsZip(): Promise<JsZipConstructor> {
  if (jsZipPromise) return jsZipPromise;

  jsZipPromise = (async () => {
    const entry = require.resolve('jszip', {
      paths: [path.join(REPO_ROOT, 'packages/super-editor')],
    });
    const mod = await import(pathToFileURL(entry).href);
    return (mod.default ?? mod) as JsZipConstructor;
  })();

  return jsZipPromise;
}

export async function writeListDocWithoutParaIds(outputPath: string): Promise<string> {
  const sourcePath = await resolveListDocFixture();
  const JSZip = await loadJsZip();
  const sourceBytes = await readFile(sourcePath);
  const zip = await JSZip.loadAsync(sourceBytes);
  const documentXmlFile = zip.file('word/document.xml');
  if (!documentXmlFile) {
    throw new Error(`Fixture doc is missing word/document.xml: ${sourcePath}`);
  }

  const documentXml = await documentXmlFile.async('string');
  const updatedXml = documentXml.replace(/\s+w14:paraId="[^"]*"/g, '').replace(/\s+w14:textId="[^"]*"/g, '');

  if (updatedXml === documentXml) {
    throw new Error(`Fixture doc did not contain paragraph ids to strip: ${sourcePath}`);
  }

  zip.file('word/document.xml', updatedXml);
  const outputBytes = await zip.generateAsync({ type: 'nodebuffer' });
  await writeFile(outputPath, outputBytes);
  return outputPath;
}

export async function writeTableOnlyDocFixture(outputPath: string): Promise<string> {
  const sourcePath = await resolveTableDocFixture();
  const JSZip = await loadJsZip();
  const sourceBytes = await readFile(sourcePath);
  const zip = await JSZip.loadAsync(sourceBytes);
  const documentXmlFile = zip.file('word/document.xml');
  if (!documentXmlFile) {
    throw new Error(`Fixture doc is missing word/document.xml: ${sourcePath}`);
  }

  const documentXml = await documentXmlFile.async('string');
  const updatedXml = documentXml
    .replace(/<\/w:tbl><w:p\b[^>]*\/><w:tbl>/g, '</w:tbl><w:tbl>')
    .replace(/<\/w:tbl><w:p\b[^>]*\/><w:sectPr>/g, '</w:tbl><w:sectPr>');

  if (updatedXml === documentXml) {
    throw new Error(`Fixture doc did not contain removable top-level paragraphs: ${sourcePath}`);
  }

  zip.file('word/document.xml', updatedXml);
  const outputBytes = await zip.generateAsync({ type: 'nodebuffer' });
  await writeFile(outputPath, outputBytes);
  return outputPath;
}
