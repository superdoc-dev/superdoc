/**
 * Node materializer — converts SDFragment nodes to ProseMirror nodes.
 *
 * SDM/1 dispatch: resolves `kind` from the canonical field, with legacy
 * `type` fallback for backward compatibility during the transition.
 *
 * ID lifecycle: caller-provided `id` is preserved as `sdBlockId`; absent IDs
 * are generated. Duplicates (intra-fragment and vs. existing document) are
 * rejected with DUPLICATE_ID.
 *
 * Capability gate: enforces the spec capability matrix per-operation before
 * materializing any node.
 */

import { Fragment } from 'prosemirror-model';
import type { Mark as ProseMirrorMark, Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import type { SDFragment, SDContentNode } from '@superdoc/document-api';
import { v4 as uuidv4 } from 'uuid';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The write operation being performed — determines capability permissions. */
export type SDWriteOp = 'insert' | 'replace' | 'mutate';

/** Capability level for a given kind + operation combination. */
interface KindCapability {
  insert: boolean | 'partial' | 'raw-gated';
  replace: boolean | 'partial';
  mutate: boolean | 'partial';
}

// ---------------------------------------------------------------------------
// Capability maps (spec §Capability Matrix)
// ---------------------------------------------------------------------------

const CONTENT_CAPABILITIES: ReadonlyMap<string, KindCapability> = new Map([
  ['paragraph', { insert: true, replace: true, mutate: true }],
  ['heading', { insert: true, replace: true, mutate: true }],
  ['table', { insert: true, replace: true, mutate: true }],
  ['list', { insert: true, replace: true, mutate: true }],
  ['image', { insert: true, replace: true, mutate: true }],
  ['toc', { insert: true, replace: false, mutate: false }],
  ['tableOfContents', { insert: true, replace: false, mutate: false }],
  ['index', { insert: true, replace: false, mutate: false }],
  ['bibliography', { insert: true, replace: false, mutate: false }],
  ['tableOfAuthorities', { insert: true, replace: false, mutate: false }],
  ['sectionBreak', { insert: true, replace: false, mutate: false }],
  ['break', { insert: true, replace: false, mutate: false }],
  ['drawing', { insert: 'partial', replace: 'partial', mutate: 'partial' }],
  ['field', { insert: 'raw-gated', replace: false, mutate: false }],
  ['sdt', { insert: true, replace: true, mutate: true }],
]);

const INLINE_CAPABILITIES: ReadonlyMap<string, KindCapability> = new Map([
  ['run', { insert: true, replace: true, mutate: true }],
  ['text', { insert: true, replace: true, mutate: true }], // legacy alias for run
  ['hyperlink', { insert: true, replace: true, mutate: true }],
  ['crossRef', { insert: true, replace: false, mutate: false }],
  ['tocEntry', { insert: true, replace: false, mutate: 'partial' }],
  ['indexEntry', { insert: true, replace: false, mutate: 'partial' }],
  ['citation', { insert: true, replace: false, mutate: 'partial' }],
  ['authorityEntry', { insert: true, replace: false, mutate: 'partial' }],
  ['sequenceField', { insert: 'partial', replace: false, mutate: 'partial' }],
  ['tab', { insert: true, replace: false, mutate: false }],
  ['lineBreak', { insert: true, replace: false, mutate: false }],
  ['footnoteRef', { insert: true, replace: false, mutate: false }],
  ['endnoteRef', { insert: true, replace: false, mutate: false }],
  ['image', { insert: true, replace: true, mutate: true }],
  ['drawing', { insert: 'partial', replace: 'partial', mutate: 'partial' }],
  ['field', { insert: 'raw-gated', replace: false, mutate: false }],
  ['sdt', { insert: true, replace: true, mutate: true }],
]);

// ---------------------------------------------------------------------------
// Capability gate
// ---------------------------------------------------------------------------

function assertCapability(
  kind: string,
  operation: SDWriteOp,
  level: 'content' | 'inline',
  options?: { rawMode?: boolean },
): void {
  if (kind.startsWith('ext.')) return; // extension nodes bypass checks

  const map = level === 'content' ? CONTENT_CAPABILITIES : INLINE_CAPABILITIES;
  const cap = map.get(kind);

  if (!cap) {
    throw new DocumentApiAdapterError(
      'PRESERVE_ONLY_VIOLATION',
      `"${kind}" is a preserve-only ${level} node family. ${operation} is not supported.`,
    );
  }

  const allowed = cap[operation];
  if (allowed === true || allowed === 'partial') return;

  if (allowed === 'raw-gated') {
    if (!options?.rawMode) {
      throw new DocumentApiAdapterError(
        'RAW_MODE_REQUIRED',
        `${operation} of "${kind}" requires explicit raw mode opt-in.`,
      );
    }
    return;
  }

  throw new DocumentApiAdapterError(
    'CAPABILITY_UNAVAILABLE',
    `"${kind}" does not support the "${operation}" operation.`,
  );
}

// ---------------------------------------------------------------------------
// ID lifecycle
// ---------------------------------------------------------------------------

function resolveBlockId(
  node: Record<string, unknown>,
  seenIds: Set<string>,
  existingDocIds: ReadonlySet<string>,
): string {
  const id = (node as any).id as string | undefined;
  if (id) {
    if (seenIds.has(id)) {
      throw new DocumentApiAdapterError('DUPLICATE_ID', `Duplicate block ID within fragment: "${id}".`);
    }
    if (existingDocIds.has(id)) {
      throw new DocumentApiAdapterError('DUPLICATE_ID', `Block ID "${id}" already exists in the document.`);
    }
    seenIds.add(id);
    return id;
  }
  const generated = uuidv4();
  seenIds.add(generated);
  return generated;
}

// ---------------------------------------------------------------------------
// Kind resolution (SDM/1 or legacy fallback)
// ---------------------------------------------------------------------------

/**
 * Resolves the canonical kind from an SDM/1 node or a legacy node.
 * SDM/1 uses `kind`; legacy uses `type`.
 */
function resolveKind(node: any): string {
  return node.kind ?? node.type ?? 'unknown';
}

/**
 * Resolves the nested payload for SDM/1 nodes.
 * SDM/1: `{ kind: 'paragraph', paragraph: { inlines: [...] } }` → node.paragraph
 * Legacy: `{ type: 'paragraph', content: [...] }` → node (the node IS the payload)
 */
function resolvePayload(node: any, kind: string): any {
  return node[kind] ?? node;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Materializes an SDFragment into a ProseMirror Fragment.
 *
 * @param schema - The editor's ProseMirror schema
 * @param fragment - The structural content to materialize
 * @param existingDocIds - IDs already in the document (for duplicate detection)
 * @param operation - The write operation being performed ('insert' | 'replace' | 'mutate')
 * @param options - Materialization options (e.g., rawMode for field nodes)
 * @returns A ProseMirror Fragment containing the materialized nodes
 */
export function materializeFragment(
  schema: Schema,
  fragment: SDFragment,
  existingDocIds: ReadonlySet<string> = new Set(),
  operation: SDWriteOp = 'insert',
  options?: { rawMode?: boolean },
): Fragment {
  const nodes = Array.isArray(fragment) ? fragment : [fragment];
  const seenIds = new Set<string>();
  const pmNodes = nodes.map((node) => materializeNode(schema, node, seenIds, existingDocIds, operation, options));
  return Fragment.from(pmNodes);
}

// ---------------------------------------------------------------------------
// Content-node dispatch
// ---------------------------------------------------------------------------

function materializeNode(
  schema: Schema,
  node: SDContentNode,
  seenIds: Set<string>,
  existingDocIds: ReadonlySet<string>,
  operation: SDWriteOp,
  options?: { rawMode?: boolean },
): ProseMirrorNode {
  const kind = resolveKind(node);
  assertCapability(kind, operation, 'content', options);

  switch (kind) {
    case 'paragraph':
      return materializeParagraph(schema, node, seenIds, existingDocIds, operation, options);
    case 'heading':
      return materializeHeading(schema, node, seenIds, existingDocIds, operation, options);
    case 'table':
      return materializeTable(schema, node, seenIds, existingDocIds, operation, options);
    case 'image':
      return materializeImage(schema, node, seenIds, existingDocIds);
    case 'list':
      return materializeList(schema, node, seenIds, existingDocIds, operation, options);
    case 'sectionBreak':
      return materializeSectionBreak(schema, node, seenIds, existingDocIds);
    case 'toc':
    case 'tableOfContents':
      return materializeToc(schema, node, seenIds, existingDocIds);
    case 'break':
      return materializeBreak(schema, node, seenIds, existingDocIds);
    case 'drawing':
      return materializeDrawing(schema, node, seenIds, existingDocIds);
    case 'index':
    case 'bibliography':
    case 'tableOfAuthorities':
      return materializeReferenceBlock(schema, node, kind, seenIds, existingDocIds);
    case 'field':
      return materializeField(schema, node, seenIds, existingDocIds);
    case 'sdt':
      return materializeSdt(schema, node, seenIds, existingDocIds, operation, options);
    default:
      return materializeFallback(schema, node, seenIds, existingDocIds);
  }
}

// ---------------------------------------------------------------------------
// Content materializers
// ---------------------------------------------------------------------------

function materializeParagraph(
  schema: Schema,
  node: SDContentNode,
  seenIds: Set<string>,
  existingDocIds: ReadonlySet<string>,
  operation: SDWriteOp,
  options?: { rawMode?: boolean },
): ProseMirrorNode {
  const kind = resolveKind(node);
  const payload = resolvePayload(node, kind);
  const inlines = payload.inlines ?? payload.content;
  const content = materializeInlineContent(schema, inlines, operation, options);
  const attrs: Record<string, unknown> = {
    sdBlockId: resolveBlockId(node as any, seenIds, existingDocIds),
  };
  const paragraphProperties = buildParagraphProperties(payload.styleRef ?? payload.style, payload.props);
  if (paragraphProperties) attrs.paragraphProperties = paragraphProperties;
  // Legacy flat style field
  if (!paragraphProperties && payload.style) attrs.paragraphStyle = payload.style;
  return schema.nodes.paragraph.create(attrs, content);
}

function materializeHeading(
  schema: Schema,
  node: SDContentNode,
  seenIds: Set<string>,
  existingDocIds: ReadonlySet<string>,
  operation: SDWriteOp,
  options?: { rawMode?: boolean },
): ProseMirrorNode {
  const payload = resolvePayload(node, 'heading');
  const inlines = payload.inlines ?? payload.content;
  const content = materializeInlineContent(schema, inlines, operation, options);
  const attrs: Record<string, unknown> = {
    sdBlockId: resolveBlockId(node as any, seenIds, existingDocIds),
    level: payload.level,
  };
  const paragraphProperties = buildParagraphProperties(payload.styleRef ?? payload.style, payload.props);
  if (paragraphProperties) attrs.paragraphProperties = paragraphProperties;
  if (!paragraphProperties && payload.style) attrs.paragraphStyle = payload.style;

  const nodeType = schema.nodes.heading ?? schema.nodes.paragraph;
  return nodeType.create(attrs, content);
}

function materializeTable(
  schema: Schema,
  node: SDContentNode,
  seenIds: Set<string>,
  existingDocIds: ReadonlySet<string>,
  operation: SDWriteOp,
  options?: { rawMode?: boolean },
): ProseMirrorNode {
  const payload = resolvePayload(node, 'table');
  const rows = (payload.rows ?? []).map((row: any) =>
    materializeTableRow(schema, row, seenIds, existingDocIds, operation, options),
  );
  const attrs: Record<string, unknown> = {
    sdBlockId: resolveBlockId(node as any, seenIds, existingDocIds),
    paraId: uuidv4(),
  };

  const styleRef = payload.styleRef ?? payload.style;
  const tableProperties: Record<string, unknown> = isRecord(payload.tableProperties)
    ? { ...payload.tableProperties }
    : {};

  if (styleRef) {
    attrs.tableStyleId = styleRef;
    tableProperties.tableStyleId = styleRef;
  }

  const width = mapSDTableWidthToMeasurement(payload.props?.width);
  if (width) {
    tableProperties.tableWidth = width;
  }

  const layout = payload.props?.layout;
  if (layout === 'fixed' || layout === 'autofit') {
    attrs.tableLayout = layout;
    tableProperties.tableLayout = layout;
  }

  const justification = mapSDTableAlignmentToJustification(payload.props?.alignment);
  if (justification) {
    attrs.justification = justification;
    tableProperties.justification = justification;
  }

  if (payload.props?.borders && isRecord(payload.props.borders)) {
    attrs.borders = payload.props.borders;
    tableProperties.borders = payload.props.borders;
  }

  if (Object.keys(tableProperties).length > 0) {
    attrs.tableProperties = tableProperties;
  }

  const grid = normalizeTableGridColumns(payload.columns);
  if (grid) {
    attrs.grid = grid;
    attrs.tableGrid = { colWidths: grid };
    attrs.tableGridModel = grid;
  }

  if (resolveNeedsTableStyleNormalization(node, payload)) {
    attrs.needsTableStyleNormalization = true;
  }

  return schema.nodes.table.create(attrs, rows);
}

function materializeTableRow(
  schema: Schema,
  row: any,
  seenIds: Set<string>,
  existingDocIds: ReadonlySet<string>,
  operation: SDWriteOp,
  options?: { rawMode?: boolean },
): ProseMirrorNode {
  const cells = (row.cells ?? []).map((cell: any) =>
    materializeTableCell(schema, cell, seenIds, existingDocIds, operation, options),
  );
  const attrs: Record<string, unknown> = { sdBlockId: uuidv4() };
  if (row.props?.minHeight !== undefined) attrs.minHeight = row.props.minHeight;
  if (row.props?.cantSplit !== undefined) attrs.cantSplit = row.props.cantSplit;
  return schema.nodes.tableRow.create(attrs, cells);
}

function materializeTableCell(
  schema: Schema,
  cell: any,
  seenIds: Set<string>,
  existingDocIds: ReadonlySet<string>,
  operation: SDWriteOp,
  options?: { rawMode?: boolean },
): ProseMirrorNode {
  const children = (cell.content ?? [{ type: 'paragraph' as const }]).map((child: any) =>
    materializeNode(schema, child as SDContentNode, seenIds, existingDocIds, operation, options),
  );
  const attrs: Record<string, unknown> = { sdBlockId: uuidv4() };
  if (cell.colSpan !== undefined) attrs.colspan = cell.colSpan;
  if (cell.rowSpan !== undefined) attrs.rowspan = cell.rowSpan;
  if (cell.props?.verticalAlign) attrs.verticalAlign = cell.props.verticalAlign;
  if (cell.props?.shading) attrs.shading = cell.props.shading;
  if (cell.props?.padding) attrs.padding = cell.props.padding;
  if (cell.props?.borders) attrs.borders = cell.props.borders;
  return schema.nodes.tableCell.create(attrs, children);
}

function normalizeTableGridColumns(columns: unknown): Array<{ col: number }> | undefined {
  if (!Array.isArray(columns) || columns.length === 0) return undefined;

  const normalized = columns
    .map((column) => {
      const raw =
        typeof column === 'number'
          ? column
          : isRecord(column) && typeof column.width === 'number'
            ? column.width
            : undefined;
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
      return { col: Math.round(raw) };
    })
    .filter((item): item is { col: number } => item !== null);

  return normalized.length > 0 ? normalized : undefined;
}

function mapSDTableWidthToMeasurement(width: unknown): Record<string, unknown> | undefined {
  if (isRecord(width)) {
    if ('kind' in width && typeof width.kind === 'string') {
      switch (width.kind) {
        case 'auto':
          return { type: 'auto' };
        case 'none':
          return { type: 'nil' };
        case 'percent':
          if (typeof width.value === 'number' && Number.isFinite(width.value)) {
            return { type: 'pct', value: width.value };
          }
          return undefined;
        case 'points':
          if (typeof width.value === 'number' && Number.isFinite(width.value)) {
            return { type: 'dxa', value: Math.round(width.value * 20) };
          }
          return undefined;
        default:
          return undefined;
      }
    }

    const hasMeasurementShape =
      typeof width.type === 'string' &&
      (typeof width.value === 'number' || typeof width.width === 'number' || width.type === 'auto');
    if (hasMeasurementShape) {
      return { ...width };
    }
  }

  if (typeof width === 'number' && Number.isFinite(width)) {
    // Legacy fallback: treat numeric width as twips.
    return { type: 'dxa', value: Math.round(width) };
  }

  return undefined;
}

function mapSDTableAlignmentToJustification(value: unknown): 'center' | 'end' | 'left' | 'right' | 'start' | undefined {
  if (typeof value !== 'string') return undefined;
  switch (value) {
    case 'left':
      return 'left';
    case 'center':
      return 'center';
    case 'right':
      return 'right';
    case 'inside':
      return 'start';
    case 'outside':
      return 'end';
    default:
      return undefined;
  }
}

function resolveNeedsTableStyleNormalization(node: unknown, payload: Record<string, unknown>): boolean {
  if (payload.needsTableStyleNormalization === true) return true;
  if (!isRecord(node)) return false;

  const ext = node.ext;
  if (!isRecord(ext)) return false;
  if (ext.needsTableStyleNormalization === true) return true;

  const superdocExt = ext.superdoc;
  if (isRecord(superdocExt) && superdocExt.needsTableStyleNormalization === true) {
    return true;
  }

  return false;
}

function materializeImage(
  schema: Schema,
  node: SDContentNode,
  seenIds: Set<string>,
  existingDocIds: ReadonlySet<string>,
): ProseMirrorNode {
  const payload = resolvePayload(node, 'image');
  const attrs: Record<string, unknown> = {
    src: payload.src,
  };
  if (payload.alt !== undefined) attrs.alt = payload.alt;
  if (payload.accessibility?.alt !== undefined) attrs.alt = payload.accessibility.alt;
  if (payload.geometry?.width !== undefined) attrs.width = payload.geometry.width;
  if (payload.geometry?.height !== undefined) attrs.height = payload.geometry.height;
  // Legacy flat fields
  if (payload.width !== undefined && !attrs.width) attrs.width = payload.width;
  if (payload.height !== undefined && !attrs.height) attrs.height = payload.height;

  const imageNode = schema.nodes.image.create(attrs);
  // Images are inline in PM — wrap in paragraph for block-level placement.
  return schema.nodes.paragraph.create({ sdBlockId: resolveBlockId(node as any, seenIds, existingDocIds) }, [
    imageNode,
  ]);
}

function materializeList(
  schema: Schema,
  node: SDContentNode,
  seenIds: Set<string>,
  existingDocIds: ReadonlySet<string>,
  operation: SDWriteOp,
  options?: { rawMode?: boolean },
): ProseMirrorNode {
  const payload = resolvePayload(node, 'list');
  const items = (payload.items ?? []).map((item: any) =>
    materializeListItem(schema, item, payload, seenIds, existingDocIds, operation, options),
  );

  // Determine list type from levels or legacy `ordered` field
  const isOrdered = payload.levels?.[0]?.kind === 'ordered' || payload.ordered;
  const listType = isOrdered ? schema.nodes.orderedList : schema.nodes.bulletList;
  if (!listType) {
    return materializeParagraph(
      schema,
      { type: 'paragraph', content: [] } as any,
      seenIds,
      existingDocIds,
      operation,
      options,
    );
  }

  const attrs: Record<string, unknown> = {
    sdBlockId: resolveBlockId(node as any, seenIds, existingDocIds),
  };
  if (payload.styleRef ?? payload.style) attrs.listStyleId = payload.styleRef ?? payload.style;
  return listType.create(attrs, items);
}

function materializeListItem(
  schema: Schema,
  item: any,
  _parentPayload: any,
  seenIds: Set<string>,
  existingDocIds: ReadonlySet<string>,
  operation: SDWriteOp,
  options?: { rawMode?: boolean },
): ProseMirrorNode {
  // SDM/1 list items have `content: SDContentNode[]`; legacy has `content: SDInlineNode[]`
  const itemContent = item.content ?? [];

  // If items contain block-level nodes, materialize them directly
  if (itemContent.length > 0 && (itemContent[0].kind || itemContent[0].type)) {
    const kind = resolveKind(itemContent[0]);
    // Block-level content in list item
    if (['paragraph', 'heading', 'table', 'list', 'image'].includes(kind)) {
      const children = itemContent.map((child: any) =>
        materializeNode(schema, child as SDContentNode, seenIds, existingDocIds, operation, options),
      );
      const attrs: Record<string, unknown> = { sdBlockId: uuidv4() };
      if (item.level !== undefined) attrs.level = item.level;
      return schema.nodes.listItem.create(attrs, children);
    }
  }

  // Inline content — wrap in paragraph
  const content = materializeInlineContent(schema, itemContent, operation, options);
  const paragraph = schema.nodes.paragraph.create({ sdBlockId: uuidv4() }, content);
  const attrs: Record<string, unknown> = { sdBlockId: uuidv4() };
  if (item.level !== undefined) attrs.level = item.level;
  return schema.nodes.listItem.create(attrs, [paragraph]);
}

function materializeSectionBreak(
  schema: Schema,
  node: SDContentNode,
  seenIds: Set<string>,
  existingDocIds: ReadonlySet<string>,
): ProseMirrorNode {
  const payload = resolvePayload(node, 'sectionBreak');
  const attrs: Record<string, unknown> = {
    sdBlockId: resolveBlockId(node as any, seenIds, existingDocIds),
  };
  if (payload.breakType) attrs.breakType = payload.breakType;
  if (payload.targetSectionId) attrs.targetSectionId = payload.targetSectionId;

  const nodeType = schema.nodes.sectionBreak ?? schema.nodes.horizontalRule;
  if (!nodeType) {
    return schema.nodes.paragraph.create({ sdBlockId: attrs.sdBlockId });
  }
  return nodeType.create(attrs);
}

function materializeToc(
  schema: Schema,
  node: SDContentNode,
  seenIds: Set<string>,
  existingDocIds: ReadonlySet<string>,
): ProseMirrorNode {
  const nodeType = schema.nodes.tableOfContents;
  const blockId = resolveBlockId(node as any, seenIds, existingDocIds);
  if (!nodeType) {
    return schema.nodes.paragraph.create({ sdBlockId: blockId });
  }
  return nodeType.create({ sdBlockId: blockId });
}

function materializeBreak(
  schema: Schema,
  node: SDContentNode,
  seenIds: Set<string>,
  existingDocIds: ReadonlySet<string>,
): ProseMirrorNode {
  const payload = resolvePayload(node, 'break');
  const blockId = resolveBlockId(node as any, seenIds, existingDocIds);
  const attrs: Record<string, unknown> = { sdBlockId: blockId };
  if (payload.type) attrs.breakType = payload.type;

  const nodeType = schema.nodes.pageBreak ?? schema.nodes.horizontalRule;
  if (!nodeType) {
    return schema.nodes.paragraph.create({ sdBlockId: blockId });
  }
  return nodeType.create(attrs);
}

function materializeDrawing(
  schema: Schema,
  node: SDContentNode,
  seenIds: Set<string>,
  existingDocIds: ReadonlySet<string>,
): ProseMirrorNode {
  const payload = resolvePayload(node, 'drawing');
  const blockId = resolveBlockId(node as any, seenIds, existingDocIds);
  const attrs: Record<string, unknown> = { sdBlockId: blockId };
  if (payload.source) attrs.source = payload.source;
  if (payload.layout) attrs.layout = payload.layout;
  if (payload.geometry) attrs.geometry = payload.geometry;

  const nodeType = schema.nodes.drawing;
  if (!nodeType) {
    return schema.nodes.paragraph.create({ sdBlockId: blockId });
  }
  return nodeType.create(attrs);
}

function materializeReferenceBlock(
  schema: Schema,
  node: SDContentNode,
  kind: string,
  seenIds: Set<string>,
  existingDocIds: ReadonlySet<string>,
): ProseMirrorNode {
  const blockId = resolveBlockId(node as any, seenIds, existingDocIds);
  // Reference blocks (index, bibliography, tableOfAuthorities) are placeholders.
  // Use the specific schema node if available, otherwise paragraph.
  const nodeType = schema.nodes[kind];
  if (!nodeType) {
    return schema.nodes.paragraph.create({ sdBlockId: blockId });
  }
  return nodeType.create({ sdBlockId: blockId });
}

function materializeField(
  schema: Schema,
  node: SDContentNode,
  seenIds: Set<string>,
  existingDocIds: ReadonlySet<string>,
): ProseMirrorNode {
  const payload = resolvePayload(node, 'field');
  const blockId = resolveBlockId(node as any, seenIds, existingDocIds);
  const attrs: Record<string, unknown> = { sdBlockId: blockId };
  if (payload.fieldType) attrs.fieldType = payload.fieldType;
  if (payload.instruction) attrs.instruction = payload.instruction;
  if (payload.resultText) attrs.resultText = payload.resultText;

  const nodeType = schema.nodes.field;
  if (!nodeType) {
    return schema.nodes.paragraph.create({ sdBlockId: blockId });
  }
  return nodeType.create(attrs);
}

const SDT_LOCK_TO_LOCK_MODE: Record<string, string> = {
  none: 'unlocked',
  sdt: 'sdtLocked',
  content: 'contentLocked',
  both: 'sdtContentLocked',
};

function buildSdtAttrsFromPayload(payload: any): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  if (payload.tag) attrs.tag = payload.tag;
  if (payload.alias) attrs.alias = payload.alias;
  if (payload.type) attrs.controlType = payload.type;
  if (payload.appearance) attrs.appearance = payload.appearance;
  if (payload.placeholder) attrs.placeholder = payload.placeholder;
  if (payload.lock) {
    const lockMode = SDT_LOCK_TO_LOCK_MODE[payload.lock];
    if (lockMode) attrs.lockMode = lockMode;
  }
  return attrs;
}

function materializeSdt(
  schema: Schema,
  node: SDContentNode,
  seenIds: Set<string>,
  existingDocIds: ReadonlySet<string>,
  operation: SDWriteOp,
  options?: { rawMode?: boolean },
): ProseMirrorNode {
  const payload = resolvePayload(node, 'sdt');
  const children = (payload.content ?? []).map((child: any) =>
    materializeNode(schema, child as SDContentNode, seenIds, existingDocIds, operation, options),
  );

  const nodeType = schema.nodes.structuredContentBlock ?? schema.nodes.sdt;
  if (!nodeType) {
    return schema.nodes.paragraph.create({
      sdBlockId: resolveBlockId(node as any, seenIds, existingDocIds),
    });
  }
  const resolvedId = resolveBlockId(node as any, seenIds, existingDocIds);
  const attrs: Record<string, unknown> = {
    ...buildSdtAttrsFromPayload(payload),
    id: resolvedId,
    sdBlockId: resolvedId,
  };
  return nodeType.create(attrs, children.length > 0 ? children : undefined);
}

function materializeInlineSdt(
  schema: Schema,
  node: any,
  operation: SDWriteOp,
  options?: { rawMode?: boolean },
): ProseMirrorNode | ProseMirrorNode[] {
  const payload = resolvePayload(node, 'sdt');
  const nodeType = schema.nodes.structuredContent;
  if (!nodeType) return materializeInlineFallback(schema, node);

  const children = materializeInlineContent(schema, payload.inlines ?? payload.content, operation, options);
  const attrs: Record<string, unknown> = {
    ...buildSdtAttrsFromPayload(payload),
    id: node.id ?? null,
  };
  return nodeType.create(attrs, children);
}

function materializeFallback(
  schema: Schema,
  node: SDContentNode,
  seenIds: Set<string>,
  existingDocIds: ReadonlySet<string>,
): ProseMirrorNode {
  return schema.nodes.paragraph.create({
    sdBlockId: resolveBlockId(node as any, seenIds, existingDocIds),
  });
}

// ---------------------------------------------------------------------------
// Inline content materialization
// ---------------------------------------------------------------------------

function materializeInlineContent(
  schema: Schema,
  content: any[] | undefined,
  operation: SDWriteOp,
  options?: { rawMode?: boolean },
): ProseMirrorNode[] | undefined {
  if (!content || content.length === 0) return undefined;

  const result: ProseMirrorNode[] = [];
  for (const item of content) {
    const materialized = materializeInlineNode(schema, item, operation, options);
    if (Array.isArray(materialized)) {
      result.push(...materialized);
    } else {
      result.push(materialized);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Inline-node dispatch
// ---------------------------------------------------------------------------

function materializeInlineNode(
  schema: Schema,
  node: any,
  operation: SDWriteOp,
  options?: { rawMode?: boolean },
): ProseMirrorNode | ProseMirrorNode[] {
  const kind = resolveKind(node);
  assertCapability(kind, operation, 'inline', options);

  switch (kind) {
    case 'run':
      return materializeRun(schema, node);
    case 'text':
      return materializeTextRun(schema, node);
    case 'hyperlink':
      return materializeHyperlink(schema, node, operation, options);
    case 'image':
      return materializeInlineImage(schema, node);
    case 'drawing':
      return materializeInlineDrawing(schema, node);
    case 'tab':
      return materializeTab(schema);
    case 'lineBreak':
      return materializeLineBreak(schema);
    case 'crossRef':
    case 'tocEntry':
    case 'indexEntry':
    case 'citation':
    case 'authorityEntry':
    case 'sequenceField':
      return materializeInlineReference(schema, node, kind);
    case 'field':
      return materializeInlineField(schema, node);
    case 'footnoteRef':
    case 'endnoteRef':
      return materializeNoteRef(schema, node, kind);
    case 'sdt':
      return materializeInlineSdt(schema, node, operation, options);
    default:
      return materializeInlineFallback(schema, node);
  }
}

// ---------------------------------------------------------------------------
// Inline materializers
// ---------------------------------------------------------------------------

/** Materializes an SDM/1 run node: `{ kind: 'run', run: { text, styleRef?, props? } }` */
function materializeRun(schema: Schema, node: any): ProseMirrorNode {
  const payload = resolvePayload(node, 'run');
  const marks = buildMarksFromRunPayload(schema, payload);
  return schema.text(payload.text, marks.length > 0 ? marks : undefined);
}

/** Materializes a legacy text node: `{ type: 'text', text, bold?, italic?, ... }` */
function materializeTextRun(schema: Schema, node: any): ProseMirrorNode {
  const marks = buildMarksFromLegacyRun(schema, node);
  return schema.text(node.text, marks.length > 0 ? marks : undefined);
}

function materializeHyperlink(
  schema: Schema,
  node: any,
  operation: SDWriteOp,
  options?: { rawMode?: boolean },
): ProseMirrorNode | ProseMirrorNode[] {
  const payload = resolvePayload(node, 'hyperlink');
  const inlines = payload.inlines ?? payload.content ?? [];
  const children = materializeInlineContent(schema, inlines, operation, options) ?? [];

  const linkMark = schema.marks.link;
  if (!linkMark) return children.length > 0 ? children : [schema.text(' ')];

  const attrs: Record<string, unknown> = {};
  if (payload.href) attrs.href = payload.href;
  if (payload.anchor) attrs.anchor = payload.anchor;
  if (payload.tooltip) attrs.tooltip = payload.tooltip;

  const mark = linkMark.create(attrs);
  return children.map((child) => child.mark(mark.addToSet(child.marks)));
}

function materializeInlineImage(schema: Schema, node: any): ProseMirrorNode {
  const payload = resolvePayload(node, 'image');
  const attrs: Record<string, unknown> = { src: payload.src };
  if (payload.alt !== undefined) attrs.alt = payload.alt;
  if (payload.accessibility?.alt !== undefined) attrs.alt = payload.accessibility.alt;
  if (payload.geometry?.width !== undefined) attrs.width = payload.geometry.width;
  if (payload.geometry?.height !== undefined) attrs.height = payload.geometry.height;
  if (payload.width !== undefined && !attrs.width) attrs.width = payload.width;
  if (payload.height !== undefined && !attrs.height) attrs.height = payload.height;
  return schema.nodes.image.create(attrs);
}

function materializeInlineDrawing(schema: Schema, node: any): ProseMirrorNode {
  const payload = resolvePayload(node, 'drawing');
  const nodeType = schema.nodes.drawing ?? schema.nodes.image;
  if (!nodeType) return schema.text('\ufffc'); // object replacement character
  const attrs: Record<string, unknown> = {};
  if (payload.source) attrs.source = payload.source;
  if (payload.layout) attrs.layout = payload.layout;
  if (payload.geometry) attrs.geometry = payload.geometry;
  return nodeType.create(attrs);
}

function materializeTab(schema: Schema): ProseMirrorNode {
  const nodeType = schema.nodes.tab;
  if (!nodeType) return schema.text('\t');
  return nodeType.create();
}

function materializeLineBreak(schema: Schema): ProseMirrorNode {
  const nodeType = schema.nodes.hardBreak ?? schema.nodes.lineBreak;
  if (!nodeType) return schema.text('\n');
  return nodeType.create();
}

function materializeInlineReference(schema: Schema, node: any, kind: string): ProseMirrorNode {
  const payload = resolvePayload(node, kind);
  const nodeType = schema.nodes[kind];
  if (!nodeType) return schema.text(payload.resolvedText ?? payload.displayText ?? payload.text ?? '');
  const attrs: Record<string, unknown> = {};
  if (payload.instruction) attrs.instruction = payload.instruction;
  if (payload.text) attrs.text = payload.text;
  if (payload.level !== undefined) attrs.level = payload.level;
  return nodeType.create(attrs);
}

function materializeInlineField(schema: Schema, node: any): ProseMirrorNode {
  const payload = resolvePayload(node, 'field');
  const nodeType = schema.nodes.field;
  if (!nodeType) return schema.text(payload.resultText ?? '');
  const attrs: Record<string, unknown> = {};
  if (payload.fieldType) attrs.fieldType = payload.fieldType;
  if (payload.instruction) attrs.instruction = payload.instruction;
  if (payload.resultText) attrs.resultText = payload.resultText;
  return nodeType.create(attrs);
}

function materializeNoteRef(schema: Schema, node: any, kind: string): ProseMirrorNode {
  const payload = resolvePayload(node, kind);
  const nodeType = schema.nodes[kind];
  if (!nodeType) return schema.text('');
  const attrs: Record<string, unknown> = {};
  if (payload.noteId) attrs.noteId = payload.noteId;
  return nodeType.create(attrs);
}

function materializeInlineFallback(schema: Schema, node: any): ProseMirrorNode {
  // Best-effort: render as text if the node has text content
  const payload = node[resolveKind(node)] ?? node;
  if (payload.text) return schema.text(payload.text);
  return schema.text('\ufffc');
}

// ---------------------------------------------------------------------------
// Helpers: paragraph properties
// ---------------------------------------------------------------------------

function buildParagraphProperties(styleRef?: string, props?: any): Record<string, unknown> | undefined {
  if (!styleRef && !props) return undefined;
  const result: Record<string, unknown> = {};
  if (styleRef) result.styleId = styleRef;
  if (!props) return result;

  if (props.alignment) result.justification = props.alignment;
  if (props.indent) result.indent = props.indent;
  if (props.spacing) result.spacing = props.spacing;
  if (props.keepWithNext !== undefined) result.keepWithNext = props.keepWithNext;
  if (props.keepLines !== undefined) result.keepLines = props.keepLines;
  if (props.pageBreakBefore !== undefined) result.pageBreakBefore = props.pageBreakBefore;
  if (props.widowControl !== undefined) result.widowControl = props.widowControl;
  if (props.numbering) result.numbering = props.numbering;
  if (props.tabs) result.tabs = props.tabs;
  if (props.borders) result.borders = props.borders;
  if (props.shading) result.shading = props.shading;
  if (props.bidi !== undefined) result.bidi = props.bidi;
  if (props.outlineLevel !== undefined) result.outlineLevel = props.outlineLevel;
  if (props.markRunProps) result.markRunProps = props.markRunProps;
  if (props.textDirection) result.textDirection = props.textDirection;
  if (props.eastAsianLineBreak) result.eastAsianLineBreak = props.eastAsianLineBreak;

  return Object.keys(result).length > 0 ? result : undefined;
}

// ---------------------------------------------------------------------------
// Helpers: run marks (SDM/1 nested payload)
// ---------------------------------------------------------------------------

function buildMarksFromRunPayload(schema: Schema, payload: any): ProseMirrorMark[] {
  const marks: ProseMirrorMark[] = [];
  const props = payload.props;

  if (props?.bold && schema.marks.bold) marks.push(schema.marks.bold.create());
  if (props?.italic && schema.marks.italic) marks.push(schema.marks.italic.create());
  if (props?.strikethrough && schema.marks.strikethrough) {
    marks.push(schema.marks.strikethrough.create());
  }
  if (props?.underline && schema.marks.underline) {
    marks.push(schema.marks.underline.create(typeof props.underline === 'object' ? props.underline : undefined));
  }
  if (props?.highlight && schema.marks.highlight) {
    marks.push(schema.marks.highlight.create({ color: props.highlight }));
  }

  const textStyleAttrs = buildTextStyleAttrs(payload);
  if (textStyleAttrs && schema.marks.textStyle) {
    marks.push(schema.marks.textStyle.create(textStyleAttrs));
  }

  return marks;
}

/** Builds textStyle mark attrs from SDM/1 run payload. */
function buildTextStyleAttrs(payload: any): Record<string, unknown> | null {
  const attrs: Record<string, unknown> = {};
  if (payload.styleRef) attrs.rStyle = payload.styleRef;
  const p = payload.props;
  if (p) {
    if (p.color) attrs.color = p.color;
    if (p.fontSize !== undefined) attrs.fontSize = p.fontSize;
    if (p.fontSizeCs !== undefined) attrs.fontSizeCs = p.fontSizeCs;
    if (p.fontFamily) attrs.fontFamily = p.fontFamily;
    if (p.fonts) attrs.fonts = p.fonts;
    if (p.caps) attrs.caps = true;
    if (p.smallCaps) attrs.smallCaps = true;
    if (p.vanish) attrs.vanish = true;
    if (p.characterSpacing !== undefined) attrs.characterSpacing = p.characterSpacing;
  }
  return Object.keys(attrs).length > 0 ? attrs : null;
}

// ---------------------------------------------------------------------------
// Helpers: run marks (legacy flat properties)
// ---------------------------------------------------------------------------

function buildMarksFromLegacyRun(schema: Schema, run: any): ProseMirrorMark[] {
  const marks: ProseMirrorMark[] = [];

  if (run.bold && schema.marks.bold) marks.push(schema.marks.bold.create());
  if (run.italic && schema.marks.italic) marks.push(schema.marks.italic.create());
  if (run.underline && schema.marks.underline) marks.push(schema.marks.underline.create());
  if (run.strikethrough && schema.marks.strikethrough) {
    marks.push(schema.marks.strikethrough.create());
  }

  const textStyleAttrs: Record<string, unknown> = {};
  if (run.color) textStyleAttrs.color = run.color;
  if (run.fontSize) textStyleAttrs.fontSize = `${run.fontSize}pt`;
  if (run.fontFamily) textStyleAttrs.fontFamily = run.fontFamily;

  if (Object.keys(textStyleAttrs).length > 0 && schema.marks.textStyle) {
    marks.push(schema.marks.textStyle.create(textStyleAttrs));
  }

  if (run.highlight && schema.marks.highlight) {
    marks.push(schema.marks.highlight.create({ color: run.highlight }));
  }

  return marks;
}
