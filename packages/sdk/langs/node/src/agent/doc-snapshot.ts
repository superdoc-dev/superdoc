/**
 * Deterministic document snapshot.
 *
 * The workflow doc-index (see action-primitives/doc-index.ts) covers body blocks
 * and lists. That coverage is too narrow for a real agent runtime — many
 * editing tasks touch headers/footers, comments, tracked changes, sections,
 * styles, content controls, fields, hyperlinks, bookmarks, images, or
 * permission ranges. Selectors that target those surfaces must resolve from
 * a snapshot that includes them, otherwise the agent has to either guess or
 * silently fall back.
 *
 * This module builds a single read-only document snapshot in a deterministic
 * sequence: each section is queried with explicit catalog operations, results
 * are normalized into typed shapes, and selectors resolve against the same
 * snapshot for the duration of one agent turn.
 *
 * The snapshot is intentionally side-effect free: it never mutates the
 * document and never depends on inference. If an underlying operation
 * returns `null`/empty, the corresponding section is recorded as empty
 * rather than skipped, so consumers see a stable shape.
 */
import type { BoundDocApi } from '../generated/client.js';

export type SnapshotBlock = {
  ordinal: number;
  nodeId: string;
  nodeType: string;
  text: string;
  textPreview: string | null;
  styleId?: string | null;
  headingLevel?: number;
  /**
   * Computed numbering when the block participates in a numbering scheme.
   * Legal clause numbers ("2.3.") usually live on numbered HEADINGS, not
   * list nodes — this is how an agent sees them.
   */
  numbering?: { marker: string | null; path: number[] | null; kind: string | null } | null;
};

export type SnapshotList = {
  listId: string;
  kind: 'ordered' | 'bullet' | string;
  items: ReadonlyArray<{ nodeId: string; ordinal: number; level: number; text: string }>;
};

export type SnapshotTable = {
  nodeId: string;
  ordinal: number;
  rows: number;
  columns: number;
  cells: ReadonlyArray<{ rowIndex: number; columnIndex: number; text: string; nodeId?: string }>;
};

export type SnapshotComment = {
  id: string;
  text: string;
  status: string;
  anchoredText?: string;
  segments?: ReadonlyArray<{ blockId: string; start: number; end: number }>;
};

export type SnapshotTrackedChange = {
  id: string;
  type: string;
  excerpt?: string;
  author?: string;
  date?: string;
  story?: string;
};

export type SnapshotHeaderFooter = {
  kind: 'header' | 'footer';
  sectionId?: string;
  sectionIndex?: number;
  variant?: 'default' | 'first' | 'even' | string;
  blocks: ReadonlyArray<SnapshotBlock>;
};

export type SnapshotSection = {
  ordinal: number;
  sectionId?: string;
  startNodeId?: string;
  endNodeId?: string;
  pageSize?: { width: number; height: number };
};

export type SnapshotStyle = {
  styleId: string;
  name: string;
  type?: string;
  basedOn?: string;
};

export type SnapshotContentControl = {
  id: string;
  type?: string;
  alias?: string;
  tag?: string;
  text?: string;
};

export type SnapshotField = {
  id: string;
  type?: string;
  result?: string;
};

export type SnapshotHyperlink = {
  id: string;
  url: string;
  display?: string;
  nodeId?: string;
};

export type SnapshotBookmark = {
  id: string;
  name: string;
  startNodeId?: string;
  endNodeId?: string;
};

export type SnapshotPermissionRange = {
  id: string;
  startNodeId?: string;
  endNodeId?: string;
  editorOrEditorGroup?: string;
};

export type SnapshotImage = {
  imageId: string;
  nodeId?: string;
  alt?: string;
  caption?: string;
};

export type SnapshotDomain =
  | 'blocks'
  | 'lists'
  | 'tables'
  | 'comments'
  | 'trackedChanges'
  | 'sections'
  | 'headerFooters'
  | 'styles'
  | 'contentControls'
  | 'fields'
  | 'hyperlinks'
  | 'bookmarks'
  | 'permissionRanges'
  | 'images';

export type SnapshotDiagnostic = {
  section: string;
  message: string;
};

export type DocumentSnapshot = {
  revision: string;
  counts: {
    blocks: number;
    paragraphs: number;
    headings: number;
    tables: number;
    lists: number;
    images: number;
    comments: number;
    trackedChanges: number;
    sections: number;
    fields: number;
    hyperlinks: number;
    bookmarks: number;
    contentControls: number;
    permissionRanges: number;
    styles: number;
    headers: number;
    footers: number;
  };
  blocks: readonly SnapshotBlock[];
  lists: readonly SnapshotList[];
  tables: readonly SnapshotTable[];
  comments: readonly SnapshotComment[];
  trackedChanges: readonly SnapshotTrackedChange[];
  sections: readonly SnapshotSection[];
  headerFooters: readonly SnapshotHeaderFooter[];
  styles: readonly SnapshotStyle[];
  contentControls: readonly SnapshotContentControl[];
  fields: readonly SnapshotField[];
  hyperlinks: readonly SnapshotHyperlink[];
  bookmarks: readonly SnapshotBookmark[];
  permissionRanges: readonly SnapshotPermissionRange[];
  images: readonly SnapshotImage[];
  diagnostics: readonly SnapshotDiagnostic[];
};

type Listish<T> = { items?: ReadonlyArray<T>; total?: number; evaluatedRevision?: string } | undefined | null;

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

async function safeCall<T>(thunk: () => Promise<T>, fallback: T, onError: (err: unknown) => void): Promise<T> {
  try {
    return await thunk();
  } catch (err) {
    onError(err);
    return fallback;
  }
}

function maybeMethod<T extends object>(
  api: T,
  path: readonly string[],
): ((args?: Record<string, unknown>) => Promise<unknown>) | null {
  let cursor: unknown = api;
  for (const token of path) {
    // Function-shaped intermediates are legal: RPC/proxy document handles
    // (e.g. the browser doc-bridge) expose namespaces as callables.
    if (!cursor || (typeof cursor !== 'object' && typeof cursor !== 'function')) return null;
    cursor = (cursor as Record<string, unknown>)[token];
  }
  return typeof cursor === 'function' ? (cursor as (args?: Record<string, unknown>) => Promise<unknown>) : null;
}

type SnapshotOptions = {
  countsOnly?: boolean;
  includeDomains?: readonly SnapshotDomain[];
  blockNodeTypes?: readonly string[];
  blockTextLimit?: number;
  listLimit?: number;
  tableLimit?: number;
  commentLimit?: number;
  trackedChangeLimit?: number;
  /**
   * Window into the block list. `blockOffset` is the 0-based index of the
   * first block to return; `blockLimit` caps how many blocks come back. This
   * is the primitive that makes large documents tractable: a 600-block /
   * 38-page doc produces a ~58k-token full snapshot, so a reader pulls a
   * bounded slice (e.g. offset 0, limit 40) per window instead of the whole
   * thing. `counts.blocks` / `blocks[].ordinal` still reflect absolute
   * positions so selectors and the next window line up.
   */
  blockOffset?: number;
  blockLimit?: number;
  /**
   * Drop empty paragraphs/list-items from the returned blocks. A real DOCX is
   * ~40% empty spacer paragraphs that carry full JSON overhead but no reading
   * value; omitting them roughly halves the blocks payload for a reading pass.
   * Ordinals are preserved, so the gaps are visible and selectors still work.
   */
  omitEmptyBlocks?: boolean;
  /**
   * Omit the duplicated `textPreview` field (it equals `text` whenever the
   * block text is not truncated). Pure payload savings for readers that use
   * `text`.
   */
  dropTextPreview?: boolean;
};

function explicitCount(counts: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = counts[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function includesDomain(requested: ReadonlySet<SnapshotDomain> | null, domain: SnapshotDomain): boolean {
  return requested == null || requested.has(domain);
}

/**
 * Build a deterministic snapshot of a document. The snapshot uses only
 * read-mode operations from the generated contract — it never mutates state,
 * and any individual section that fails is captured as a diagnostic so the
 * rest of the snapshot remains usable.
 */
export async function buildDocumentSnapshot(
  doc: BoundDocApi,
  options: SnapshotOptions = {},
): Promise<DocumentSnapshot> {
  const diagnostics: SnapshotDiagnostic[] = [];
  const recordError = (section: string) => (err: unknown) => {
    diagnostics.push({ section, message: err instanceof Error ? err.message : String(err) });
  };

  const blockOffset = Math.max(0, options.blockOffset ?? 0);
  const blockLimit = options.blockLimit ?? options.blockTextLimit ?? 1000;
  const listLimit = options.listLimit ?? 1000;
  const tableLimit = options.tableLimit ?? 500;
  const commentLimit = options.commentLimit ?? 500;
  const trackedChangeLimit = options.trackedChangeLimit ?? 500;
  const requestedDomains =
    Array.isArray(options.includeDomains) && options.includeDomains.length > 0 ? new Set(options.includeDomains) : null;
  const blockNodeTypes = new Set(
    Array.isArray(options.blockNodeTypes)
      ? options.blockNodeTypes.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : [],
  );

  const infoFn = maybeMethod(doc, ['info']);
  const info = infoFn ? await safeCall(() => infoFn({}), null, recordError('info')) : null;
  const infoRec = asRecord(info);
  const counts = asRecord(infoRec?.counts) ?? {};
  const revision = asString(infoRec?.revision, 'unknown');
  const countsFromInfo = {
    blocks: explicitCount(counts, 'blocks') ?? 0,
    paragraphs: explicitCount(counts, 'paragraphs') ?? 0,
    headings: explicitCount(counts, 'headings') ?? 0,
    tables: explicitCount(counts, 'tables') ?? 0,
    lists: explicitCount(counts, 'lists') ?? 0,
    images: explicitCount(counts, 'images') ?? 0,
    comments: explicitCount(counts, 'comments') ?? 0,
    trackedChanges: explicitCount(counts, 'trackedChanges') ?? 0,
    sections: explicitCount(counts, 'sections') ?? 0,
    fields: explicitCount(counts, 'fields') ?? 0,
    hyperlinks: explicitCount(counts, 'hyperlinks') ?? 0,
    bookmarks: explicitCount(counts, 'bookmarks') ?? 0,
    contentControls: explicitCount(counts, 'contentControls', 'sdtFields') ?? 0,
    permissionRanges: explicitCount(counts, 'permissionRanges') ?? 0,
    styles: explicitCount(counts, 'styles') ?? 0,
    headers: explicitCount(counts, 'headers') ?? 0,
    footers: explicitCount(counts, 'footers') ?? 0,
  } satisfies DocumentSnapshot['counts'];

  if (options.countsOnly === true) {
    return {
      revision,
      counts: countsFromInfo,
      blocks: [],
      lists: [],
      tables: [],
      comments: [],
      trackedChanges: [],
      sections: [],
      headerFooters: [],
      styles: [],
      contentControls: [],
      fields: [],
      hyperlinks: [],
      bookmarks: [],
      permissionRanges: [],
      images: [],
      diagnostics,
    };
  }

  // Blocks
  const includeBlocksInSnapshot = includesDomain(requestedDomains, 'blocks');
  const needBlocksRead = includeBlocksInSnapshot || includesDomain(requestedDomains, 'tables');
  const blocksFn = maybeMethod(doc, ['blocks', 'list']);
  const blocksRaw =
    needBlocksRead && blocksFn
      ? await safeCall(
          () => blocksFn({ offset: blockOffset, limit: blockLimit, includeText: includeBlocksInSnapshot }),
          null,
          recordError('blocks.list'),
        )
      : null;
  const blocksRec = asRecord(blocksRaw);
  const totalBlocks = explicitCount(blocksRec ?? {}, 'total') ?? countsFromInfo.blocks;
  const rawBlocks = Array.isArray(blocksRec?.blocks) ? (blocksRec!.blocks as unknown[]) : [];
  const normalizedBlocks: SnapshotBlock[] = rawBlocks.map((b, index) => {
    const rec = asRecord(b) ?? {};
    return {
      // doc-api block.ordinal is 0-based; the model-facing convention is
      // 1-based (matches paragraphOrdinal/tableOrdinal and ordinal selectors).
      ordinal: asNumber(rec.ordinal, blockOffset + index) + 1,
      nodeId: asString(rec.nodeId),
      nodeType: asString(rec.nodeType, 'paragraph'),
      text: asString(rec.text),
      textPreview: typeof rec.textPreview === 'string' ? rec.textPreview : null,
      styleId: typeof rec.styleId === 'string' ? rec.styleId : null,
      headingLevel: typeof rec.headingLevel === 'number' ? rec.headingLevel : undefined,
      ...(asRecord(rec.numbering)
        ? {
            numbering: {
              marker: asString(asRecord(rec.numbering)!.marker) || null,
              path: Array.isArray(asRecord(rec.numbering)!.path) ? (asRecord(rec.numbering)!.path as number[]) : null,
              kind: asString(asRecord(rec.numbering)!.kind) || null,
            },
          }
        : {}),
    };
  });
  let blocks =
    includeBlocksInSnapshot && blockNodeTypes.size > 0
      ? normalizedBlocks.filter((block) => blockNodeTypes.has(block.nodeType))
      : includeBlocksInSnapshot
        ? normalizedBlocks
        : [];
  if (includeBlocksInSnapshot && options.omitEmptyBlocks === true) {
    // Drop empty paragraphs/list-items only; structural blocks (tables) keep
    // their slot even with empty text.
    blocks = blocks.filter(
      (block) => block.text.trim().length > 0 || (block.nodeType !== 'paragraph' && block.nodeType !== 'listItem'),
    );
  }
  if (includeBlocksInSnapshot && options.dropTextPreview === true) {
    blocks = blocks.map((block) => ({ ...block, textPreview: null }));
  }

  // Lists
  const listsFn = maybeMethod(doc, ['lists', 'list']);
  const listsRaw =
    includesDomain(requestedDomains, 'lists') && listsFn
      ? await safeCall(() => listsFn({ offset: 0, limit: listLimit }), null, recordError('lists.list'))
      : null;
  const listsRec = asRecord(listsRaw);
  const listItemsArr = Array.isArray(listsRec?.items) ? (listsRec!.items as unknown[]) : [];
  const listsById = new Map<
    string,
    SnapshotList & { items: Array<{ nodeId: string; ordinal: number; level: number; text: string }> }
  >();
  for (const item of listItemsArr) {
    const rec = asRecord(item);
    if (!rec) continue;
    const listId = asString(rec.listId, 'list:unknown');
    if (!listsById.has(listId)) {
      listsById.set(listId, {
        listId,
        kind: asString(rec.kind, 'ordered'),
        items: [],
      });
    }
    const addr = asRecord(rec.address);
    listsById.get(listId)!.items.push({
      nodeId: asString(addr?.nodeId),
      ordinal: asNumber(rec.ordinal),
      level: asNumber(rec.level),
      text: asString(rec.text),
    });
  }
  const lists: SnapshotList[] = [...listsById.values()];

  // Tables: derive table block list from `blocks`, then query shape per table.
  const tableBlocks = normalizedBlocks.filter((b) => b.nodeType === 'table');
  const tablesFn = maybeMethod(doc, ['tables', 'get']);
  const tables: SnapshotTable[] = [];
  if (includesDomain(requestedDomains, 'tables')) {
    for (let i = 0; i < Math.min(tableBlocks.length, tableLimit); i += 1) {
      const block = tableBlocks[i]!;
      if (!tablesFn) {
        tables.push({ nodeId: block.nodeId, ordinal: i + 1, rows: 0, columns: 0, cells: [] });
        continue;
      }
      const tableRaw = await safeCall(
        () => tablesFn({ nodeId: block.nodeId }),
        null,
        recordError(`tables.get:${block.nodeId}`),
      );
      const rec = asRecord(tableRaw);
      tables.push({
        nodeId: block.nodeId,
        ordinal: i + 1,
        rows: asNumber(rec?.rows),
        columns: asNumber(rec?.columns),
        cells: [],
      });
    }
  }

  const extractFn = maybeMethod(doc, ['extract']);
  if (tables.length > 0 && extractFn) {
    const extractRaw = await safeCall(() => extractFn({}), null, recordError('extract'));
    const extractRec = asRecord(extractRaw);
    const extractBlocks = Array.isArray(extractRec?.blocks) ? (extractRec!.blocks as unknown[]) : [];
    const cellsByTableNodeId = new Map<
      string,
      Map<string, { rowIndex: number; columnIndex: number; text: string; nodeId?: string }>
    >();
    for (const block of extractBlocks) {
      const rec = asRecord(block);
      const tableContext = asRecord(rec?.tableContext);
      if (!rec || !tableContext) continue;
      const tableOrdinal = asNumber(tableContext.tableOrdinal, -1);
      const rowIndex = asNumber(tableContext.rowIndex, -1);
      const columnIndex = asNumber(tableContext.columnIndex, -1);
      if (tableOrdinal < 0 || rowIndex < 0 || columnIndex < 0) continue;
      const table = tables[tableOrdinal];
      if (!table) continue;
      const key = `${rowIndex}:${columnIndex}`;
      const text = asString(rec.text);
      const nodeId = asString(rec.nodeId) || undefined;
      const cellMap =
        cellsByTableNodeId.get(table.nodeId) ??
        new Map<string, { rowIndex: number; columnIndex: number; text: string; nodeId?: string }>();
      const existing = cellMap.get(key);
      cellMap.set(key, {
        rowIndex,
        columnIndex,
        text:
          existing == null || text.length === 0
            ? (existing?.text ?? text)
            : existing.text.length === 0
              ? text
              : `${existing.text}\n${text}`,
        nodeId: existing?.nodeId ?? nodeId,
      });
      cellsByTableNodeId.set(table.nodeId, cellMap);
    }
    for (const table of tables) {
      const cellMap = cellsByTableNodeId.get(table.nodeId);
      if (!cellMap) continue;
      table.cells = [...cellMap.values()].sort(
        (left, right) => left.rowIndex - right.rowIndex || left.columnIndex - right.columnIndex,
      );
    }
  }

  // Comments
  const commentsFn = maybeMethod(doc, ['comments', 'list']);
  const commentsRaw =
    includesDomain(requestedDomains, 'comments') && commentsFn
      ? await safeCall(
          () => commentsFn({ includeResolved: true, offset: 0, limit: commentLimit }),
          null,
          recordError('comments.list'),
        )
      : null;
  const commentsRec = asRecord(commentsRaw);
  const commentItems = Array.isArray(commentsRec?.items) ? (commentsRec!.items as unknown[]) : [];
  const comments: SnapshotComment[] = commentItems.map((c) => {
    const rec = asRecord(c) ?? {};
    const target = asRecord(rec.target);
    const segments = Array.isArray(target?.segments) ? (target!.segments as unknown[]) : [];
    return {
      id: asString(rec.id),
      text: asString(rec.text),
      status: asString(rec.status, 'open'),
      anchoredText: typeof rec.anchoredText === 'string' ? rec.anchoredText : undefined,
      segments: segments.flatMap((seg) => {
        const segRec = asRecord(seg);
        const range = asRecord(segRec?.range);
        if (!segRec) return [];
        return [
          {
            blockId: asString(segRec.blockId),
            start: asNumber(range?.start),
            end: asNumber(range?.end),
          },
        ];
      }),
    };
  });

  // Tracked changes
  const trackedFn = maybeMethod(doc, ['trackChanges', 'list']);
  const trackedRaw =
    includesDomain(requestedDomains, 'trackedChanges') && trackedFn
      ? await safeCall(
          () => trackedFn({ offset: 0, limit: trackedChangeLimit }),
          null,
          recordError('trackChanges.list'),
        )
      : null;
  const trackedRec = asRecord(trackedRaw);
  const trackedItems = Array.isArray(trackedRec?.items) ? (trackedRec!.items as unknown[]) : [];
  const trackedChanges: SnapshotTrackedChange[] = trackedItems.map((t) => {
    const rec = asRecord(t) ?? {};
    const addr = asRecord(rec.address);
    const story = asRecord(addr?.story);
    return {
      id: asString(rec.id),
      type: asString(rec.type, 'insert'),
      excerpt: typeof rec.excerpt === 'string' ? rec.excerpt : undefined,
      author: typeof rec.author === 'string' ? rec.author : undefined,
      date: typeof rec.date === 'string' ? rec.date : undefined,
      story: typeof story?.storyType === 'string' ? (story.storyType as string) : undefined,
    };
  });

  // Sections (best effort; not all SDK builds expose a sections.list)
  const sectionsFn = maybeMethod(doc, ['sections', 'list']);
  let sections: SnapshotSection[] = [];
  if (includesDomain(requestedDomains, 'sections') && sectionsFn) {
    const sectionsRaw = await safeCall(() => sectionsFn({}), null, recordError('sections.list'));
    const rec = asRecord(sectionsRaw);
    const items = Array.isArray(rec?.items) ? (rec!.items as unknown[]) : [];
    sections = items.map((s, index) => {
      const srec = asRecord(s) ?? {};
      const pageSize = asRecord(srec.pageSize);
      return {
        ordinal: asNumber(srec.ordinal, index + 1),
        sectionId: typeof srec.sectionId === 'string' ? srec.sectionId : undefined,
        startNodeId: typeof srec.startNodeId === 'string' ? srec.startNodeId : undefined,
        endNodeId: typeof srec.endNodeId === 'string' ? srec.endNodeId : undefined,
        pageSize: pageSize ? { width: asNumber(pageSize.width), height: asNumber(pageSize.height) } : undefined,
      };
    });
  }

  // Header / footer (best effort)
  const headerFooterFn = maybeMethod(doc, ['headerFooters', 'list']);
  let headerFooters: SnapshotHeaderFooter[] = [];
  if (includesDomain(requestedDomains, 'headerFooters') && headerFooterFn) {
    const raw = await safeCall(() => headerFooterFn({}), null, recordError('headerFooters.list'));
    const rec = asRecord(raw);
    const items = Array.isArray(rec?.items) ? (rec!.items as unknown[]) : [];
    headerFooters = items.flatMap((hf) => {
      const r = asRecord(hf);
      if (!r) return [];
      const kind = asString(r.kind, 'header');
      return [
        {
          kind: kind === 'footer' ? 'footer' : 'header',
          sectionId: typeof r.sectionId === 'string' ? r.sectionId : undefined,
          sectionIndex: typeof r.sectionIndex === 'number' ? r.sectionIndex : undefined,
          variant: typeof r.variant === 'string' ? r.variant : undefined,
          blocks: [],
        },
      ];
    });
  }

  // Styles
  const stylesFn = maybeMethod(doc, ['styles', 'list']);
  let styles: SnapshotStyle[] = [];
  if (includesDomain(requestedDomains, 'styles') && stylesFn) {
    const raw = await safeCall(() => stylesFn({}), null, recordError('styles.list'));
    const rec = asRecord(raw);
    const items = Array.isArray(rec?.items) ? (rec!.items as unknown[]) : [];
    styles = items.flatMap((it) => {
      const r = asRecord(it);
      if (!r) return [];
      return [
        {
          styleId: asString(r.styleId),
          name: asString(r.name, asString(r.styleId)),
          type: typeof r.type === 'string' ? r.type : undefined,
          basedOn: typeof r.basedOn === 'string' ? r.basedOn : undefined,
        },
      ];
    });
  }

  // Content controls
  const contentControlsFn = maybeMethod(doc, ['contentControls', 'list']);
  let contentControls: SnapshotContentControl[] = [];
  if (includesDomain(requestedDomains, 'contentControls') && contentControlsFn) {
    const raw = await safeCall(() => contentControlsFn({}), null, recordError('contentControls.list'));
    const rec = asRecord(raw);
    const items = Array.isArray(rec?.items) ? (rec!.items as unknown[]) : [];
    contentControls = items.flatMap((it) => {
      const r = asRecord(it);
      if (!r) return [];
      return [
        {
          id: asString(r.id),
          type: typeof r.type === 'string' ? r.type : undefined,
          alias: typeof r.alias === 'string' ? r.alias : undefined,
          tag: typeof r.tag === 'string' ? r.tag : undefined,
          text: typeof r.text === 'string' ? r.text : undefined,
        },
      ];
    });
  }

  // Fields
  const fieldsFn = maybeMethod(doc, ['fields', 'list']);
  let fields: SnapshotField[] = [];
  if (includesDomain(requestedDomains, 'fields') && fieldsFn) {
    const raw = await safeCall(() => fieldsFn({}), null, recordError('fields.list'));
    const rec = asRecord(raw);
    const items = Array.isArray(rec?.items) ? (rec!.items as unknown[]) : [];
    fields = items.flatMap((it) => {
      const r = asRecord(it);
      if (!r) return [];
      return [
        {
          id: asString(r.id),
          type: typeof r.type === 'string' ? r.type : undefined,
          result: typeof r.result === 'string' ? r.result : undefined,
        },
      ];
    });
  }

  // Hyperlinks
  const hyperlinksFn = maybeMethod(doc, ['hyperlinks', 'list']);
  let hyperlinks: SnapshotHyperlink[] = [];
  if (includesDomain(requestedDomains, 'hyperlinks') && hyperlinksFn) {
    const raw = await safeCall(() => hyperlinksFn({}), null, recordError('hyperlinks.list'));
    const rec = asRecord(raw);
    const items = Array.isArray(rec?.items) ? (rec!.items as unknown[]) : [];
    hyperlinks = items.flatMap((it) => {
      const r = asRecord(it);
      if (!r) return [];
      return [
        {
          id: asString(r.id),
          url: asString(r.url),
          display: typeof r.display === 'string' ? r.display : undefined,
          nodeId: typeof r.nodeId === 'string' ? r.nodeId : undefined,
        },
      ];
    });
  }

  // Bookmarks
  const bookmarksFn = maybeMethod(doc, ['bookmarks', 'list']);
  let bookmarks: SnapshotBookmark[] = [];
  if (includesDomain(requestedDomains, 'bookmarks') && bookmarksFn) {
    const raw = await safeCall(() => bookmarksFn({}), null, recordError('bookmarks.list'));
    const rec = asRecord(raw);
    const items = Array.isArray(rec?.items) ? (rec!.items as unknown[]) : [];
    bookmarks = items.flatMap((it) => {
      const r = asRecord(it);
      if (!r) return [];
      return [
        {
          id: asString(r.id),
          name: asString(r.name, asString(r.id)),
          startNodeId: typeof r.startNodeId === 'string' ? r.startNodeId : undefined,
          endNodeId: typeof r.endNodeId === 'string' ? r.endNodeId : undefined,
        },
      ];
    });
  }

  // Permission ranges
  const prFn = maybeMethod(doc, ['permissionRanges', 'list']);
  let permissionRanges: SnapshotPermissionRange[] = [];
  if (includesDomain(requestedDomains, 'permissionRanges') && prFn) {
    const raw = await safeCall(() => prFn({}), null, recordError('permissionRanges.list'));
    const rec = asRecord(raw);
    const items = Array.isArray(rec?.items) ? (rec!.items as unknown[]) : [];
    permissionRanges = items.flatMap((it) => {
      const r = asRecord(it);
      if (!r) return [];
      return [
        {
          id: asString(r.id),
          startNodeId: typeof r.startNodeId === 'string' ? r.startNodeId : undefined,
          endNodeId: typeof r.endNodeId === 'string' ? r.endNodeId : undefined,
          editorOrEditorGroup: typeof r.editorOrEditorGroup === 'string' ? r.editorOrEditorGroup : undefined,
        },
      ];
    });
  }

  // Images
  const imagesFn = maybeMethod(doc, ['images', 'list']);
  let images: SnapshotImage[] = [];
  if (includesDomain(requestedDomains, 'images') && imagesFn) {
    const raw = await safeCall(() => imagesFn({}), null, recordError('images.list'));
    const rec = asRecord(raw);
    const items = Array.isArray(rec?.items) ? (rec!.items as unknown[]) : [];
    images = items.flatMap((it) => {
      const r = asRecord(it);
      if (!r) return [];
      return [
        {
          imageId: asString(r.imageId, asString(r.id)),
          nodeId: typeof r.nodeId === 'string' ? r.nodeId : undefined,
          alt: typeof r.alt === 'string' ? r.alt : undefined,
          caption: typeof r.caption === 'string' ? r.caption : undefined,
        },
      ];
    });
  }

  return {
    revision,
    counts: {
      blocks: countsFromInfo.blocks || totalBlocks || normalizedBlocks.length,
      paragraphs: countsFromInfo.paragraphs || normalizedBlocks.filter((b) => b.nodeType === 'paragraph').length,
      headings: countsFromInfo.headings || normalizedBlocks.filter((b) => b.nodeType === 'heading').length,
      tables: countsFromInfo.tables || tableBlocks.length,
      lists: countsFromInfo.lists || lists.length,
      images: countsFromInfo.images || images.length,
      comments: countsFromInfo.comments || comments.length,
      trackedChanges: countsFromInfo.trackedChanges || trackedChanges.length,
      sections: countsFromInfo.sections || sections.length,
      fields: countsFromInfo.fields || fields.length,
      hyperlinks: countsFromInfo.hyperlinks || hyperlinks.length,
      bookmarks: countsFromInfo.bookmarks || bookmarks.length,
      contentControls: countsFromInfo.contentControls || contentControls.length,
      permissionRanges: countsFromInfo.permissionRanges || permissionRanges.length,
      styles: countsFromInfo.styles || styles.length,
      headers: countsFromInfo.headers || headerFooters.filter((h) => h.kind === 'header').length,
      footers: countsFromInfo.footers || headerFooters.filter((h) => h.kind === 'footer').length,
    },
    blocks,
    lists,
    tables,
    comments,
    trackedChanges,
    sections,
    headerFooters,
    styles,
    contentControls,
    fields,
    hyperlinks,
    bookmarks,
    permissionRanges,
    images,
    diagnostics,
  };
}

/**
 * Structured ambiguity error returned when multiple candidates match a
 * selector and the plan required uniqueness.
 */
export class AmbiguousSelectorError extends Error {
  readonly code = 'AMBIGUOUS_SELECTOR' as const;
  readonly candidates: ReadonlyArray<{ nodeId: string; description: string }>;

  constructor(message: string, candidates: ReadonlyArray<{ nodeId: string; description: string }>) {
    super(message);
    this.name = 'AmbiguousSelectorError';
    this.candidates = candidates;
  }
}

/**
 * Resolve a deterministic selector against the snapshot. Returns the matching
 * block ids in document order. Selectors that target entities return
 * entity-domain matches by id.
 */
export function resolveSnapshotSelector(
  snapshot: DocumentSnapshot,
  selector: import('./ir.js').AgentSelector,
): readonly string[] {
  const nonEmptyParagraphs = snapshot.blocks.filter(
    (block) => block.nodeType === 'paragraph' && block.text.trim().length > 0,
  );
  const firstHeading = snapshot.blocks.find((block) => block.nodeType === 'heading');
  const bodyParagraphs =
    firstHeading == null
      ? nonEmptyParagraphs
      : snapshot.blocks.filter(
          (block) =>
            block.nodeType === 'paragraph' && block.text.trim().length > 0 && block.ordinal > firstHeading.ordinal,
        );
  switch (selector.kind) {
    case 'ref':
      return snapshot.blocks.filter((b) => b.nodeId === selector.ref).map((b) => b.nodeId);
    case 'nodeId':
      return snapshot.blocks.filter((b) => b.nodeId === selector.nodeId).map((b) => b.nodeId);
    case 'tableCell': {
      const table = snapshot.tables[selector.tableOrdinal - 1];
      if (!table) return [];
      const cell = table.cells.find(
        (entry) => entry.rowIndex === selector.rowIndex && entry.columnIndex === selector.columnIndex,
      );
      return cell?.nodeId ? [cell.nodeId] : [];
    }
    case 'textSearch': {
      const matchMode = selector.match ?? 'all';
      const occurrence = selector.occurrence ?? 1;
      const caseSensitive = selector.caseSensitive === true;
      const allowedNodeTypes = new Set(selector.nodeTypes ?? ['paragraph', 'heading', 'listItem']);
      const terms = selector.terms.filter((term) => term.trim().length > 0);
      if (terms.length === 0) return [];
      const normalizedTerms = caseSensitive ? terms : terms.map((term) => term.toLocaleLowerCase());
      const matches = snapshot.blocks.filter((block) => {
        if (!allowedNodeTypes.has(block.nodeType as 'paragraph' | 'heading' | 'listItem')) return false;
        if (block.text.trim().length === 0) return false;
        const haystack = caseSensitive ? block.text : block.text.toLocaleLowerCase();
        const hits = normalizedTerms.filter((term) => haystack.includes(term)).length;
        return matchMode === 'any' ? hits > 0 : hits === normalizedTerms.length;
      });
      const target = matches[occurrence - 1];
      return target ? [target.nodeId] : [];
    }
    case 'ordinal': {
      switch (selector.ordinalKind) {
        case 'blockOrdinal': {
          const target = snapshot.blocks[selector.value - 1];
          return target ? [target.nodeId] : [];
        }
        case 'paragraphOrdinal': {
          const target = nonEmptyParagraphs[selector.value - 1];
          return target ? [target.nodeId] : [];
        }
        case 'bodyParagraphOrdinal': {
          const target = (bodyParagraphs.length > 0 ? bodyParagraphs : nonEmptyParagraphs)[selector.value - 1];
          return target ? [target.nodeId] : [];
        }
        case 'headingOrdinal': {
          const headings = snapshot.blocks.filter((b) => b.nodeType === 'heading');
          const target = headings[selector.value - 1];
          return target ? [target.nodeId] : [];
        }
        case 'tableOrdinal': {
          const target = snapshot.tables[selector.value - 1];
          return target ? [target.nodeId] : [];
        }
        case 'listOrdinal': {
          const target = snapshot.lists[selector.value - 1];
          return target ? target.items.map((item) => item.nodeId) : [];
        }
        case 'sectionOrdinal': {
          const target = snapshot.sections[selector.value - 1];
          return target?.startNodeId ? [target.startNodeId] : [];
        }
      }
      return [];
    }
    case 'entity':
      switch (selector.entityType) {
        case 'comment':
          return snapshot.comments.filter((c) => c.id === selector.entityId).map((c) => c.id);
        case 'trackedChange':
          return snapshot.trackedChanges.filter((c) => c.id === selector.entityId).map((c) => c.id);
        case 'bookmark':
          return snapshot.bookmarks.filter((b) => b.id === selector.entityId).map((b) => b.id);
        case 'image':
          return snapshot.images.filter((i) => i.imageId === selector.entityId).map((i) => i.imageId);
        case 'hyperlink':
          return snapshot.hyperlinks.filter((h) => h.id === selector.entityId).map((h) => h.id);
        case 'field':
          return snapshot.fields.filter((f) => f.id === selector.entityId).map((f) => f.id);
      }
      return [];
    case 'placement':
      if (selector.at === 'document_start') {
        const first = snapshot.blocks[0];
        return first ? [first.nodeId] : [];
      }
      const last = snapshot.blocks[snapshot.blocks.length - 1];
      return last ? [last.nodeId] : [];
    case 'relative': {
      const targetIds = resolveSnapshotSelector(snapshot, selector.target);
      const offset = selector.position === 'before' ? -1 : 1;
      const matches: string[] = [];
      for (const targetId of targetIds) {
        const index = snapshot.blocks.findIndex((block) => block.nodeId === targetId);
        if (index === -1) continue;
        const sibling = snapshot.blocks[index + offset];
        if (sibling != null) matches.push(sibling.nodeId);
      }
      return [...new Set(matches)];
    }
    case 'document':
      return snapshot.blocks.map((b) => b.nodeId);
  }
}
