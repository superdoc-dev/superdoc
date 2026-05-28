import {
  buildLayoutSourceIdentityForFragment,
  getParagraphInlineDirection,
  type DrawingBlock,
  type FieldAnnotationRun,
  type FlowBlock,
  type Fragment,
  type ImageBlock,
  type ImageDrawing,
  type ImageRun,
  type LayoutSourceIdentity,
  type LayoutStoryLocator,
  type ParagraphAttrs,
  type ParagraphBlock,
  type SdtMetadata,
  type ShapeGroupDrawing,
  type SourceAnchor,
  type TableAttrs,
  type TableBlock,
  type TableCellAttrs,
  type TrackedChangeMeta,
  type TextRun,
  type VectorShapeDrawing,
} from '@superdoc/contracts';
import { hashParagraphBorders } from './paragraphBorderHash.js';
import {
  hashCellBorders,
  hashTableBorders,
  getRunBooleanProp,
  getRunNumberProp,
  getRunStringProp,
  getRunUnderlineColor,
  getRunUnderlineStyle,
} from './hashUtils.js';

// ---------------------------------------------------------------------------
// SDT metadata helpers
// ---------------------------------------------------------------------------

const getSdtMetadataId = (metadata: SdtMetadata | null | undefined): string => {
  if (!metadata) return '';
  if ('id' in metadata && metadata.id != null) {
    return String(metadata.id);
  }
  return '';
};

const getSdtMetadataLockMode = (metadata: SdtMetadata | null | undefined): string => {
  if (!metadata) return '';
  return metadata.type === 'structuredContent' ? (metadata.lockMode ?? '') : '';
};

const getSdtMetadataVersion = (metadata: SdtMetadata | null | undefined): string => {
  if (!metadata) return '';
  return [metadata.type, getSdtMetadataLockMode(metadata), getSdtMetadataId(metadata)].join(':');
};

const getTrackedChangeLayers = (run: TextRun): TrackedChangeMeta[] => {
  if (Array.isArray(run.trackedChanges) && run.trackedChanges.length > 0) {
    return run.trackedChanges;
  }
  return run.trackedChange ? [run.trackedChange] : [];
};

const trackedChangeVersion = (run: TextRun): string =>
  getTrackedChangeLayers(run)
    .map((trackedChange) =>
      [
        trackedChange.kind ?? '',
        trackedChange.id ?? '',
        trackedChange.storyKey ?? '',
        trackedChange.overlapParentId ?? '',
        trackedChange.relationship ?? '',
        trackedChange.author ?? '',
        trackedChange.authorEmail ?? '',
        trackedChange.authorImage ?? '',
        trackedChange.date ?? '',
        trackedChange.before ? JSON.stringify(trackedChange.before) : '',
        trackedChange.after ? JSON.stringify(trackedChange.after) : '',
      ].join(':'),
    )
    .join('|');

// ---------------------------------------------------------------------------
// Clip path helpers
// ---------------------------------------------------------------------------

const CLIP_PATH_PREFIXES = ['inset(', 'polygon(', 'circle(', 'ellipse(', 'path(', 'rect('];

const readClipPathValue = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  if (normalized.length === 0) return '';
  const lower = normalized.toLowerCase();
  if (!CLIP_PATH_PREFIXES.some((prefix) => lower.startsWith(prefix))) return '';
  return normalized;
};

const resolveClipPathFromAttrs = (attrs: unknown): string => {
  if (!attrs || typeof attrs !== 'object') return '';
  const record = attrs as Record<string, unknown>;
  return readClipPathValue(record.clipPath);
};

const resolveBlockClipPath = (block: unknown): string => {
  if (!block || typeof block !== 'object') return '';
  const record = block as Record<string, unknown>;
  return readClipPathValue(record.clipPath) || resolveClipPathFromAttrs(record.attrs);
};

const imageHyperlinkVersion = (hyperlink: ImageBlock['hyperlink'] | undefined): string => {
  if (!hyperlink) return '';
  return JSON.stringify([hyperlink.url ?? '', hyperlink.tooltip ?? '']);
};

const imageLuminanceVersion = (lum: ImageBlock['lum'] | undefined): string => {
  if (!lum) return '';
  return [lum.bright ?? '', lum.contrast ?? ''].join(':');
};

const renderedBlockImageVersion = (image: ImageBlock | ImageDrawing): string =>
  [
    image.src ?? '',
    image.width ?? '',
    image.height ?? '',
    image.alt ?? '',
    image.title ?? '',
    image.objectFit ?? '',
    image.display ?? '',
    image.gain ?? '',
    image.blacklevel ?? '',
    image.grayscale ? 1 : 0,
    imageLuminanceVersion(image.lum),
    image.rotation ?? '',
    image.flipH ? 1 : 0,
    image.flipV ? 1 : 0,
    imageHyperlinkVersion(image.hyperlink),
    resolveBlockClipPath(image),
  ].join('|');

const renderedInlineImageRunVersion = (image: ImageRun): string =>
  [
    'img',
    image.src ?? '',
    image.width ?? '',
    image.height ?? '',
    image.alt ?? '',
    image.title ?? '',
    typeof image.clipPath === 'string' ? image.clipPath.trim() : '',
    image.distTop ?? '',
    image.distBottom ?? '',
    image.distLeft ?? '',
    image.distRight ?? '',
    image.verticalAlign ?? '',
    image.gain ?? '',
    image.blacklevel ?? '',
    image.grayscale ? 1 : 0,
    imageLuminanceVersion(image.lum),
    image.rotation ?? '',
    image.flipH ? 1 : 0,
    image.flipV ? 1 : 0,
    imageHyperlinkVersion(image.hyperlink),
    stableSerializeEvidenceValue(image.sdt),
    stableSerializeEvidenceValue(image.dataAttrs),
  ].join('|');

// ---------------------------------------------------------------------------
// List marker validation
// ---------------------------------------------------------------------------

const hasListMarkerProperties = (
  attrs: unknown,
): attrs is {
  numberingProperties: { numId?: number | string; ilvl?: number };
  wordLayout?: { marker?: { markerText?: string } };
} => {
  if (!attrs || typeof attrs !== 'object') return false;
  const obj = attrs as Record<string, unknown>;

  if (!obj.numberingProperties || typeof obj.numberingProperties !== 'object') return false;
  const numProps = obj.numberingProperties as Record<string, unknown>;

  if ('numId' in numProps) {
    const numId = numProps.numId;
    if (typeof numId !== 'number' && typeof numId !== 'string') return false;
  }

  if ('ilvl' in numProps) {
    const ilvl = numProps.ilvl;
    if (typeof ilvl !== 'number') return false;
  }

  if ('wordLayout' in obj && obj.wordLayout !== undefined) {
    if (typeof obj.wordLayout !== 'object' || obj.wordLayout === null) return false;
    const wordLayout = obj.wordLayout as Record<string, unknown>;

    if ('marker' in wordLayout && wordLayout.marker !== undefined) {
      if (typeof wordLayout.marker !== 'object' || wordLayout.marker === null) return false;
      const marker = wordLayout.marker as Record<string, unknown>;

      if ('markerText' in marker && marker.markerText !== undefined) {
        if (typeof marker.markerText !== 'string') return false;
      }
    }
  }

  return true;
};

// ---------------------------------------------------------------------------
// FNV-1a hash helpers (for table block hashing)
// ---------------------------------------------------------------------------

const hashString = (seed: number, value: string): number => {
  let hash = seed >>> 0;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const hashNumber = (seed: number, value: number | undefined | null): number => {
  const n = Number.isFinite(value) ? (value as number) : 0;
  let hash = seed ^ n;
  hash = Math.imul(hash, 16777619);
  hash ^= hash >>> 13;
  return hash >>> 0;
};

// ---------------------------------------------------------------------------
// sourceAnchorSignature
// ---------------------------------------------------------------------------

const stableSerializeEvidenceValue = (value: unknown): string => {
  if (value === undefined) return '';
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerializeEvidenceValue(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableSerializeEvidenceValue(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(String(value));
};

/**
 * Stable source/evidence metadata signature for paint cache invalidation.
 *
 * Source anchors are not visual geometry. Keep them out of deriveBlockVersion()
 * and fragmentSignature(), but include this fingerprint in DomPainter's paint
 * reuse signature so metadata-only updates refresh data-source-* attributes and
 * paint snapshot anchors.
 */
export const sourceAnchorSignature = (sourceAnchor: SourceAnchor | undefined): string =>
  sourceAnchor ? stableSerializeEvidenceValue(sourceAnchor) : '';

/**
 * Resolve the editor-neutral identity for a fragment (prep-001).
 *
 * Prefers `fragment.layoutSourceIdentity` when present; otherwise constructs
 * one from the producer's existing fields (`blockId`, `kind`, fragment-local
 * line/row indices, optional `sourceAnchor`). Pure helper — does not mutate
 * the fragment, and remains safe to call for v1 layouts that never populate
 * `layoutSourceIdentity` upstream.
 */
export const resolveFragmentLayoutIdentity = (fragment: Fragment, story?: LayoutStoryLocator): LayoutSourceIdentity => {
  return buildLayoutSourceIdentityForFragment(fragment, story);
};

// ---------------------------------------------------------------------------
// deriveBlockVersion
// ---------------------------------------------------------------------------

/**
 * Derives a version string for a flow block based on its content and styling properties.
 *
 * This version string is used for cache invalidation. When any visual property of the block
 * changes, the version string changes, triggering a DOM rebuild instead of reusing cached elements.
 *
 * Kept in layout-resolved so the resolved layout stage can pre-compute block
 * versions without depending on painter-dom.
 */
export const deriveBlockVersion = (block: FlowBlock): string => {
  if (block.kind === 'paragraph') {
    const markerVersion = hasListMarkerProperties(block.attrs)
      ? `marker:${block.attrs.numberingProperties.numId ?? ''}:${block.attrs.numberingProperties.ilvl ?? 0}:${block.attrs.wordLayout?.marker?.markerText ?? ''}`
      : '';

    const runsVersion = block.runs
      .map((run) => {
        if (run.kind === 'image') {
          return renderedInlineImageRunVersion(run as ImageRun);
        }

        if (run.kind === 'lineBreak') {
          return 'linebreak';
        }

        if (run.kind === 'tab') {
          return [run.text ?? '', 'tab'].join(',');
        }

        if (run.kind === 'fieldAnnotation') {
          const fieldRun = run as FieldAnnotationRun;
          const size = fieldRun.size ? `${fieldRun.size.width ?? ''}x${fieldRun.size.height ?? ''}` : '';
          const highlighted = fieldRun.highlighted !== false ? 1 : 0;
          return [
            'field',
            fieldRun.variant ?? '',
            fieldRun.displayLabel ?? '',
            fieldRun.fieldColor ?? '',
            fieldRun.borderColor ?? '',
            highlighted,
            fieldRun.hidden ? 1 : 0,
            fieldRun.visibility ?? '',
            fieldRun.imageSrc ?? '',
            fieldRun.linkUrl ?? '',
            fieldRun.rawHtml ?? '',
            size,
            fieldRun.fontFamily ?? '',
            fieldRun.fontSize ?? '',
            fieldRun.textColor ?? '',
            fieldRun.textHighlight ?? '',
            fieldRun.bold ? 1 : 0,
            fieldRun.italic ? 1 : 0,
            fieldRun.underline ? 1 : 0,
            fieldRun.fieldId ?? '',
            fieldRun.fieldType ?? '',
          ].join(',');
        }

        const textRun = run as TextRun;
        const trackedVersion = trackedChangeVersion(textRun);
        return [
          textRun.text ?? '',
          textRun.fontFamily,
          textRun.fontSize,
          textRun.bold ? 1 : 0,
          textRun.italic ? 1 : 0,
          textRun.color ?? '',
          textRun.underline?.style ?? '',
          textRun.underline?.color ?? '',
          textRun.strike ? 1 : 0,
          textRun.highlight ?? '',
          textRun.letterSpacing != null ? textRun.letterSpacing : '',
          textRun.vertAlign ?? '',
          textRun.baselineShift != null ? textRun.baselineShift : '',
          textRun.token ?? '',
          trackedVersion,
          textRun.comments?.length ?? 0,
          // SD-3098: DomPainter reads run.bidi to apply dir + RLM injection; signature must include it.
          textRun.bidi ? JSON.stringify(textRun.bidi) : '',
        ].join(',');
      })
      .join('|');

    const attrs = block.attrs as ParagraphAttrs | undefined;

    const paragraphAttrsVersion = attrs
      ? [
          attrs.alignment ?? '',
          attrs.spacing?.before ?? '',
          attrs.spacing?.after ?? '',
          attrs.spacing?.line ?? '',
          attrs.spacing?.lineRule ?? '',
          attrs.indent?.left ?? '',
          attrs.indent?.right ?? '',
          attrs.indent?.firstLine ?? '',
          attrs.indent?.hanging ?? '',
          attrs.borders ? hashParagraphBorders(attrs.borders) : '',
          attrs.shading?.fill ?? '',
          attrs.shading?.color ?? '',
          getParagraphInlineDirection(attrs) ?? '',
          attrs.tabs?.length ? JSON.stringify(attrs.tabs) : '',
        ].join(':')
      : '';

    const sdtAttrs = (block.attrs as ParagraphAttrs | undefined)?.sdt;
    const sdtVersion = getSdtMetadataVersion(sdtAttrs);

    const parts = [markerVersion, runsVersion, paragraphAttrsVersion, sdtVersion].filter(Boolean);
    return parts.join('|');
  }

  if (block.kind === 'list') {
    return block.items.map((item) => `${item.id}:${item.marker.text}:${deriveBlockVersion(item.paragraph)}`).join('|');
  }

  if (block.kind === 'image') {
    const imgSdt = (block as ImageBlock).attrs?.sdt;
    const imgSdtVersion = getSdtMetadataVersion(imgSdt);
    return [renderedBlockImageVersion(block), imgSdtVersion].join('|');
  }

  if (block.kind === 'drawing') {
    if (block.drawingKind === 'image') {
      const imageLike = block as ImageDrawing;
      return ['drawing:image', renderedBlockImageVersion(imageLike)].join('|');
    }
    if (block.drawingKind === 'vectorShape') {
      const vector = block as VectorShapeDrawing;
      return [
        'drawing:vector',
        vector.shapeKind ?? '',
        vector.fillColor ?? '',
        vector.strokeColor ?? '',
        vector.strokeWidth ?? '',
        vector.geometry.width,
        vector.geometry.height,
        vector.geometry.rotation ?? 0,
        vector.geometry.flipH ? 1 : 0,
        vector.geometry.flipV ? 1 : 0,
      ].join('|');
    }
    if (block.drawingKind === 'shapeGroup') {
      const group = block as ShapeGroupDrawing;
      const childSignature = group.shapes
        .map((child) => `${child.shapeType}:${JSON.stringify(child.attrs ?? {})}`)
        .join(';');
      return [
        'drawing:group',
        group.geometry.width,
        group.geometry.height,
        group.groupTransform ? JSON.stringify(group.groupTransform) : '',
        childSignature,
      ].join('|');
    }
    if (block.drawingKind === 'chart') {
      return [
        'drawing:chart',
        block.chartData?.chartType ?? '',
        block.chartData?.series?.length ?? 0,
        block.geometry.width,
        block.geometry.height,
        block.chartRelId ?? '',
      ].join('|');
    }
    const _exhaustive: never = block;
    return `drawing:unknown:${(block as DrawingBlock).id}`;
  }

  if (block.kind === 'table') {
    const tableBlock = block as TableBlock;

    let hash = 2166136261;
    hash = hashString(hash, block.id);
    hash = hashNumber(hash, tableBlock.rows.length);
    hash = (tableBlock.columnWidths ?? []).reduce((acc, width) => hashNumber(acc, Math.round(width * 1000)), hash);

    const rows = tableBlock.rows ?? [];
    for (const row of rows) {
      if (!row || !Array.isArray(row.cells)) continue;
      hash = hashNumber(hash, row.cells.length);
      for (const cell of row.cells) {
        if (!cell) continue;
        const cellBlocks = cell.blocks ?? (cell.paragraph ? [cell.paragraph] : []);
        hash = hashNumber(hash, cellBlocks.length);
        hash = hashNumber(hash, cell.rowSpan ?? 1);
        hash = hashNumber(hash, cell.colSpan ?? 1);

        if (cell.attrs) {
          const cellAttrs = cell.attrs as TableCellAttrs;
          if (cellAttrs.borders) {
            hash = hashString(hash, hashCellBorders(cellAttrs.borders));
          }
          if (cellAttrs.padding) {
            const p = cellAttrs.padding;
            hash = hashNumber(hash, p.top ?? 0);
            hash = hashNumber(hash, p.right ?? 0);
            hash = hashNumber(hash, p.bottom ?? 0);
            hash = hashNumber(hash, p.left ?? 0);
          }
          if (cellAttrs.verticalAlign) {
            hash = hashString(hash, cellAttrs.verticalAlign);
          }
          if (cellAttrs.background) {
            hash = hashString(hash, cellAttrs.background);
          }
        }

        for (const cellBlock of cellBlocks) {
          hash = hashString(hash, cellBlock?.kind ?? 'unknown');
          if (cellBlock?.kind === 'paragraph') {
            const paragraphBlock = cellBlock as ParagraphBlock;
            const runs = paragraphBlock.runs ?? [];
            hash = hashNumber(hash, runs.length);

            const attrs = paragraphBlock.attrs as ParagraphAttrs | undefined;

            if (attrs) {
              hash = hashString(hash, attrs.alignment ?? '');
              hash = hashNumber(hash, attrs.spacing?.before ?? 0);
              hash = hashNumber(hash, attrs.spacing?.after ?? 0);
              hash = hashNumber(hash, attrs.spacing?.line ?? 0);
              hash = hashString(hash, attrs.spacing?.lineRule ?? '');
              hash = hashNumber(hash, attrs.indent?.left ?? 0);
              hash = hashNumber(hash, attrs.indent?.right ?? 0);
              hash = hashNumber(hash, attrs.indent?.firstLine ?? 0);
              hash = hashNumber(hash, attrs.indent?.hanging ?? 0);
              hash = hashString(hash, attrs.shading?.fill ?? '');
              hash = hashString(hash, attrs.shading?.color ?? '');
              hash = hashString(hash, getParagraphInlineDirection(attrs) ?? '');
              if (attrs.borders) {
                hash = hashString(hash, hashParagraphBorders(attrs.borders));
              }
            }

            for (const run of runs) {
              if (run.kind === 'image') {
                hash = hashString(hash, renderedInlineImageRunVersion(run as ImageRun));
                hash = hashNumber(hash, run.pmStart ?? -1);
                hash = hashNumber(hash, run.pmEnd ?? -1);
                continue;
              }

              if ('text' in run && typeof run.text === 'string') {
                hash = hashString(hash, run.text);
              }
              hash = hashNumber(hash, run.pmStart ?? -1);
              hash = hashNumber(hash, run.pmEnd ?? -1);

              hash = hashString(hash, getRunStringProp(run, 'color'));
              hash = hashString(hash, getRunStringProp(run, 'highlight'));
              hash = hashString(hash, getRunBooleanProp(run, 'bold') ? '1' : '');
              hash = hashString(hash, getRunBooleanProp(run, 'italic') ? '1' : '');
              hash = hashNumber(hash, getRunNumberProp(run, 'fontSize'));
              hash = hashString(hash, getRunStringProp(run, 'fontFamily'));
              hash = hashString(hash, getRunUnderlineStyle(run));
              hash = hashString(hash, getRunUnderlineColor(run));
              hash = hashString(hash, getRunBooleanProp(run, 'strike') ? '1' : '');
              hash = hashString(hash, getRunStringProp(run, 'vertAlign'));
              hash = hashNumber(hash, getRunNumberProp(run, 'baselineShift'));
              // SD-3098: include run.bidi so rtl-only changes invalidate the cached block hash.
              const bidi = (run as { bidi?: unknown }).bidi;
              hash = hashString(hash, bidi ? JSON.stringify(bidi) : '');
              hash = hashString(hash, trackedChangeVersion(run as TextRun));
            }
          } else if (cellBlock?.kind) {
            hash = hashString(hash, deriveBlockVersion(cellBlock as FlowBlock));
          }
        }
      }
    }

    if (tableBlock.attrs) {
      const tblAttrs = tableBlock.attrs as TableAttrs;
      if (tblAttrs.borders) {
        hash = hashString(hash, hashTableBorders(tblAttrs.borders));
      }
      if (tblAttrs.borderCollapse) {
        hash = hashString(hash, tblAttrs.borderCollapse);
      }
      if (tblAttrs.cellSpacing !== undefined) {
        const cs = tblAttrs.cellSpacing;
        if (typeof cs === 'number') {
          hash = hashNumber(hash, cs);
        } else {
          const v = (cs as { value?: number; type?: string }).value ?? 0;
          const t = (cs as { value?: number; type?: string }).type ?? 'px';
          hash = hashString(hash, `cs:${v}:${t}`);
        }
      }
      if (tblAttrs.sdt) {
        hash = hashString(hash, tblAttrs.sdt.type);
        hash = hashString(hash, getSdtMetadataLockMode(tblAttrs.sdt));
        hash = hashString(hash, getSdtMetadataId(tblAttrs.sdt));
      }
    }

    return [block.id, tableBlock.rows.length, hash.toString(16)].join('|');
  }

  return block.id;
};

// ---------------------------------------------------------------------------
// fragmentSignature
// ---------------------------------------------------------------------------

/**
 * Computes a change-detection signature for a layout fragment.
 *
 * Combines the block-level version with fragment-specific data (line range,
 * continuation flags, marker width, drawing geometry, table row range, etc.)
 * so that each fragment has a unique identity for incremental re-rendering.
 *
 * Adapted from painters/dom/src/renderer.ts fragmentSignature(). The painter
 * version accepts a BlockLookup map; this version takes a pre-computed
 * blockVersion string directly.
 */
export const fragmentSignature = (fragment: Fragment, blockVersion: string): string => {
  if (fragment.kind === 'para') {
    return [
      blockVersion,
      fragment.fromLine,
      fragment.toLine,
      fragment.continuesFromPrev ? 1 : 0,
      fragment.continuesOnNext ? 1 : 0,
      fragment.markerWidth ?? '',
    ].join('|');
  }
  if (fragment.kind === 'list-item') {
    return [
      blockVersion,
      fragment.itemId,
      fragment.fromLine,
      fragment.toLine,
      fragment.continuesFromPrev ? 1 : 0,
      fragment.continuesOnNext ? 1 : 0,
    ].join('|');
  }
  if (fragment.kind === 'image') {
    return [blockVersion, fragment.width, fragment.height].join('|');
  }
  if (fragment.kind === 'drawing') {
    return [
      blockVersion,
      fragment.drawingKind,
      fragment.drawingContentId ?? '',
      fragment.width,
      fragment.height,
      fragment.geometry.width,
      fragment.geometry.height,
      fragment.geometry.rotation ?? 0,
      fragment.scale ?? 1,
      fragment.zIndex ?? '',
    ].join('|');
  }
  if (fragment.kind === 'table') {
    const partialSig = fragment.partialRow
      ? `${fragment.partialRow.fromLineByCell.join(',')}-${fragment.partialRow.toLineByCell.join(',')}-${fragment.partialRow.partialHeight}`
      : '';
    return [
      blockVersion,
      fragment.fromRow,
      fragment.toRow,
      fragment.width,
      fragment.height,
      fragment.continuesFromPrev ? 1 : 0,
      fragment.continuesOnNext ? 1 : 0,
      fragment.repeatHeaderCount ?? 0,
      partialSig,
    ].join('|');
  }
  return blockVersion;
};
