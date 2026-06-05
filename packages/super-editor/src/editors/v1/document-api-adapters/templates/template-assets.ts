/**
 * Header/footer template-asset import (with rel + media closure) and page-1
 * section-default adoption for `templates.apply`.
 *
 * These functions touch the converter runtime (convertedXml, media maps,
 * headers/footers caches) and the editor section-mutation path, so they are
 * engine-specific. They are written to be safe in dry-run (no mutation) and to
 * degrade gracefully when a runtime affordance is missing.
 */

import type { Editor } from '../../core/Editor.js';
import {
  type XmlElement,
  localName,
  rootElement,
  firstChildByLocalName,
  clone,
  findPageOneSectPr,
  rewriteSectPrRefs,
  xmlDeepEqual,
} from './template-xml.js';
import { decodeText } from '../../core/opc/read-package.js';
import { resolveSectionProjections } from '../helpers/sections-resolver.js';
import { applySectPrToProjection } from '../helpers/section-mutation-wrapper.js';
import { readTargetSectPr } from '../helpers/section-projection-access.js';

const HEADER_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header';
const FOOTER_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer';
const IMAGE_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const HEADER_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml';
const FOOTER_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml';
const CONTENT_TYPES_PART = '[Content_Types].xml';
const DOCUMENT_RELS_PART = 'word/_rels/document.xml.rels';

interface ConverterForAssets {
  convertedXml: Record<string, XmlElement | Record<string, unknown>>;
  parseXmlToJson(xml: string): XmlElement;
  media?: Record<string, unknown>;
  addedMedia?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  footers?: Record<string, unknown>;
  headerIds?: Record<string, unknown>;
  footerIds?: Record<string, unknown>;
  reimportHeaderFooterPart?: (partId: string) => unknown;
}

export interface TemplateIdMapping {
  kind: 'style' | 'numbering' | 'relationship';
  from: string;
  to: string;
}

export interface TemplateChangedPart {
  part: string;
  scope: 'headersFooters' | 'sectionDefaults' | 'package';
  change: 'created' | 'replaced' | 'merged' | 'imported';
}

export interface TemplateApplyWarning {
  code: string;
  message: string;
}

export interface HeaderFooterImportResult {
  /** source document-rel id -> new document-rel id (for sectPr ref rewriting). */
  relIdRemap: Map<string, string>;
  changedParts: TemplateChangedPart[];
  mappings: TemplateIdMapping[];
  warnings: TemplateApplyWarning[];
  /** Whether any header/footer asset was detected in the source. */
  detected: boolean;
  /** Whether the importer actually applied changes (false for dry-run). */
  applied: boolean;
}

// ---------------------------------------------------------------------------
// Low-level xml-js node helpers for relationship / content-type tables
// ---------------------------------------------------------------------------

function getRelationshipsRoot(part: XmlElement | undefined): XmlElement | undefined {
  if (!part) return undefined;
  return rootElement(part, 'Relationships');
}

function relTargetToWordPath(target: string): string {
  // Per-part rels (e.g. word/_rels/header1.xml.rels) resolve targets relative
  // to the `word/` directory: `media/image1.png` -> `word/media/image1.png`,
  // `../media/x.png` -> `word/media/x.png`.
  const cleaned = target.replace(/^\.\//, '').replace(/^\.\.\//, '');
  if (cleaned.startsWith('word/')) return cleaned;
  if (cleaned.startsWith('/')) return cleaned.slice(1);
  return `word/${cleaned}`;
}

function baseName(p: string): string {
  return p.split('/').pop() ?? p;
}

function extOf(name: string): string {
  const m = name.match(/\.([^.]+)$/);
  return m ? m[1] : '';
}

// ---------------------------------------------------------------------------
// Header/footer asset import
// ---------------------------------------------------------------------------

/**
 * Import all source `word/header*.xml` / `word/footer*.xml` parts as reusable
 * template assets, with their per-part `.rels` and transitive media closure.
 * Allocates fresh part names / relationship ids / media filenames on collision
 * and rewrites references consistently (`DA-TEMPLATE-015`/`016`).
 */
export function importHeaderFooterAssets(
  editor: Editor,
  converter: ConverterForAssets,
  byName: Map<string, Uint8Array>,
  dryRun: boolean,
): HeaderFooterImportResult {
  const result: HeaderFooterImportResult = {
    relIdRemap: new Map(),
    changedParts: [],
    mappings: [],
    warnings: [],
    detected: false,
    applied: false,
  };

  // Source document relationships drive part-name + ref discovery.
  const srcRelsRaw = byName.get(DOCUMENT_RELS_PART);
  const srcDocRels = srcRelsRaw ? converter.parseXmlToJson(decodeText(srcRelsRaw)) : undefined;
  const srcRelsRoot = getRelationshipsRoot(srcDocRels);
  const srcRelEls = srcRelsRoot?.elements ?? [];

  // Detect every header/footer part present in the source (even if the page-1
  // governing section does not reference it), then attach a representative
  // source rel id when one exists so the selected sectPr can be rewired.
  const hfPartNames = [...byName.keys()]
    .filter((n) => /^word\/(header|footer)\d+\.xml$/.test(n))
    .sort();
  if (hfPartNames.length === 0) return result;
  result.detected = true;
  if (dryRun) {
    // Plan only: report would-import parts; no mutation.
    for (const srcPart of hfPartNames) {
      result.changedParts.push({ part: srcPart, scope: 'headersFooters', change: 'imported' });
    }
    return result;
  }

  // --- Live application ---
  // Allocate-free helpers against the live target package.
  const usedPartNames = new Set(Object.keys(converter.convertedXml));
  const allocatePartName = (sourceTarget: string, kind: 'header' | 'footer'): string => {
    const desired = `word/${sourceTarget}`;
    if (!usedPartNames.has(desired)) {
      usedPartNames.add(desired);
      return desired;
    }
    let i = 1;
    while (usedPartNames.has(`word/${kind}${i}.xml`)) i++;
    const allocated = `word/${kind}${i}.xml`;
    usedPartNames.add(allocated);
    return allocated;
  };

  // Document-rels allocation.
  let docRelsPart = converter.convertedXml[DOCUMENT_RELS_PART] as XmlElement | undefined;
  if (!docRelsPart) {
    docRelsPart = {
      elements: [
        {
          type: 'element',
          name: 'Relationships',
          attributes: { xmlns: 'http://schemas.openxmlformats.org/package/2006/relationships' },
          elements: [],
        },
      ],
    };
    converter.convertedXml[DOCUMENT_RELS_PART] = docRelsPart;
  }
  const docRelsRoot = getRelationshipsRoot(docRelsPart)!;
  if (!docRelsRoot.elements) docRelsRoot.elements = [];
  const usedRelIds = new Set<string>(
    docRelsRoot.elements.map((el) => el.attributes?.Id).filter((x): x is string => !!x),
  );
  const allocateRelId = (): string => {
    let max = 0;
    for (const id of usedRelIds) {
      const m = id.match(/^rId(\d+)$/);
      if (m) max = Math.max(max, Number(m[1]));
    }
    const next = `rId${max + 1}`;
    usedRelIds.add(next);
    return next;
  };

  // Media allocation.
  const mediaStore: Record<string, unknown> =
    (converter.convertedXml.media as Record<string, unknown>) ?? (converter.media as Record<string, unknown>) ?? {};
  converter.convertedXml.media = mediaStore;
  converter.media = mediaStore;
  if (!converter.addedMedia) converter.addedMedia = {};
  const usedMedia = new Set<string>([
    ...Object.keys(mediaStore),
    ...Object.keys(converter.convertedXml).filter((p) => p.startsWith('word/media/')),
  ]);
  const allocateMediaPath = (sourceMediaPath: string): string => {
    const base = baseName(sourceMediaPath);
    const desired = `word/media/${base}`;
    if (!usedMedia.has(desired)) {
      usedMedia.add(desired);
      return desired;
    }
    const ext = extOf(base);
    let i = 1;
    while (usedMedia.has(`word/media/tmpl-image${i}.${ext}`)) i++;
    const allocated = `word/media/tmpl-image${i}.${ext}`;
    usedMedia.add(allocated);
    return allocated;
  };

  // Build a quick lookup of source document rels by target part name.
  const sourceRelByTarget = new Map<string, { id: string; type: string }>();
  for (const rel of srcRelEls) {
    const type = rel.attributes?.Type;
    const target = rel.attributes?.Target;
    const id = rel.attributes?.Id;
    if (!type || !target || !id) continue;
    if (type === HEADER_REL_TYPE || type === FOOTER_REL_TYPE) {
      sourceRelByTarget.set(relTargetToWordPath(target).replace(/^word\//, ''), { id, type });
    }
  }

  const setHeaderIdsArray = (idsHolder: Record<string, unknown>, relId: string): void => {
    if (!Array.isArray(idsHolder.ids)) idsHolder.ids = [];
    (idsHolder.ids as string[]).push(relId);
  };

  let docRelsChanged = false;
  let contentTypesChanged = false;

  for (const srcPart of hfPartNames) {
    const kind: 'header' | 'footer' = /header/.test(baseName(srcPart)) ? 'header' : 'footer';
    const sourceTarget = baseName(srcPart); // e.g. header1.xml
    const targetPartName = allocatePartName(sourceTarget, kind);
    const targetBase = baseName(targetPartName);

    // Parse + store the part body.
    let parsedPart: XmlElement;
    try {
      parsedPart = converter.parseXmlToJson(decodeText(byName.get(srcPart)!));
    } catch {
      result.warnings.push({
        code: 'HEADER_FOOTER_PARSE_FAILED',
        message: `Could not parse source ${srcPart}; skipped.`,
      });
      continue;
    }

    // Per-part rels (media closure).
    const srcPartRelsPath = `word/_rels/${sourceTarget}.rels`;
    const srcPartRelsRaw = byName.get(srcPartRelsPath);
    if (srcPartRelsRaw) {
      let parsedRels: XmlElement;
      try {
        parsedRels = converter.parseXmlToJson(decodeText(srcPartRelsRaw));
      } catch {
        parsedRels = { elements: [] };
      }
      const relsRoot = getRelationshipsRoot(parsedRels);
      for (const rel of relsRoot?.elements ?? []) {
        const type = rel.attributes?.Type;
        const target = rel.attributes?.Target;
        const mode = rel.attributes?.TargetMode;
        if (!type || !target) continue;
        if (mode === 'External') continue;
        // Import internal media targets.
        if (type === IMAGE_REL_TYPE || /\/media\//.test(relTargetToWordPath(target))) {
          const srcMediaPath = relTargetToWordPath(target);
          const bytes = byName.get(srcMediaPath);
          if (!bytes) {
            result.warnings.push({
              code: 'MEDIA_MISSING',
              message: `Header/footer ${srcPart} references missing media ${srcMediaPath}.`,
            });
            continue;
          }
          const targetMediaPath = allocateMediaPath(srcMediaPath);
          mediaStore[targetMediaPath] = bytes;
          (converter.addedMedia as Record<string, unknown>)[targetMediaPath] = bytes;
          const imgStorage = (editor as unknown as { storage?: { image?: { media?: Record<string, unknown> } } })
            .storage?.image?.media;
          if (imgStorage) imgStorage[targetMediaPath] = bytes;
          // Rewrite the rel target (keep relative form under word/).
          rel.attributes!.Target = `media/${baseName(targetMediaPath)}`;
          result.changedParts.push({ part: targetMediaPath, scope: 'headersFooters', change: 'imported' });
          if (baseName(targetMediaPath) !== baseName(srcMediaPath)) {
            result.mappings.push({
              kind: 'relationship',
              from: baseName(srcMediaPath),
              to: baseName(targetMediaPath),
            });
          }
        }
      }
      converter.convertedXml[`word/_rels/${targetBase}.rels`] = parsedRels;
    }

    converter.convertedXml[targetPartName] = parsedPart;
    result.changedParts.push({ part: targetPartName, scope: 'headersFooters', change: 'imported' });

    // Allocate a document relationship for the part.
    const relId = allocateRelId();
    docRelsRoot.elements!.push({
      type: 'element',
      name: 'Relationship',
      attributes: {
        Id: relId,
        Type: kind === 'header' ? HEADER_REL_TYPE : FOOTER_REL_TYPE,
        Target: targetBase,
      },
    });
    docRelsChanged = true;

    // Map the source document-rel id (if this part was referenced) to the new id.
    const srcRel = sourceRelByTarget.get(sourceTarget);
    if (srcRel) {
      result.relIdRemap.set(srcRel.id, relId);
      result.mappings.push({ kind: 'relationship', from: srcRel.id, to: relId });
    }

    // Content-type override.
    if (ensureContentTypeOverride(converter, targetPartName, kind === 'header' ? HEADER_CONTENT_TYPE : FOOTER_CONTENT_TYPE)) {
      contentTypesChanged = true;
    }

    // Runtime caches (best-effort) so the asset is available in-session.
    try {
      const pmJson = converter.reimportHeaderFooterPart?.(targetPartName);
      if (pmJson) {
        const collection = kind === 'header' ? (converter.headers ??= {}) : (converter.footers ??= {});
        collection[relId] = pmJson;
        const idsHolder = kind === 'header' ? (converter.headerIds ??= {}) : (converter.footerIds ??= {});
        setHeaderIdsArray(idsHolder as Record<string, unknown>, relId);
      }
    } catch {
      // In-session cache rebuild is best-effort; durability comes from convertedXml.
    }
  }

  if (docRelsChanged) {
    result.changedParts.push({ part: DOCUMENT_RELS_PART, scope: 'package', change: 'merged' });
  }
  if (contentTypesChanged) {
    result.changedParts.push({ part: CONTENT_TYPES_PART, scope: 'package', change: 'merged' });
  }
  result.applied = result.changedParts.length > 0;
  return result;
}

function ensureContentTypeOverride(converter: ConverterForAssets, partPath: string, contentType: string): boolean {
  const ct = converter.convertedXml[CONTENT_TYPES_PART] as XmlElement | undefined;
  const types = ct ? rootElement(ct, 'Types') : undefined;
  if (!types) return false;
  if (!types.elements) types.elements = [];
  const partName = `/${partPath}`;
  const exists = types.elements.some((el) => el.name === 'Override' && el.attributes?.PartName === partName);
  if (exists) return false;
  types.elements.push({
    type: 'element',
    name: 'Override',
    attributes: { PartName: partName, ContentType: contentType },
  });
  return true;
}

// ---------------------------------------------------------------------------
// Page-1 section-default adoption
// ---------------------------------------------------------------------------

export interface SectionDefaultsResult {
  detected: boolean;
  applied: boolean;
  changed: boolean;
  changedParts: TemplateChangedPart[];
  warnings: TemplateApplyWarning[];
}

/**
 * Adopt the source `w:sectPr` that governs page 1 as the active section
 * defaults (`DA-TEMPLATE-017`), routed through the real section-mutation/sync
 * path so `bodySectPr`, saved body XML and page-style runtime state stay
 * consistent. Header/footer reference relationship ids are rewritten via
 * `relIdRemap`.
 */
export function applyPageOneSectionDefaults(
  editor: Editor,
  sourceDocumentXml: string,
  relIdRemap: Map<string, string>,
  parseXml: (xml: string) => XmlElement,
  dryRun: boolean,
): SectionDefaultsResult {
  const result: SectionDefaultsResult = { detected: false, applied: false, changed: false, changedParts: [], warnings: [] };

  let parsedDoc: XmlElement;
  try {
    parsedDoc = parseXml(sourceDocumentXml);
  } catch {
    return result;
  }
  const sourceSectPr = findPageOneSectPr(parsedDoc);
  if (!sourceSectPr) return result;
  result.detected = true;

  const sectPr = clone(sourceSectPr);
  rewriteSectPrRefs(sectPr, relIdRemap);

  // Find the final/body section projection and apply via the section path.
  let projections;
  try {
    projections = resolveSectionProjections(editor);
  } catch {
    result.warnings.push({
      code: 'SECTION_DEFAULTS_UNAVAILABLE',
      message: 'Could not resolve sections to apply the source page-1 sectPr.',
    });
    return result;
  }
  const bodyProjection = [...projections].reverse().find((p) => p.target.kind === 'body') ?? projections[projections.length - 1];
  if (!bodyProjection) {
    result.warnings.push({
      code: 'SECTION_DEFAULTS_UNAVAILABLE',
      message: 'No body section projection found for page-1 sectPr adoption.',
    });
    return result;
  }

  const currentSectPr = readTargetSectPr(editor, bodyProjection);
  if (xmlDeepEqual(currentSectPr, sectPr)) {
    return result;
  }

  result.changed = true;
  result.changedParts.push({ part: 'word/document.xml', scope: 'sectionDefaults', change: 'replaced' });
  if (dryRun) return result;

  try {
    applySectPrToProjection(editor, bodyProjection, sectPr as unknown as Parameters<typeof applySectPrToProjection>[2]);
    result.applied = true;
  } catch (err) {
    result.changed = false;
    result.changedParts = [];
    result.warnings.push({
      code: 'SECTION_DEFAULTS_FAILED',
      message: `Failed to apply source page-1 sectPr: ${(err as Error).message ?? 'unknown error'}.`,
    });
  }
  return result;
}
