/**
 * Minimal async OPC / ZIP package reader (SD-3247).
 *
 * Reads a DOCX/OPC package through `JSZip.loadAsync` — the same async ZIP path
 * the rest of the editor uses for import/export (see `DocxZipper.js`). Because
 * JSZip inflates DEFLATE entries internally (pako), normal compressed DOCX
 * sources work in every runtime with no `node:zlib` dependency. This replaces
 * the bespoke synchronous ZIP reader (`document-api-adapters/templates/zip-sync.ts`)
 * that `templates.apply` needed while it was a synchronous operation.
 *
 * It is intentionally small and read-only: enumerate parts and return their
 * decompressed bytes, plus a shared helper to decode XML/.rels parts to clean
 * strings (BOM/UTF-16 aware) via the editor's encoding helpers.
 */

import JSZip from 'jszip';
import { ensureXmlString } from '../encoding-helpers.js';

export interface OpcPackageReadResult {
  /** Part path (e.g. `word/styles.xml`) → decompressed raw bytes. */
  byName: Map<string, Uint8Array>;
}

/**
 * Read an OPC package's parts asynchronously.
 *
 * @param bytes Raw package bytes (a ZIP/DOCX container).
 * @returns A map of part path → decompressed bytes (directory entries omitted).
 * @throws When `bytes` is not a valid ZIP/OPC container (JSZip rejects).
 */
export async function readOpcPackage(bytes: Uint8Array): Promise<OpcPackageReadResult> {
  const zip = await JSZip.loadAsync(bytes);

  const entries: Array<{ name: string; file: JSZip.JSZipObject }> = [];
  zip.forEach((relativePath, file) => {
    // Skip directory entries — they carry no content.
    if (file.dir) return;
    entries.push({ name: relativePath, file });
  });

  const byName = new Map<string, Uint8Array>();
  await Promise.all(
    entries.map(async ({ name, file }) => {
      byName.set(name, await file.async('uint8array'));
    }),
  );

  return { byName };
}

/**
 * Decode an XML / `.rels` part's bytes to a clean JS string.
 *
 * Uses the shared {@link ensureXmlString} helper so BOM stripping and UTF-16
 * detection match the rest of the import pipeline (the old sync reader was
 * UTF-8 only).
 */
export function decodeText(bytes: Uint8Array): string {
  return ensureXmlString(bytes);
}
