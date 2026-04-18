/**
 * Header/footer sync helpers for the centralized parts system.
 *
 * Bridges header/footer sub-editors with the mutation core:
 * - Export: Sub-editor PM JSON → OOXML JSON → mutatePart
 * - Import: OOXML JSON → PM JSON (for remote apply afterCommit)
 */

import type { Editor } from '../../Editor.js';
import type { PartId } from '../types.js';
import { mutatePart } from '../mutation/mutate-part.js';
import { hasPart } from '../store/part-store.js';
import {
  ensureHeaderFooterDescriptor,
  isHeaderFooterPartId,
  SOURCE_HEADER_FOOTER_LOCAL,
} from './header-footer-part-descriptor.js';

// ---------------------------------------------------------------------------
// Converter shape
// ---------------------------------------------------------------------------

interface ConverterForSync {
  convertedXml?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  footers?: Record<string, unknown>;
  headerEditors?: Array<{ id: string; editor: SubEditor }>;
  footerEditors?: Array<{ id: string; editor: SubEditor }>;
  headerFooterModified?: boolean;
  exportToXmlJson?: (opts: ExportToXmlJsonOpts) => { result: XmlJsonDoc; params: ExportParams };
}

interface SubEditor {
  schema?: unknown;
  getUpdatedJson?: () => unknown;
  isDestroyed?: boolean;
}

interface ExportToXmlJsonOpts {
  data: unknown;
  editor: SubEditor;
  editorSchema: unknown;
  isHeaderFooter: boolean;
  comments?: unknown[];
  commentDefinitions?: unknown[];
  isFinalDoc?: boolean;
}

interface XmlJsonDoc {
  elements?: Array<{ elements?: unknown[] }>;
}

interface ExportParams {
  relationships: unknown[];
}

function getConverter(editor: Editor): ConverterForSync | undefined {
  return (editor as unknown as { converter?: ConverterForSync }).converter;
}

// ---------------------------------------------------------------------------
// Relationship → Part ID Resolution
// ---------------------------------------------------------------------------

interface XmlElement {
  name?: string;
  attributes?: Record<string, string>;
  elements?: XmlElement[];
}

const HEADER_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header';
const FOOTER_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer';

/**
 * Resolve a header/footer relationship ID (e.g., 'rId7') to its OOXML part path
 * (e.g., 'word/header1.xml').
 */
export function resolvePartIdFromRefId(editor: Editor, headerFooterRefId: string): PartId | null {
  const converter = getConverter(editor);
  const relsPart = converter?.convertedXml?.['word/_rels/document.xml.rels'] as XmlElement | undefined;
  const relsRoot = relsPart?.elements?.find((el) => el.name === 'Relationships');
  if (!relsRoot?.elements) return null;

  for (const el of relsRoot.elements) {
    if (el.name !== 'Relationship') continue;
    if (el.attributes?.Id !== headerFooterRefId) continue;

    const type = el.attributes?.Type;
    if (type !== HEADER_REL_TYPE && type !== FOOTER_REL_TYPE) continue;

    const target = el.attributes?.Target;
    if (!target) continue;

    return `word/${target}` as PartId;
  }

  return null;
}

/** @deprecated Use `resolvePartIdFromRefId` — alias kept for backward compatibility. */
export const resolvePartIdFromSectionId = resolvePartIdFromRefId;

/**
 * Resolve a part path (e.g., 'word/header1.xml') to its relationship ID (e.g., 'rId7')
 * by scanning a rels XML JSON structure.
 *
 * This is the reverse of `resolvePartIdFromRefId`.
 */
export function resolveRIdFromRelsData(relsData: unknown, partId: string): string | null {
  const target = partId.replace(/^word\//, '');
  const relsEl = relsData as XmlElement | undefined;
  const relsRoot = relsEl?.elements?.find((el) => el.name === 'Relationships');
  if (!relsRoot?.elements) return null;

  for (const el of relsRoot.elements) {
    if (el.name !== 'Relationship') continue;
    if (el.attributes?.Target !== target) continue;

    const type = el.attributes?.Type;
    if (type !== HEADER_REL_TYPE && type !== FOOTER_REL_TYPE) continue;

    return el.attributes?.Id ?? null;
  }

  return null;
}

/**
 * Resolve the relationship ID for a header/footer part, trying multiple sources.
 *
 * 1. `relsData` — pre-decoded rels XML JSON (e.g., from a Yjs parts map envelope)
 * 2. Editor's converter `convertedXml` (local cache)
 *
 * Returns null if no matching relationship is found in either source.
 */
export function resolveHeaderFooterRId(partId: string, relsData: unknown | null, editor?: Editor): string | null {
  if (relsData) {
    const rId = resolveRIdFromRelsData(relsData, partId);
    if (rId) return rId;
  }

  if (editor) {
    const converter = getConverter(editor);
    const localRels = converter?.convertedXml?.['word/_rels/document.xml.rels'];
    if (localRels) return resolveRIdFromRelsData(localRels, partId);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Export: Sub-Editor PM JSON → OOXML JSON → mutatePart
// ---------------------------------------------------------------------------

/**
 * Export a sub-editor's current state to OOXML JSON and commit via mutatePart.
 *
 * Called on sub-editor blur. The parts publisher picks up the
 * `partChanged` event and writes to Yjs automatically.
 */
export function exportSubEditorToPart(
  mainEditor: Editor,
  subEditor: SubEditor,
  headerFooterRefId: string,
  type: 'header' | 'footer',
): boolean {
  const converter = getConverter(mainEditor);
  if (!converter?.exportToXmlJson) return false;

  const partId = resolvePartIdFromRefId(mainEditor, headerFooterRefId);
  if (!partId) return false;

  // Ensure descriptor is registered for this dynamic part
  ensureHeaderFooterDescriptor(partId, headerFooterRefId);

  // Get current PM JSON from the sub-editor
  const pmJson =
    typeof subEditor.getUpdatedJson === 'function'
      ? subEditor.getUpdatedJson()
      : converter[`${type}s` as 'headers' | 'footers']?.[headerFooterRefId];

  if (!pmJson) return false;

  // Export PM JSON → OOXML JSON
  let bodyContent: unknown[];
  try {
    const { result } = converter.exportToXmlJson({
      data: pmJson,
      editor: subEditor,
      editorSchema: subEditor.schema,
      isHeaderFooter: true,
      comments: [],
      commentDefinitions: [],
    });
    bodyContent = result?.elements?.[0]?.elements ?? [];
  } catch (err) {
    console.warn(`[header-footer-sync] Export failed for ${partId}:`, err);
    return false;
  }

  // Apply to convertedXml via mutatePart
  try {
    const operation = hasPart(mainEditor, partId) ? 'mutate' : 'create';

    if (operation === 'mutate') {
      mutatePart({
        editor: mainEditor,
        partId,
        sectionId: headerFooterRefId,
        operation: 'mutate',
        source: SOURCE_HEADER_FOOTER_LOCAL,
        mutate: ({ part }) => {
          const p = part as XmlElement;
          if (p?.elements?.[0]) {
            p.elements[0].elements = bodyContent as XmlElement[];
          }
        },
      });
    } else {
      const rootName = type === 'header' ? 'w:hdr' : 'w:ftr';
      mutatePart({
        editor: mainEditor,
        partId,
        sectionId: headerFooterRefId,
        operation: 'create',
        source: SOURCE_HEADER_FOOTER_LOCAL,
        initial: {
          type: 'element',
          name: 'document',
          elements: [
            {
              type: 'element',
              name: rootName,
              elements: bodyContent,
            },
          ],
        },
      });
    }

    return true;
  } catch (err) {
    console.warn(`[header-footer-sync] mutatePart failed for ${partId}:`, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Batch Registration
// ---------------------------------------------------------------------------

/**
 * Register descriptors for all existing header/footer parts in convertedXml.
 *
 * Called during editor initialization to ensure descriptors exist for
 * all header/footer parts that were loaded from the document.
 */
export function registerExistingHeaderFooterDescriptors(editor: Editor): void {
  const converter = getConverter(editor);
  if (!converter?.convertedXml) return;

  const relsPart = converter.convertedXml['word/_rels/document.xml.rels'] as XmlElement | undefined;
  const relsRoot = relsPart?.elements?.find((el) => el.name === 'Relationships');
  if (!relsRoot?.elements) return;

  for (const el of relsRoot.elements) {
    if (el.name !== 'Relationship') continue;

    const type = el.attributes?.Type;
    if (type !== HEADER_REL_TYPE && type !== FOOTER_REL_TYPE) continue;

    const target = el.attributes?.Target;
    const id = el.attributes?.Id;
    if (!target || !id) continue;

    const partId = `word/${target}` as PartId;
    if (isHeaderFooterPartId(partId)) {
      ensureHeaderFooterDescriptor(partId, id);
    }
  }
}
