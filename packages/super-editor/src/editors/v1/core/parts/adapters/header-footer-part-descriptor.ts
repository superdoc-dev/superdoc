/**
 * Dynamic part descriptors for header/footer parts.
 *
 * Unlike singleton descriptors (styles, numbering), header/footer parts
 * are discovered dynamically at runtime (word/header1.xml, word/footer2.xml, etc.).
 * This module provides a factory for creating and registering descriptors
 * on demand.
 *
 * The `afterCommit` hook handles OOXML JSON → PM JSON re-import for remote
 * applies, and triggers sub-editor refresh and layout invalidation.
 */

import type { Editor } from '../../Editor.js';
import type { PartDescriptor, CommitContext, DeleteContext, PartId } from '../types.js';
import { registerPartDescriptor, hasPartDescriptor } from '../registry/part-registry.js';
import { registerInvalidationHandler } from '../invalidation/part-invalidation-registry.js';

// ---------------------------------------------------------------------------
// Converter shape
// ---------------------------------------------------------------------------

interface HeaderFooterEditorEntry {
  id: string;
  editor: { replaceContent: (content: unknown) => void; isDestroyed?: boolean; destroy?: () => void };
}

interface ConverterForHeaderFooter {
  headers?: Record<string, unknown>;
  footers?: Record<string, unknown>;
  headerEditors?: HeaderFooterEditorEntry[];
  footerEditors?: HeaderFooterEditorEntry[];
  headerFooterModified?: boolean;
  convertedXml?: Record<string, unknown>;
  /** Re-import a single header/footer part from OOXML JSON to PM JSON. */
  reimportHeaderFooterPart?: (partId: string) => unknown;
}

function getConverter(editor: Editor): ConverterForHeaderFooter | undefined {
  return (editor as unknown as { converter?: ConverterForHeaderFooter }).converter;
}

// ---------------------------------------------------------------------------
// Part ID Parsing
// ---------------------------------------------------------------------------

/** Mutation source tag for local header/footer sub-editor edits. */
export const SOURCE_HEADER_FOOTER_LOCAL = 'header-footer-sync:local';

const HEADER_PATTERN = /^word\/header\d+\.xml$/;
const FOOTER_PATTERN = /^word\/footer\d+\.xml$/;

export function isHeaderPartId(partId: string): boolean {
  return HEADER_PATTERN.test(partId);
}

export function isFooterPartId(partId: string): boolean {
  return FOOTER_PATTERN.test(partId);
}

export function isHeaderFooterPartId(partId: string): boolean {
  return isHeaderPartId(partId) || isFooterPartId(partId);
}

function getHeaderFooterType(partId: string): 'header' | 'footer' {
  return isHeaderPartId(partId) ? 'header' : 'footer';
}

// ---------------------------------------------------------------------------
// Default OOXML namespace attributes
// ---------------------------------------------------------------------------

const DEFAULT_HDR_FTR_ATTRS: Record<string, string> = {
  'xmlns:wpc': 'http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas',
  'xmlns:mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  'xmlns:o': 'urn:schemas-microsoft-com:office:office',
  'xmlns:r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  'xmlns:m': 'http://schemas.openxmlformats.org/officeDocument/2006/math',
  'xmlns:v': 'urn:schemas-microsoft-com:vml',
  'xmlns:wp14': 'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing',
  'xmlns:wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  'xmlns:w10': 'urn:schemas-microsoft-com:office:word',
  'xmlns:w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'xmlns:w14': 'http://schemas.microsoft.com/office/word/2010/wordml',
  'xmlns:wpg': 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup',
  'xmlns:wpi': 'http://schemas.microsoft.com/office/word/2010/wordprocessingInk',
  'xmlns:wne': 'http://schemas.microsoft.com/office/word/2006/wordml',
  'xmlns:wps': 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
};

// ---------------------------------------------------------------------------
// Descriptor Factory
// ---------------------------------------------------------------------------

/**
 * Create and register a descriptor for a header/footer part.
 * No-op if the descriptor already exists for this partId.
 */
export function ensureHeaderFooterDescriptor(partId: PartId, sectionId: string): void {
  if (hasPartDescriptor(partId)) return;

  const type = getHeaderFooterType(partId);
  const rootElementName = type === 'header' ? 'w:hdr' : 'w:ftr';

  const descriptor: PartDescriptor = {
    id: partId,

    ensurePart() {
      return {
        type: 'element',
        name: 'document',
        elements: [
          {
            type: 'element',
            name: rootElementName,
            attributes: { ...DEFAULT_HDR_FTR_ATTRS },
            elements: [],
          },
        ],
      };
    },

    afterCommit(ctx: CommitContext) {
      const converter = getConverter(ctx.editor);
      if (!converter) return;

      const resolvedSectionId = ctx.sectionId ?? sectionId;

      // Local edits (header-footer-sync:local) already update the PM cache
      // and refresh other sub-editors in onHeaderFooterDataUpdate. Running
      // refreshActiveSubEditors here would re-replace the originating editor,
      // causing a redundant update cycle with cursor churn.
      const isLocalSync = ctx.source === SOURCE_HEADER_FOOTER_LOCAL;

      // For remote applies, rebuild the PM JSON from the updated OOXML
      if (!isLocalSync && typeof converter.reimportHeaderFooterPart === 'function') {
        try {
          const pmJson = converter.reimportHeaderFooterPart(ctx.partId);
          if (pmJson) {
            const collection = type === 'header' ? (converter.headers ??= {}) : (converter.footers ??= {});
            collection[resolvedSectionId] = pmJson;
          }
        } catch (err) {
          console.warn(`[parts] Failed to re-import ${ctx.partId}:`, err);
        }
      }

      converter.headerFooterModified = true;

      // Only refresh sub-editors for remote updates — local sync already
      // handled this in onHeaderFooterDataUpdate (which correctly skips
      // the originating editor).
      if (!isLocalSync) {
        refreshActiveSubEditors(converter, type, resolvedSectionId);
      }
    },

    onDelete(ctx: DeleteContext) {
      const converter = getConverter(ctx.editor);
      if (!converter) return;

      const resolvedSectionId = ctx.sectionId ?? sectionId;

      // Destroy active sub-editors for this section
      destroySubEditors(converter, type, resolvedSectionId);

      // Clear cache entries
      const collection = type === 'header' ? converter.headers : converter.footers;
      if (collection) delete collection[resolvedSectionId];

      converter.headerFooterModified = true;
    },
  };

  registerPartDescriptor(descriptor);
  registerHeaderFooterInvalidationHandler(partId);
}

// ---------------------------------------------------------------------------
// Sub-Editor Management
// ---------------------------------------------------------------------------

function refreshActiveSubEditors(
  converter: ConverterForHeaderFooter,
  type: 'header' | 'footer',
  sectionId: string,
): void {
  const editors = type === 'header' ? converter.headerEditors : converter.footerEditors;
  const collection = type === 'header' ? converter.headers : converter.footers;
  const pmJson = collection?.[sectionId];
  if (!editors || !pmJson) return;

  for (const entry of editors) {
    if (entry.id === sectionId && entry.editor && !entry.editor.isDestroyed) {
      try {
        entry.editor.replaceContent(pmJson);
      } catch (err) {
        console.warn(`[parts] Failed to refresh sub-editor for ${type}:${sectionId}:`, err);
      }
    }
  }
}

function destroySubEditors(converter: ConverterForHeaderFooter, type: 'header' | 'footer', sectionId: string): void {
  const editors = type === 'header' ? converter.headerEditors : converter.footerEditors;
  if (!editors) return;

  for (let i = editors.length - 1; i >= 0; i--) {
    if (editors[i].id === sectionId) {
      try {
        editors[i].editor.destroy?.();
      } catch {
        // Editor may already be destroyed
      }
      editors.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Invalidation Handler
// ---------------------------------------------------------------------------

function registerHeaderFooterInvalidationHandler(partId: PartId): void {
  registerInvalidationHandler(partId, (editor) => {
    try {
      const tr = (editor as unknown as { state: { tr: unknown } }).state.tr;
      const setMeta = (tr as unknown as { setMeta: (key: string, value: boolean) => unknown }).setMeta;
      setMeta.call(tr, 'forceUpdatePagination', true);
      const view = (editor as unknown as { view?: { dispatch?: (tr: unknown) => void } }).view;
      view?.dispatch?.(tr);
    } catch {
      // View may not be ready
    }
  });
}
