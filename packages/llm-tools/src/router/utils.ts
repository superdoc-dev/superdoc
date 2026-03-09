import type { Executor } from '../types.js';

/**
 * Parse a JSON string parameter from the LLM input.
 * Returns undefined if the param is not set.
 * Throws a clear error if the JSON is malformed.
 */
export function parseTarget(params: Record<string, unknown>, key = 'target'): unknown {
  const raw = params[key];
  if (raw == null) return undefined;
  try {
    return JSON.parse(raw as string);
  } catch {
    throw new Error(`Invalid JSON in "${key}" parameter: ${raw}`);
  }
}

/** Returns tracked-change options when suggest mode is enabled. */
export function trackedOptions(params: Record<string, unknown>) {
  return params.suggest ? { changeMode: 'tracked' as const } : undefined;
}

// ---------------------------------------------------------------------------
// Address helpers
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function isContentAddress(v: unknown): v is Rec & { kind: 'content'; nodeId: string } {
  return isRec(v) && v.kind === 'content' && typeof v.nodeId === 'string';
}

function isTextAddress(v: unknown): v is Rec & { kind: 'text'; blockId: string; range: Rec } {
  return isRec(v) && v.kind === 'text' && typeof v.blockId === 'string' && isRec(v.range);
}

/** Compute total text length from a node's inline runs (paragraph, heading, list-item content). */
function computeInlinesTextLength(inlines: unknown[]): number {
  let len = 0;
  for (const inline of inlines) {
    if (!isRec(inline)) continue;
    if (inline.kind === 'run' && isRec(inline.run) && typeof inline.run.text === 'string') {
      len += inline.run.text.length;
    } else if (inline.kind === 'hyperlink' && isRec(inline.hyperlink) && Array.isArray(inline.hyperlink.inlines)) {
      len += computeInlinesTextLength(inline.hyperlink.inlines);
    } else if (inline.kind === 'tab' || inline.kind === 'lineBreak') {
      len += 1;
    }
  }
  return len;
}

/** Extract inlines array from an SDContentNode (paragraph, heading). */
function extractInlines(node: Rec): unknown[] | null {
  if (node.kind === 'paragraph' && isRec(node.paragraph) && Array.isArray(node.paragraph.inlines)) {
    return node.paragraph.inlines;
  }
  if (node.kind === 'heading' && isRec(node.heading) && Array.isArray(node.heading.inlines)) {
    return node.heading.inlines;
  }
  return null;
}

/**
 * Resolve a target to a TextAddress if it's a content address.
 *
 * Content addresses (`kind: 'content'`) come from `find` and `create` results.
 * Operations like format.apply and comments.create require text addresses.
 * This helper bridges the gap by looking up the node and computing a text range.
 */
export async function resolveTextTarget(target: unknown, execute: Executor): Promise<unknown> {
  if (!target || isTextAddress(target)) return target;
  if (!isContentAddress(target)) return target;

  const result = (await execute('getNodeById', { nodeId: target.nodeId })) as Rec;
  const node = result.node as Rec;
  if (!node) return target;

  const inlines = extractInlines(node);
  if (!inlines) return target;

  const textLength = computeInlinesTextLength(inlines);
  return { kind: 'text', blockId: target.nodeId, range: { start: 0, end: textLength } };
}

/**
 * Enrich find results with `textAddress` fields so the model can use them
 * directly for format/comment/edit operations without manual address conversion.
 *
 * For text searches, also computes a `matchAddress` with the exact range of the
 * first occurrence of the search pattern within the node's text.
 */
export function enrichFindResults(result: unknown, pattern?: string): unknown {
  if (!isRec(result) || !Array.isArray(result.items)) return result;

  const enrichedItems = result.items.map((item: unknown) => {
    if (!isRec(item) || !isRec(item.node) || !isRec(item.address)) return item;

    const node = item.node as Rec;
    const nodeId = node.id as string;
    if (!nodeId) return item;

    const inlines = extractInlines(node);
    if (!inlines) return item;

    const textLength = computeInlinesTextLength(inlines);
    const textAddress = { kind: 'text', blockId: nodeId, range: { start: 0, end: textLength } };

    const enriched: Rec = { ...item, textAddress };

    // For text searches, find the match offset within the node's flattened text
    if (pattern) {
      const flatText = flattenInlinesText(inlines);
      const idx = flatText.toLowerCase().indexOf(pattern.toLowerCase());
      if (idx >= 0) {
        enriched.matchAddress = {
          kind: 'text',
          blockId: nodeId,
          range: { start: idx, end: idx + pattern.length },
        };
      }
    }

    return enriched;
  });

  return { ...result, items: enrichedItems };
}

/** Flatten all inline run text into a single string. */
function flattenInlinesText(inlines: unknown[]): string {
  let text = '';
  for (const inline of inlines) {
    if (!isRec(inline)) continue;
    if (inline.kind === 'run' && isRec(inline.run) && typeof inline.run.text === 'string') {
      text += inline.run.text;
    } else if (inline.kind === 'hyperlink' && isRec(inline.hyperlink) && Array.isArray(inline.hyperlink.inlines)) {
      text += flattenInlinesText(inline.hyperlink.inlines);
    } else if (inline.kind === 'tab' || inline.kind === 'lineBreak') {
      text += '\t'; // placeholder char so offsets stay correct
    }
  }
  return text;
}

/**
 * Extract cell paragraph IDs from a table SDNodeResult.
 * Returns a 2D array: `paragraphIds[row][col]` = first paragraph ID in each cell.
 */
export function extractTableCellParagraphIds(node: Rec): string[][] | null {
  if (node.kind !== 'table' || !isRec(node.table) || !Array.isArray(node.table.rows)) return null;

  return node.table.rows.map((row: unknown) => {
    if (!isRec(row) || !Array.isArray(row.cells)) return [];
    return row.cells.map((cell: unknown) => {
      if (!isRec(cell) || !Array.isArray(cell.content)) return '';
      const firstParagraph = cell.content.find(
        (c: unknown) => isRec(c) && (c.kind === 'paragraph' || c.kind === 'heading'),
      ) as Rec | undefined;
      return (firstParagraph?.id as string) ?? '';
    });
  });
}
