/**
 * Convert an mdast AST tree into ProseMirror JSON nodes.
 *
 * This module walks the mdast tree produced by remark-parse and produces
 * ProseMirror-compatible JSON that conforms to the SuperEditor schema.
 *
 * Key schema facts (SuperEditor/OOXML):
 *  - Headings are `paragraph` nodes with `paragraphProperties.styleId: 'HeadingN'`.
 *  - Lists are `paragraph` nodes with `paragraphProperties.numberingProperties`.
 *  - The `run` node wraps text with run-level properties (bold, italic, etc.).
 *  - Tables use `table` > `tableRow` > `tableCell` with block content inside cells.
 *  - There is no dedicated blockquote or horizontal-rule node.
 */

import type {
  Node as MdastNode,
  Root,
  PhrasingContent,
  Paragraph as MdastParagraph,
  Heading as MdastHeading,
  Blockquote as MdastBlockquote,
  Code as MdastCode,
  Table as MdastTable,
  Image as MdastImage,
  Html as MdastHtml,
  Text as MdastText,
  Strong as MdastStrong,
  Emphasis as MdastEmphasis,
  Delete as MdastDelete,
  Link as MdastLink,
  InlineCode as MdastInlineCode,
  List as MdastList,
  ListItem as MdastListItem,
} from 'mdast';
import { ListHelpers } from '../list-numbering-helpers.js';
import type { MdastConversionContext, MarkdownDiagnostic } from './types.js';

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Convert an mdast root node into an array of ProseMirror JSON block nodes
 * suitable for constructing a full doc or a fragment.
 */
export function convertMdastToBlocks(root: Root, ctx: MdastConversionContext): JsonNode[] {
  return flatMapRootChildrenPreserveBlankLines(root, ctx);
}

// ---------------------------------------------------------------------------
// JSON node shape (matches ProseMirror nodeFromJSON input)
// ---------------------------------------------------------------------------

interface JsonNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
  marks?: JsonMark[];
  text?: string;
}

interface JsonMark {
  type: string;
  attrs?: Record<string, unknown>;
}

// OOXML stores percentages in fiftieths of a percent.
// 5000 = 100% table width.
const FULL_WIDTH_TABLE_PCT = 5000;

// ---------------------------------------------------------------------------
// Block-level converters
// ---------------------------------------------------------------------------

function flatMapRootChildrenPreserveBlankLines(root: Root, ctx: MdastConversionContext): JsonNode[] {
  const children = root.children ?? [];
  const blocks: JsonNode[] = [];

  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    blocks.push(...convertBlockNode(child, ctx));

    const next = children[i + 1];
    if (!next) continue;

    const blankLines = countBlankLinesBetweenSiblings(child, next);
    for (let j = 0; j < blankLines; j += 1) {
      blocks.push(makeParagraph([]));
    }
  }

  return blocks;
}

function flatMapChildren(parent: MdastNode & { children?: MdastNode[] }, ctx: MdastConversionContext): JsonNode[] {
  if (!parent.children) return [];
  const blocks: JsonNode[] = [];
  for (const child of parent.children) {
    blocks.push(...convertBlockNode(child, ctx));
  }
  return blocks;
}

function countBlankLinesBetweenSiblings(previous: MdastNode, next: MdastNode): number {
  const previousEndLine = previous.position?.end?.line;
  const nextStartLine = next.position?.start?.line;

  if (typeof previousEndLine !== 'number' || typeof nextStartLine !== 'number') {
    return 0;
  }

  // mdast line numbers are 1-based and inclusive:
  //   previous ends on line A, next starts on line B.
  // A single blank line between blocks is the standard Markdown separator,
  // not an intentional empty paragraph.  Only extra blank lines beyond that
  // mandatory separator are preserved as empty paragraphs.
  return Math.max(0, nextStartLine - previousEndLine - 2);
}

function convertBlockNode(node: MdastNode, ctx: MdastConversionContext): JsonNode[] {
  switch (node.type) {
    case 'paragraph':
      return [convertParagraph(node as MdastParagraph, ctx)];

    case 'heading':
      return [convertHeading(node as MdastHeading, ctx)];

    case 'list':
      return convertList(node as MdastList, ctx, 0);

    case 'blockquote':
      return convertBlockquote(node as MdastBlockquote, ctx);

    case 'code':
      return [convertCodeBlock(node as MdastCode, ctx)];

    case 'thematicBreak':
      return [convertThematicBreak(ctx)];

    case 'table':
      return [convertTable(node as MdastTable, ctx)];

    case 'image':
      return [convertImageBlock(node as MdastImage, ctx)];

    case 'html':
      return convertRawHtml(node as MdastHtml, ctx);

    default:
      addDiagnostic(ctx, 'warning', node.type, `Unsupported mdast block node "${node.type}" — skipped.`, node);
      return [];
  }
}

// ---------------------------------------------------------------------------
// Paragraph
// ---------------------------------------------------------------------------

function convertParagraph(node: MdastParagraph, ctx: MdastConversionContext): JsonNode {
  return makeParagraph(convertInlineChildren(node.children, ctx, []));
}

// ---------------------------------------------------------------------------
// Heading (paragraph + styleId)
// ---------------------------------------------------------------------------

const HEADING_STYLE_MAP: Record<number, string> = {
  1: 'Heading1',
  2: 'Heading2',
  3: 'Heading3',
  4: 'Heading4',
  5: 'Heading5',
  6: 'Heading6',
};

function convertHeading(node: MdastHeading, ctx: MdastConversionContext): JsonNode {
  const styleId = HEADING_STYLE_MAP[node.depth] ?? 'Heading1';
  const runs = convertInlineChildren(node.children, ctx, []);
  return makeParagraph(runs, { styleId });
}

// ---------------------------------------------------------------------------
// List (ordered / bullet → paragraphs with numberingProperties)
// ---------------------------------------------------------------------------

function convertList(node: MdastList, ctx: MdastConversionContext, depth: number): JsonNode[] {
  const listType = node.ordered ? 'orderedList' : 'bulletList';

  let numId: number | undefined;
  if (!ctx.options.dryRun) {
    numId = ListHelpers.getNewListId(ctx.editor);
    ListHelpers.generateNewListDefinition({ numId, listType, editor: ctx.editor });
  } else {
    // Dry-run: use a placeholder numId (never persisted)
    numId = 0;
  }

  const blocks: JsonNode[] = [];
  for (let i = 0; i < node.children.length; i++) {
    const listItem = node.children[i];
    blocks.push(...convertListItem(listItem, ctx, numId, depth, listType));
  }
  return blocks;
}

function convertListItem(
  item: MdastListItem,
  ctx: MdastConversionContext,
  numId: number,
  depth: number,
  listType: string,
): JsonNode[] {
  const blocks: JsonNode[] = [];
  let firstParagraphEmitted = false;

  for (const child of item.children) {
    if (child.type === 'paragraph') {
      const runs = convertInlineChildren((child as MdastParagraph).children, ctx, []);
      if (!firstParagraphEmitted) {
        blocks.push(makeListParagraph(runs, numId, depth));
        firstParagraphEmitted = true;
      } else {
        // Continuation paragraph within the same list item — no list marker
        blocks.push(makeParagraph(runs));
      }
    } else if (child.type === 'list') {
      // Nested list — increase depth, reuse same listType context
      blocks.push(...convertList(child as MdastList, ctx, depth + 1));
    } else {
      // Other block content inside a list item (e.g., blockquote, code)
      blocks.push(...convertBlockNode(child, ctx));
    }
  }

  // If the list item had no paragraph children (edge case), emit an empty list paragraph
  if (blocks.length === 0) {
    blocks.push(makeListParagraph([], numId, depth));
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Blockquote (paragraph + Quote style)
// ---------------------------------------------------------------------------

function convertBlockquote(node: MdastBlockquote, ctx: MdastConversionContext): JsonNode[] {
  const blocks: JsonNode[] = [];
  for (const child of node.children) {
    if (child.type === 'paragraph') {
      const runs = convertInlineChildren((child as MdastParagraph).children, ctx, []);
      blocks.push(makeParagraph(runs, { styleId: 'Quote' }));
    } else {
      // Nested block inside blockquote — convert normally but could lose quote context
      blocks.push(...convertBlockNode(child, ctx));
    }
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Code block (paragraph with monospace run properties)
// ---------------------------------------------------------------------------

function convertCodeBlock(node: MdastCode, ctx: MdastConversionContext): JsonNode {
  const lines = node.value.split('\n');
  const content: JsonNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      content.push({ type: 'lineBreak' });
    }
    if (lines[i].length > 0) {
      content.push(makeRun(lines[i], [], { rFonts: { ascii: 'Courier New', hAnsi: 'Courier New' } }));
    }
  }
  return makeParagraph(content);
}

// ---------------------------------------------------------------------------
// Thematic break (horizontal rule → empty paragraph with border-bottom)
// ---------------------------------------------------------------------------

function convertThematicBreak(ctx: MdastConversionContext): JsonNode {
  // Use the contentBlock node (SuperEditor's inline horizontal rule element)
  // if the schema supports it, otherwise fall back to a styled paragraph.
  const hasContentBlock = ctx.schema.nodes.contentBlock != null;
  if (hasContentBlock) {
    return makeParagraph([
      {
        type: 'contentBlock',
        attrs: {
          horizontalRule: true,
          size: { width: '100%', height: 2 },
          background: '#e5e7eb',
        },
      },
    ]);
  }

  return makeParagraph([], {
    pBdr: {
      bottom: { val: 'single', sz: '6', space: '1', color: 'auto' },
    },
  });
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

function convertTable(node: MdastTable, ctx: MdastConversionContext): JsonNode {
  const rows: JsonNode[] = [];

  for (let rowIndex = 0; rowIndex < node.children.length; rowIndex++) {
    const mdastRow = node.children[rowIndex];
    const isHeaderRow = rowIndex === 0;
    const cells: JsonNode[] = [];

    for (const mdastCell of mdastRow.children) {
      const cellContent = convertInlineChildren(mdastCell.children, ctx, []);
      const cellParagraph = makeParagraph(cellContent);
      const cellType = isHeaderRow ? 'tableHeader' : 'tableCell';
      cells.push({
        type: cellType,
        attrs: {
          colspan: 1,
          rowspan: 1,
          colwidth: null,
        },
        content: [cellParagraph],
      });
    }

    rows.push({
      type: 'tableRow',
      content: cells,
    });
  }

  return {
    type: 'table',
    attrs: {
      tableStyleId: 'TableGrid',
      tableProperties: {
        tableWidth: {
          value: FULL_WIDTH_TABLE_PCT,
          type: 'pct',
        },
      },
    },
    content: rows,
  };
}

// ---------------------------------------------------------------------------
// Image (block-level — wraps in paragraph if at top level)
// ---------------------------------------------------------------------------

function convertImageBlock(node: MdastImage, ctx: MdastConversionContext): JsonNode {
  if (!node.url) {
    addDiagnostic(ctx, 'warning', 'image', 'Image with empty URL — skipped.', node);
    return makeParagraph([]);
  }

  const imageNode: JsonNode = {
    type: 'image',
    attrs: {
      src: node.url,
      alt: node.alt ?? null,
      title: node.title ?? null,
    },
  };

  // Image must be wrapped in a paragraph for the OOXML content model
  return {
    type: 'paragraph',
    content: [imageNode],
  };
}

// ---------------------------------------------------------------------------
// Raw HTML fallback
// ---------------------------------------------------------------------------

function extractHtmlTagName(html: string): string {
  const match = html.match(/^<\/?([a-zA-Z][a-zA-Z0-9]*)/);
  return match ? match[1].toUpperCase() : 'HTML';
}

function convertRawHtml(node: MdastHtml, ctx: MdastConversionContext): JsonNode[] {
  const tagName = extractHtmlTagName(node.value);
  addDiagnostic(
    ctx,
    'warning',
    tagName,
    `Raw HTML <${tagName.toLowerCase()}> in markdown — converted to plain text.`,
    node,
  );
  // Fall back to a plain text paragraph
  if (node.value.trim().length === 0) return [];
  return [makeParagraph([makeRun(node.value, [])])];
}

// ---------------------------------------------------------------------------
// Inline-level converters
// ---------------------------------------------------------------------------

/**
 * Convert an array of mdast phrasing (inline) content into PM JSON run nodes.
 * `parentMarks` accumulates marks as we recurse into emphasis/strong/etc.
 */
function convertInlineChildren(
  children: PhrasingContent[],
  ctx: MdastConversionContext,
  parentMarks: JsonMark[],
): JsonNode[] {
  const nodes: JsonNode[] = [];
  for (const child of children) {
    nodes.push(...convertInlineNode(child, ctx, parentMarks));
  }
  return nodes;
}

function convertInlineNode(node: PhrasingContent, ctx: MdastConversionContext, parentMarks: JsonMark[]): JsonNode[] {
  switch (node.type) {
    case 'text':
      return [makeRun((node as MdastText).value, parentMarks)];

    case 'strong':
      return convertInlineChildren((node as MdastStrong).children, ctx, [...parentMarks, { type: 'bold' }]);

    case 'emphasis':
      return convertInlineChildren((node as MdastEmphasis).children, ctx, [...parentMarks, { type: 'italic' }]);

    case 'delete':
      return convertInlineChildren((node as MdastDelete).children, ctx, [...parentMarks, { type: 'strike' }]);

    case 'link':
      return convertLink(node as MdastLink, ctx, parentMarks);

    case 'inlineCode':
      return [
        makeRun((node as MdastInlineCode).value, [
          ...parentMarks,
          { type: 'textStyle', attrs: { fontFamily: 'Courier New' } },
        ]),
      ];

    case 'break':
      return [{ type: 'lineBreak' }];

    case 'image':
      return convertInlineImage(node as MdastImage, ctx);

    default: {
      const diagNodeType = node.type === 'html' ? extractHtmlTagName((node as MdastHtml).value ?? '') : node.type;
      addDiagnostic(
        ctx,
        'warning',
        diagNodeType,
        `Unsupported mdast inline node "${node.type}" — converted to text.`,
        node,
      );
      // Attempt to extract text content as fallback
      if ('value' in node && typeof (node as unknown as { value: unknown }).value === 'string') {
        return [makeRun((node as unknown as { value: string }).value, parentMarks)];
      }
      if ('children' in node && Array.isArray((node as unknown as { children: unknown }).children)) {
        return convertInlineChildren((node as unknown as { children: PhrasingContent[] }).children, ctx, parentMarks);
      }
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Link
// ---------------------------------------------------------------------------

function convertLink(node: MdastLink, ctx: MdastConversionContext, parentMarks: JsonMark[]): JsonNode[] {
  const linkMark: JsonMark = {
    type: 'link',
    attrs: {
      href: node.url,
      target: '_blank',
      rel: 'noopener noreferrer nofollow',
      ...(node.title ? { tooltip: node.title } : {}),
    },
  };
  return convertInlineChildren(node.children, ctx, [...parentMarks, linkMark]);
}

// ---------------------------------------------------------------------------
// Inline image
// ---------------------------------------------------------------------------

function convertInlineImage(node: MdastImage, ctx: MdastConversionContext): JsonNode[] {
  if (!node.url) {
    addDiagnostic(ctx, 'warning', 'image', 'Inline image with empty URL — skipped.', node);
    return [];
  }
  return [
    {
      type: 'image',
      attrs: {
        src: node.url,
        alt: node.alt ?? null,
        title: node.title ?? null,
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// JSON node builders
// ---------------------------------------------------------------------------

function makeParagraph(content: JsonNode[], extraParagraphProps?: Record<string, unknown>): JsonNode {
  const paragraphProperties = extraParagraphProps ? { ...extraParagraphProps } : undefined;
  const attrs: Record<string, unknown> = {};
  if (paragraphProperties) {
    attrs.paragraphProperties = paragraphProperties;
  }
  return {
    type: 'paragraph',
    ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
    content: content.length > 0 ? content : undefined,
  };
}

function makeListParagraph(content: JsonNode[], numId: number, ilvl: number): JsonNode {
  const numberingProperties = { numId, ilvl };
  return {
    type: 'paragraph',
    attrs: {
      paragraphProperties: { numberingProperties },
      numberingProperties,
    },
    content: content.length > 0 ? content : undefined,
  };
}

/**
 * Create a `run` JSON node wrapping a text node with optional marks/run properties.
 */
function makeRun(text: string, marks: JsonMark[], extraRunProperties?: Record<string, unknown>): JsonNode {
  const textNode: JsonNode = {
    type: 'text',
    text,
    ...(marks.length > 0 ? { marks } : {}),
  };
  const runNode: JsonNode = {
    type: 'run',
    content: [textNode],
  };
  if (extraRunProperties) {
    runNode.attrs = { runProperties: extraRunProperties };
  }
  return runNode;
}

// ---------------------------------------------------------------------------
// Diagnostics helper
// ---------------------------------------------------------------------------

function addDiagnostic(
  ctx: MdastConversionContext,
  severity: MarkdownDiagnostic['severity'],
  nodeType: string,
  message: string,
  node?: MdastNode,
): void {
  const diagnostic: MarkdownDiagnostic = { severity, nodeType, message };
  if (node?.position?.start) {
    diagnostic.position = {
      line: node.position.start.line,
      column: node.position.start.column,
    };
  }
  ctx.diagnostics.push(diagnostic);
}
