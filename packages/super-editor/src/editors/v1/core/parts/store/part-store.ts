/**
 * Read/write/remove primitives for canonical part storage.
 *
 * All part data lives in `converter.convertedXml`. This module is the
 * only approved code path for writing to that store at runtime.
 * Import/export phases are exempt.
 */

import type { Editor } from '../../Editor.js';
import type { PartId } from '../types.js';

interface ConvertedXmlHost {
  convertedXml?: Record<string, unknown>;
}

function getConvertedXml(editor: Editor): Record<string, unknown> {
  const converter = (editor as unknown as { converter?: ConvertedXmlHost }).converter;
  if (!converter?.convertedXml) {
    throw new Error('PartStore: editor.converter.convertedXml is not available.');
  }
  return converter.convertedXml;
}

export function getPart<T = unknown>(editor: Editor, partId: PartId): T | undefined {
  const store = getConvertedXml(editor);
  return store[partId] as T | undefined;
}

export function hasPart(editor: Editor, partId: PartId): boolean {
  const store = getConvertedXml(editor);
  return partId in store && store[partId] !== undefined;
}

export function setPart(editor: Editor, partId: PartId, data: unknown): void {
  const store = getConvertedXml(editor);
  store[partId] = data;
}

export function removePart(editor: Editor, partId: PartId): void {
  const store = getConvertedXml(editor);
  delete store[partId];
}

/**
 * Deep-clones a part for snapshot/rollback purposes.
 * Uses structuredClone for correctness over performance.
 */
export function clonePart<T>(part: T): T {
  return structuredClone(part);
}
