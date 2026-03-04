/**
 * Convert a ProseMirror document into an mdast AST tree (synchronous, DOM-free).
 *
 * This is the inverse of `mdastToProseMirror.ts`. It walks the ProseMirror node
 * tree and produces mdast nodes suitable for serialisation via remark-stringify.
 *
 * Key schema facts (SuperEditor/OOXML → mdast):
 *  - Headings are `paragraph` nodes with `paragraphProperties.styleId: 'HeadingN'`.
 *  - Lists are `paragraph` nodes with `paragraphProperties.numberingProperties`.
 *  - The `run` node wraps text with run-level properties (bold, italic, etc.).
 *  - Tables use `table` > `tableRow` > `tableCell`/`tableHeader`.
 *  - Blockquotes are `paragraph` nodes with `paragraphProperties.styleId: 'Quote'`.
 */

import type { Node as PmNode, Mark } from 'prosemirror-model';
import type {
  Root,
  Content,
  BlockContent,
  DefinitionContent,
  Paragraph,
  Heading,
  Table,
  TableRow,
  TableCell,
  List,
  ListItem,
  Blockquote,
  ThematicBreak,
  Image,
  Text,
  Strong,
  Emphasis,
  Delete,
  Link,
  InlineCode,
  Break,
  PhrasingContent,
} from 'mdast';
import { ListHelpers } from '../list-numbering-helpers.js';
import type { Editor } from '../../Editor.js';

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Convert a ProseMirror document node into an mdast Root node.
 *
 * @param doc - The ProseMirror doc node.
 * @param editor - Editor instance (needed for list definition lookups).
 * @returns An mdast Root suitable for remark-stringify.
 */
export function proseMirrorDocToMdast(doc: PmNode, editor: Editor): Root {
  const rawBlocks = convertDocChildren(doc, editor);
  const children = groupConsecutiveListItems(rawBlocks);
  return { type: 'root', children };
}

// ---------------------------------------------------------------------------
// Heading style → depth mapping
// ---------------------------------------------------------------------------

const HEADING_STYLE_DEPTH: Record<string, 1 | 2 | 3 | 4 | 5 | 6> = {
  Heading1: 1,
  Heading2: 2,
  Heading3: 3,
  Heading4: 4,
  Heading5: 5,
  Heading6: 6,
};

// Bullet-type numFmt values — anything else is treated as ordered.
const BULLET_FORMATS = new Set(['bullet', 'none']);

// ---------------------------------------------------------------------------
// Block-level converters
// ---------------------------------------------------------------------------

/** Sentinel wrapper used for list accumulation before grouping. */
interface PendingListItem {
  type: 'pendingListItem';
  numId: number;
  ilvl: number;
  ordered: boolean;
  children: (BlockContent | DefinitionContent)[];
}

type BlockOrPending = Content | PendingListItem;

function convertDocChildren(doc: PmNode, editor: Editor): BlockOrPending[] {
  const blocks: BlockOrPending[] = [];
  doc.forEach((child) => {
    blocks.push(...convertBlockNode(child, editor));
  });
  return blocks;
}

function convertBlockNode(node: PmNode, editor: Editor): BlockOrPending[] {
  switch (node.type.name) {
    case 'paragraph':
      return convertParagraph(node, editor);
    case 'table':
      return [convertTable(node, editor)];
    case 'contentBlock':
      return convertContentBlock(node);
    default:
      // Unknown block — try to extract text content as a paragraph
      return [{ type: 'paragraph', children: convertInlineContent(node, editor) }];
  }
}

// ---------------------------------------------------------------------------
// Paragraph (may produce heading, list item, blockquote, or plain paragraph)
// ---------------------------------------------------------------------------

function convertParagraph(node: PmNode, editor: Editor): BlockOrPending[] {
  const pProps = node.attrs.paragraphProperties as Record<string, unknown> | undefined;
  const styleId = pProps?.styleId as string | undefined;
  const numberingProps =
    (pProps?.numberingProperties as { numId?: number; ilvl?: number } | undefined) ??
    (node.attrs.numberingProperties as { numId?: number; ilvl?: number } | undefined);

  const inlineContent = convertInlineContent(node, editor);

  // Heading?
  if (styleId && styleId in HEADING_STYLE_DEPTH) {
    const heading: Heading = {
      type: 'heading',
      depth: HEADING_STYLE_DEPTH[styleId],
      children: inlineContent,
    };
    return [heading];
  }

  // List item?
  if (numberingProps && numberingProps.numId != null) {
    const numId = numberingProps.numId;
    const ilvl = numberingProps.ilvl ?? 0;
    const ordered = isOrderedList(numId, ilvl, editor);

    const paragraph: Paragraph = { type: 'paragraph', children: inlineContent };
    return [
      {
        type: 'pendingListItem',
        numId,
        ilvl,
        ordered,
        children: [paragraph],
      } satisfies PendingListItem,
    ];
  }

  // Blockquote?
  if (styleId === 'Quote') {
    const blockquote: Blockquote = {
      type: 'blockquote',
      children: [{ type: 'paragraph', children: inlineContent }],
    };
    return [blockquote];
  }

  // Plain paragraph
  const paragraph: Paragraph = { type: 'paragraph', children: inlineContent };
  return [paragraph];
}

// ---------------------------------------------------------------------------
// List detection
// ---------------------------------------------------------------------------

function isOrderedList(numId: number, ilvl: number, editor: Editor): boolean {
  try {
    const details = ListHelpers.getListDefinitionDetails({ numId, level: ilvl, editor });
    if (!details?.numFmt) return false;
    return !BULLET_FORMATS.has(details.numFmt);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// List grouping post-pass
// ---------------------------------------------------------------------------

/**
 * Group consecutive PendingListItem nodes into nested mdast List trees.
 * Non-list blocks pass through unchanged.
 */
function groupConsecutiveListItems(blocks: BlockOrPending[]): Content[] {
  const result: Content[] = [];
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];
    if (isPendingListItem(block)) {
      // Collect consecutive list items sharing the same numId
      const run: PendingListItem[] = [block];
      i += 1;
      while (
        i < blocks.length &&
        isPendingListItem(blocks[i]) &&
        (blocks[i] as PendingListItem).numId === block.numId
      ) {
        run.push(blocks[i] as PendingListItem);
        i += 1;
      }
      result.push(buildListTree(run));
    } else {
      result.push(block as Content);
      i += 1;
    }
  }

  return result;
}

function isPendingListItem(block: BlockOrPending): block is PendingListItem {
  return (block as PendingListItem).type === 'pendingListItem';
}

/**
 * Build a nested mdast List from a run of PendingListItems.
 * Items at ilvl > 0 are nested inside the preceding item's list.
 */
function buildListTree(items: PendingListItem[]): List {
  const ordered = items[0].ordered;
  const rootList: List = { type: 'list', ordered, spread: false, children: [] };

  for (const item of items) {
    insertItemAtDepth(rootList, item.ilvl, item.children, item.ordered);
  }

  return rootList;
}

function insertItemAtDepth(
  list: List,
  depth: number,
  content: (BlockContent | DefinitionContent)[],
  ordered: boolean,
): void {
  if (depth === 0) {
    const listItem: ListItem = { type: 'listItem', spread: false, children: content };
    list.children.push(listItem);
    return;
  }

  // Ensure there's a parent item to nest under
  if (list.children.length === 0) {
    list.children.push({ type: 'listItem', spread: false, children: [] });
  }

  const lastItem = list.children[list.children.length - 1];
  // Find or create a nested list
  let nestedList = lastItem.children.find((child): child is List => child.type === 'list');
  if (!nestedList) {
    nestedList = { type: 'list', ordered, spread: false, children: [] };
    lastItem.children.push(nestedList);
  }

  insertItemAtDepth(nestedList, depth - 1, content, ordered);
}

// ---------------------------------------------------------------------------
// Content block (horizontal rule, etc.)
// ---------------------------------------------------------------------------

function convertContentBlock(node: PmNode): Content[] {
  if (node.attrs.horizontalRule) {
    const hr: ThematicBreak = { type: 'thematicBreak' };
    return [hr];
  }
  // Unrecognised content block — skip
  return [];
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

function convertTable(node: PmNode, editor: Editor): Table {
  const rows: TableRow[] = [];
  node.forEach((rowNode) => {
    rows.push(convertTableRow(rowNode, editor));
  });
  return { type: 'table', children: rows };
}

function convertTableRow(node: PmNode, editor: Editor): TableRow {
  const cells: TableCell[] = [];
  node.forEach((cellNode) => {
    cells.push(convertTableCell(cellNode, editor));
  });
  return { type: 'tableRow', children: cells };
}

function convertTableCell(node: PmNode, editor: Editor): TableCell {
  // Table cells contain block content; collapse to inline for mdast GFM tables
  const inlineContent: PhrasingContent[] = [];
  node.forEach((child) => {
    if (child.type.name === 'paragraph') {
      if (inlineContent.length > 0) {
        // Separate multiple paragraphs with a space
        inlineContent.push({ type: 'text', value: ' ' });
      }
      inlineContent.push(...convertInlineContent(child, editor));
    }
  });
  return { type: 'tableCell', children: inlineContent };
}

// ---------------------------------------------------------------------------
// Inline-level converters
// ---------------------------------------------------------------------------

function convertInlineContent(node: PmNode, editor: Editor): PhrasingContent[] {
  const result: PhrasingContent[] = [];
  node.forEach((child) => {
    result.push(...convertInlineNode(child, editor));
  });
  return result;
}

function convertInlineNode(node: PmNode, editor: Editor): PhrasingContent[] {
  switch (node.type.name) {
    case 'run':
      return convertRunNode(node, editor);
    case 'text':
      return [wrapWithMarks(node.text ?? '', node.marks)];
    case 'lineBreak':
      return [{ type: 'break' } as Break];
    case 'image':
      return [convertImageNode(node)];
    case 'contentBlock':
      // Inline content block (e.g. HR inside paragraph) — skip in inline context
      return [];
    default:
      // Try to recurse into children for unknown inline nodes
      return convertInlineContent(node, editor);
  }
}

// ---------------------------------------------------------------------------
// Run node (wraps text with run properties)
// ---------------------------------------------------------------------------

function convertRunNode(node: PmNode, editor: Editor): PhrasingContent[] {
  const result: PhrasingContent[] = [];
  node.forEach((child) => {
    if (child.type.name === 'text') {
      const text = child.text ?? '';
      // Check for inline code via run properties (Courier New font)
      const runProps = node.attrs.runProperties as Record<string, unknown> | undefined;
      if (isMonospaceRun(runProps)) {
        const code: InlineCode = { type: 'inlineCode', value: text };
        result.push(wrapWithMarks(code, child.marks));
      } else {
        result.push(wrapWithMarks(text, child.marks));
      }
    } else {
      result.push(...convertInlineNode(child, editor));
    }
  });
  return result;
}

function isMonospaceRun(runProps: Record<string, unknown> | undefined): boolean {
  if (!runProps) return false;
  const rFonts = runProps.rFonts as Record<string, string> | undefined;
  if (!rFonts) return false;
  return rFonts.ascii === 'Courier New' || rFonts.hAnsi === 'Courier New';
}

// ---------------------------------------------------------------------------
// Image
// ---------------------------------------------------------------------------

function convertImageNode(node: PmNode): Image {
  return {
    type: 'image',
    url: (node.attrs.src as string) ?? '',
    alt: (node.attrs.alt as string) ?? undefined,
    title: (node.attrs.title as string) ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Mark wrapping
// ---------------------------------------------------------------------------

/** Consistent ordering for deterministic output. */
const MARK_PRIORITY: Record<string, number> = {
  link: 0,
  strong: 1,
  bold: 1,
  emphasis: 2,
  italic: 2,
  delete: 3,
  strike: 3,
};

/**
 * Wrap a text value or existing phrasing node with ProseMirror marks.
 * Marks are applied inside-out: start with the innermost content and wrap outward.
 */
function wrapWithMarks(content: string | PhrasingContent, marks: readonly Mark[]): PhrasingContent {
  // Build the innermost node
  let node: PhrasingContent = typeof content === 'string' ? ({ type: 'text', value: content } as Text) : content;

  if (!marks || marks.length === 0) return node;

  // Sort marks for deterministic nesting (outermost first → applied last)
  const sorted = [...marks].sort((a, b) => (MARK_PRIORITY[a.type.name] ?? 99) - (MARK_PRIORITY[b.type.name] ?? 99));

  // Wrap inside-out (reverse so outermost mark wraps last)
  for (let i = sorted.length - 1; i >= 0; i--) {
    node = applyMark(sorted[i], node);
  }

  return node;
}

function applyMark(mark: Mark, child: PhrasingContent): PhrasingContent {
  switch (mark.type.name) {
    case 'bold':
      return { type: 'strong', children: [child] } as Strong;
    case 'italic':
      return { type: 'emphasis', children: [child] } as Emphasis;
    case 'strike':
      return { type: 'delete', children: [child] } as Delete;
    case 'link':
      return {
        type: 'link',
        url: (mark.attrs.href as string) ?? '',
        title: (mark.attrs.tooltip as string) ?? undefined,
        children: [child],
      } as Link;
    case 'textStyle': {
      // Courier New fontFamily → inlineCode (only if child is text)
      const fontFamily = mark.attrs.fontFamily as string | undefined;
      if (fontFamily === 'Courier New' && child.type === 'text') {
        return { type: 'inlineCode', value: (child as Text).value } as InlineCode;
      }
      return child;
    }
    default:
      // Unsupported mark — pass through
      return child;
  }
}
