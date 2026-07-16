/**
 * Clean agent actions.
 *
 * Actions are the high-level, flat-arg actions the product agent surface
 * exposes through `superdoc_perform_action`. They lower into deterministic doc.*
 * operation calls on the bound document handle and return real
 * AgentReceipts with pre/post evidence and verification.
 *
 * Actions are *not* benchmark-shaped: they take only product-facing arguments
 * (text, items, target ordinal, change-mode) and never depend on eval IDs,
 * fixture names, benchmark descriptions, or task-text routing. They are a
 * port of the *generalizable* logic from the workflow-poc surface
 * (clause-level routing and descriptor sentinels are deliberately left
 * behind).
 *
 * The set is intentionally compact — every action covers a real product
 * intent that an LLM would otherwise have to express via raw generated
 * doc.* calls with complex oneOf JSON args.
 */
import type { BoundDocApi } from '../generated/client.js';
import { SuperDocCliError } from '../runtime/errors.js';
import { runSuperdocListTransformWorkflow } from '../action-primitives/tools/list-transform.js';
import { runSuperdocStructureInsertWorkflow } from '../action-primitives/tools/structure-insert.js';
import { runSuperdocTextTransformWorkflow } from '../action-primitives/tools/text-transform.js';
import {
  buildDocumentSnapshot,
  resolveSnapshotSelector,
  type DocumentSnapshot,
  type SnapshotBlock,
  type SnapshotDomain,
} from './doc-snapshot.js';
import type { AgentReceipt, ReceiptRecovery, VerificationResult } from './runtime.js';
import type { AgentChangeMode, AgentSelector, AgentVerificationCheck } from './ir.js';

export type ActionName =
  | 'insert_paragraphs'
  | 'insert_heading'
  | 'replace_text'
  | 'delete_text'
  | 'append_list'
  | 'create_table'
  | 'comment_paragraphs'
  | 'add_comments'
  | 'resolve_comments'
  | 'reply_to_comment'
  | 'rewrite_block'
  | 'accept_tracked_changes'
  | 'reject_tracked_changes'
  | 'normalize_body_font_size'
  | 'set_font_family'
  | 'apply_letter_spacing'
  | 'fill_placeholders'
  | 'move_range'
  | 'insert_toc'
  | 'insert_table_row'
  | 'insert_table_column'
  | 'delete_table_row'
  | 'delete_table_column'
  | 'split_table'
  | 'convert_list'
  | 'split_list'
  | 'undo_changes'
  | 'redo_changes'
  | 'attach_numbering'
  | 'add_list_items'
  | 'format_text'
  | 'apply_style'
  | 'format_paragraph'
  | 'move_text'
  | 'style_table'
  | 'move_table'
  | 'delete_table'
  | 'set_paragraph_spacing'
  | 'insert_page_break'
  | 'add_hyperlink';

export type ActionPlacement =
  | { at: 'document_end' }
  | { at: 'document_start' }
  | { at: 'after'; selector: AgentSelector }
  | { at: 'before'; selector: AgentSelector };

export type ActionArgs =
  | InsertParagraphsArgs
  | InsertHeadingArgs
  | ReplaceTextArgs
  | DeleteTextArgs
  | AppendListArgs
  | AddListItemsArgs
  | ConvertListArgs
  | AttachNumberingArgs
  | SplitListArgs
  | CreateTableArgs
  | CommentParagraphsArgs
  | AddCommentsArgs
  | ResolveCommentsArgs
  | ReplyToCommentArgs
  | RewriteBlockArgs
  | FormatTextArgs
  | FormatParagraphArgs
  | ApplyStyleArgs
  | MoveTextArgs
  | UndoChangesArgs
  | RedoChangesArgs
  | AcceptTrackedChangesArgs
  | RejectTrackedChangesArgs
  | NormalizeBodyFontSizeArgs
  | SetFontFamilyArgs
  | ApplyLetterSpacingArgs
  | FillPlaceholdersArgs
  | MoveRangeArgs
  | InsertTocArgs
  | StyleTableArgs
  | MoveTableArgs
  | DeleteTableArgs
  | SetParagraphSpacingArgs
  | InsertPageBreakArgs
  | AddHyperlinkArgs
  | InsertTableRowArgs
  | InsertTableColumnArgs
  | DeleteTableRowArgs
  | DeleteTableColumnArgs
  | SplitTableArgs;

export type InsertParagraphsArgs = {
  action: 'insert_paragraphs';
  // Accepts `texts` (in final order) or a single `text` for one paragraph;
  // the dispatcher normalizes `text` to a one-element `texts`.
  texts?: readonly string[];
  text?: string;
  placement?: ActionPlacement;
  changeMode?: AgentChangeMode;
  headingLevel?: number;
};

export type InsertHeadingArgs = {
  action: 'insert_heading';
  text: string;
  level: number;
  placement?: ActionPlacement;
  changeMode?: AgentChangeMode;
};

export type ReplaceTextArgs = {
  action: 'replace_text';
  edits: ReadonlyArray<{ find: string; replace: string }>;
  selector?: AgentSelector;
  caseSensitive?: boolean;
  changeMode?: AgentChangeMode;
};

export type DeleteTextArgs = {
  action: 'delete_text';
  finds: readonly string[];
  /** Scope deletions to one inspected block (like replace_text). Without it, finds match document-wide. */
  selector?: AgentSelector;
  caseSensitive?: boolean;
  changeMode?: AgentChangeMode;
};

export type AppendListArgs = {
  action: 'append_list';
  items: readonly string[];
  kind?: 'ordered' | 'bullet';
  headingText?: string;
  headingLevel?: number;
  changeMode?: AgentChangeMode;
};

/**
 * Internal args for the workflow/ghost-list insertion path (formerly the
 * standalone insert_list_items action, now folded into add_list_items). Not a
 * public action — has no `action` discriminant.
 */
export type InsertListItemsArgs = {
  listOrdinal?: number;
  items: readonly string[];
  changeMode?: AgentChangeMode;
};

export type AddListItemsArgs = {
  action: 'add_list_items';
  /** Text inside an existing list item to identify the list to extend. Provide this OR listOrdinal. */
  anchorText?: string;
  /** 1-based index of the target list (from inspect). Alternative to anchorText. */
  listOrdinal?: number;
  /** Items to append, with relative nesting level (0 = same as anchor, 1 = nested sub-item). */
  entries?: ReadonlyArray<{ text: string; level?: number }>;
  /** Plain items to append at the list's base level (simple alias for entries without nesting). */
  items?: readonly string[];
  changeMode?: AgentChangeMode;
};

export type CreateTableArgs = {
  action: 'create_table';
  rows: number;
  columns: number;
  cellTexts?: ReadonlyArray<ReadonlyArray<string>>;
  placement?: ActionPlacement;
  changeMode?: AgentChangeMode;
};

export type CommentParagraphsArgs = {
  action: 'comment_paragraphs';
  commentText: string;
  scope?: 'all' | 'body';
  excludeBlockQuotes?: boolean;
};

export type AddCommentsArgs = {
  action: 'add_comments';
  commentText: string;
  /** Single target. Provide this OR `selectors` (batch). */
  selector?: AgentSelector;
  /** Batch: comment many blocks in ONE call (same text). Looped sequentially. */
  selectors?: AgentSelector[];
};

export type ReplyToCommentArgs = {
  action: 'reply_to_comment';
  /** The reply body. */
  commentText: string;
  /** Locate the comment to reply to by text it is anchored on / mentions. Provide this OR commentId. */
  anchorText?: string;
  /** Explicit id of the parent comment (from inspect comments[].id). Alternative to anchorText. */
  commentId?: string;
};

export type SetFontFamilyArgs = {
  action: 'set_font_family';
  /** Font family to apply, e.g. "Arial" or "Times New Roman". */
  fontFamily: string;
  /** Restrict to one block. Omit selector + targetText to set the whole body. */
  selector?: AgentSelector;
  /** Apply to every occurrence of this text (or targetTexts[] for several). */
  targetText?: string;
  targetTexts?: readonly string[];
  caseSensitive?: boolean;
  changeMode?: AgentChangeMode;
};

export type RewriteBlockArgs = {
  action: 'rewrite_block';
  selector: AgentSelector;
  text: string;
  changeMode?: AgentChangeMode;
};

export type TrackedChangeKind = 'insert' | 'delete' | 'replacement' | 'format';

export type AcceptTrackedChangesArgs = {
  action: 'accept_tracked_changes';
  author?: string;
  /** Restrict the decision to one kind of change, e.g. 'format' = formatting-only revisions. */
  changeType?: TrackedChangeKind;
};

export type RejectTrackedChangesArgs = {
  action: 'reject_tracked_changes';
  author?: string;
  changeType?: TrackedChangeKind;
};

export type NormalizeBodyFontSizeArgs = {
  action: 'normalize_body_font_size';
  fontSize: number;
  changeMode?: AgentChangeMode;
};

export type ApplyLetterSpacingArgs = {
  action: 'apply_letter_spacing';
  selector: AgentSelector;
  letterSpacing: number;
  changeMode?: AgentChangeMode;
};

export type FillPlaceholdersArgs = {
  action: 'fill_placeholders';
  values?: readonly string[];
  fields?: ReadonlyArray<{ label?: string; value: string }>;
  changeMode?: AgentChangeMode;
};

export type MoveRangeArgs = {
  action: 'move_range';
  /** Text identifying the FIRST block of the contiguous range to move. */
  fromText: string;
  /**
   * Text identifying the LAST block of the range. When omitted, the range
   * auto-extends from the `fromText` block up to (but NOT including) the next
   * heading-like block — i.e. the whole "visual section".
   */
  toText?: string;
  /** Place the moved range AFTER the block containing this text. Exactly one of afterText/beforeText is required. */
  afterText?: string;
  /** Place the moved range BEFORE the block containing this text. Exactly one of afterText/beforeText is required. */
  beforeText?: string;
  changeMode?: AgentChangeMode;
};

export type InsertTocArgs = {
  action: 'insert_toc';
  title?: string;
  placement?: ActionPlacement;
  changeMode?: AgentChangeMode;
};

export type StyleTableArgs = {
  action: 'style_table';
  /** 1-based table ordinal (default 1). */
  tableOrdinal: number;
  /** Header-row fill color (hex, e.g. "#1F3864"); defaults to dark navy. */
  accentColor?: string;
};

export type MoveTableArgs = {
  action: 'move_table';
  /** 1-based table ordinal to move (default 1). */
  tableOrdinal?: number;
  /** Destination for the whole table (reuses the placement shape). */
  placement: ActionPlacement;
};

export type DeleteTableArgs = {
  action: 'delete_table';
  /** 1-based table ordinal to delete (default 1). */
  tableOrdinal?: number;
  changeMode?: AgentChangeMode;
};

export type InsertTableRowArgs = {
  action: 'insert_table_row';
  tableOrdinal?: number;
  rowIndex?: number;
  position?: 'before' | 'after' | 'above' | 'below';
  cellTexts?: readonly string[];
  changeMode?: AgentChangeMode;
  dryRun?: boolean;
};

export type InsertTableColumnArgs = {
  action: 'insert_table_column';
  tableOrdinal?: number;
  columnIndex?: number;
  position?: 'left' | 'right';
  headerText?: string;
  changeMode?: AgentChangeMode;
};

export type DeleteTableRowArgs = {
  action: 'delete_table_row';
  tableOrdinal?: number;
  rowIndex: number;
  changeMode?: AgentChangeMode;
};

export type DeleteTableColumnArgs = {
  action: 'delete_table_column';
  tableOrdinal?: number;
  columnIndex: number;
  changeMode?: AgentChangeMode;
};

export type SplitTableArgs = {
  action: 'split_table';
  tableOrdinal?: number;
  rowIndex: number;
  separatorText?: string;
  changeMode?: AgentChangeMode;
};

export type ConvertListArgs = {
  action: 'convert_list';
  kind: 'ordered' | 'bullet';
  listOrdinal?: number;
  anchorText?: string;
  fromMarker?: string;
  toMarker?: string;
  fromText?: string;
  toText?: string;
  changeMode?: AgentChangeMode;
};

export type UndoChangesArgs = {
  action: 'undo_changes';
  untilMarker?: string;
  steps?: number;
};

export type RedoChangesArgs = {
  action: 'redo_changes';
  steps?: number;
};

export type SplitListArgs = {
  action: 'split_list';
  /** Text inside the list item that should START the new (second) list. */
  anchorText: string;
  /** Restart the new list's numbering at 1 (default true); false keeps it continuous. */
  restartNumbering?: boolean;
};

export type AttachNumberingArgs = {
  action: 'attach_numbering';
  nodeId?: string;
  anchorText?: string;
  likeMarker: string;
};

export type ApplyStyleArgs = {
  action: 'apply_style';
  /** Block to restyle. */
  selector: AgentSelector;
  /** Explicit paragraph style id (e.g. "Heading2"). */
  styleId?: string;
  /** Shorthand for styleId "Heading<N>". */
  headingLevel?: number;
  /** Copy the style (and effective inline look) of the block containing this text. */
  likeText?: string;
};

export type FormatTextArgs = {
  action: 'format_text';
  /** Literal text whose every occurrence gets formatted. */
  targetText?: string;
  /** Several literal texts in one call ("bold these three dates"). */
  targetTexts?: readonly string[];
  /** Scope to one block (whole block when no targetText given). */
  selector?: AgentSelector;
  caseSensitive?: boolean;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** Highlight color name (e.g. "yellow"). */
  highlight?: string;
  color?: string;
  fontSize?: number;
  changeMode?: AgentChangeMode;
};

const ACTION_NAMES: readonly ActionName[] = [
  'insert_paragraphs',
  'insert_heading',
  'replace_text',
  'delete_text',
  'append_list',
  'create_table',
  'comment_paragraphs',
  'add_comments',
  'resolve_comments',
  'reply_to_comment',
  'rewrite_block',
  'accept_tracked_changes',
  'reject_tracked_changes',
  'normalize_body_font_size',
  'set_font_family',
  'apply_letter_spacing',
  'fill_placeholders',
  'move_range',
  'insert_toc',
  'insert_table_row',
  'insert_table_column',
  'delete_table_row',
  'delete_table_column',
  'split_table',
  'convert_list',
  'split_list',
  'undo_changes',
  'redo_changes',
  'attach_numbering',
  'add_list_items',
  'format_text',
  'apply_style',
  'format_paragraph',
  'move_text',
  'style_table',
  'move_table',
  'delete_table',
  'set_paragraph_spacing',
  'insert_page_break',
  'add_hyperlink',
];

/**
 * Per-action argument hints — together with ACTION_NAMES and ACTION_GROUPS,
 * the single source for the advertised superdoc_perform_action tool schema/description
 * (rendered in catalog.ts — never hand-edit the description string there).
 * Adding a action = union entry + ACTION_NAMES entry + hint + group + dispatch
 * case; the compiler enforces all but the group, which a unit test covers.
 */
export const ACTION_HINTS: Record<ActionName, string> = {
  insert_paragraphs:
    'texts[] (or text for a single paragraph), placement?, headingLevel? (first item as heading 1-6), changeMode?',
  insert_heading: 'text, level, placement?, changeMode?',
  replace_text:
    'edits[{find,replace}], optional selector to scope replacements to one inspected block, caseSensitive?, changeMode?',
  delete_text:
    'finds[], optional selector to scope deletions to ONE inspected block (required to delete stray whitespace — an unscoped whitespace find matches document-wide), caseSensitive?, changeMode?',
  append_list:
    'items[], kind?: ordered|bullet, headingText?, headingLevel?, placement? {at:"after"|"before",selector} builds the list at that block instead of document end',
  create_table:
    'rows, columns, cellTexts?, placement?, changeMode? — changeMode:"tracked" makes the table insertion itself a tracked change',
  rewrite_block: 'selector, text, changeMode?',
  fill_placeholders: 'values[] and/or fields[{label?,value}], changeMode?',
  move_range:
    'fromText (text in the FIRST block of the range to move), toText? (text in the LAST block — omit to auto-extend across the whole VISUAL SECTION: from fromText up to the next heading-like/ALL-CAPS/bold title), then exactly ONE destination: afterText OR beforeText (text in the block to land after/before). Direct-only today: changeMode:"tracked" fails with no mutation because block-range deletion cannot be tracked. Moves plain paragraph/heading text only; a range containing a table, list, or image is refused with nothing changed. THE way to MOVE a contiguous block range or a visual "section" identified BY TEXT (works on styled-paragraph sections like PREAMBLE / SCHEDULE A that are NOT Word heading nodes). afterText on a heading-like block lands the range after that block\'s WHOLE section.',
  comment_paragraphs: 'commentText, scope?: all|body, excludeBlockQuotes?',
  add_comments:
    'commentText, selector (one block) OR selectors[] to comment MANY blocks in ONE call (same text) — use selectors[] for "comment every heading/section/clause"; NEVER emit multiple add_comments calls, batch the targets into selectors[]',
  resolve_comments:
    'anchorText? (resolve only comments anchored on text containing this; omit to resolve ALL open comments), reopen? (true = reopen resolved comments instead) — THE way to resolve (or reopen) comments. Use for "resolve the comment(s)" / "mark comments resolved".',
  reply_to_comment:
    'commentText (the reply body), anchorText (text the target comment is anchored on / mentions) OR commentId — THE way to REPLY to an existing comment thread. Use for "reply to the comment about X" / "respond to Reviewer\'s comment". Adds a threaded reply, not a new top-level comment.',
  accept_tracked_changes:
    'author?, changeType?: insert|delete|replacement|format — e.g. changeType:"format" accepts ONLY formatting revisions (bold/italic/color), leaving text edits pending',
  reject_tracked_changes: 'author?, changeType?: insert|delete|replacement|format',
  normalize_body_font_size: 'fontSize, changeMode?',
  set_font_family:
    'fontFamily (e.g. "Arial"), selector? (one block) OR targetText/targetTexts[] (occurrences) — omit both to set the WHOLE body font, caseSensitive?, changeMode? — THE way to change the typeface. Use for "change the font to X" / "set the heading font to Y".',
  format_text:
    "bold?/italic?/underline?/strike? booleans, highlight? color name, color?, fontSize?, applied to EVERY occurrence of targetText (or targetTexts[] for several phrases in one call, or a selector'd block), caseSensitive?, changeMode? — THE way to bold/italicize/underline/highlight text, tracked-safe",
  apply_style:
    'selector (block to restyle), then ONE of: styleId (e.g. "Heading2"), headingLevel (1-6), or likeText (text inside another block whose style AND effective look to copy) — THE way to restyle an EXISTING block ("make Summary match the Parties heading"). Never delete-and-recreate a block to change its style',
  apply_letter_spacing: 'selector, letterSpacing, changeMode?',
  insert_toc: 'title?, placement?, changeMode?',
  insert_table_row: 'tableOrdinal?, rowIndex?, position?: before|after|above|below, cellTexts?, changeMode?, dryRun?',
  insert_table_column: 'tableOrdinal?, columnIndex?, position?, headerText?, changeMode?',
  delete_table_row: 'tableOrdinal?, rowIndex, changeMode?',
  delete_table_column: 'tableOrdinal?, columnIndex, changeMode?',
  split_table: 'tableOrdinal?, rowIndex, separatorText?, changeMode?',
  convert_list:
    'kind: ordered|bullet, listOrdinal? 1-based or anchorText? text inside an item of the target list, OR fromMarker+toMarker rendered clause numbers like "2.1."/"2.3." to convert a numbered-clause range, OR fromText+toText exact text inside the first/last of consecutive plain paragraphs to convert them into a list IN PLACE, changeMode? — converts lists, clause ranges, or plain paragraphs to a list without touching text; never recreate-and-delete to make existing paragraphs a list',
  split_list:
    'anchorText (text inside the item that should START the second list), restartNumbering? (default true — the new list restarts at 1; false keeps continuous numbering) — THE way to SPLIT one list into two at an item ("split the list starting at item 7 into a new list with reset numbering"). Nested sub-items stay with their parent. Direct edit (not tracked).',
  undo_changes:
    'untilMarker? rendered marker to restore e.g. "2.1.", steps? 1-25 — deterministic revert that steps document history back until the marker reappears',
  redo_changes:
    'steps? 1-25 (default 1) — the inverse of undo_changes: steps history FORWARD to re-apply edits a prior undo removed. THE recovery when an undo overshot. Only works right after an undo, before any new edit.',
  attach_numbering:
    'anchorText|nodeId, likeMarker e.g. "10.", changeMode? — make an existing block a numbered clause at the same scheme/level as the sibling rendering likeMarker; changeMode:"tracked" records the former unnumbered state as a w:pPrChange',
  add_list_items:
    "anchorText (text inside the item to add relative to) + entries[{text, level?}] — level is RELATIVE to the anchor: 0 = same level as the anchor, positive nests deeper, NEGATIVE promotes toward the top (anchor on a sub-item like \"12(e)\" with level:-1 → a new TOP-LEVEL item 13). The item lands after the anchor's whole sub-tree at that level, and the receipt reports the marker it landed on. New items also inherit the anchor item's font/size/bold/colour automatically (receipt.formattingMatched) — do NOT re-format after adding unless asked. To control level ALWAYS use anchorText (listOrdinal/items[] just append at the list's trailing level and cannot set level). THE way to ADD items (incl. nested sub-items or a new top-level item) into an EXISTING list, reusing its numbering + markers — NOT append_list (which starts a brand-new list)",
  format_paragraph:
    'selector (block to align), alignment: left|center|right|justify, changeMode? — THE way to set paragraph alignment; changeMode:"tracked" records the former alignment as a w:pPrChange so accept/reject toggles it (never apply alignment untracked when tracking is on)',
  move_text:
    'text (exact clause/phrase to relocate), afterText? (relocate to immediately after this text), changeMode? — THE way to MOVE a text span. Direct by default (physically relocates; REQUIRES afterText). changeMode:"tracked" records it as a redline (tracked delete of the source + tracked insert at the destination; accept keeps the move, reject restores the order) and may omit afterText (lands right after the struck source).',
  style_table:
    'tableOrdinal? (1-based, default 1), accentColor? (header fill hex, default dark navy) — THE way to make a table look professional: filled accent header row with white bold text, bold first-column labels, banded rows, clean borders. Use after create_table or on any existing table.',
  move_table:
    'tableOrdinal? (1-based, default 1), placement {at:"document_end"|"document_start"|"after"|"before", selector?} — THE way to MOVE a whole table (with all its content) to a new position IN ONE call. Use for "move the table to the end / under section X". NEVER delete-and-recreate a table to relocate it, and never chain inserts/undos to fake a move.',
  delete_table:
    'tableOrdinal? (1-based, default 1), changeMode? — THE way to DELETE an entire table in one call. Use for "remove/delete the table". Do NOT delete rows one by one or hijack another table.',
  set_paragraph_spacing:
    'selector (block/blocks to space), lineSpacing? (multiplier e.g. 1.5 or 2), spaceBefore? / spaceAfter? (points) — THE way to set line spacing or space before/after paragraphs. Use this for "add spacing" / "1.5 line spacing" / "more room between paragraphs" — NEVER insert blank paragraphs for spacing. Direct edit (not tracked).',
  insert_page_break:
    'selector (block that should start on a new page) — THE way to "start X on a new page" / add a page break before a block (sets pageBreakBefore). Use instead of inserting empty paragraphs to push content down. Direct edit (not tracked).',
  add_hyperlink:
    'text (exact text to turn into a link), url, tooltip? — THE way to make existing text a clickable hyperlink to a URL. Direct edit (not tracked).',
};

/** Category grouping for the rendered tool description. Must cover ACTION_NAMES exactly (unit-tested). */
export const ACTION_GROUPS: ReadonlyArray<{ label: string; actions: readonly ActionName[] }> = [
  {
    label: 'Text/structure actions',
    actions: [
      'insert_paragraphs',
      'insert_heading',
      'replace_text',
      'delete_text',
      'append_list',
      'create_table',
      'rewrite_block',
      'fill_placeholders',
      'move_range',
    ],
  },
  { label: 'List/numbering actions', actions: ['convert_list', 'attach_numbering', 'add_list_items', 'split_list'] },
  { label: 'History', actions: ['undo_changes', 'redo_changes'] },
  { label: 'Tracked move', actions: ['move_text'] },
  { label: 'Comment actions', actions: ['comment_paragraphs', 'add_comments', 'resolve_comments', 'reply_to_comment'] },
  { label: 'Tracked-change review', actions: ['accept_tracked_changes', 'reject_tracked_changes'] },
  {
    label: 'Formatting actions',
    actions: [
      'format_text',
      'apply_style',
      'format_paragraph',
      'set_paragraph_spacing',
      'normalize_body_font_size',
      'set_font_family',
      'apply_letter_spacing',
    ],
  },
  { label: 'Layout', actions: ['insert_page_break'] },
  { label: 'Links', actions: ['add_hyperlink'] },
  { label: 'Media / TOC', actions: ['insert_toc'] },
  {
    label: 'Table edits',
    actions: [
      'style_table',
      'move_table',
      'delete_table',
      'insert_table_row',
      'insert_table_column',
      'delete_table_row',
      'delete_table_column',
      'split_table',
    ],
  },
];

/**
 * Per-action argument names (EXCLUDING `action` itself). Derived by reading
 * every `args.X` the matching `case '<action>':` block in the `superdocPerformAction`
 * dispatch switch consumes — including the args read inside the helper
 * functions that case forwards `args` into (e.g. `appendListAtPlacement`,
 * `insertListItemsIntoGhostList` via `chooseListFromSnapshot`,
 * `matchInsertedBlockFormatting`, `runConvertList`, `runUndoChanges`,
 * `runAttachNumbering`).
 *
 * This is the source of truth for which args each action accepts. The catalog
 * generates the `superdoc_perform_action` tool's advertised properties from the UNION of
 * these entries (see ACTION_ARG_PROPERTIES), so the schema can never drift from
 * what actions actually read. `Record<ActionName, …>` forces an entry for every
 * action at compile time.
 */
export const ACTION_ARGS: Record<ActionName, readonly string[]> = {
  insert_paragraphs: ['text', 'texts', 'headingLevel', 'placement', 'changeMode'],
  insert_heading: ['text', 'level', 'placement', 'changeMode'],
  replace_text: ['edits', 'selector', 'caseSensitive', 'changeMode'],
  delete_text: ['finds', 'selector', 'caseSensitive', 'changeMode'],
  append_list: ['items', 'kind', 'headingText', 'headingLevel', 'placement', 'changeMode'],
  create_table: ['rows', 'columns', 'cellTexts', 'placement', 'changeMode'],
  comment_paragraphs: ['commentText', 'scope', 'excludeBlockQuotes'],
  add_comments: ['commentText', 'selector', 'selectors'],
  resolve_comments: ['anchorText', 'reopen'],
  reply_to_comment: ['commentText', 'anchorText', 'commentId'],
  rewrite_block: ['text', 'selector', 'changeMode'],
  accept_tracked_changes: ['author', 'changeType'],
  reject_tracked_changes: ['author', 'changeType'],
  normalize_body_font_size: ['fontSize', 'changeMode'],
  set_font_family: ['fontFamily', 'selector', 'targetText', 'targetTexts', 'caseSensitive', 'changeMode'],
  apply_letter_spacing: ['selector', 'letterSpacing', 'changeMode'],
  fill_placeholders: ['values', 'fields', 'changeMode'],
  move_range: ['fromText', 'toText', 'afterText', 'beforeText', 'changeMode'],
  insert_toc: ['title', 'placement', 'changeMode'],
  insert_table_row: ['tableOrdinal', 'rowIndex', 'position', 'cellTexts', 'changeMode', 'dryRun'],
  insert_table_column: ['tableOrdinal', 'columnIndex', 'position', 'headerText', 'changeMode'],
  delete_table_row: ['tableOrdinal', 'rowIndex', 'changeMode'],
  delete_table_column: ['tableOrdinal', 'columnIndex', 'changeMode'],
  split_table: ['tableOrdinal', 'rowIndex', 'separatorText', 'changeMode'],
  convert_list: ['kind', 'fromMarker', 'toMarker', 'fromText', 'toText', 'listOrdinal', 'anchorText', 'changeMode'],
  split_list: ['anchorText', 'restartNumbering'],
  undo_changes: ['untilMarker', 'steps'],
  redo_changes: ['steps'],
  attach_numbering: ['likeMarker', 'nodeId', 'anchorText', 'changeMode'],
  add_list_items: ['anchorText', 'listOrdinal', 'entries', 'items', 'changeMode'],
  format_text: [
    'targetText',
    'targetTexts',
    'selector',
    'caseSensitive',
    'bold',
    'italic',
    'underline',
    'strike',
    'highlight',
    'color',
    'fontSize',
    'changeMode',
  ],
  apply_style: ['selector', 'styleId', 'headingLevel', 'likeText'],
  format_paragraph: ['selector', 'alignment', 'changeMode'],
  move_text: ['text', 'afterText', 'changeMode'],
  style_table: ['tableOrdinal', 'accentColor'],
  move_table: ['tableOrdinal', 'placement'],
  delete_table: ['tableOrdinal', 'changeMode'],
  set_paragraph_spacing: ['selector', 'lineSpacing', 'spaceBefore', 'spaceAfter'],
  insert_page_break: ['selector'],
  add_hyperlink: ['text', 'url', 'tooltip'],
};

export function isActionName(value: unknown): value is ActionName {
  return typeof value === 'string' && ACTION_NAMES.includes(value as ActionName);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function asString(value: unknown, fallback?: string): string | undefined {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback?: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function maybeMethod(obj: unknown, path: readonly string[]): ((...args: unknown[]) => Promise<unknown>) | null {
  let cursor: unknown = obj;
  for (const token of path) {
    // Function-shaped intermediates are legal: RPC/proxy document handles
    // (e.g. the browser doc-bridge) expose namespaces as callables.
    if (!cursor || (typeof cursor !== 'object' && typeof cursor !== 'function')) return null;
    cursor = (cursor as Record<string, unknown>)[token];
  }
  return typeof cursor === 'function' ? (cursor as (...args: unknown[]) => Promise<unknown>) : null;
}

function selectorToBlockTarget(
  selector: AgentSelector,
  snapshot: DocumentSnapshot,
): { nodeId: string; nodeType: string; text: string } | null {
  const matched = resolveSnapshotSelector(snapshot, selector);
  if (matched.length !== 1) return null;
  const nodeId = matched[0];
  const block = snapshot.blocks.find((b) => b.nodeId === nodeId);
  if (block) return { nodeId: block.nodeId, nodeType: block.nodeType, text: block.text };
  for (const table of snapshot.tables) {
    const cell = table.cells.find((entry) => entry.nodeId === nodeId);
    if (cell) {
      return { nodeId, nodeType: 'paragraph', text: cell.text };
    }
  }
  return null;
}

function snapshotDomainsForSelector(selector: AgentSelector): readonly SnapshotDomain[] {
  if (selector.kind === 'tableCell') {
    return ['blocks', 'tables'];
  }
  if (selector.kind === 'ordinal') {
    if (selector.ordinalKind === 'tableOrdinal') {
      return ['blocks', 'tables'];
    }
    if (selector.ordinalKind === 'sectionOrdinal') {
      return ['blocks', 'sections'];
    }
    if (selector.ordinalKind === 'listOrdinal') {
      return ['blocks', 'lists'];
    }
  }
  return ['blocks'];
}

function findSnapshotTextByNodeId(
  snapshot: DocumentSnapshot,
  nodeId: string,
): { nodeType: string; text: string } | null {
  const block = snapshot.blocks.find((entry) => entry.nodeId === nodeId);
  if (block) return { nodeType: block.nodeType, text: block.text };
  for (const table of snapshot.tables) {
    const cell = table.cells.find((entry) => entry.nodeId === nodeId);
    if (cell) return { nodeType: 'paragraph', text: cell.text };
  }
  return null;
}

function lastBlock(snapshot: DocumentSnapshot): { nodeId: string; nodeType: string } | null {
  const block = snapshot.blocks[snapshot.blocks.length - 1];
  return block ? { nodeId: block.nodeId, nodeType: block.nodeType } : null;
}

function createdBlockTarget(result: unknown): { nodeId: string; nodeType: string } | null {
  const rec = asRecord(result);
  const paragraph = asRecord(rec?.paragraph);
  if (typeof paragraph?.nodeId === 'string' && paragraph.nodeId.length > 0) {
    return { nodeId: paragraph.nodeId, nodeType: 'paragraph' };
  }
  const heading = asRecord(rec?.heading);
  if (typeof heading?.nodeId === 'string' && heading.nodeId.length > 0) {
    return { nodeId: heading.nodeId, nodeType: 'heading' };
  }
  return null;
}

function resolvePlacement(
  placement: ActionPlacement | undefined,
  snapshot: DocumentSnapshot,
):
  | { kind: 'documentEnd' }
  | { kind: 'documentStart' }
  | { kind: 'after'; target: { kind: 'block'; nodeType: string; nodeId: string } }
  | { kind: 'before'; target: { kind: 'block'; nodeType: string; nodeId: string } } {
  if (!placement || placement.at === 'document_end') return { kind: 'documentEnd' };
  if (placement.at === 'document_start') return { kind: 'documentStart' };
  const target = selectorToBlockTarget(placement.selector, snapshot);
  if (!target) {
    throw new SuperDocCliError('placement selector did not resolve to a unique body block', {
      code: 'INVALID_ARGUMENT',
      details: { placement },
    });
  }
  return {
    kind: placement.at === 'before' ? 'before' : 'after',
    target: { kind: 'block', nodeType: target.nodeType, nodeId: target.nodeId },
  };
}

function estimateInsertedTableOrdinal(
  snapshot: DocumentSnapshot,
  placement: ReturnType<typeof resolvePlacement>,
): number {
  if (placement.kind === 'documentStart') return 1;
  if (placement.kind === 'documentEnd') return snapshot.tables.length + 1;

  const targetBlock = snapshot.blocks.find((block) => block.nodeId === placement.target.nodeId);
  if (!targetBlock) return snapshot.tables.length + 1;

  if (placement.kind === 'after') {
    const tablesBeforeOrAt = snapshot.blocks.filter(
      (block) => block.nodeType === 'table' && block.ordinal <= targetBlock.ordinal,
    ).length;
    return tablesBeforeOrAt + 1;
  }

  const tablesBefore = snapshot.blocks.filter(
    (block) => block.nodeType === 'table' && block.ordinal < targetBlock.ordinal,
  ).length;
  return tablesBefore + 1;
}

type ExtractedTableBlock = {
  nodeId: string;
  type?: string;
  tableContext?: {
    tableOrdinal?: number;
    rowIndex?: number;
    columnIndex?: number;
    colspan?: number;
    rowspan?: number;
  };
};

type TableCellText = {
  rowIndex: number;
  columnIndex: number;
  text: string;
};

type ListItemTarget = {
  kind: 'block';
  nodeType: 'listItem';
  nodeId: string;
};

function emptyCounts(): DocumentSnapshot['counts'] {
  return {
    blocks: 0,
    paragraphs: 0,
    headings: 0,
    tables: 0,
    lists: 0,
    images: 0,
    comments: 0,
    trackedChanges: 0,
    sections: 0,
    fields: 0,
    hyperlinks: 0,
    bookmarks: 0,
    contentControls: 0,
    permissionRanges: 0,
    styles: 0,
    headers: 0,
    footers: 0,
  };
}

function countsFromInfoCounts(counts: Record<string, unknown> | null): DocumentSnapshot['counts'] {
  return {
    blocks: asNumber(counts?.blocks) ?? 0,
    paragraphs: asNumber(counts?.paragraphs) ?? 0,
    headings: asNumber(counts?.headings) ?? 0,
    tables: asNumber(counts?.tables) ?? 0,
    lists: asNumber(counts?.lists) ?? 0,
    images: asNumber(counts?.images) ?? 0,
    comments: asNumber(counts?.comments) ?? 0,
    trackedChanges: asNumber(counts?.trackedChanges) ?? 0,
    sections: asNumber(counts?.sections) ?? 0,
    fields: asNumber(counts?.fields) ?? 0,
    hyperlinks: asNumber(counts?.hyperlinks) ?? 0,
    bookmarks: asNumber(counts?.bookmarks) ?? 0,
    contentControls: asNumber(counts?.contentControls) ?? 0,
    permissionRanges: asNumber(counts?.permissionRanges) ?? 0,
    styles: asNumber(counts?.styles) ?? 0,
    headers: asNumber(counts?.headers) ?? 0,
    footers: asNumber(counts?.footers) ?? 0,
  };
}

function snapshotFromIdentity(identity: { revision: string; counts: DocumentSnapshot['counts'] }): DocumentSnapshot {
  return {
    revision: identity.revision,
    counts: identity.counts,
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
    diagnostics: [],
  };
}

async function readDocumentIdentity(
  doc: BoundDocApi,
): Promise<{ revision: string; counts: DocumentSnapshot['counts'] }> {
  const infoFn = maybeMethod(doc, ['info']);
  if (!infoFn) {
    return { revision: 'unknown', counts: emptyCounts() };
  }
  const infoRec = asRecord(await infoFn({}));
  return {
    revision: asString(infoRec?.revision, 'unknown') ?? 'unknown',
    counts: countsFromInfoCounts(asRecord(infoRec?.counts)),
  };
}

function revisionAfterOperation(result: unknown, fallbackRevision: string): string {
  return asString(asRecord(asRecord(result)?.revision)?.after, fallbackRevision) ?? fallbackRevision;
}

async function listAllBlocks(doc: BoundDocApi, includeText = false): Promise<SnapshotBlock[]> {
  const blocksFn = maybeMethod(doc, ['blocks', 'list']);
  if (!blocksFn) return [];

  const blocks: SnapshotBlock[] = [];
  const pageSize = 250;
  let offset = 0;
  while (true) {
    const raw = asRecord(
      await blocksFn(includeText ? { offset, limit: pageSize, includeText: true } : { offset, limit: pageSize }),
    );
    const rawBlocks = Array.isArray(raw?.blocks) ? raw.blocks : [];
    for (const block of rawBlocks) {
      const rec = asRecord(block);
      if (!rec) continue;
      blocks.push({
        // 1-based, same convention as the inspect snapshot (doc-api is 0-based).
        ordinal: (asNumber(rec.ordinal, blocks.length) ?? blocks.length) + 1,
        nodeId: asString(rec.nodeId, '') ?? '',
        nodeType: asString(rec.nodeType, 'paragraph') ?? 'paragraph',
        text: asString(rec.text, '') ?? '',
        textPreview: typeof rec.textPreview === 'string' ? rec.textPreview : null,
        styleId: typeof rec.styleId === 'string' ? rec.styleId : null,
        headingLevel: typeof rec.headingLevel === 'number' ? rec.headingLevel : undefined,
      });
    }
    const total = asNumber(raw?.total, blocks.length) ?? blocks.length;
    offset += rawBlocks.length;
    if (rawBlocks.length === 0 || offset >= total) return blocks;
  }
}

async function getTableShape(doc: BoundDocApi, nodeId: string): Promise<{ rows: number; columns: number } | null> {
  const getFn = maybeMethod(doc, ['tables', 'get']);
  if (!getFn) return null;
  const tableRec = asRecord(await getFn({ nodeId }));
  return {
    rows: asNumber(tableRec?.rows) ?? 0,
    columns: asNumber(tableRec?.columns) ?? 0,
  };
}

async function resolveTableContextQuick(
  doc: BoundDocApi,
  tableOrdinal: number | undefined,
): Promise<{ nodeId: string; ordinal: number; rows: number; columns: number } | null> {
  const blocks = await listAllBlocks(doc, false);
  const tableBlocks = blocks.filter((block) => block.nodeType === 'table');
  if (tableBlocks.length === 0) return null;

  const target =
    tableOrdinal == null
      ? tableBlocks.length === 1
        ? tableBlocks[0]!
        : null
      : (tableBlocks[tableOrdinal - 1] ?? null);
  if (!target) return null;

  const shape = await getTableShape(doc, target.nodeId);
  return {
    nodeId: target.nodeId,
    ordinal: tableOrdinal ?? 1,
    rows: shape?.rows ?? 0,
    columns: shape?.columns ?? 0,
  };
}

function revisionVerification(preRevision: string, postRevision: string, expectChanged: boolean): VerificationResult {
  return {
    check: { kind: expectChanged ? 'revision-changed' : 'revision-unchanged' },
    passed: expectChanged ? preRevision !== postRevision : preRevision === postRevision,
    detail: `pre=${preRevision} post=${postRevision}`,
  };
}

function failedReceipt(intent: string, err: unknown, preSnapshot?: DocumentSnapshot): AgentReceipt {
  const message = err instanceof Error ? err.message : String(err);
  return {
    status: 'failed',
    intent,
    preSnapshot: preSnapshot
      ? { revision: preSnapshot.revision, counts: preSnapshot.counts }
      : { revision: 'unknown', counts: emptyCounts() },
    selectedTargets: [],
    executedOperations: [],
    verification: [],
    errors: [{ code: 'ACTION_FAILED', message }],
  };
}

async function receiptFromWorkflowResult(
  doc: BoundDocApi,
  intent: string,
  pre: DocumentSnapshot,
  workflowResult: {
    receipt: {
      status: string;
      toolName: string;
      message: string;
      details?: Record<string, unknown>;
    };
    output?: Record<string, unknown>;
  },
  selectedTargets: readonly { selector: AgentSelector; matched: readonly string[] }[] = [],
  checks: readonly AgentVerificationCheck[] = [{ kind: 'revision-changed' }],
): Promise<AgentReceipt> {
  const workflowCode = asString(workflowResult.receipt.details?.code);
  if (workflowResult.receipt.status !== 'success') {
    return {
      status: 'failed',
      intent,
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      selectedTargets,
      executedOperations:
        workflowResult.output == null
          ? []
          : [{ operationId: `workflow.${workflowResult.receipt.toolName}`, result: workflowResult.output }],
      verification: [],
      errors: [
        {
          code: workflowCode ?? 'ACTION_FAILED',
          message: workflowResult.receipt.message,
        },
      ],
    };
  }

  const post = await buildDocumentSnapshot(doc);
  const verification = evaluateChecks(pre, post, checks);
  const summary = asString(asRecord(workflowResult.output?.verification)?.summary);
  return {
    status: verification.every((entry) => entry.passed) ? 'ok' : 'failed',
    intent,
    preSnapshot: { revision: pre.revision, counts: pre.counts },
    postSnapshot: { revision: post.revision, counts: post.counts },
    selectedTargets,
    executedOperations: [
      {
        operationId: `workflow.${workflowResult.receipt.toolName}`,
        rationale: summary,
        result: workflowResult.output?.execution ?? workflowResult.output,
      },
    ],
    verification,
  };
}

function buildFullBlockTextTarget(
  snapshot: DocumentSnapshot,
  blockId: string,
): { kind: 'text'; blockId: string; range: { start: number; end: number } } | null {
  const block = snapshot.blocks.find((entry) => entry.nodeId === blockId);
  if (!block) return null;
  return {
    kind: 'text',
    blockId,
    range: {
      start: 0,
      end: block.text.length,
    },
  };
}

function flattenCellTexts(cellTexts: ReadonlyArray<ReadonlyArray<string>> | undefined): TableCellText[] {
  if (!cellTexts) return [];
  const flattened: TableCellText[] = [];
  for (let rowIndex = 0; rowIndex < cellTexts.length; rowIndex += 1) {
    const row = cellTexts[rowIndex] ?? [];
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      flattened.push({
        rowIndex,
        columnIndex,
        text: row[columnIndex] ?? '',
      });
    }
  }
  return flattened;
}

function findExtractedCellBlock(
  blocks: readonly ExtractedTableBlock[],
  rowIndex: number,
  columnIndex: number,
): ExtractedTableBlock | undefined {
  return (
    blocks.find(
      (block) => block.tableContext?.rowIndex === rowIndex && block.tableContext?.columnIndex === columnIndex,
    ) ??
    blocks.find((block) => {
      const context = block.tableContext;
      if (context?.rowIndex == null || context.columnIndex == null) return false;
      const rowEnd = context.rowIndex + Math.max(1, context.rowspan ?? 1);
      const columnEnd = context.columnIndex + Math.max(1, context.colspan ?? 1);
      return (
        rowIndex >= context.rowIndex &&
        rowIndex < rowEnd &&
        columnIndex >= context.columnIndex &&
        columnIndex < columnEnd
      );
    })
  );
}

function evaluateChecks(
  pre: DocumentSnapshot,
  post: DocumentSnapshot,
  checks: readonly AgentVerificationCheck[],
): VerificationResult[] {
  const results: VerificationResult[] = [];
  for (const check of checks) {
    if (check.kind === 'block-count-delta') {
      const preCount = pre.blocks.filter((b) => b.nodeType === check.nodeType).length;
      const postCount = post.blocks.filter((b) => b.nodeType === check.nodeType).length;
      results.push({
        check,
        passed: postCount - preCount === check.delta,
        detail: `pre=${preCount} post=${postCount}`,
      });
    } else if (check.kind === 'comment-count-delta') {
      results.push({
        check,
        passed: post.comments.length - pre.comments.length === check.delta,
        detail: `pre=${pre.comments.length} post=${post.comments.length}`,
      });
    } else if (check.kind === 'tracked-change-count-delta') {
      results.push({
        check,
        passed: post.trackedChanges.length - pre.trackedChanges.length === check.delta,
        detail: `pre=${pre.trackedChanges.length} post=${post.trackedChanges.length}`,
      });
    } else if (check.kind === 'revision-changed') {
      results.push({
        check,
        passed: pre.revision !== post.revision,
        detail: `pre=${pre.revision} post=${post.revision}`,
      });
    } else if (check.kind === 'block-text-contains') {
      const block = post.blocks.find((b) => b.nodeId === check.nodeId);
      results.push({ check, passed: !!block && block.text.includes(check.text) });
    } else if (check.kind === 'table-shape') {
      const table = post.tables.find((t) => t.nodeId === check.nodeId);
      results.push({
        check,
        passed: !!table && table.rows === check.rows && table.columns === check.columns,
      });
    } else if (check.kind === 'list-item-count') {
      const list = check.listId == null ? post.lists[0] : post.lists.find((l) => l.listId === check.listId);
      results.push({ check, passed: !!list && list.items.length === check.expected });
    } else {
      // Unsupported check kind for actions: fail closed so we never
      // optimistically report success.
      results.push({ check, passed: false, detail: 'unsupported in action verification' });
    }
  }
  return results;
}

function preserveRewriteStyle(): {
  inline: { mode: 'preserve' };
  paragraph: { mode: 'preserve' };
} {
  return {
    inline: { mode: 'preserve' },
    paragraph: { mode: 'preserve' },
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceAllText(source: string, find: string, replace: string, caseSensitive: boolean): string {
  const flags = caseSensitive ? 'g' : 'gi';
  return source.replace(new RegExp(escapeRegExp(find), flags), replace);
}

function summarizeSkippedReplaceEdits(edits: readonly { find: string }[]): string | undefined {
  if (edits.length === 0) return undefined;
  const preview = edits
    .slice(0, 5)
    .map((edit) => JSON.stringify(edit.find))
    .join(', ');
  const suffix = edits.length > 5 ? `, and ${edits.length - 5} more` : '';
  return `Skipped ${edits.length} unmatched replacement edit(s): ${preview}${suffix}`;
}

function textIncludes(source: string, find: string, caseSensitive: boolean): boolean {
  if (caseSensitive) return source.includes(find);
  return source.toLocaleLowerCase().includes(find.toLocaleLowerCase());
}

function significantRewriteTokens(text: string): string[] {
  return text
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((token) => token.length >= 3);
}

function tokensPresentInOrder(haystack: string, tokens: readonly string[]): boolean {
  let offset = 0;
  const lowerHaystack = haystack.toLocaleLowerCase();
  for (const token of tokens) {
    const lowerToken = token.toLocaleLowerCase();
    const index = lowerHaystack.indexOf(lowerToken, offset);
    if (index < 0) return false;
    offset = index + lowerToken.length;
  }
  return true;
}

function verifyRewrittenBlockText(
  targetText: string,
  rewrittenText: string,
  changeMode: AgentChangeMode | undefined,
): boolean {
  if (changeMode === 'tracked') {
    return tokensPresentInOrder(targetText, significantRewriteTokens(rewrittenText));
  }
  return targetText.includes(rewrittenText);
}

function isUppercaseTitleLikeText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 120) return false;
  if (/[.?!]/.test(trimmed)) return false;
  const letters = [...trimmed].filter((char) => /\p{L}/u.test(char));
  if (letters.length === 0) return false;
  return letters.every((char) => char === char.toLocaleUpperCase());
}

function toDisplayTitleCase(text: string): string {
  return text.replace(/\p{L}+/gu, (word) =>
    word.length <= 3 ? word.toLocaleUpperCase() : `${word[0]!.toLocaleUpperCase()}${word.slice(1).toLocaleLowerCase()}`,
  );
}

function normalizeTitleLikeRewriteText(targetText: string, rewrittenText: string): string {
  if (!isUppercaseTitleLikeText(targetText)) return rewrittenText;
  const displayTitle = toDisplayTitleCase(targetText);
  if (rewrittenText.includes(displayTitle)) return rewrittenText;
  const lowerTarget = targetText.toLocaleLowerCase();
  const lowerRewrite = rewrittenText.toLocaleLowerCase();
  const index = lowerRewrite.indexOf(lowerTarget);
  if (index < 0) return rewrittenText;
  return `${rewrittenText.slice(0, index)}${displayTitle}${rewrittenText.slice(index + targetText.length)}`;
}

async function executeCreateParagraph(
  doc: BoundDocApi,
  text: string,
  placement: ReturnType<typeof resolvePlacement>,
  changeMode: AgentChangeMode | undefined,
): Promise<unknown> {
  const fn = maybeMethod(doc, ['create', 'paragraph']);
  if (!fn)
    throw new SuperDocCliError('doc.create.paragraph is not available on the document handle.', {
      code: 'TOOL_DISPATCH_NOT_FOUND',
    });
  const params: Record<string, unknown> = { text, at: placement };
  if (changeMode) params.changeMode = changeMode;
  // Dual dialect: the CLI-transport client reads changeMode from the INPUT
  // (encoded as --change-mode); the in-process DocumentApi (browser bridge,
  // CLI preset dispatch, Python core) reads it from the SECOND MutationOptions
  // arg and ignores the stray input key. Pass both so tracked inserts are
  // tracked on every host. Each side ignores the other's copy.
  return fn(params, changeMode ? { changeMode } : undefined);
}

async function executeCreateHeading(
  doc: BoundDocApi,
  text: string,
  level: number,
  placement: ReturnType<typeof resolvePlacement>,
  changeMode: AgentChangeMode | undefined,
): Promise<unknown> {
  const fn = maybeMethod(doc, ['create', 'heading']);
  if (!fn) {
    // Fall back to a paragraph when create.heading is not exposed
    return executeCreateParagraph(doc, text, placement, changeMode);
  }
  const params: Record<string, unknown> = { text, level, at: placement };
  if (changeMode) params.changeMode = changeMode;
  // Dual dialect — see executeCreateParagraph.
  return fn(params, changeMode ? { changeMode } : undefined);
}

async function executeMutations(
  doc: BoundDocApi,
  steps: ReadonlyArray<Record<string, unknown>>,
  changeMode: AgentChangeMode | undefined,
): Promise<unknown> {
  const fn = maybeMethod(doc, ['mutations', 'apply']);
  if (!fn)
    throw new SuperDocCliError('doc.mutations.apply is not available on the document handle.', {
      code: 'TOOL_DISPATCH_NOT_FOUND',
    });
  return fn({ atomic: true, changeMode: changeMode ?? 'direct', steps });
}

async function executeCreateTable(
  doc: BoundDocApi,
  args: CreateTableArgs,
  placement: ReturnType<typeof resolvePlacement>,
): Promise<unknown> {
  const fn = maybeMethod(doc, ['create', 'table']);
  if (!fn)
    throw new SuperDocCliError('doc.create.table is not available on the document handle.', {
      code: 'TOOL_DISPATCH_NOT_FOUND',
    });
  const params: Record<string, unknown> = {
    rows: args.rows,
    columns: args.columns,
    at: placement,
  };
  if (args.changeMode) params.changeMode = args.changeMode;
  // Dual dialect — see executeCreateParagraph.
  return fn(params, args.changeMode ? { changeMode: args.changeMode } : undefined);
}

async function executeCommentCreate(
  doc: BoundDocApi,
  snapshot: DocumentSnapshot,
  commentText: string,
  blockId: string,
): Promise<unknown> {
  const fn = maybeMethod(doc, ['comments', 'create']);
  if (!fn)
    throw new SuperDocCliError('doc.comments.create is not available on the document handle.', {
      code: 'TOOL_DISPATCH_NOT_FOUND',
    });
  const target = buildFullBlockTextTarget(snapshot, blockId);
  if (!target) {
    throw new SuperDocCliError('Unable to build a text target for the requested comment block.', {
      code: 'INVALID_ARGUMENT',
      details: { blockId },
    });
  }
  return fn({
    text: commentText,
    target,
  });
}

async function applyTableCellTexts(
  doc: BoundDocApi,
  tableNodeId: string,
  tableOrdinal: number,
  cellTexts: readonly TableCellText[],
  changeMode: AgentChangeMode | undefined,
): Promise<TableCellText[]> {
  const nonEmptyCells = cellTexts.filter((cell) => cell.text.trim().length > 0);
  if (nonEmptyCells.length === 0) return [];

  const extractFn = maybeMethod(doc, ['extract']);
  if (!extractFn) {
    throw new SuperDocCliError('doc.extract is required to populate table cell text.', {
      code: 'TOOL_DISPATCH_NOT_FOUND',
    });
  }

  const extracted = asRecord(await extractFn({}));
  const blocks = (Array.isArray(extracted?.blocks) ? extracted?.blocks : [])
    .map((block: unknown) => asRecord(block))
    .filter((block: Record<string, unknown> | null): block is Record<string, unknown> => block != null)
    .flatMap((block: Record<string, unknown>) => {
      const tableContext = asRecord(block.tableContext);
      if (asNumber(tableContext?.tableOrdinal, -1) !== tableOrdinal - 1) return [];
      const nodeId = asString(block.nodeId);
      if (!nodeId) return [];
      return [
        {
          nodeId,
          type: asString(block.type, 'paragraph'),
          tableContext: {
            tableOrdinal: asNumber(tableContext?.tableOrdinal),
            rowIndex: asNumber(tableContext?.rowIndex),
            columnIndex: asNumber(tableContext?.columnIndex),
            colspan: asNumber(tableContext?.colspan, 1),
            rowspan: asNumber(tableContext?.rowspan, 1),
          },
        } satisfies ExtractedTableBlock,
      ];
    });

  const steps = [];
  for (const cell of nonEmptyCells) {
    const block = findExtractedCellBlock(blocks, cell.rowIndex, cell.columnIndex);
    if (!block?.nodeId) {
      throw new SuperDocCliError('Unable to locate a paragraph block for the requested table cell.', {
        code: 'INVALID_ARGUMENT',
        details: {
          tableNodeId,
          rowIndex: cell.rowIndex,
          columnIndex: cell.columnIndex,
        },
      });
    }
    steps.push({
      id: `set-table-cell-${cell.rowIndex}-${cell.columnIndex}`,
      op: 'text.rewrite',
      where: {
        by: 'block',
        nodeType: block.type ?? 'paragraph',
        nodeId: block.nodeId,
      },
      args: {
        replacement: { text: cell.text },
      },
    });
  }

  if (steps.length === 0) return [];
  await executeMutations(doc, steps, changeMode);
  return nonEmptyCells;
}

async function runInsertParagraphs(doc: BoundDocApi, args: InsertParagraphsArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc, { includeDomains: ['blocks'] });
  try {
    // `texts` is the canonical input; a single `text` is normalized to one item
    // upstream in the dispatcher, but tolerate it here too.
    const texts = args.texts ?? (args.text ? [args.text] : []);
    const placement = resolvePlacement(args.placement, pre);
    const executedOperations: Array<{ operationId: string; result?: unknown; rationale?: string }> = [];
    // Blank-line spacing between drafted paragraphs is only desirable when
    // creating a NEW document (a blank doc has ~one empty block). Inserting into
    // an existing doc must NOT scatter blank paragraphs through it.
    const isNewDocument = (pre.counts?.blocks ?? 0) <= 1;
    // For the first item: respect the requested placement and headingLevel.
    // For subsequent items: append after the previously inserted block by
    // using `documentEnd` (the SDK keeps blocks contiguous) so order is
    // preserved.
    let currentPlacement = placement;
    let headingFirst = false;
    if (typeof args.headingLevel === 'number' && args.headingLevel >= 1 && args.headingLevel <= 6) {
      headingFirst = true;
    }
    // Advance the insertion point to sit right after the block just created
    // (prefer the receipt's created id; fall back to the document's last block).
    const advanceAfter = async (result: unknown): Promise<ReturnType<typeof resolvePlacement>> => {
      const created = createdBlockTarget(result);
      if (created) {
        return { kind: 'after', target: { kind: 'block', nodeType: created.nodeType, nodeId: created.nodeId } };
      }
      const mid = await buildDocumentSnapshot(doc, { includeDomains: ['blocks'] });
      const last = lastBlock(mid);
      return last
        ? { kind: 'after', target: { kind: 'block', nodeType: last.nodeType, nodeId: last.nodeId } }
        : { kind: 'documentEnd' };
    };
    for (let i = 0; i < texts.length; i += 1) {
      const text = texts[i]!;
      const isFirst = i === 0;
      const result =
        isFirst && headingFirst
          ? await executeCreateHeading(doc, text, args.headingLevel!, currentPlacement, args.changeMode)
          : await executeCreateParagraph(doc, text, currentPlacement, args.changeMode);
      executedOperations.push({
        operationId: isFirst && headingFirst ? 'doc.create.heading' : 'doc.create.paragraph',
        result,
      });
      currentPlacement = await advanceAfter(result);
      // New-document drafts get a blank paragraph after each item for spacing;
      // inserts into an existing document do not (would scatter blank lines).
      if (isNewDocument) {
        const spacer = await executeCreateParagraph(doc, '', currentPlacement, args.changeMode);
        executedOperations.push({ operationId: 'doc.create.paragraph', result: spacer, rationale: 'spacing' });
        currentPlacement = await advanceAfter(spacer);
      }
    }
    const postIdentity = await readDocumentIdentity(doc);
    const verification = [revisionVerification(pre.revision, postIdentity.revision, true)];
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: 'insert_paragraphs',
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: postIdentity,
      selectedTargets: [],
      executedOperations,
      verification,
    };
  } catch (err) {
    return failedReceipt('insert_paragraphs', err, pre);
  }
}

async function runInsertHeading(doc: BoundDocApi, args: InsertHeadingArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc, { includeDomains: ['blocks'] });
  try {
    const placement = resolvePlacement(args.placement, pre);
    const result = await executeCreateHeading(doc, args.text, args.level, placement, args.changeMode);
    const postIdentity = await readDocumentIdentity(doc);
    const verification = [revisionVerification(pre.revision, postIdentity.revision, true)];
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: `insert_heading: ${args.text.slice(0, 60)}`,
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: postIdentity,
      selectedTargets: [],
      executedOperations: [{ operationId: 'doc.create.heading', result }],
      verification,
    };
  } catch (err) {
    return failedReceipt('insert_heading', err, pre);
  }
}

async function runReplaceText(doc: BoundDocApi, args: ReplaceTextArgs): Promise<AgentReceipt> {
  const selectorDomains = args.selector ? snapshotDomainsForSelector(args.selector) : null;
  const requiresBlockSnapshot = args.selector != null || args.edits.length > 1;
  const preIdentity = requiresBlockSnapshot ? null : await readDocumentIdentity(doc);
  const pre = requiresBlockSnapshot
    ? await buildDocumentSnapshot(doc, { includeDomains: selectorDomains ?? ['blocks'] })
    : snapshotFromIdentity(preIdentity!);
  try {
    if (args.edits.length === 0) {
      return failedReceipt('replace_text', new Error('edits must be non-empty'), pre);
    }
    const caseSensitive = args.caseSensitive === true;
    const selectedTargets: Array<{ selector: AgentSelector; matched: readonly string[] }> = [];
    let skippedEdits: Array<{ find: string }> = [];
    let steps: Array<Record<string, unknown>>;

    if (args.selector) {
      const target = selectorToBlockTarget(args.selector, pre);
      if (!target) {
        return failedReceipt('replace_text', new Error('selector did not resolve to a unique body block'), pre);
      }
      let rewrittenText = target.text;
      for (const edit of args.edits) {
        if (!textIncludes(rewrittenText, edit.find, caseSensitive)) {
          return {
            status: 'failed',
            intent: 'replace_text',
            preSnapshot: { revision: pre.revision, counts: pre.counts },
            selectedTargets: [{ selector: args.selector, matched: [target.nodeId] }],
            executedOperations: [],
            verification: [],
            errors: [
              {
                code: 'ACTION_FAILED',
                message: `selected block does not contain ${JSON.stringify(edit.find)}`,
              },
            ],
          };
        }
        rewrittenText = replaceAllText(rewrittenText, edit.find, edit.replace, caseSensitive);
      }
      steps = [
        {
          id: 'replace-text-in-block-1',
          op: 'text.rewrite',
          where: { by: 'block', nodeType: target.nodeType, nodeId: target.nodeId },
          args: {
            replacement: { text: rewrittenText },
            style: preserveRewriteStyle(),
          },
        },
      ];
      selectedTargets.push({ selector: args.selector, matched: [target.nodeId] });
    } else {
      const matchingEdits =
        args.edits.length === 1
          ? args.edits
          : args.edits.filter((edit) => pre.blocks.some((block) => textIncludes(block.text, edit.find, caseSensitive)));
      skippedEdits = args.edits.filter((edit) => !matchingEdits.includes(edit));
      if (matchingEdits.length === 0) {
        return {
          status: 'failed',
          intent: 'replace_text',
          preSnapshot: { revision: pre.revision, counts: pre.counts },
          selectedTargets: [],
          executedOperations: [],
          verification: [],
          errors: [
            {
              code: 'ACTION_FAILED',
              message: 'none of the requested text replacements matched the current document',
            },
          ],
        };
      }
      steps = matchingEdits.map((edit, index) => ({
        id: `replace-${index + 1}`,
        op: 'text.rewrite',
        where: {
          by: 'select',
          select: {
            type: 'text',
            pattern: edit.find,
            mode: 'contains',
            caseSensitive,
          },
          require: 'all',
        },
        args: {
          replacement: { text: edit.replace },
          style: preserveRewriteStyle(),
        },
      }));
    }

    const result = await executeMutations(doc, steps, args.changeMode);
    if (args.selector && selectedTargets[0]) {
      const post = await buildDocumentSnapshot(doc, { includeDomains: selectorDomains ?? ['blocks'] });
      const blockId = selectedTargets[0]!.matched[0]!;
      const postTarget = findSnapshotTextByNodeId(post, blockId);
      const preTarget = findSnapshotTextByNodeId(pre, blockId);
      const finalText = postTarget?.text ?? '';
      const expectedText = args.edits.reduce(
        (current, edit) => replaceAllText(current, edit.find, edit.replace, caseSensitive),
        preTarget?.text ?? '',
      );
      const verification = [
        {
          check: { kind: 'revision-changed' } satisfies AgentVerificationCheck,
          passed: pre.revision !== post.revision,
          detail: `pre=${pre.revision} post=${post.revision}`,
        },
        {
          check: {
            kind: 'block-text-contains',
            nodeId: blockId,
            text: expectedText,
          } satisfies AgentVerificationCheck,
          passed: !!postTarget && verifyRewrittenBlockText(finalText, expectedText, args.changeMode),
        },
      ];
      return {
        status: verification.every((v) => v.passed) ? 'ok' : 'failed',
        intent: 'replace_text',
        preSnapshot: { revision: pre.revision, counts: pre.counts },
        postSnapshot: { revision: post.revision, counts: post.counts },
        selectedTargets,
        executedOperations: [{ operationId: 'doc.mutations.apply', result }],
        verification,
      };
    }

    const postIdentity =
      args.changeMode === 'tracked'
        ? await readDocumentIdentity(doc)
        : {
            revision: revisionAfterOperation(result, pre.revision),
            counts: pre.counts,
          };
    const verification = [revisionVerification(pre.revision, postIdentity.revision, true)];
    const skippedEditRationale =
      args.selector == null && args.edits.length > 1 ? summarizeSkippedReplaceEdits(skippedEdits) : undefined;
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: 'replace_text',
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: postIdentity,
      selectedTargets,
      executedOperations: [
        {
          operationId: 'doc.mutations.apply',
          ...(skippedEditRationale ? { rationale: skippedEditRationale } : {}),
          result,
        },
      ],
      verification,
    };
  } catch (err) {
    return failedReceipt('replace_text', err, pre);
  }
}

async function runDeleteText(doc: BoundDocApi, args: DeleteTextArgs): Promise<AgentReceipt> {
  const caseSensitive = args.caseSensitive === true;

  // Scoped form: delete finds within ONE block (mirrors replace_text's selector
  // path). Rewriting the block minus the finds keeps the deletion local — without
  // this a short/whitespace find matches document-wide and blows the target cap.
  if (args.selector) {
    const scopedPre = await buildDocumentSnapshot(doc, { includeDomains: snapshotDomainsForSelector(args.selector) });
    try {
      if (args.finds.length === 0) {
        return failedReceipt('delete_text', new Error('finds must be non-empty'), scopedPre);
      }
      const target = selectorToBlockTarget(args.selector, scopedPre);
      if (!target) {
        return failedReceipt('delete_text', new Error('selector did not resolve to a unique body block'), scopedPre);
      }
      let rewritten = target.text;
      const missing: string[] = [];
      for (const find of args.finds) {
        if (!textIncludes(rewritten, find, caseSensitive)) {
          missing.push(find);
          continue;
        }
        rewritten = replaceAllText(rewritten, find, '', caseSensitive);
      }
      if (rewritten === target.text) {
        return {
          status: 'failed',
          intent: 'delete_text',
          preSnapshot: { revision: scopedPre.revision, counts: scopedPre.counts },
          selectedTargets: [{ selector: args.selector, matched: [target.nodeId] }],
          executedOperations: [],
          verification: [],
          errors: [
            {
              code: 'ACTION_FAILED',
              message: `selected block does not contain ${missing.map((m) => JSON.stringify(m)).join(', ')}`,
              recovery: { kind: 'reinspect' },
            },
          ],
        };
      }
      const scopedSteps = [
        {
          id: 'delete-text-in-block-1',
          op: 'text.rewrite',
          where: { by: 'block', nodeType: target.nodeType, nodeId: target.nodeId },
          args: { replacement: { text: rewritten }, style: preserveRewriteStyle() },
        },
      ];
      const scopedResult = await executeMutations(doc, scopedSteps, args.changeMode);
      const scopedPost = await buildDocumentSnapshot(doc, { includeDomains: ['blocks'] });
      const verification = evaluateChecks(scopedPre, scopedPost, [{ kind: 'revision-changed' }]);
      return {
        status: verification.every((v) => v.passed) ? 'ok' : 'failed',
        intent: 'delete_text',
        ...(missing.length
          ? { note: `not found in the selected block: ${missing.map((m) => JSON.stringify(m)).join(', ')}` }
          : {}),
        preSnapshot: { revision: scopedPre.revision, counts: scopedPre.counts },
        postSnapshot: { revision: scopedPost.revision, counts: scopedPost.counts },
        selectedTargets: [{ selector: args.selector, matched: [target.nodeId] }],
        executedOperations: [{ operationId: 'doc.mutations.apply', result: scopedResult }],
        verification,
      };
    } catch (err) {
      return failedReceipt('delete_text', err, scopedPre);
    }
  }

  const preIdentity = await readDocumentIdentity(doc);
  const pre = snapshotFromIdentity(preIdentity);
  try {
    if (args.finds.length === 0) {
      return failedReceipt('delete_text', new Error('finds must be non-empty'), pre);
    }
    // Guard the exact footgun that motivated the selector: an unscoped
    // whitespace-only find matches every space in the document and trips the
    // plan's target cap. Require a selector to remove stray whitespace.
    const degenerate = args.finds.find((f) => typeof f === 'string' && f.trim().length === 0);
    if (degenerate !== undefined) {
      return {
        status: 'failed',
        intent: 'delete_text',
        preSnapshot: preIdentity,
        selectedTargets: [],
        executedOperations: [],
        verification: [],
        errors: [
          {
            code: 'INVALID_ARGUMENT',
            message: `refusing to delete a whitespace-only find (${JSON.stringify(degenerate)}) document-wide — pass a selector to scope it to one block.`,
            recovery: { kind: 'reinspect' },
          },
        ],
      };
    }
    const steps = args.finds.map((find, index) => ({
      id: `delete-${index + 1}`,
      op: 'text.delete',
      where: {
        by: 'select',
        select: {
          type: 'text',
          pattern: find,
          mode: 'contains',
          caseSensitive: args.caseSensitive === true,
        },
        require: 'all',
      },
      args: {},
    }));
    const result = await executeMutations(doc, steps, args.changeMode);
    const revision = asRecord(asRecord(result)?.revision);
    const postIdentity =
      args.changeMode === 'tracked'
        ? await readDocumentIdentity(doc)
        : {
            revision: asString(revision?.after, preIdentity.revision) ?? preIdentity.revision,
            counts: preIdentity.counts,
          };
    const verification = [revisionVerification(preIdentity.revision, postIdentity.revision, true)];
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: 'delete_text',
      preSnapshot: preIdentity,
      postSnapshot: postIdentity,
      selectedTargets: [],
      executedOperations: [{ operationId: 'doc.mutations.apply', result }],
      verification,
    };
  } catch (err) {
    return failedReceipt('delete_text', err, pre);
  }
}

async function runAppendList(doc: BoundDocApi, args: AppendListArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    if (args.items.length === 0) {
      return failedReceipt('append_list', new Error('items must be non-empty'), pre);
    }
    const workflowResult = await runSuperdocListTransformWorkflow({
      documentHandle: doc,
      args: {
        action: 'append_new_list',
        items: [...args.items],
        kind: args.kind ?? 'ordered',
        headingText: args.headingText,
        headingLevel: args.headingLevel,
        changeMode: args.changeMode,
      },
    });
    return receiptFromWorkflowResult(doc, 'append_list', pre, workflowResult);
  } catch (err) {
    return failedReceipt('append_list', err, pre);
  }
}

// Workflow/ordinal insertion path for add_list_items (was the standalone
// insert_list_items action). Inserts into a list identified by listOrdinal via
// the shared list-transform workflow.
async function runInsertListItems(doc: BoundDocApi, args: InsertListItemsArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    if (args.items.length === 0) {
      return failedReceipt('add_list_items', new Error('items must be non-empty'), pre);
    }
    const workflowResult = await runSuperdocListTransformWorkflow({
      documentHandle: doc,
      args: {
        action: 'insert_many',
        items: [...args.items],
        target:
          args.listOrdinal == null
            ? undefined
            : {
                by: 'listOrdinal',
                value: args.listOrdinal,
              },
        changeMode: args.changeMode,
      },
    });
    return receiptFromWorkflowResult(doc, 'add_list_items', pre, workflowResult);
  } catch (err) {
    return failedReceipt('add_list_items', err, pre);
  }
}

/**
 * add_list_items — append items (including nested sub-items) into an EXISTING
 * list, reusing its numbering definition + markers. THE way to "add X to the
 * list with Y and Z under it": each entry is created as a paragraph after the
 * anchor and attached to the anchor's list at `anchorLevel + entry.level`, so a
 * level-0 entry matches the anchor's bullets and level-1 entries nest as
 * sub-items. Unlike append_list (which starts a brand-new list), this keeps the
 * existing list's marker style and level scheme.
 */
async function runAddListItems(
  doc: BoundDocApi,
  args: AddListItemsArgs,
  opts?: { fallbackOnMissing?: boolean },
): Promise<AgentReceipt>;
async function runAddListItems(
  doc: BoundDocApi,
  args: AddListItemsArgs,
  opts: { fallbackOnMissing: true },
): Promise<AgentReceipt | null>;
async function runAddListItems(
  doc: BoundDocApi,
  args: AddListItemsArgs,
  opts?: { fallbackOnMissing?: boolean },
): Promise<AgentReceipt | null> {
  const pre = await buildDocumentSnapshot(doc, { includeDomains: ['blocks'] });
  try {
    const needle = args.anchorText?.trim();
    if (!needle) return failedReceipt('add_list_items', new Error('anchorText is required'), pre);
    if (!args.entries || args.entries.length === 0) {
      return failedReceipt('add_list_items', new Error('entries must be non-empty'), pre);
    }

    const rows = await listBlockRows(doc);
    // The list to extend: a numbered/bulleted item whose text matches anchorText.
    const anchor = rows.find(
      (r) => blockNumbering(r) && (r.textPreview ?? '').toLowerCase().includes(needle.toLowerCase()),
    );
    if (!anchor || !anchor.nodeId) {
      // The caller can retry via the ghost/ordinal path (imported list-looking
      // paragraphs carry no numbering, so no NUMBERED anchor matches here).
      if (opts?.fallbackOnMissing) return null;
      return {
        status: 'failed',
        intent: 'add_list_items',
        errors: [
          {
            code: 'TARGET_NOT_FOUND',
            message: `no existing list item contains ${JSON.stringify(args.anchorText)}. anchorText must be text inside an item of the list to extend.`,
            recovery: { kind: 'reinspect' },
          },
        ],
      };
    }
    const anchorPath = blockNumbering(anchor)?.path;
    const anchorLevel = Array.isArray(anchorPath) ? Math.max(0, anchorPath.length - 1) : 0;

    // Place new items AFTER the anchor's whole sub-tree — every following item
    // whose numbering PATH is nested under the anchor's path (e.g. [12] ⊂ [12,4]).
    // Match by path prefix, not merely "deeper level", and SKIP interleaved
    // non-numbered paragraphs (list-item continuations) rather than stopping at
    // them — real lists wrap sub-items across plain paragraphs. Stop at the first
    // numbered item that is NOT a descendant (a sibling/ancestor, or a different
    // list). Without this, a new same-level item wedges in among the anchor's
    // children and steals the ones after it. No descendants → the anchor itself.
    let subtreeEnd = anchor;
    const anchorPathArr = Array.isArray(anchorPath) ? anchorPath : null;
    const anchorIdx = rows.findIndex((r) => r.nodeId === anchor.nodeId);
    if (anchorPathArr && anchorIdx >= 0) {
      const isDescendant = (p: number[] | null | undefined): boolean =>
        Array.isArray(p) && p.length > anchorPathArr.length && anchorPathArr.every((v, k) => p[k] === v);
      for (let i = anchorIdx + 1; i < rows.length; i += 1) {
        const p = blockNumbering(rows[i])?.path;
        if (isDescendant(p)) {
          subtreeEnd = rows[i]; // a nested child/grandchild of the anchor
        } else if (Array.isArray(p)) {
          break; // a numbered item that is NOT a descendant → sub-tree ended
        }
        // else: non-numbered paragraph (a continuation) — skip and keep scanning
      }
    }

    const attachFn = maybeMethod(doc, ['lists', 'attach']);
    if (!attachFn) {
      throw new SuperDocCliError('doc.lists.attach is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }

    const executed: Array<{ operationId: string; result?: unknown; rationale?: string }> = [];
    let placement: ReturnType<typeof resolvePlacement> = {
      kind: 'after',
      target: {
        kind: 'block',
        nodeType: subtreeEnd.nodeType ?? 'listItem',
        nodeId: subtreeEnd.nodeId ?? anchor.nodeId,
      },
    };
    const createdItems: Array<{ nodeId: string; targetLevel: number; text: string }> = [];
    for (const entry of args.entries) {
      const text = typeof entry?.text === 'string' ? entry.text : '';
      // `level` is RELATIVE to the anchor and MAY BE NEGATIVE: positive nests
      // deeper, 0 = same level as the anchor, negative promotes toward the top
      // (e.g. anchor on a sub-item, level:-1 → a top-level sibling). The final
      // outline level is clamped at 0 (can't go above the root).
      const rel = typeof entry?.level === 'number' ? Math.floor(entry.level) : 0;
      const targetLevel = Math.max(0, anchorLevel + rel);
      const created = await executeCreateParagraph(doc, text, placement, args.changeMode);
      const target = createdBlockTarget(created);
      executed.push({ operationId: 'doc.create.paragraph', result: created });
      if (!target) continue;
      // changeMode is a MutationOption — pass it in the second options arg, not
      // the input (lists.attach reads options.changeMode; input.changeMode is ignored).
      const attachResult = await attachFn(
        {
          target: { kind: 'block', nodeType: 'paragraph', nodeId: target.nodeId },
          attachTo: { kind: 'block', nodeType: 'listItem', nodeId: anchor.nodeId },
          level: targetLevel,
          // Dual dialect — see executeCreateParagraph.
          ...(args.changeMode ? { changeMode: args.changeMode } : {}),
        },
        args.changeMode ? { changeMode: args.changeMode } : undefined,
      );
      executed.push({
        operationId: 'doc.lists.attach',
        result: compactOpResult(attachResult),
        rationale: `level ${targetLevel}`,
      });
      createdItems.push({ nodeId: target.nodeId, targetLevel, text });
      // After attach the block is a listItem (same nodeId) — the next placement
      // must address it as such or the create resolver rejects the anchor.
      placement = { kind: 'after', target: { kind: 'block', nodeType: 'listItem', nodeId: target.nodeId } };
    }

    // Report WHERE each item actually landed (rendered marker + outline level),
    // so the caller can trust the result instead of re-deriving it and undoing
    // correct work when the level looked ambiguous.
    let landed: Array<{ marker: string | null; level: number }> = [];
    let afterRows: BlockRow[] = [];
    try {
      afterRows = await listBlockRows(doc);
      landed = createdItems.map((ci) => {
        const row = afterRows.find((r) => r.nodeId === ci.nodeId);
        const num = row ? blockNumbering(row) : null;
        const p = num?.path;
        return { marker: num?.marker ?? null, level: Array.isArray(p) ? Math.max(0, p.length - 1) : ci.targetLevel };
      });
    } catch {
      // best-effort read-back; the mutation already applied
    }

    // Match the anchor item's inline look (font/size/bold/colour) onto each new
    // item, so a list extended from styled items keeps that styling — the same
    // neighbour-formatting polish insert_paragraphs/insert_heading receive, except
    // the anchor IS the explicit reference here. Best-effort: a format.apply
    // failure must NEVER fail an otherwise-landed add, so the items still exist.
    let formattingMatched: Record<string, unknown> = { skipped: 'anchor had no inline look' };
    try {
      const inline = inlineLookFromRow(anchor);
      const formatFn = maybeMethod(doc, ['format', 'apply']);
      if (Object.keys(inline).length > 0 && formatFn) {
        for (const ci of createdItems) {
          const row = afterRows.find((r) => r.nodeId === ci.nodeId);
          const len = (row?.textPreview ?? ci.text ?? '').length;
          const params: Record<string, unknown> = {
            blockId: ci.nodeId,
            start: 0,
            end: Math.max(len, 1),
            inline,
          };
          // Mirror scoped delete_text/format_text: changeMode is a MutationOption
          // passed inside the format.apply params, only when tracking is on.
          if (args.changeMode === 'tracked') params.changeMode = args.changeMode;
          await formatFn(params);
        }
        formattingMatched = inline;
      }
    } catch (err) {
      formattingMatched = { skipped: err instanceof Error ? err.message : String(err) };
    }

    const postIdentity = await readDocumentIdentity(doc);
    const verification = [revisionVerification(pre.revision, postIdentity.revision, true)];
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: `add_list_items: ${args.entries.length} into list @ ${anchor.nodeId}`,
      ...(landed.length
        ? {
            note: `landed at ${landed
              .map((l) => (l.marker ? `${l.marker} (level ${l.level})` : `level ${l.level}`))
              .join(', ')}`,
            addedItems: landed,
          }
        : {}),
      formattingMatched,
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: postIdentity,
      selectedTargets: [{ selector: { kind: 'textSearch', terms: [needle] }, matched: [anchor.nodeId] }],
      executedOperations: executed,
      verification,
    };
  } catch (err) {
    return failedReceipt('add_list_items', err, pre);
  }
}

/**
 * split_list — split one list into two at a target item, restarting the new
 * half's numbering (default). Thin wrapper over doc.lists.split (separate +
 * setValue). The split point is the item that should START the second list,
 * located by anchorText. Direct-only: lists.split rejects tracked mode.
 */
async function runSplitList(doc: BoundDocApi, args: SplitListArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc, { includeDomains: ['blocks', 'lists'] });
  try {
    const needle = args.anchorText?.trim();
    if (!needle) return failedReceipt('split_list', new Error('anchorText is required'), pre);

    const rows = await listBlockRows(doc);
    // The item that begins the new (second) list: a numbered item matching anchorText.
    const target = rows.find(
      (r) => blockNumbering(r) && (r.textPreview ?? '').toLowerCase().includes(needle.toLowerCase()),
    );
    if (!target || !target.nodeId) {
      return {
        status: 'failed',
        intent: 'split_list',
        errors: [
          {
            code: 'TARGET_NOT_FOUND',
            message: `no list item contains ${JSON.stringify(args.anchorText)}. anchorText must be text inside the item that should START the new list.`,
            recovery: { kind: 'reinspect' },
          },
        ],
      };
    }

    const splitFn = maybeMethod(doc, ['lists', 'split']);
    if (!splitFn) {
      throw new SuperDocCliError('doc.lists.split is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }
    const restartNumbering = args.restartNumbering !== false;
    const result = await splitFn({
      target: { kind: 'block', nodeType: 'listItem', nodeId: target.nodeId },
      restartNumbering,
    });

    const post = await buildDocumentSnapshot(doc, { includeDomains: ['blocks', 'lists'] });
    const verification = evaluateChecks(pre, post, [{ kind: 'revision-changed' }]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: `split_list @ ${target.nodeId}${restartNumbering ? ' (restart at 1)' : ''}`,
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [{ selector: { kind: 'textSearch', terms: [needle] }, matched: [target.nodeId] }],
      executedOperations: [{ operationId: 'doc.lists.split', result: compactOpResult(result) }],
      verification,
    };
  } catch (err) {
    return failedReceipt('split_list', err, pre);
  }
}

async function runCreateTable(doc: BoundDocApi, args: CreateTableArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    if (!Number.isInteger(args.rows) || args.rows < 1 || !Number.isInteger(args.columns) || args.columns < 1) {
      return failedReceipt('create_table', new Error('rows and columns must be positive integers'), pre);
    }
    const placement = resolvePlacement(args.placement, pre);
    const insertedTableOrdinal = estimateInsertedTableOrdinal(pre, placement);
    const result = await executeCreateTable(doc, args, placement);
    const executedOperations: Array<{ operationId: string; result?: unknown; rationale?: string }> = [
      { operationId: 'doc.create.table', result },
    ];
    const createdTableNodeId = asString(asRecord(asRecord(result)?.table)?.nodeId);
    if (createdTableNodeId && args.cellTexts) {
      const appliedCells = await applyTableCellTexts(
        doc,
        createdTableNodeId,
        insertedTableOrdinal,
        flattenCellTexts(args.cellTexts),
        args.changeMode,
      );
      if (appliedCells.length > 0) {
        executedOperations.push({
          operationId: 'doc.mutations.apply',
          rationale: `Populated ${appliedCells.length} table cells.`,
        });
      }
    }
    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [
      { kind: 'revision-changed' },
      { kind: 'block-count-delta', nodeType: 'table', delta: 1 },
    ]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: 'create_table',
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [],
      executedOperations,
      verification,
    };
  } catch (err) {
    return failedReceipt('create_table', err, pre);
  }
}

async function runCommentParagraphs(doc: BoundDocApi, args: CommentParagraphsArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    const blocks = pre.blocks.filter((b) => {
      if (args.scope === 'all') {
        if (b.nodeType !== 'paragraph' && b.nodeType !== 'heading') return false;
      } else if (b.nodeType !== 'paragraph') {
        return false;
      }
      if (b.text.trim().length === 0) return false;
      if (args.excludeBlockQuotes && /(blockquote|intensequote|quote)/i.test(b.styleId ?? '')) return false;
      return true;
    });
    if (blocks.length === 0) {
      return failedReceipt('comment_paragraphs', new Error('no eligible body paragraphs to comment'), pre);
    }
    const executed: Array<{ operationId: string; result?: unknown }> = [];
    for (const block of blocks) {
      const result = await executeCommentCreate(doc, pre, args.commentText, block.nodeId);
      executed.push({ operationId: 'doc.comments.create', result });
    }
    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [{ kind: 'comment-count-delta', delta: blocks.length }]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: 'comment_paragraphs',
      note: `the SAME comment text was applied to all ${blocks.length} paragraphs. If the user wanted passage-specific feedback, this is not it — use add_comments per block with distinct text.`,
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [],
      executedOperations: executed,
      verification,
    };
  } catch (err) {
    return failedReceipt('comment_paragraphs', err, pre);
  }
}

async function runAddComments(doc: BoundDocApi, args: AddCommentsArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    // Batch form: `selectors` comments many blocks in ONE action call so the
    // model never fans out N concurrent add_comments tool calls (which race the
    // shared document and the comment-count verification). A single `selector`
    // is the one-target shorthand. Comments are applied sequentially.
    const selectorList = args.selectors?.length ? args.selectors : args.selector ? [args.selector] : [];
    if (!selectorList.length) {
      return failedReceipt(
        'add_comments',
        new Error('add_comments requires a "selector" or a non-empty "selectors" array'),
        pre,
      );
    }

    const resolved: Array<{ selector: AgentSelector; nodeId: string }> = [];
    const unresolved: AgentSelector[] = [];
    for (const sel of selectorList) {
      const target = selectorToBlockTarget(sel, pre);
      if (target) resolved.push({ selector: sel, nodeId: target.nodeId });
      else unresolved.push(sel);
    }
    if (!resolved.length) {
      return failedReceipt('add_comments', new Error('no selector resolved to a body block'), pre);
    }

    const executed: Array<{ operationId: string; result?: unknown }> = [];
    for (const { commentText, nodeId } of resolved.map((r) => ({ commentText: args.commentText, nodeId: r.nodeId }))) {
      const result = await executeCommentCreate(doc, pre, commentText, nodeId);
      executed.push({ operationId: 'doc.comments.create', result });
    }
    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [{ kind: 'comment-count-delta', delta: resolved.length }]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: 'add_comments',
      ...(unresolved.length
        ? { note: `${unresolved.length} selector(s) did not resolve to a block and were skipped` }
        : {}),
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: resolved.map((r) => ({ selector: r.selector, matched: [r.nodeId] })),
      executedOperations: executed,
      verification,
    };
  } catch (err) {
    return failedReceipt('add_comments', err, pre);
  }
}

export type ResolveCommentsArgs = {
  action: 'resolve_comments';
  /** Resolve only comments anchored on text containing this; omit to resolve all. */
  anchorText?: string;
  /** Reopen (status → active) instead of resolve. */
  reopen?: boolean;
};

/**
 * resolve_comments — resolve (or reopen) comments. With no anchorText, resolves
 * every open comment; with anchorText, only comments anchored on / mentioning
 * that text. THE way to "resolve the comments" without superdoc_execute_code.
 */
async function runResolveComments(doc: BoundDocApi, args: ResolveCommentsArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc, { includeDomains: ['comments'] });
  try {
    const patchFn = maybeMethod(doc, ['comments', 'patch']);
    if (!patchFn) {
      throw new SuperDocCliError('doc.comments.patch is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }
    const reopen = args.reopen === true;
    const targetState = reopen ? 'resolved' : 'open';
    const newStatus = reopen ? 'active' : 'resolved';
    const needle = args.anchorText?.trim().toLowerCase();

    const matches = pre.comments.filter((c) => {
      // Only flip comments not already in the desired end state.
      if (reopen ? c.status !== 'resolved' : c.status === 'resolved') return false;
      if (!needle) return true;
      const hay = `${c.anchoredText ?? ''} ${c.text ?? ''}`.toLowerCase();
      return hay.includes(needle);
    });

    if (matches.length === 0) {
      const post = await buildDocumentSnapshot(doc, { includeDomains: ['comments'] });
      return {
        status: 'ok',
        intent: 'resolve_comments',
        preSnapshot: { revision: pre.revision, counts: pre.counts },
        postSnapshot: { revision: post.revision, counts: post.counts },
        selectedTargets: [],
        executedOperations: [
          {
            operationId: 'doc.comments.list',
            rationale: `no ${targetState} comments${needle ? ` matching ${JSON.stringify(args.anchorText)}` : ''} to ${reopen ? 'reopen' : 'resolve'}`,
          },
        ],
        verification: [
          {
            check: { kind: 'comment-status-delta', delta: 0 } as unknown as AgentVerificationCheck,
            passed: true,
            detail: 'no-op',
          },
        ],
      };
    }

    const executed: Array<{ operationId: string; result?: unknown }> = [];
    for (const c of matches) {
      if (!c.id) continue;
      // The patch identifier field name has drifted across hosts (browser uses
      // `commentId`, some CLI builds use `id`). Try the canonical `commentId`
      // first, fall back to `id` so the action works against either host.
      let result: unknown;
      try {
        result = await patchFn({ commentId: c.id, status: newStatus });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/unknown field|commentId/i.test(msg)) {
          result = await patchFn({ id: c.id, status: newStatus });
        } else {
          throw e;
        }
      }
      executed.push({ operationId: 'doc.comments.patch', result: compactOpResult(result) });
    }
    const post = await buildDocumentSnapshot(doc, { includeDomains: ['comments'] });
    return {
      status: 'ok',
      intent: `resolve_comments: ${reopen ? 'reopened' : 'resolved'} ${matches.length}`,
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: matches.map((c) => ({
        selector: { kind: 'entity', entityType: 'comment', entityId: c.id } as AgentSelector,
        matched: [c.id],
      })),
      executedOperations: executed,
      verification: [
        {
          check: { kind: 'comment-status-delta', delta: matches.length } as unknown as AgentVerificationCheck,
          passed: true,
        },
      ],
    };
  } catch (err) {
    return failedReceipt('resolve_comments', err, pre);
  }
}

/**
 * reply_to_comment — add a threaded reply to an existing comment. The parent is
 * located by explicit commentId or, more commonly, by anchorText (text the
 * comment is anchored on / mentions, like resolve_comments). THE way to
 * "reply to the comment about X" without superdoc_execute_code.
 */
async function runReplyToComment(doc: BoundDocApi, args: ReplyToCommentArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc, { includeDomains: ['comments'] });
  try {
    const wantedId = args.commentId?.trim();
    const needle = args.anchorText?.trim().toLowerCase();

    // Prefer an explicit id; otherwise match anchoredText/body and favour open
    // threads (you usually reply to an unresolved comment).
    let parent = wantedId ? pre.comments.find((c) => c.id === wantedId) : undefined;
    if (!parent && needle) {
      const matches = pre.comments.filter((c) =>
        `${c.anchoredText ?? ''} ${c.text ?? ''}`.toLowerCase().includes(needle),
      );
      parent = matches.find((c) => c.status !== 'resolved') ?? matches[0];
    }
    if (!parent || !parent.id) {
      return {
        status: 'failed',
        intent: 'reply_to_comment',
        errors: [
          {
            code: 'TARGET_NOT_FOUND',
            message: wantedId
              ? `no comment with id ${JSON.stringify(args.commentId)} — inspect comments and pass a valid id.`
              : `no comment anchored on / mentioning ${JSON.stringify(args.anchorText)} — inspect comments and pass the exact anchored text.`,
            recovery: { kind: 'reinspect' },
          },
        ],
      };
    }

    // A reply is a comment created WITH parentCommentId — the document API's
    // comments namespace exposes `create` (which threads a reply when
    // parentCommentId is given), NOT a separate `reply` op. create still
    // requires a target, so anchor the reply on the parent's own span (from its
    // snapshot segments) — the reply threads on the same anchor as its parent.
    const createFn = maybeMethod(doc, ['comments', 'create']);
    if (!createFn) {
      throw new SuperDocCliError('doc.comments.create is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }
    // A reply must NOT carry a target — the comments engine rejects
    // "parentCommentId with target" outright; the thread inherits the
    // parent's anchor. Threading key is dual-dialect: the contract/transport
    // param is `parentId` (the CLI reverses it to parentCommentId after
    // parsing), while in-process hosts (MCP server, browser bridge) read
    // `parentCommentId` directly. Send both; each host ignores the other's.
    const result = await createFn({
      text: args.commentText,
      parentId: parent.id,
      parentCommentId: parent.id,
    });

    const post = await buildDocumentSnapshot(doc, { includeDomains: ['comments'] });
    const verification = evaluateChecks(pre, post, [{ kind: 'comment-count-delta', delta: 1 }]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: `reply_to_comment: @ ${parent.id}`,
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [],
      executedOperations: [{ operationId: 'doc.comments.create', result: compactOpResult(result) }],
      verification,
    };
  } catch (err) {
    return failedReceipt('reply_to_comment', err, pre);
  }
}

async function runRewriteBlock(doc: BoundDocApi, args: RewriteBlockArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    const target = selectorToBlockTarget(args.selector, pre);
    if (!target) {
      return failedReceipt('rewrite_block', new Error('selector did not resolve to a body block'), pre);
    }
    const normalizedText = normalizeTitleLikeRewriteText(target.text, args.text);
    const steps = [
      {
        id: 'rewrite-block-1',
        op: 'text.rewrite',
        where: { by: 'block', nodeType: target.nodeType, nodeId: target.nodeId },
        args: {
          replacement: { text: normalizedText },
          style: preserveRewriteStyle(),
        },
      },
    ];
    const result = await executeMutations(doc, steps, args.changeMode);
    const post = await buildDocumentSnapshot(doc);
    const rewrittenBlock = findSnapshotTextByNodeId(post, target.nodeId);
    const verification: VerificationResult[] = [
      revisionVerification(pre.revision, post.revision, true),
      {
        check: { kind: 'block-text-contains', nodeId: target.nodeId, text: normalizedText },
        passed: !!rewrittenBlock && verifyRewrittenBlockText(rewrittenBlock.text, normalizedText, args.changeMode),
      },
    ];
    const changed = pre.revision !== post.revision;
    const rewritten = !!rewrittenBlock && verifyRewrittenBlockText(rewrittenBlock.text, args.text, args.changeMode);
    return {
      status: changed && rewritten ? 'ok' : 'failed',
      intent: 'rewrite_block',
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [{ selector: args.selector, matched: [target.nodeId] }],
      executedOperations: [{ operationId: 'doc.mutations.apply', result }],
      verification,
      errors:
        changed && rewritten
          ? undefined
          : [
              {
                code: 'ACTION_FAILED',
                message: changed
                  ? 'rewrite_block did not produce the requested rewritten text for the selected block'
                  : 'rewrite_block produced no change for the selected block; keep the same target and provide a changed rewrite',
              },
            ],
    };
  } catch (err) {
    return failedReceipt('rewrite_block', err, pre);
  }
}

const NAMED_COLORS: Record<string, string> = {
  black: '000000',
  blue: '0000FF',
  green: '00B050',
  grey: '808080',
  gray: '808080',
  'light grey': 'D3D3D3',
  'light gray': 'D3D3D3',
  red: 'FF0000',
  white: 'FFFFFF',
  yellow: 'FFFF00',
  orange: 'ED7D31',
  purple: '7030A0',
};

const HEX_COLOR_PATTERN = /^#?([0-9a-f]{6})$/i;

function normalizeColor(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const named = NAMED_COLORS[trimmed.toLocaleLowerCase()];
  if (named) return named;
  const match = HEX_COLOR_PATTERN.exec(trimmed);
  return match ? match[1]!.toUpperCase() : null;
}

function normalizeTableColor(raw: string): string | null {
  const normalized = normalizeColor(raw);
  return normalized ? `#${normalized}` : null;
}

async function runAcceptTrackedChanges(doc: BoundDocApi, args: AcceptTrackedChangesArgs): Promise<AgentReceipt> {
  return runTrackedChangeDecision(doc, 'accept_tracked_changes', 'accept', args.author, args.changeType);
}

async function runRejectTrackedChanges(doc: BoundDocApi, args: RejectTrackedChangesArgs): Promise<AgentReceipt> {
  return runTrackedChangeDecision(doc, 'reject_tracked_changes', 'reject', args.author, args.changeType);
}

async function runTrackedChangeDecision(
  doc: BoundDocApi,
  intentLabel: string,
  decision: 'accept' | 'reject',
  author: string | undefined,
  changeType?: TrackedChangeKind,
): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    const listFn = maybeMethod(doc, ['trackChanges', 'list']);
    const decideFn = maybeMethod(doc, ['trackChanges', 'decide']);
    if (!listFn || !decideFn) {
      throw new SuperDocCliError('doc.trackChanges.list / decide are not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }

    const items = await listAllTrackedChanges(listFn);
    const authorKey = author?.trim().toLocaleLowerCase();
    let scoped = authorKey ? items.filter((item) => asString(item?.author)?.toLocaleLowerCase() === authorKey) : items;
    // A paired replacement (adjacent tracked delete + insert) lists as a single
    // `replacement`. A delete/insert decision targets the matching SIDE of it,
    // leaving the other half pending; a `replacement` changeType (or none)
    // decides the whole pair. This is THE way to resolve one half of a
    // replacement (e.g. reject the deletion, keep the insertion).
    const sideForType: 'inserted' | 'deleted' | undefined =
      changeType === 'delete' ? 'deleted' : changeType === 'insert' ? 'inserted' : undefined;
    const isReplacement = (item: unknown): boolean => asString(asRecord(item)?.type) === 'replacement';
    if (changeType) {
      scoped = scoped.filter(
        (item) => asString(item?.type) === changeType || (sideForType != null && isReplacement(item)),
      );
    }

    const executedOperations: Array<{ operationId: string; result?: unknown; rationale?: string }> = [];

    if (scoped.length === 0) {
      // Nothing to do is not a failure: report it honestly.
      const post = await buildDocumentSnapshot(doc);
      return {
        status: 'ok',
        intent: intentLabel,
        preSnapshot: { revision: pre.revision, counts: pre.counts },
        postSnapshot: { revision: post.revision, counts: post.counts },
        selectedTargets: [],
        executedOperations: [
          {
            operationId: 'doc.trackChanges.list',
            rationale: `no tracked changes${author ? ` for author=${author}` : ''}${changeType ? ` of type=${changeType}` : ''} to ${decision}`,
          },
        ],
        verification: [{ check: { kind: 'tracked-change-count-delta', delta: 0 }, passed: true, detail: 'no-op' }],
      };
    }

    if (!authorKey && !changeType) {
      const result = await decideFn({ decision, target: { scope: 'all' } });
      executedOperations.push({ operationId: 'doc.trackChanges.decide', result });
    } else {
      for (const item of scoped) {
        const id = asString(item?.id);
        if (!id) continue;
        const story = asRecord(asRecord(item?.address)?.story);
        const side = sideForType != null && isReplacement(item) ? sideForType : undefined;
        const params: Record<string, unknown> = {
          decision,
          // Send the canonical `{ kind: 'id' }` shape so a replacement-side
          // selector survives normalization (the legacy `{ id }` shape drops it).
          target: { kind: 'id', id, ...(story ? { story } : {}), ...(side ? { side } : {}) },
        };
        const result = await decideFn(params);
        executedOperations.push({ operationId: 'doc.trackChanges.decide', result });
      }
    }

    const post = await buildDocumentSnapshot(doc);
    // Side-decided replacements transform (replacement → standalone) rather than
    // disappear, so they don't reduce the tracked-change count.
    const sideDecidedReplacements = sideForType != null ? scoped.filter((item) => isReplacement(item)).length : 0;
    const expectedDelta = -(scoped.length - sideDecidedReplacements);
    const verification = evaluateChecks(pre, post, [
      { kind: 'revision-changed' },
      { kind: 'tracked-change-count-delta', delta: expectedDelta },
    ]);

    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: intentLabel,
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [],
      executedOperations,
      verification,
    };
  } catch (err) {
    return failedReceipt(intentLabel, err, pre);
  }
}

async function listAllTrackedChanges(
  listFn: (input: unknown) => Promise<unknown>,
): Promise<Array<Record<string, unknown>>> {
  const PAGE = 250;
  let offset = 0;
  const out: Array<Record<string, unknown>> = [];
  while (true) {
    const page = asRecord(await listFn({ offset, limit: PAGE, in: 'all' }));
    const items = Array.isArray(page?.items) ? page!.items : [];
    for (const item of items) {
      if (isRecord(item)) out.push(item);
    }
    const total = asNumber(page?.total, out.length) ?? out.length;
    offset += items.length;
    if (items.length === 0 || offset >= total) return out;
  }
}

async function runNormalizeBodyFontSize(doc: BoundDocApi, args: NormalizeBodyFontSizeArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    if (!Number.isFinite(args.fontSize) || args.fontSize <= 0) {
      return failedReceipt('normalize_body_font_size', new Error('fontSize must be a positive number'), pre);
    }
    const targetBlocks = pre.blocks.filter(
      (b) =>
        (b.nodeType === 'paragraph' || b.nodeType === 'listItem') &&
        typeof b.text === 'string' &&
        b.text.trim().length > 0,
    );
    if (targetBlocks.length === 0) {
      return failedReceipt('normalize_body_font_size', new Error('no non-empty body blocks found'), pre);
    }
    const steps = targetBlocks.map((block, index) => ({
      id: `body-font-${index + 1}`,
      op: 'format.apply',
      where: { by: 'block', nodeType: block.nodeType, nodeId: block.nodeId },
      args: { inline: { fontSize: args.fontSize }, scope: 'block' },
    }));
    const result = await executeMutations(doc, steps, args.changeMode);
    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [{ kind: 'revision-changed' }]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: `normalize_body_font_size: ${args.fontSize}pt`,
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [],
      executedOperations: [
        {
          operationId: 'doc.mutations.apply',
          result,
          rationale: `format.apply on ${targetBlocks.length} body block(s)`,
        },
      ],
      verification,
    };
  } catch (err) {
    return failedReceipt('normalize_body_font_size', err, pre);
  }
}

/**
 * set_font_family — change the typeface. Targets one block (selector), specific
 * text occurrences (targetText/targetTexts), or — when neither is given — the
 * whole body (every non-empty paragraph/list item), mirroring
 * normalize_body_font_size. Applies fontFamily via doc.format.apply, so it is
 * tracked-safe (changeMode).
 */
async function runSetFontFamily(doc: BoundDocApi, args: SetFontFamilyArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    const fontFamily = args.fontFamily.trim();
    if (fontFamily.length === 0) {
      return failedReceipt('set_font_family', new Error('fontFamily must be a non-empty string'), pre);
    }
    const inline = { fontFamily };
    const formatFn = maybeMethod(doc, ['format', 'apply']);
    if (!formatFn) {
      throw new SuperDocCliError('doc.format.apply is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }

    const needles = [
      ...(typeof args.targetText === 'string' && args.targetText.length > 0 ? [args.targetText] : []),
      ...(args.targetTexts ?? []).filter((t) => typeof t === 'string' && t.length > 0),
    ];
    const isBodyBlock = (nodeType: string) =>
      nodeType === 'paragraph' || nodeType === 'heading' || nodeType === 'listItem';

    type Range = { blockId: string; start: number; end: number };
    const ranges: Range[] = [];
    const missing: string[] = [];

    if (args.selector) {
      const target = selectorToBlockTarget(args.selector, pre);
      if (!target) {
        return failedReceipt('set_font_family', new Error('selector did not resolve to a unique body block'), pre);
      }
      const text = findSnapshotTextByNodeId(pre, target.nodeId)?.text ?? '';
      if (needles.length > 0) {
        for (const needle of needles) {
          const found = findRanges(text, needle, args.caseSensitive === true);
          if (found.length === 0) missing.push(needle);
          for (const r of found) ranges.push({ blockId: target.nodeId, start: r.start, end: r.end });
        }
      } else {
        if (text.length === 0) {
          return failedReceipt('set_font_family', new Error('selected block has no text to format'), pre);
        }
        ranges.push({ blockId: target.nodeId, start: 0, end: text.length });
      }
    } else if (needles.length > 0) {
      for (const needle of needles) {
        let hit = false;
        for (const b of pre.blocks) {
          if (!isBodyBlock(b.nodeType)) continue;
          const found = findRanges(b.text, needle, args.caseSensitive === true);
          if (found.length > 0) hit = true;
          for (const r of found) ranges.push({ blockId: b.nodeId, start: r.start, end: r.end });
        }
        for (const table of pre.tables ?? []) {
          for (const cell of table.cells) {
            if (!cell.nodeId) continue;
            const found = findRanges(cell.text, needle, args.caseSensitive === true);
            if (found.length > 0) hit = true;
            for (const r of found) ranges.push({ blockId: cell.nodeId, start: r.start, end: r.end });
          }
        }
        if (!hit) missing.push(needle);
      }
    } else {
      // Whole-body: every non-empty paragraph/list item, like normalize_body_font_size.
      for (const b of pre.blocks) {
        if (!isBodyBlock(b.nodeType) || typeof b.text !== 'string' || b.text.trim().length === 0) continue;
        ranges.push({ blockId: b.nodeId, start: 0, end: b.text.length });
      }
      if (ranges.length === 0) {
        return failedReceipt('set_font_family', new Error('no non-empty body blocks found'), pre);
      }
    }

    if (ranges.length === 0) {
      return {
        status: 'failed',
        intent: 'set_font_family',
        errors: [
          {
            code: 'MATCH_NOT_FOUND',
            message: `none of the target texts occur in the document body: ${missing.map((m) => JSON.stringify(m)).join(', ')}. Inspect and pass the exact text.`,
            recovery: { kind: 'reinspect' },
          },
        ],
      };
    }

    const executed: Array<{ operationId: string; result?: unknown }> = [];
    for (const range of ranges) {
      const params: Record<string, unknown> = { blockId: range.blockId, start: range.start, end: range.end, inline };
      if (args.changeMode) params.changeMode = args.changeMode;
      const result = await formatFn(params);
      executed.push({ operationId: 'doc.format.apply', result: compactOpResult(result) });
    }

    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [{ kind: 'revision-changed' }]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: `set_font_family: ${fontFamily}`,
      ...(missing.length ? { note: `no match for: ${missing.map((m) => JSON.stringify(m)).join(', ')}` } : {}),
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [],
      executedOperations: executed,
      verification,
    };
  } catch (err) {
    return failedReceipt('set_font_family', err, pre);
  }
}

/**
 * apply_style — restyle an EXISTING block: explicit styleId, headingLevel
 * shorthand, or likeText (copy another block's style AND effective inline
 * look — real documents carry direct formatting on top of styleIds). The
 * vocabulary for "make Summary match the Parties heading"; without it,
 * models delete-and-recreate the block — losing its position, or landing
 * the recreated block inside an adjacent table cell.
 */
async function runApplyStyle(doc: BoundDocApi, args: ApplyStyleArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    const target = selectorToBlockTarget(args.selector, pre);
    if (!target) {
      return failedReceipt('apply_style', new Error('selector did not resolve to a unique body block'), pre);
    }

    let styleId = typeof args.styleId === 'string' && args.styleId.length > 0 ? args.styleId : undefined;
    if (!styleId && typeof args.headingLevel === 'number' && args.headingLevel >= 1 && args.headingLevel <= 6) {
      styleId = `Heading${args.headingLevel}`;
    }

    let reference: BlockRow | null = null;
    if (!styleId && typeof args.likeText === 'string' && args.likeText.length > 0) {
      // Match on the FULL block text (snapshot), then read the effective look
      // from the formatting-bearing rows — previews are truncated.
      const needle = args.likeText.toLowerCase();
      const refBlock =
        pre.blocks.find((b) => b.nodeId !== target.nodeId && b.text.toLowerCase().includes(needle)) ?? null;
      const rows = await listBlockRows(doc);
      reference = refBlock ? (rows.find((r) => r.nodeId === refBlock.nodeId) ?? null) : null;
      if (!reference) {
        return {
          status: 'failed',
          intent: 'apply_style',
          errors: [
            {
              code: 'TARGET_NOT_FOUND',
              message: `no other block contains ${JSON.stringify(args.likeText)} — pass the exact text of the block whose style to copy.`,
              recovery: { kind: 'reinspect' },
            },
          ],
        };
      }
      styleId = reference.styleId ?? undefined;
    }
    if (!styleId && !reference) {
      return failedReceipt('apply_style', new Error('pass styleId, headingLevel (1-6), or likeText'), pre);
    }

    const executed: Array<{ operationId: string; result?: unknown }> = [];
    if (styleId) {
      const setStyleFn = maybeMethod(doc, ['styles', 'paragraph', 'setStyle']);
      if (!setStyleFn) {
        throw new SuperDocCliError('doc.styles.paragraph.setStyle is not available on the document handle.', {
          code: 'TOOL_DISPATCH_NOT_FOUND',
        });
      }
      const result = await setStyleFn({
        target: { kind: 'block', nodeType: target.nodeType, nodeId: target.nodeId },
        styleId,
      });
      executed.push({ operationId: 'doc.styles.paragraph.setStyle', result: compactOpResult(result) });
    }

    // likeText also copies the reference's EFFECTIVE look — styles rarely
    // tell the whole story (direct formatting overrides are the norm).
    const applied: Record<string, unknown> = styleId ? { styleId } : {};
    if (reference) {
      const inline = inlineLookFromRow(reference);
      if (Object.keys(inline).length > 0) {
        const formatFn = maybeMethod(doc, ['format', 'apply']);
        if (formatFn) {
          const block = findSnapshotTextByNodeId(pre, target.nodeId);
          const result = await formatFn({
            blockId: target.nodeId,
            start: 0,
            end: Math.max((block?.text ?? '').length, 1),
            inline,
          });
          executed.push({ operationId: 'doc.format.apply', result: compactOpResult(result) });
          Object.assign(applied, inline);
        }
      }
    }

    const post = await listBlockRows(doc);
    const updated = post.find((r) => r.nodeId === target.nodeId);
    const stylePassed = !styleId || updated?.styleId === styleId;
    return {
      status: stylePassed ? 'ok' : 'failed',
      intent: 'apply_style',
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      selectedTargets: [{ selector: args.selector, matched: [target.nodeId] }],
      applied,
      ...(reference ? { copiedFrom: reference.nodeId } : {}),
      executedOperations: executed,
      verification: [
        {
          check: { kind: 'block-style-equals', styleId: styleId ?? '(inline only)' } as AgentVerificationCheck,
          passed: stylePassed,
          detail: `block styleId now ${updated?.styleId ?? 'unknown'}`,
        },
      ],
    };
  } catch (err) {
    return failedReceipt('apply_style', err, pre);
  }
}

export type FormatParagraphArgs = {
  action: 'format_paragraph';
  /** Block whose paragraph properties to change. */
  selector: AgentSelector;
  /** Paragraph alignment: left | center | right | justify (alias: both). */
  alignment: string;
  changeMode?: AgentChangeMode;
};

/**
 * format_paragraph — paragraph-level formatting (alignment) applied to ONE
 * block. THE way to centre/justify a clause. With changeMode:"tracked" the
 * former paragraph properties are recorded as a w:pPrChange, so a reviewer sees
 * a paragraph-format revision and accept/reject toggles it — without it, models
 * escape to superdoc_execute_code and apply the alignment untracked (no pPrChange).
 */
async function runFormatParagraph(doc: BoundDocApi, args: FormatParagraphArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    const target = selectorToBlockTarget(args.selector, pre);
    if (!target) {
      return failedReceipt('format_paragraph', new Error('selector did not resolve to a unique body block'), pre);
    }
    const alignment = typeof args.alignment === 'string' ? args.alignment.trim().toLowerCase() : '';
    const normalizedAlignment = alignment === 'both' ? 'justify' : alignment;
    if (!['left', 'center', 'right', 'justify'].includes(normalizedAlignment)) {
      return failedReceipt(
        'format_paragraph',
        new Error('format_paragraph requires alignment: left | center | right | justify'),
        pre,
      );
    }

    const steps = [
      {
        id: 'format-paragraph-1',
        op: 'format.apply',
        where: { by: 'block', nodeType: target.nodeType, nodeId: target.nodeId },
        args: { alignment: normalizedAlignment, scope: 'block' },
      },
    ];
    const result = await executeMutations(doc, steps, args.changeMode);
    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [{ kind: 'revision-changed' }]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: `format_paragraph: ${normalizedAlignment}`,
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [{ selector: args.selector, matched: [target.nodeId] }],
      applied: { alignment: normalizedAlignment },
      executedOperations: [
        { operationId: 'doc.mutations.apply', result: compactOpResult(result), rationale: `align ${target.nodeId}` },
      ],
      verification,
    };
  } catch (err) {
    return failedReceipt('format_paragraph', err, pre);
  }
}

export type MoveTextArgs = {
  action: 'move_text';
  /** Exact source text span to relocate. */
  text: string;
  /** Relocate to immediately after this text; defaults to immediately after the source span itself. */
  afterText?: string;
  /**
   * 'tracked' records the move as a redline (tracked delete + insert); direct
   * (default) physically relocates the text. Direct mode requires afterText.
   */
  changeMode?: AgentChangeMode;
};

/**
 * move_text — relocate a clause/phrase under track changes by composing a
 * TRACKED DELETE of the source span with a TRACKED INSERT of that text at the
 * destination. This produces two tracked changes (a deletion at the source and
 * an insertion at the destination): accepting both keeps the relocation,
 * rejecting both restores the original order.
 *
 * Implementation note: run as two separate tracked `doc.mutations.apply` calls —
 * the source DELETE first, then the destination INSERT. Delete-before-insert is
 * required: the insert writes a literal copy of `text`, so a text-search delete
 * running afterwards would match both the source and the copy. Tracked deletions
 * leave the struck text in place, so when no `afterText` is given the insert can
 * still anchor on the (now tracked-deleted) source span and land right after it.
 */
async function runMoveText(doc: BoundDocApi, args: MoveTextArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    if (!args.text || args.text.length === 0) {
      return failedReceipt('move_text', new Error('text (the exact source span to move) is required'), pre);
    }

    // Honor changeMode like every other mutating action: 'tracked' records the
    // move as a redline (tracked delete + insert); direct (default) physically
    // relocates the text. In direct mode the delete REMOVES the source, so there
    // is no struck span left to anchor the destination on — afterText is required.
    const tracked = args.changeMode === 'tracked';
    // PRE-FLIGHT before any mutation: the delete runs first, so a bad anchor
    // discovered later would leave the source deleted with nothing inserted —
    // data loss reported as a mere failure. Verify both spans exist up front.
    const bodyHas = (needle: string): boolean =>
      pre.blocks.some((b) => typeof b.text === 'string' && b.text.includes(needle)) ||
      (pre.tables ?? []).some((t) => t.cells.some((c) => (c.text ?? '').includes(needle)));
    const missingSpans = [args.text, ...(args.afterText ? [args.afterText] : [])].filter((s) => !bodyHas(s));
    if (missingSpans.length > 0) {
      return {
        status: 'failed',
        intent: 'move_text',
        errors: [
          {
            code: 'MATCH_NOT_FOUND',
            message: `not found in the document: ${missingSpans.map((m) => JSON.stringify(m)).join(', ')} — nothing was changed. Inspect and pass the exact text.`,
            recovery: { kind: 'reinspect' },
          },
        ],
      };
    }
    if (!tracked && !(args.afterText && args.afterText.length > 0)) {
      return {
        status: 'failed',
        intent: 'move_text',
        errors: [
          {
            code: 'INVALID_ARGUMENT',
            message:
              'a direct move needs afterText — the source is removed, so there is nothing to anchor the destination on. Pass afterText, or use changeMode:"tracked" to record the move as a redline.',
            recovery: { kind: 'reinspect' },
          },
        ],
      };
    }

    // ORDER MATTERS: delete the source span FIRST, then insert the copy at the
    // destination. The insert writes a literal copy of `args.text`; if the delete
    // ran afterwards and matched by text search, it would match BOTH the source
    // and the freshly-inserted copy and wipe the move. Deleting first means only
    // the original source exists when the delete's text search runs.
    //
    // 1) Delete the original source span (tracked when changeMode:"tracked").
    const deleteSteps = [
      {
        id: 'move-delete-1',
        op: 'text.delete',
        where: {
          by: 'select',
          select: { type: 'text', pattern: args.text, mode: 'contains', caseSensitive: true },
          require: 'first',
        },
        args: {},
      },
    ];
    const deleteResult = await executeMutations(doc, deleteSteps, args.changeMode);

    // 2) Insert the moved text at the destination. Anchor on `afterText` when
    //    provided; otherwise (tracked only) on the tracked-deleted source span
    //    itself so the copy lands right after it — tracked deletions keep the
    //    struck text in the document, so that anchor still resolves. (Direct mode
    //    always has afterText: the guard above requires it.)
    const insertAnchor = args.afterText && args.afterText.length > 0 ? args.afterText : args.text;
    const insertSteps = [
      {
        id: 'move-insert-1',
        op: 'text.insert',
        where: {
          by: 'select',
          select: { type: 'text', pattern: insertAnchor, mode: 'contains', caseSensitive: true },
          require: 'first',
        },
        args: {
          position: 'after',
          content: { text: args.text },
        },
      },
    ];
    const insertResult = await executeMutations(doc, insertSteps, args.changeMode);

    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [{ kind: 'revision-changed' }]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: `move_text${tracked ? ' (tracked)' : ''}: ${JSON.stringify(args.text)}`,
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [],
      executedOperations: [
        {
          operationId: 'doc.mutations.apply',
          result: compactOpResult(insertResult),
          rationale: `${tracked ? 'tracked ' : ''}insert at destination`,
        },
        {
          operationId: 'doc.mutations.apply',
          result: compactOpResult(deleteResult),
          rationale: `${tracked ? 'tracked ' : ''}delete of source`,
        },
      ],
      verification,
    };
  } catch (err) {
    return failedReceipt('move_text', err, pre);
  }
}

export type SetParagraphSpacingArgs = {
  action: 'set_paragraph_spacing';
  selector: AgentSelector;
  /** Line-spacing multiplier (1, 1.5, 2). */
  lineSpacing?: number;
  /** Space before the paragraph, in points. */
  spaceBefore?: number;
  /** Space after the paragraph, in points. */
  spaceAfter?: number;
};

/**
 * set_paragraph_spacing — set line spacing and/or space before/after on a
 * block. THE correct way to add spacing between paragraphs (real Word spacing),
 * instead of inserting blank paragraphs.
 */
async function runSetParagraphSpacing(doc: BoundDocApi, args: SetParagraphSpacingArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc, { includeDomains: ['blocks'] });
  try {
    const target = selectorToBlockTarget(args.selector, pre);
    if (!target) {
      return failedReceipt('set_paragraph_spacing', new Error('selector did not resolve to a unique body block'), pre);
    }
    const fn = maybeMethod(doc, ['format', 'paragraph', 'setSpacing']);
    if (!fn) {
      throw new SuperDocCliError('doc.format.paragraph.setSpacing is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }
    // The op takes twips; expose friendlier units: lineSpacing as a multiplier
    // (240 twips per line) and spaceBefore/After in points (20 twips per point).
    const params: Record<string, unknown> = {
      target: { kind: 'block', nodeType: 'paragraph', nodeId: target.nodeId },
    };
    const applied: Record<string, unknown> = {};
    if (typeof args.lineSpacing === 'number' && args.lineSpacing > 0) {
      params.line = Math.round(args.lineSpacing * 240);
      params.lineRule = 'auto';
      applied.lineSpacing = args.lineSpacing;
    }
    if (typeof args.spaceBefore === 'number' && args.spaceBefore >= 0) {
      params.before = Math.round(args.spaceBefore * 20);
      applied.spaceBefore = args.spaceBefore;
    }
    if (typeof args.spaceAfter === 'number' && args.spaceAfter >= 0) {
      params.after = Math.round(args.spaceAfter * 20);
      applied.spaceAfter = args.spaceAfter;
    }
    if (Object.keys(applied).length === 0) {
      return failedReceipt(
        'set_paragraph_spacing',
        new Error('provide lineSpacing and/or spaceBefore/spaceAfter'),
        pre,
      );
    }
    const result = await fn(params);
    const post = await readDocumentIdentity(doc);
    const verification = [revisionVerification(pre.revision, post.revision, true)];
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: `set_paragraph_spacing`,
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: post,
      selectedTargets: [{ selector: args.selector, matched: [target.nodeId] }],
      applied,
      executedOperations: [{ operationId: 'doc.format.paragraph.setSpacing', result: compactOpResult(result) }],
      verification,
    };
  } catch (err) {
    return failedReceipt('set_paragraph_spacing', err, pre);
  }
}

export type InsertPageBreakArgs = {
  action: 'insert_page_break';
  selector: AgentSelector;
};

/**
 * insert_page_break — make a block start on a new page (sets pageBreakBefore).
 * THE way to "start X on a new page" instead of padding with empty paragraphs.
 */
async function runInsertPageBreak(doc: BoundDocApi, args: InsertPageBreakArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc, { includeDomains: ['blocks'] });
  try {
    const target = selectorToBlockTarget(args.selector, pre);
    if (!target) {
      return failedReceipt('insert_page_break', new Error('selector did not resolve to a unique body block'), pre);
    }
    const fn = maybeMethod(doc, ['format', 'paragraph', 'setFlowOptions']);
    if (!fn) {
      throw new SuperDocCliError('doc.format.paragraph.setFlowOptions is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }
    const result = await fn({
      target: { kind: 'block', nodeType: 'paragraph', nodeId: target.nodeId },
      pageBreakBefore: true,
    });
    const post = await readDocumentIdentity(doc);
    const verification = [revisionVerification(pre.revision, post.revision, true)];
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: 'insert_page_break',
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: post,
      selectedTargets: [{ selector: args.selector, matched: [target.nodeId] }],
      executedOperations: [{ operationId: 'doc.format.paragraph.setFlowOptions', result: compactOpResult(result) }],
      verification,
    };
  } catch (err) {
    return failedReceipt('insert_page_break', err, pre);
  }
}

export type AddHyperlinkArgs = {
  action: 'add_hyperlink';
  /** Exact text to turn into a hyperlink. */
  text: string;
  url: string;
  tooltip?: string;
};

/**
 * add_hyperlink — turn an existing run of text into a clickable hyperlink.
 * Finds the text in the body and applies a link over its range.
 */
async function runAddHyperlink(doc: BoundDocApi, args: AddHyperlinkArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc, { includeDomains: ['blocks'] });
  try {
    const needle = args.text;
    const url = args.url;
    if (!needle || !url) return failedReceipt('add_hyperlink', new Error('text and url are required'), pre);
    // Locate the first body block containing the text, then its char offsets.
    const block = pre.blocks.find((b) => typeof b.text === 'string' && b.text.includes(needle));
    if (!block) {
      return {
        status: 'failed',
        intent: 'add_hyperlink',
        errors: [
          {
            code: 'TARGET_NOT_FOUND',
            message: `text ${JSON.stringify(needle)} not found in the document.`,
            recovery: { kind: 'reinspect' },
          },
        ],
      };
    }
    const start = block.text!.indexOf(needle);
    const end = start + needle.length;
    // wrap (not insert): turn the EXISTING text range into a hyperlink.
    const fn = maybeMethod(doc, ['hyperlinks', 'wrap']);
    if (!fn) {
      throw new SuperDocCliError('doc.hyperlinks.wrap is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }
    const result = await fn({
      target: { kind: 'text', blockId: block.nodeId, range: { start, end } },
      link: { destination: { href: url }, ...(args.tooltip ? { tooltip: args.tooltip } : {}) },
    });
    const post = await readDocumentIdentity(doc);
    const verification = [revisionVerification(pre.revision, post.revision, true)];
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: `add_hyperlink: ${JSON.stringify(needle)} → ${url}`,
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: post,
      selectedTargets: [{ selector: { kind: 'textSearch', terms: [needle] }, matched: [block.nodeId] }],
      executedOperations: [{ operationId: 'doc.hyperlinks.wrap', result: compactOpResult(result) }],
      verification,
    };
  } catch (err) {
    return failedReceipt('add_hyperlink', err, pre);
  }
}

/**
 * format_text — inline formatting (bold/italic/underline/strike/highlight/
 * color/fontSize) applied to every occurrence of one or more literal texts,
 * or to a selector'd block. The vocabulary for "bold all the dates" — without
 * it, models escape to superdoc_execute_code, trip over the raw format API's options
 * dialect, and silently apply the formatting untracked.
 */
async function runFormatText(doc: BoundDocApi, args: FormatTextArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    const inline: Record<string, unknown> = {};
    if (args.bold === true) inline.bold = true;
    if (args.italic === true) inline.italic = true;
    if (args.underline === true) inline.underline = true;
    if (args.strike === true) inline.strike = true;
    if (typeof args.highlight === 'string' && args.highlight.length > 0) inline.highlight = args.highlight;
    if (typeof args.fontSize === 'number' && Number.isFinite(args.fontSize)) inline.fontSize = args.fontSize;
    if (typeof args.color === 'string' && args.color.length > 0) {
      const color = normalizeColor(args.color);
      if (!color) {
        return failedReceipt(
          'format_text',
          new Error('color must be a 6-digit hex (e.g. "#FF0000") or a named color'),
          pre,
        );
      }
      inline.color = color;
    }
    if (Object.keys(inline).length === 0) {
      return failedReceipt(
        'format_text',
        new Error(
          'pass at least one format: bold/italic/underline/strike (true), highlight (color name), color, or fontSize',
        ),
        pre,
      );
    }
    const formatFn = maybeMethod(doc, ['format', 'apply']);
    if (!formatFn) {
      throw new SuperDocCliError('doc.format.apply is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }

    const needles = [
      ...(typeof args.targetText === 'string' && args.targetText.length > 0 ? [args.targetText] : []),
      ...(args.targetTexts ?? []).filter((t) => typeof t === 'string' && t.length > 0),
    ];

    type Range = { blockId: string; start: number; end: number; matched: string };
    const ranges: Range[] = [];
    const missing: string[] = [];

    if (args.selector) {
      const target = selectorToBlockTarget(args.selector, pre);
      if (!target) {
        return failedReceipt('format_text', new Error('selector did not resolve to a unique body block'), pre);
      }
      const block = findSnapshotTextByNodeId(pre, target.nodeId);
      const text = block?.text ?? '';
      if (needles.length > 0) {
        for (const needle of needles) {
          const found = findRanges(text, needle, args.caseSensitive === true);
          if (found.length === 0) missing.push(needle);
          for (const r of found) ranges.push({ blockId: target.nodeId, ...r, matched: needle });
        }
      } else {
        if (text.length === 0) {
          return failedReceipt('format_text', new Error('selected block has no text to format'), pre);
        }
        ranges.push({ blockId: target.nodeId, start: 0, end: text.length, matched: '<block>' });
      }
    } else {
      if (needles.length === 0) {
        return failedReceipt('format_text', new Error('either targetText/targetTexts or selector is required'), pre);
      }
      for (const needle of needles) {
        let hit = false;
        for (const b of pre.blocks) {
          if (b.nodeType !== 'paragraph' && b.nodeType !== 'heading' && b.nodeType !== 'listItem') continue;
          const found = findRanges(b.text, needle, args.caseSensitive === true);
          if (found.length > 0) hit = true;
          for (const r of found) ranges.push({ blockId: b.nodeId, ...r, matched: needle });
        }
        // Table cells are their own text-bearing blocks — "bold every X" must
        // reach text inside tables too.
        for (const table of pre.tables ?? []) {
          for (const cell of table.cells) {
            if (!cell.nodeId) continue;
            const found = findRanges(cell.text, needle, args.caseSensitive === true);
            if (found.length > 0) hit = true;
            for (const r of found) ranges.push({ blockId: cell.nodeId, ...r, matched: needle });
          }
        }
        if (!hit) missing.push(needle);
      }
    }

    if (ranges.length === 0) {
      return {
        status: 'failed',
        intent: 'format_text',
        errors: [
          {
            code: 'MATCH_NOT_FOUND',
            message: `none of the target texts occur in the document body: ${missing.map((m) => JSON.stringify(m)).join(', ')}. Inspect and pass the exact text.`,
            recovery: { kind: 'reinspect' },
          },
        ],
      };
    }

    const executed: Array<{ operationId: string; result?: unknown }> = [];
    for (const range of ranges) {
      const params: Record<string, unknown> = {
        blockId: range.blockId,
        start: range.start,
        end: range.end,
        inline,
      };
      if (args.changeMode) params.changeMode = args.changeMode;
      const result = await formatFn(params);
      executed.push({ operationId: 'doc.format.apply', result: compactOpResult(result) });
    }

    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [{ kind: 'revision-changed' }]);
    const allPassed = verification.every((v) => v.passed);
    const status = !allPassed ? 'failed' : missing.length > 0 ? 'partial' : 'ok';
    return {
      status,
      intent: 'format_text',
      formats: Object.keys(inline),
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [],
      rangesFormatted: ranges.length,
      ...(missing.length > 0
        ? {
            targetsSkipped: missing,
            nextStep: `${missing.length} target text(s) were not found and got NO formatting — inspect for the exact wording and call format_text again for them.`,
          }
        : {}),
      executedOperations: executed,
      verification,
    };
  } catch (err) {
    return failedReceipt('format_text', err, pre);
  }
}

function findRanges(haystack: string, needle: string, caseSensitive: boolean): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  if (needle.length === 0) return ranges;
  const source = caseSensitive ? haystack : haystack.toLocaleLowerCase();
  const target = caseSensitive ? needle : needle.toLocaleLowerCase();
  let offset = 0;
  while (offset < source.length) {
    const idx = source.indexOf(target, offset);
    if (idx < 0) break;
    ranges.push({ start: idx, end: idx + target.length });
    offset = idx + target.length;
  }
  return ranges;
}

async function runApplyLetterSpacing(doc: BoundDocApi, args: ApplyLetterSpacingArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    if (!Number.isFinite(args.letterSpacing)) {
      return failedReceipt('apply_letter_spacing', new Error('letterSpacing must be a finite number'), pre);
    }
    const target = selectorToBlockTarget(args.selector, pre);
    if (!target) {
      return failedReceipt('apply_letter_spacing', new Error('selector did not resolve to a unique block'), pre);
    }
    if (target.nodeType !== 'paragraph' && target.nodeType !== 'heading' && target.nodeType !== 'listItem') {
      return failedReceipt(
        'apply_letter_spacing',
        new Error('selector must resolve to a paragraph, heading, or list item'),
        pre,
      );
    }
    const steps = [
      {
        id: 'letter-spacing-1',
        op: 'format.apply',
        where: { by: 'block', nodeType: target.nodeType, nodeId: target.nodeId },
        args: { inline: { letterSpacing: args.letterSpacing }, scope: 'block' },
      },
    ];
    const result = await executeMutations(doc, steps, args.changeMode);
    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [{ kind: 'revision-changed' }]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: `apply_letter_spacing: ${args.letterSpacing}pt`,
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [{ selector: args.selector, matched: [target.nodeId] }],
      executedOperations: [{ operationId: 'doc.mutations.apply', result }],
      verification,
    };
  } catch (err) {
    return failedReceipt('apply_letter_spacing', err, pre);
  }
}

async function runFillPlaceholders(doc: BoundDocApi, args: FillPlaceholdersArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    const valueCount = args.values?.length ?? 0;
    const fieldCount = args.fields?.length ?? 0;
    if (valueCount === 0 && fieldCount === 0) {
      return failedReceipt(
        'fill_placeholders',
        new Error('fill_placeholders requires non-empty values or fields'),
        pre,
      );
    }
    const workflowResult = await runSuperdocTextTransformWorkflow({
      documentHandle: doc,
      args: {
        action: 'fill_placeholders',
        values: args.values == null ? undefined : [...args.values],
        fields: args.fields,
        changeMode: args.changeMode,
      },
    });
    return receiptFromWorkflowResult(doc, 'fill_placeholders', pre, workflowResult);
  } catch (err) {
    return failedReceipt('fill_placeholders', err, pre);
  }
}

/**
 * Resolve a search string to the FIRST block whose (trimmed) text matches. An
 * exact case-insensitive match wins over a substring match so short titles like
 * "SCHEDULE A" prefer the title line over a body block that merely mentions it.
 */
function findBlockNodeIdByText(
  blocks: readonly SnapshotBlock[],
  needle: string,
): { nodeId: string; text: string } | null {
  const normalizedNeedle = needle.trim().toLowerCase();
  if (normalizedNeedle.length === 0) {
    return null;
  }
  const textOf = (block: SnapshotBlock): string =>
    (typeof block.text === 'string' && block.text.length > 0 ? block.text : (block.textPreview ?? '')).trim();
  const exact = blocks.find((block) => textOf(block).toLowerCase() === normalizedNeedle);
  if (exact) {
    return { nodeId: exact.nodeId, text: textOf(exact) };
  }
  const contains = blocks.find((block) => textOf(block).toLowerCase().includes(normalizedNeedle));
  return contains ? { nodeId: contains.nodeId, text: textOf(contains) } : null;
}

async function runMoveRange(doc: BoundDocApi, args: MoveRangeArgs): Promise<AgentReceipt> {
  const preIdentity = await readDocumentIdentity(doc);
  const pre = snapshotFromIdentity(preIdentity);
  const fail = (code: string, message: string): AgentReceipt => ({
    status: 'failed',
    intent: 'move_range',
    preSnapshot: preIdentity,
    selectedTargets: [],
    executedOperations: [],
    verification: [],
    errors: [{ code, message, recovery: { kind: 'reinspect' } }],
  });

  try {
    const fromText = typeof args.fromText === 'string' ? args.fromText.trim() : '';
    if (fromText.length === 0) {
      return fail(
        'INVALID_ARGUMENT',
        'move_range requires fromText (text inside the FIRST block of the range to move).',
      );
    }

    const afterText = typeof args.afterText === 'string' ? args.afterText.trim() : '';
    const beforeText = typeof args.beforeText === 'string' ? args.beforeText.trim() : '';
    const hasAfter = afterText.length > 0;
    const hasBefore = beforeText.length > 0;
    if (hasAfter === hasBefore) {
      return fail(
        'INVALID_ARGUMENT',
        'move_range requires exactly one destination: afterText OR beforeText (text inside the block to land after/before).',
      );
    }

    const blocks = await listAllBlocks(doc, true);
    const start = findBlockNodeIdByText(blocks, fromText);
    if (!start) {
      return fail(
        'TARGET_NOT_FOUND',
        `move_range could not find a block containing fromText ${JSON.stringify(fromText)}.`,
      );
    }

    let endNodeId: string | undefined;
    const toText = typeof args.toText === 'string' ? args.toText.trim() : '';
    if (toText.length > 0) {
      const end = findBlockNodeIdByText(blocks, toText);
      if (!end) {
        return fail(
          'TARGET_NOT_FOUND',
          `move_range could not find a block containing toText ${JSON.stringify(toText)}.`,
        );
      }
      endNodeId = end.nodeId;
    }

    const destText = hasAfter ? afterText : beforeText;
    const dest = findBlockNodeIdByText(blocks, destText);
    if (!dest) {
      return fail(
        'TARGET_NOT_FOUND',
        `move_range could not find the destination block containing ${JSON.stringify(destText)}.`,
      );
    }
    if (dest.nodeId === start.nodeId) {
      return fail('INVALID_ARGUMENT', 'move_range destination resolved to the same block as fromText.');
    }

    const workflowResult = await runSuperdocStructureInsertWorkflow({
      documentHandle: doc,
      args: {
        action: 'move_range',
        startNodeId: start.nodeId,
        endNodeId,
        destinationNodeId: dest.nodeId,
        position: hasAfter ? 'after' : 'before',
        changeMode: args.changeMode === 'tracked' ? 'tracked' : 'direct',
      },
    });
    const workflowCode = asString(workflowResult.receipt.details?.code);
    if (workflowResult.receipt.status !== 'success') {
      return {
        status: 'failed',
        intent: 'move_range',
        preSnapshot: preIdentity,
        selectedTargets: [],
        executedOperations:
          workflowResult.output == null
            ? []
            : [{ operationId: `workflow.${workflowResult.receipt.toolName}`, result: workflowResult.output }],
        verification: [],
        errors: [
          {
            code: workflowCode ?? 'ACTION_FAILED',
            message: workflowResult.receipt.message,
          },
        ],
      };
    }

    const postIdentity = await readDocumentIdentity(doc);
    const summary = asString(asRecord(workflowResult.output?.verification)?.summary);
    const verification = [revisionVerification(preIdentity.revision, postIdentity.revision, true)];
    return {
      status: verification.every((entry) => entry.passed) ? 'ok' : 'failed',
      intent: 'move_range',
      preSnapshot: preIdentity,
      postSnapshot: postIdentity,
      selectedTargets: [],
      executedOperations: [
        {
          operationId: `workflow.${workflowResult.receipt.toolName}`,
          rationale: summary,
          result: workflowResult.output?.execution ?? workflowResult.output,
        },
      ],
      verification,
    };
  } catch (err) {
    return failedReceipt('move_range', err, pre);
  }
}

async function runInsertToc(doc: BoundDocApi, args: InsertTocArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    const tocFn = maybeMethod(doc, ['create', 'tableOfContents']);
    if (!tocFn) {
      throw new SuperDocCliError('doc.create.tableOfContents is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }
    const placement = resolvePlacement(args.placement ?? { at: 'document_start' }, pre);
    const executed: Array<{ operationId: string; result?: unknown }> = [];

    let tocPlacement = placement;
    if (args.title) {
      const headingResult = await executeCreateHeading(doc, args.title, 1, placement, args.changeMode);
      executed.push({ operationId: 'doc.create.heading', result: headingResult });
      const headingNodeId = asString(asRecord(asRecord(headingResult)?.heading)?.nodeId);
      if (headingNodeId) {
        tocPlacement = {
          kind: 'after',
          target: { kind: 'block', nodeType: 'heading', nodeId: headingNodeId },
        };
      }
    }

    const tocParams: Record<string, unknown> = { at: tocPlacement };
    if (args.changeMode) tocParams.changeMode = args.changeMode;
    // Dual dialect — see executeCreateParagraph.
    const result = await tocFn(tocParams, args.changeMode ? { changeMode: args.changeMode } : undefined);
    executed.push({ operationId: 'doc.create.tableOfContents', result });

    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [{ kind: 'revision-changed' }]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: `insert_toc${args.title ? `: ${args.title}` : ''}`,
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [],
      executedOperations: executed,
      verification,
    };
  } catch (err) {
    return failedReceipt('insert_toc', err, pre);
  }
}

/**
 * style_table — make a table look professional in one call: a filled accent
 * header row (navy by default) with white bold header text, bold first-column
 * labels, banded rows, and clean borders. Composes tables.applyPreset("accent")
 * for the header fill + borders, then formats the header row (white + bold) and
 * the first column (bold + accent) via cell formatting.
 */
async function runStyleTable(doc: BoundDocApi, args: StyleTableArgs): Promise<AgentReceipt> {
  const preIdentity = await readDocumentIdentity(doc);
  const pre = snapshotFromIdentity(preIdentity);
  try {
    const tableOrdinal = args.tableOrdinal ?? 1;
    const table = await resolveTableContextQuick(doc, tableOrdinal);
    if (!table) {
      return failedReceipt('style_table', new Error(`tableOrdinal ${tableOrdinal} is out of range`), pre);
    }
    const accent = normalizeTableColor(args.accentColor ?? '#1F3864') ?? '#1F3864';
    const target = { kind: 'block', nodeType: 'table', nodeId: table.nodeId } as const;
    const executed: Array<{ operationId: string; result?: unknown }> = [];

    // 1. Accent preset: filled header row + accent borders, in one call.
    const presetFn = maybeMethod(doc, ['tables', 'applyPreset']);
    if (!presetFn) {
      throw new SuperDocCliError('doc.tables.applyPreset is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }
    const presetResult = await presetFn({ target, preset: 'accent', accentColor: accent });
    executed.push({ operationId: 'doc.tables.applyPreset', result: compactOpResult(presetResult) });

    // 2. Header row → white + bold; first column (body rows) → bold + accent.
    //    Best-effort: a failure to read/format cells must not fail the action,
    //    the header fill + borders already landed.
    try {
      const getCellsFn = maybeMethod(doc, ['tables', 'getCells']);
      if (getCellsFn) {
        const cellsRes = asRecord(await getCellsFn({ target }));
        const cells = Array.isArray(cellsRes?.cells) ? (cellsRes!.cells as Array<Record<string, unknown>>) : [];
        const steps: Array<Record<string, unknown>> = [];
        for (const cell of cells) {
          const nodeId = asString(cell.nodeId);
          const rowIndex = asNumber(cell.rowIndex);
          const columnIndex = asNumber(cell.columnIndex);
          if (!nodeId || rowIndex == null) continue;
          const where = { by: 'block', nodeType: 'tableCell', nodeId };
          if (rowIndex === 0) {
            steps.push({
              id: `hdr-${nodeId}`,
              op: 'format.apply',
              where,
              args: { inline: { bold: true, color: '#FFFFFF' }, scope: 'block' },
            });
          } else if (columnIndex === 0) {
            steps.push({
              id: `col-${nodeId}`,
              op: 'format.apply',
              where,
              args: { inline: { bold: true, color: accent }, scope: 'block' },
            });
          }
        }
        if (steps.length > 0) {
          const fmtResult = await executeMutations(doc, steps, 'direct');
          executed.push({ operationId: 'doc.mutations.apply', result: compactOpResult(fmtResult) });
        }
      }
    } catch {
      // header/first-column emphasis is cosmetic polish on top of the preset.
    }

    const postIdentity = await readDocumentIdentity(doc);
    const verification = [revisionVerification(preIdentity.revision, postIdentity.revision, true)];
    return {
      status: verification.every((entry) => entry.passed) ? 'ok' : 'failed',
      intent: `style_table: accent ${accent}`,
      preSnapshot: preIdentity,
      postSnapshot: postIdentity,
      selectedTargets: [
        { selector: { kind: 'ordinal', ordinalKind: 'tableOrdinal', value: tableOrdinal }, matched: [table.nodeId] },
      ],
      executedOperations: executed,
      verification,
    };
  } catch (err) {
    return failedReceipt('style_table', err, pre);
  }
}

/**
 * move_table — relocate a WHOLE table (with all its content) in ONE call.
 * Wraps doc.tables.move; `resolvePlacement` returns exactly the destination
 * shape (TableCreateLocation) that move expects. This is the action the model
 * should reach for instead of delete-and-recreate or insert/undo churn.
 */
async function runMoveTable(doc: BoundDocApi, args: MoveTableArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    const tableOrdinal = args.tableOrdinal ?? 1;
    const table = await resolveTableContextQuick(doc, tableOrdinal);
    if (!table) {
      return failedReceipt('move_table', new Error(`tableOrdinal ${tableOrdinal} is out of range`), pre);
    }
    const destination = resolvePlacement(args.placement, pre);
    const moveFn = maybeMethod(doc, ['tables', 'move']);
    if (!moveFn) {
      throw new SuperDocCliError('doc.tables.move is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }
    const target = { kind: 'block', nodeType: 'table', nodeId: table.nodeId } as const;
    const result = await moveFn({ target, destination });
    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [{ kind: 'revision-changed' }]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: `move_table: ordinal ${tableOrdinal} -> ${destination.kind}`,
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [
        { selector: { kind: 'ordinal', ordinalKind: 'tableOrdinal', value: tableOrdinal }, matched: [table.nodeId] },
      ],
      executedOperations: [{ operationId: 'doc.tables.move', result: compactOpResult(result) }],
      verification,
    };
  } catch (err) {
    return failedReceipt('move_table', err, pre);
  }
}

/**
 * delete_table — remove an ENTIRE table in ONE call. Wraps doc.blocks.delete on
 * the table block. changeMode:"tracked" records the removal as a tracked change.
 */
async function runDeleteTable(doc: BoundDocApi, args: DeleteTableArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    const tableOrdinal = args.tableOrdinal ?? 1;
    const table = await resolveTableContextQuick(doc, tableOrdinal);
    if (!table) {
      return failedReceipt('delete_table', new Error(`tableOrdinal ${tableOrdinal} is out of range`), pre);
    }
    const deleteFn = maybeMethod(doc, ['blocks', 'delete']);
    if (!deleteFn) {
      throw new SuperDocCliError('doc.blocks.delete is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }
    const target = { kind: 'block', nodeType: 'table', nodeId: table.nodeId } as const;
    const changeMode = parseChangeMode(args.changeMode);
    const result = await deleteFn({ target }, changeMode ? { changeMode } : undefined);
    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [{ kind: 'revision-changed' }]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: `delete_table: ordinal ${tableOrdinal}`,
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [
        { selector: { kind: 'ordinal', ordinalKind: 'tableOrdinal', value: tableOrdinal }, matched: [table.nodeId] },
      ],
      executedOperations: [{ operationId: 'doc.blocks.delete', result: compactOpResult(result) }],
      verification,
    };
  } catch (err) {
    return failedReceipt('delete_table', err, pre);
  }
}

function resolveSnapshotTable(
  snapshot: DocumentSnapshot,
  tableOrdinal: number | undefined,
): { nodeId: string; ordinal: number; rows: number; columns: number } | null {
  if (snapshot.tables.length === 0) return null;
  if (tableOrdinal == null) {
    if (snapshot.tables.length !== 1) return null;
    const t = snapshot.tables[0]!;
    return { nodeId: t.nodeId, ordinal: t.ordinal, rows: t.rows, columns: t.columns };
  }
  const t = snapshot.tables.find((entry) => entry.ordinal === tableOrdinal);
  return t ? { nodeId: t.nodeId, ordinal: t.ordinal, rows: t.rows, columns: t.columns } : null;
}

async function runInsertTableRow(doc: BoundDocApi, args: InsertTableRowArgs): Promise<AgentReceipt> {
  const preIdentity = await readDocumentIdentity(doc);
  const pre = snapshotFromIdentity(preIdentity);
  try {
    const table = await resolveTableContextQuick(doc, args.tableOrdinal);
    if (!table) {
      return failedReceipt(
        'insert_table_row',
        new Error(
          args.tableOrdinal == null
            ? 'no unique table found (specify tableOrdinal)'
            : `table ordinal ${args.tableOrdinal} not found`,
        ),
        pre,
      );
    }
    const insertFn = maybeMethod(doc, ['tables', 'insertRow']);
    if (!insertFn) {
      throw new SuperDocCliError('doc.tables.insertRow is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }
    const lastRowIndex = Math.max(0, table.rows - 1);
    const rowIndex = args.rowIndex == null ? lastRowIndex : Math.min(args.rowIndex, lastRowIndex);
    const position = args.position === 'before' || args.position === 'above' ? 'above' : 'below';
    const insertParams: Record<string, unknown> = {
      target: { kind: 'block', nodeType: 'table', nodeId: table.nodeId },
      rowIndex,
      position,
    };
    if (args.changeMode) insertParams.changeMode = args.changeMode;
    if (args.dryRun === true) insertParams.dryRun = true;
    const insertResult = await insertFn(insertParams);
    const executed: Array<{ operationId: string; result?: unknown; rationale?: string }> = [
      {
        operationId: 'doc.tables.insertRow',
        result: insertResult,
        rationale: args.dryRun === true ? 'Preview only; no document mutation applied.' : undefined,
      },
    ];

    if (args.dryRun !== true && args.cellTexts && args.cellTexts.length > 0) {
      const insertedRowIndex = position === 'below' ? rowIndex + 1 : rowIndex;
      const cells = args.cellTexts.map((text, columnIndex) => ({ rowIndex: insertedRowIndex, columnIndex, text }));
      const applied = await applyTableCellTexts(doc, table.nodeId, table.ordinal, cells, args.changeMode);
      if (applied.length > 0) {
        executed.push({
          operationId: 'doc.mutations.apply',
          rationale: `Populated ${applied.length} cell(s) in new row`,
        });
      }
    }

    const postIdentity = await readDocumentIdentity(doc);
    const postTable = await getTableShape(doc, table.nodeId);
    const verification: VerificationResult[] = [
      revisionVerification(preIdentity.revision, postIdentity.revision, args.dryRun !== true),
    ];
    if (postTable) {
      verification.push({
        check: {
          kind: 'table-shape',
          nodeId: table.nodeId,
          rows: args.dryRun === true ? table.rows : table.rows + 1,
          columns: table.columns,
        },
        passed:
          postTable.rows === (args.dryRun === true ? table.rows : table.rows + 1) &&
          postTable.columns === table.columns,
      });
    }
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: 'insert_table_row',
      preSnapshot: preIdentity,
      postSnapshot: postIdentity,
      selectedTargets: [],
      executedOperations: executed,
      verification,
    };
  } catch (err) {
    return failedReceipt('insert_table_row', err, pre);
  }
}

async function runInsertTableColumn(doc: BoundDocApi, args: InsertTableColumnArgs): Promise<AgentReceipt> {
  const preIdentity = await readDocumentIdentity(doc);
  const pre = snapshotFromIdentity(preIdentity);
  try {
    const table = await resolveTableContextQuick(doc, args.tableOrdinal);
    if (!table) {
      return failedReceipt(
        'insert_table_column',
        new Error(
          args.tableOrdinal == null
            ? 'no unique table found (specify tableOrdinal)'
            : `table ordinal ${args.tableOrdinal} not found`,
        ),
        pre,
      );
    }
    const insertFn = maybeMethod(doc, ['tables', 'insertColumn']);
    if (!insertFn) {
      throw new SuperDocCliError('doc.tables.insertColumn is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }
    const lastColumnIndex = Math.max(0, table.columns - 1);
    const columnIndex = args.columnIndex == null ? lastColumnIndex : Math.min(args.columnIndex, lastColumnIndex);
    const position = args.position ?? 'right';
    const insertParams: Record<string, unknown> = {
      target: { kind: 'block', nodeType: 'table', nodeId: table.nodeId },
      columnIndex,
      position,
    };
    if (args.changeMode) insertParams.changeMode = args.changeMode;
    const insertResult = await insertFn(insertParams);
    const executed: Array<{ operationId: string; result?: unknown; rationale?: string }> = [
      { operationId: 'doc.tables.insertColumn', result: insertResult },
    ];

    if (args.headerText) {
      const headerColumnIndex = position === 'right' ? columnIndex + 1 : columnIndex;
      const applied = await applyTableCellTexts(
        doc,
        table.nodeId,
        table.ordinal,
        [{ rowIndex: 0, columnIndex: headerColumnIndex, text: args.headerText }],
        args.changeMode,
      );
      if (applied.length > 0) {
        executed.push({ operationId: 'doc.mutations.apply', rationale: 'Populated header cell' });
      }
    }

    const postIdentity = await readDocumentIdentity(doc);
    const postTable = await getTableShape(doc, table.nodeId);
    const verification: VerificationResult[] = [
      revisionVerification(preIdentity.revision, postIdentity.revision, true),
    ];
    if (postTable) {
      verification.push({
        check: {
          kind: 'table-shape',
          nodeId: table.nodeId,
          rows: table.rows,
          columns: table.columns + 1,
        },
        passed: postTable.rows === table.rows && postTable.columns === table.columns + 1,
      });
    }
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: 'insert_table_column',
      preSnapshot: preIdentity,
      postSnapshot: postIdentity,
      selectedTargets: [],
      executedOperations: executed,
      verification,
    };
  } catch (err) {
    return failedReceipt('insert_table_column', err, pre);
  }
}

async function runDeleteTableRow(doc: BoundDocApi, args: DeleteTableRowArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    const table = resolveSnapshotTable(pre, args.tableOrdinal);
    if (!table) {
      return failedReceipt('delete_table_row', new Error('no table resolved for delete_table_row'), pre);
    }
    if (!Number.isInteger(args.rowIndex) || args.rowIndex < 0 || args.rowIndex >= table.rows) {
      return failedReceipt(
        'delete_table_row',
        new Error(`rowIndex ${args.rowIndex} out of range [0, ${table.rows - 1}]`),
        pre,
      );
    }
    const fn = maybeMethod(doc, ['tables', 'deleteRow']);
    if (!fn) {
      throw new SuperDocCliError('doc.tables.deleteRow is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }
    const params: Record<string, unknown> = {
      target: { kind: 'block', nodeType: 'table', nodeId: table.nodeId },
      rowIndex: args.rowIndex,
    };
    if (args.changeMode) params.changeMode = args.changeMode;
    const result = await fn(params);
    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [{ kind: 'revision-changed' }]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: 'delete_table_row',
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [],
      executedOperations: [{ operationId: 'doc.tables.deleteRow', result }],
      verification,
    };
  } catch (err) {
    return failedReceipt('delete_table_row', err, pre);
  }
}

async function runDeleteTableColumn(doc: BoundDocApi, args: DeleteTableColumnArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    const table = resolveSnapshotTable(pre, args.tableOrdinal);
    if (!table) {
      return failedReceipt('delete_table_column', new Error('no table resolved for delete_table_column'), pre);
    }
    if (!Number.isInteger(args.columnIndex) || args.columnIndex < 0 || args.columnIndex >= table.columns) {
      return failedReceipt(
        'delete_table_column',
        new Error(`columnIndex ${args.columnIndex} out of range [0, ${table.columns - 1}]`),
        pre,
      );
    }
    const fn = maybeMethod(doc, ['tables', 'deleteColumn']);
    if (!fn) {
      throw new SuperDocCliError('doc.tables.deleteColumn is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }
    const params: Record<string, unknown> = {
      target: { kind: 'block', nodeType: 'table', nodeId: table.nodeId },
      columnIndex: args.columnIndex,
    };
    if (args.changeMode) params.changeMode = args.changeMode;
    const result = await fn(params);
    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [{ kind: 'revision-changed' }]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: 'delete_table_column',
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [],
      executedOperations: [{ operationId: 'doc.tables.deleteColumn', result }],
      verification,
    };
  } catch (err) {
    return failedReceipt('delete_table_column', err, pre);
  }
}

async function runSplitTable(doc: BoundDocApi, args: SplitTableArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc);
  try {
    const table = resolveSnapshotTable(pre, args.tableOrdinal);
    if (!table) {
      return failedReceipt('split_table', new Error('no table resolved for split_table'), pre);
    }
    if (!Number.isInteger(args.rowIndex) || args.rowIndex < 1 || args.rowIndex >= table.rows) {
      return failedReceipt(
        'split_table',
        new Error(`rowIndex ${args.rowIndex} must be in range [1, ${table.rows - 1}]`),
        pre,
      );
    }
    const splitFn = maybeMethod(doc, ['tables', 'split']);
    if (!splitFn) {
      throw new SuperDocCliError('doc.tables.split is not available on the document handle.', {
        code: 'TOOL_DISPATCH_NOT_FOUND',
      });
    }
    const params: Record<string, unknown> = {
      target: { kind: 'block', nodeType: 'table', nodeId: table.nodeId },
      rowIndex: args.rowIndex,
    };
    if (args.changeMode) params.changeMode = args.changeMode;
    const splitResult = await splitFn(params);
    const executed: Array<{ operationId: string; result?: unknown }> = [
      { operationId: 'doc.tables.split', result: splitResult },
    ];

    if (args.separatorText) {
      const placement: ReturnType<typeof resolvePlacement> = {
        kind: 'after',
        target: { kind: 'block', nodeType: 'table', nodeId: table.nodeId },
      };
      const sepResult = await executeCreateParagraph(doc, args.separatorText, placement, args.changeMode);
      executed.push({ operationId: 'doc.create.paragraph', result: sepResult });
    }

    const post = await buildDocumentSnapshot(doc);
    const verification = evaluateChecks(pre, post, [{ kind: 'revision-changed' }]);
    return {
      status: verification.every((v) => v.passed) ? 'ok' : 'failed',
      intent: 'split_table',
      preSnapshot: { revision: pre.revision, counts: pre.counts },
      postSnapshot: { revision: post.revision, counts: post.counts },
      selectedTargets: [],
      executedOperations: executed,
      verification,
    };
  } catch (err) {
    return failedReceipt('split_table', err, pre);
  }
}

// ---------------------------------------------------------------------------
// Scoped replace — span-targeted text.rewrite inside one selected block.
// Replaces whole-block rewrites that destroyed non-text inline nodes (tabs,
// breaks, images) and produced giant tracked-change diffs. Receipts report
// per-edit truth (editsApplied/editsSkipped); a partially-applied request is
// `partial`, never a silent "ok".
// ---------------------------------------------------------------------------

type ScopedReplaceArgs = {
  edits: Array<{ find: string; replace?: string }>;
  selector: AgentSelector;
  caseSensitive?: boolean;
  changeMode?: AgentChangeMode;
};

function snippetAround(text: string, limit = 240): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}…[+${text.length - limit} chars]`;
}

/**
 * Locate a term inside table cells and return a ready-to-use tableCell
 * selector suggestion (prose + the same selector as data). Probe-major:
 * earlier probes (the edit's find texts) win over later ones (selector terms),
 * so the suggestion points at the cell holding the text being edited rather
 * than a section-label cell that merely shares a term like "1.2".
 */
function suggestTableCell(
  snapshot: DocumentSnapshot,
  probes: readonly string[],
): { message: string; selector: Record<string, unknown> } | null {
  const tables = snapshot.tables ?? [];
  for (const probe of probes) {
    const needle = probe.toLowerCase();
    for (let t = 0; t < tables.length; t++) {
      for (const cell of tables[t]!.cells) {
        if (cell.text.toLowerCase().includes(needle)) {
          const selector = {
            kind: 'tableCell',
            tableOrdinal: t + 1,
            rowIndex: cell.rowIndex,
            columnIndex: cell.columnIndex,
          };
          return {
            message:
              `Found ${JSON.stringify(probe)} inside table ${t + 1} cell (rowIndex ${cell.rowIndex}, columnIndex ${cell.columnIndex}). ` +
              `Use selector ${JSON.stringify(selector)}.`,
            selector,
          };
        }
      }
    }
  }
  return null;
}

function describeSelectorFailure(
  selector: AgentSelector,
  matched: readonly string[],
  snapshot: DocumentSnapshot,
  finds: readonly string[] = [],
): { message: string; recovery?: ReceiptRecovery } {
  if (matched.length === 0) {
    const terms =
      selector.kind === 'textSearch' && Array.isArray((selector as { terms?: unknown }).terms)
        ? (selector as { terms: readonly string[] }).terms
        : [];
    // Prefer locating the text being edited (the finds) over the selector terms:
    // section labels and section bodies usually live in different cells.
    const probes = [...finds, ...terms];
    const cellHint = probes.length > 0 ? suggestTableCell(snapshot, probes) : null;
    if (cellHint) {
      return {
        message: `selector matched no body block. ${cellHint.message}`,
        recovery: { kind: 'retry', selector: cellHint.selector },
      };
    }
    const hint =
      selector.kind === 'textSearch' && terms.length > 0 && ((selector as { match?: string }).match ?? 'all') === 'all'
        ? ' With match:"all" every term must appear in the SAME block — section labels and body text in tables usually live in different cells. Retry with match:"any", a single distinctive term, or a tableCell selector {kind:"tableCell",tableOrdinal,rowIndex,columnIndex}.'
        : ' Inspect first and target by nodeId, or use a tableCell/ordinal selector.';
    return { message: `selector matched no block.${hint}`, recovery: { kind: 'reinspect' } };
  }
  const preview = matched
    .slice(0, 3)
    .map((id) => {
      const block = snapshot.blocks.find((b) => b.nodeId === id);
      return `${id}(${block?.nodeType ?? '?'}: ${snippetAround(block?.text ?? '', 40)})`;
    })
    .join(', ');
  return {
    message: `selector matched ${matched.length} blocks (${preview}…). Add occurrence/nodeId to make it unique.`,
    recovery: { kind: 'reinspect' },
  };
}

/** Resolve text-bearing target by nodeId from body blocks OR table cells. */
function findTextTarget(
  snapshot: DocumentSnapshot,
  nodeId: string,
): { nodeId: string; nodeType: string; text: string } | null {
  const block = snapshot.blocks.find((b) => b.nodeId === nodeId);
  if (block) return { nodeId, nodeType: block.nodeType, text: block.text };
  for (const table of snapshot.tables ?? []) {
    const cell = table.cells.find((c) => c.nodeId === nodeId);
    if (cell) return { nodeId, nodeType: 'paragraph', text: cell.text };
  }
  return null;
}

function compactOpResult(result: unknown): unknown {
  if (!isRecord(result)) return result;
  const compact: Record<string, unknown> = {};
  if (typeof result.success === 'boolean') compact.success = result.success;
  if (isRecord(result.revision)) compact.revision = result.revision;
  if (Array.isArray(result.steps)) compact.stepCount = result.steps.length;
  return compact;
}

function parseScopedReplaceArgs(args: Record<string, unknown>): ScopedReplaceArgs | null {
  if (args.action !== 'replace_text') return null;
  if (!isRecord(args.selector)) return null;
  if (!Array.isArray(args.edits) || args.edits.length === 0) return null;
  const edits: Array<{ find: string; replace?: string }> = [];
  for (const entry of args.edits) {
    if (!isRecord(entry) || typeof entry.find !== 'string' || entry.find.length === 0) return null;
    edits.push({ find: entry.find, replace: typeof entry.replace === 'string' ? entry.replace : '' });
  }
  return {
    edits,
    selector: args.selector as unknown as AgentSelector,
    caseSensitive: args.caseSensitive === true,
    changeMode: args.changeMode === 'tracked' ? 'tracked' : 'direct',
  };
}

async function runScopedReplace(doc: BoundDocApi, args: ScopedReplaceArgs): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc, { includeDomains: ['blocks', 'tables'] });
  const matched = resolveSnapshotSelector(pre, args.selector);
  if (matched.length !== 1) {
    const failure = describeSelectorFailure(
      args.selector,
      matched,
      pre,
      args.edits.map((e) => e.find),
    );
    return {
      status: 'failed',
      intent: 'replace_text',
      errors: [{ code: 'SELECTOR_NOT_UNIQUE', message: failure.message, recovery: failure.recovery }],
    };
  }
  const nodeId = matched[0]!;
  const block = findTextTarget(pre, nodeId);
  if (!block) {
    return {
      status: 'failed',
      intent: 'replace_text',
      errors: [{ code: 'TARGET_NOT_FOUND', message: `resolved block ${nodeId} missing from snapshot` }],
    };
  }

  const caseSensitive = args.caseSensitive === true;
  const perEdit: Array<{ find: string; occurrences: number }> = [];
  const allSpans: Array<{ start: number; end: number; replace: string; find: string }> = [];
  for (const edit of args.edits) {
    const spans = findRanges(block.text, edit.find, caseSensitive);
    perEdit.push({ find: edit.find, occurrences: spans.length });
    for (const span of spans) allSpans.push({ ...span, replace: edit.replace ?? '', find: edit.find });
  }

  const appliedEdits = perEdit.filter((e) => e.occurrences > 0);
  const skippedEdits = perEdit.filter((e) => e.occurrences === 0);
  if (allSpans.length === 0) {
    const cellHint = suggestTableCell(
      pre,
      args.edits.map((e) => e.find),
    );
    return {
      status: 'failed',
      intent: 'replace_text',
      selectedBlock: { nodeId, nodeType: block.nodeType, text: snippetAround(block.text) },
      errors: [
        {
          code: 'MATCH_NOT_FOUND',
          message:
            `none of the finds occur in the selected block. Block text: ${JSON.stringify(snippetAround(block.text, 160))}` +
            (cellHint != null ? ` ${cellHint.message}` : ''),
          ...(cellHint != null ? { recovery: { kind: 'retry' as const, selector: cellHint.selector } } : {}),
        },
      ],
    };
  }

  // Overlapping spans (e.g. finds that contain each other) cannot be applied
  // in one batch; keep the earliest, drop overlaps, and say so.
  allSpans.sort((a, b) => a.start - b.start || a.end - b.end);
  const planned: typeof allSpans = [];
  const droppedOverlaps: typeof allSpans = [];
  let lastEnd = -1;
  for (const span of allSpans) {
    if (span.start < lastEnd) {
      droppedOverlaps.push(span);
      continue;
    }
    planned.push(span);
    lastEnd = span.end;
  }

  const steps = planned.map((span, index) => ({
    id: `scoped-replace-${index + 1}`,
    op: 'text.rewrite',
    where: {
      by: 'target',
      target: {
        kind: 'selection',
        start: { kind: 'text', blockId: nodeId, offset: span.start },
        end: { kind: 'text', blockId: nodeId, offset: span.end },
      },
    },
    args: { replacement: { text: span.replace } },
  }));

  const result = await executeMutations(doc, steps, args.changeMode);

  const post = await buildDocumentSnapshot(doc, { includeDomains: ['blocks', 'tables'] });
  const postBlock = findTextTarget(post, nodeId);
  const expected = planned.reduceRight(
    (text, span) => text.slice(0, span.start) + span.replace + text.slice(span.end),
    block.text,
  );
  const tracked = (args.changeMode ?? 'direct') === 'tracked';
  // In tracked mode the deleted text is still present in the block, so only
  // require the inserted text to be visible.
  const passed =
    postBlock != null &&
    (tracked
      ? planned.every((span) => span.replace.length === 0 || postBlock.text.includes(span.replace))
      : postBlock.text === expected);

  // Partially-applied requests must NOT read as success: a model that asked
  // for two edits and got one will stop if the receipt says "ok".
  const status = !passed ? 'failed' : skippedEdits.length > 0 ? 'partial' : 'ok';
  return {
    status,
    intent: 'replace_text',
    ...(status === 'partial'
      ? {
          nextStep:
            `${skippedEdits.length} of ${perEdit.length} edits were NOT applied — the find text is not in the selected block. ` +
            `Do not stop: call replace_text again for the remaining edits with a different selector (or no selector for a global replace).`,
          recovery: { kind: 'retry' as const },
        }
      : {}),
    preSnapshot: { revision: pre.revision },
    postSnapshot: { revision: post.revision },
    selectedBlock: { nodeId, nodeType: block.nodeType },
    editsRequested: perEdit.length,
    editsApplied: appliedEdits,
    ...(skippedEdits.length > 0
      ? { editsSkipped: skippedEdits.map((e) => ({ find: e.find, reason: 'not present in selected block' })) }
      : {}),
    ...(droppedOverlaps.length > 0 ? { overlapsDropped: droppedOverlaps.map((s) => s.find) } : {}),
    replacedSpans: planned.length,
    postText: snippetAround(postBlock?.text ?? ''),
    executedOperations: [{ operationId: 'doc.mutations.apply', result: compactOpResult(result) }],
    verification: [
      { check: { kind: 'block-text-matches-expectation' } as AgentVerificationCheck, passed },
      { check: { kind: 'revision-changed' }, passed: pre.revision !== post.revision },
    ],
  };
}

// ---------------------------------------------------------------------------
// Block rows — blocks.list projection with effective formatting + numbering.
// Used by the list/numbering actions and contextual formatting.
// ---------------------------------------------------------------------------

type BlockRow = {
  ordinal?: number;
  nodeId?: string;
  nodeType?: string;
  styleId?: string | null;
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  color?: string;
  // TODO: italic — the formatting sampler (super-editor extractBlockFormatting)
  // and the BlockListEntry contract do not yet surface italic, so this is always
  // undefined today. Present so the shared inline-copy helper can match italics
  // for free once the read side (and doc-api contract) start carrying it.
  italic?: boolean;
  indent?: { left?: number; right?: number; firstLine?: number; hanging?: number };
  textPreview?: string | null;
  isEmpty?: boolean;
  numbering?: { marker?: string | null; path?: number[] | null; kind?: string | null } | null;
};

/**
 * Build a `doc.format.apply` `inline` payload from a block row's sampled look.
 * Shared by apply_style (likeText copy) and add_list_items (anchor auto-match)
 * so both copy the SAME set of run properties in one place. Only emits keys the
 * row actually carries — an empty result means "nothing to match".
 */
function inlineLookFromRow(row: {
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  color?: string;
  italic?: boolean;
}): Record<string, unknown> {
  const inline: Record<string, unknown> = {};
  if (row.fontFamily) inline.fontFamily = row.fontFamily;
  if (typeof row.fontSize === 'number') inline.fontSize = row.fontSize;
  if (row.color) inline.color = row.color;
  if (row.bold === true) inline.bold = true;
  // TODO: italic — no-op until the read side samples the italic mark (see BlockRow).
  if (row.italic === true) inline.italic = true;
  return inline;
}

async function listBlockRows(doc: BoundDocApi): Promise<BlockRow[]> {
  const fn = maybeMethod(doc, ['blocks', 'list']);
  if (!fn) return [];
  const raw = (await fn({})) as { blocks?: BlockRow[] } | null;
  return Array.isArray(raw?.blocks) ? raw!.blocks! : [];
}

type BlockNumbering = { marker?: string | null; path?: number[] | null; kind?: string | null };

function blockNumbering(row: BlockRow | null | undefined): BlockNumbering | null {
  const numbering = row?.numbering;
  return numbering && (numbering.marker || numbering.path) ? numbering : null;
}

/** One real list across a contiguous paragraph range (lists.create fromParagraphs). */
async function createListFromParagraphRange(
  createFn: (input: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>,
  kind: 'ordered' | 'bullet',
  fromNodeId: string,
  toNodeId: string | null,
  changeMode?: AgentChangeMode,
): Promise<unknown> {
  // Dual dialect — see executeCreateParagraph: input key for the CLI
  // transport, 2nd MutationOptions arg for in-process hosts.
  return createFn(
    {
      mode: 'fromParagraphs',
      kind,
      target: {
        from: { kind: 'block', nodeType: 'paragraph', nodeId: fromNodeId },
        to: { kind: 'block', nodeType: 'paragraph', nodeId: toNodeId },
      },
      ...(changeMode === 'tracked' ? { changeMode: 'tracked' } : {}),
    },
    changeMode === 'tracked' ? { changeMode: 'tracked' } : undefined,
  );
}

/** Pick a list by 1-based ordinal, by text inside one of its items, or the only list. */
function chooseListFromSnapshot(
  lists: DocumentSnapshot['lists'],
  args: { listOrdinal?: unknown; anchorText?: unknown },
): DocumentSnapshot['lists'][number] | null {
  if (typeof args.listOrdinal === 'number') return lists[args.listOrdinal - 1] ?? null;
  if (typeof args.anchorText === 'string' && args.anchorText.length > 0) {
    const needle = args.anchorText.toLowerCase();
    return lists.find((l) => l.items.some((it) => it.text.toLowerCase().includes(needle))) ?? null;
  }
  return lists.length === 1 ? (lists[0] ?? null) : null;
}

const normMarker = (m: string) => m.trim().replace(/\.$/, '');

// ---------------------------------------------------------------------------
// convert_list — lists, numbered-clause ranges, and plain paragraph ranges.
// ---------------------------------------------------------------------------

async function convertNumberedRange(
  doc: BoundDocApi,
  fromMarker: string,
  toMarker: string,
  kind: 'ordered' | 'bullet',
  tracked: boolean,
): Promise<AgentReceipt> {
  const rows = await listBlockRows(doc);
  // Bullet glyphs (and any marker shared by several blocks) cannot identify a
  // range — converting bullets "back to numbers" right after a conversion is
  // an UNDO, not a re-conversion (re-converting creates a NEW flat scheme and
  // loses the original numbering).
  const fromCount = rows.filter((r) => normMarker(blockNumbering(r)?.marker ?? '') === normMarker(fromMarker)).length;
  const toCount = rows.filter((r) => normMarker(blockNumbering(r)?.marker ?? '') === normMarker(toMarker)).length;
  if (/^[•◦▪‣·*-]+$/.test(normMarker(fromMarker)) || fromCount > 1 || toCount > 1) {
    return {
      status: 'failed',
      intent: 'convert_list',
      errors: [
        {
          code: 'AMBIGUOUS_MARKER',
          message:
            `marker ${JSON.stringify(fromMarker)} does not uniquely identify a block. ` +
            `For bullet lists use anchorText or listOrdinal. To REVERT a recent conversion, call superdoc_perform_action ` +
            `{"action":"undo_changes","untilMarker":"<original marker>"} — that restores the original numbering exactly, which re-conversion cannot.`,
          recovery: {
            kind: 'revert',
            call: 'superdoc_perform_action {"action":"undo_changes","untilMarker":"<original marker>"}',
          },
        },
      ],
    };
  }
  const fromIdx = rows.findIndex((r) => normMarker(blockNumbering(r)?.marker ?? '') === normMarker(fromMarker));
  const toIdx = rows.findIndex((r) => normMarker(blockNumbering(r)?.marker ?? '') === normMarker(toMarker));
  if (fromIdx === -1 || toIdx === -1 || toIdx < fromIdx) {
    const available = rows
      .filter((r) => blockNumbering(r)?.marker)
      .map((r) => blockNumbering(r)!.marker)
      .slice(0, 30);
    return {
      status: 'failed',
      intent: 'convert_list',
      errors: [
        {
          code: 'TARGET_NOT_FOUND',
          message: `markers ${JSON.stringify(fromMarker)}..${JSON.stringify(toMarker)} not found in order. Available markers: ${available.join(' ')}`,
          recovery: { kind: 'reinspect' },
        },
      ],
    };
  }
  const range = rows.slice(fromIdx, toIdx + 1).filter((r) => blockNumbering(r)?.marker);
  const detachFn = maybeMethod(doc, ['lists', 'detach']);
  const createFn = maybeMethod(doc, ['lists', 'create']);
  if (!detachFn || !createFn) {
    throw new SuperDocCliError('doc.lists.detach/create are not available on the document handle.', {
      code: 'TOOL_DISPATCH_NOT_FOUND',
    });
  }
  let historySteps = 0;
  for (const row of range) {
    await detachFn({ target: { kind: 'block', nodeType: 'listItem', nodeId: row.nodeId } });
    historySteps += 1;
  }
  historySteps += 1; // lists.create below
  await createListFromParagraphRange(
    createFn,
    kind,
    range[0]!.nodeId!,
    range[range.length - 1]!.nodeId!,
    tracked ? 'tracked' : undefined,
  );

  // Contextual awareness for the MARKERS: a freshly created numbering
  // definition does not inherit the document's fonts, so "1." renders in the
  // default marker font next to Arial body text. Match the range's own font.
  try {
    const fontFamily = (range[0] as { fontFamily?: string }).fontFamily;
    const setMarkerFont = maybeMethod(doc, ['lists', 'setLevelMarkerFont']);
    if (fontFamily && setMarkerFont) {
      const primaryFont = fontFamily.split(',')[0]!.trim();
      for (const level of [0, 1, 2]) {
        await setMarkerFont({
          target: { kind: 'block', nodeType: 'listItem', nodeId: range[0]!.nodeId },
          level,
          fontFamily: primaryFont,
        }).then(
          () => {
            historySteps += 1;
          },
          () => {},
        );
      }
    }
  } catch {
    // marker-font matching is cosmetic; the conversion result below is what counts
  }

  const post = await listBlockRows(doc);
  const converted = post.filter((r) => range.some((x) => x.nodeId === r.nodeId) && blockNumbering(r)?.kind === kind);
  const passed = converted.length === range.length;

  // Truth-telling nudge: numbered blocks immediately adjacent to the
  // converted range stayed in the old scheme (and may have RENUMBERED now
  // that their siblings left it). If the user meant "all items", the model
  // needs to see them — receipts must surface what the range missed.
  const convertedIds = new Set(range.map((r) => r.nodeId));
  const adjacentNumbered: Array<{ marker: string; nodeId: string }> = [];
  const postToIdx = post.findIndex((r) => r.nodeId === range[range.length - 1]!.nodeId);
  for (let i = postToIdx + 1; i >= 0 && i < post.length; i++) {
    const row = post[i]!;
    const rowNumbering = blockNumbering(row);
    if (!rowNumbering?.marker || convertedIds.has(row.nodeId) || rowNumbering.kind === kind) break;
    adjacentNumbered.push({ marker: rowNumbering.marker, nodeId: row.nodeId! });
  }

  const revertCall = `superdoc_perform_action {"action":"undo_changes","untilMarker":${JSON.stringify(fromMarker)}}`;
  return {
    status: passed ? 'ok' : 'partial',
    intent: 'convert_list',
    convertedListKind: kind,
    itemCount: converted.length,
    requested: range.length,
    // Reverting this conversion requires undoing EVERY step it dispatched —
    // hand the model the EXACT call, not a description of one.
    undoSteps: historySteps,
    revertHint: `to revert this conversion, call ${revertCall} — steps:1 is NOT enough`,
    recovery: { kind: 'revert', call: revertCall },
    ...(adjacentNumbered.length > 0
      ? {
          adjacentNumberedNotConverted: adjacentNumbered,
          note:
            `${adjacentNumbered.length} numbered block(s) immediately after the range were NOT converted and may have renumbered ` +
            `(now: ${adjacentNumbered.map((a) => a.marker).join(' ')}). If the user meant ALL items, convert these too (use their nodeIds).`,
        }
      : {}),
    ...(passed
      ? {}
      : {
          nextStep: `${range.length - converted.length} blocks did not convert — re-inspect and retry those markers.`,
        }),
    verification: [{ check: { kind: 'range-converted', expected: range.length } as AgentVerificationCheck, passed }],
  };
}

async function convertParagraphRange(
  doc: BoundDocApi,
  fromText: string,
  toText: string,
  kind: 'ordered' | 'bullet',
  tracked: boolean,
): Promise<AgentReceipt> {
  const pre = await buildDocumentSnapshot(doc, { includeDomains: ['blocks'] });
  const blocks = pre.blocks ?? [];
  const findBlock = (needle: string) =>
    blocks.findIndex((b) => b.nodeType === 'paragraph' && (b.text ?? '').toLowerCase().includes(needle.toLowerCase()));
  const fromIdx = findBlock(fromText);
  const toIdx = findBlock(toText);
  if (fromIdx < 0 || toIdx < 0) {
    return {
      status: 'failed',
      intent: 'convert_list',
      errors: [
        {
          code: 'TARGET_NOT_FOUND',
          message:
            `convert_list could not find a plain paragraph containing ${JSON.stringify(fromIdx < 0 ? fromText : toText)}. ` +
            'fromText/toText must each match text inside an existing non-list paragraph. Re-run superdoc_inspect and pass exact text.',
          recovery: { kind: 'reinspect' },
        },
      ],
    };
  }
  const [start, end] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
  const range = blocks.slice(start, end + 1);
  const nonParagraph = range.find((b) => b.nodeType !== 'paragraph');
  if (nonParagraph) {
    return {
      status: 'failed',
      intent: 'convert_list',
      errors: [
        {
          code: 'INVALID_TARGET',
          message:
            `the range from ${JSON.stringify(fromText)} to ${JSON.stringify(toText)} crosses a ${nonParagraph.nodeType} ` +
            `("${(nonParagraph.textPreview ?? '').slice(0, 40)}"). fromText/toText must bound consecutive plain paragraphs only.`,
        },
      ],
    };
  }

  const createFn = maybeMethod(doc, ['lists', 'create']);
  if (!createFn) {
    return {
      status: 'failed',
      intent: 'convert_list',
      errors: [{ code: 'ACTION_FAILED', message: 'lists.create is not available on this document handle.' }],
    };
  }
  await createListFromParagraphRange(
    createFn,
    kind,
    range[0]!.nodeId,
    range[range.length - 1]!.nodeId,
    tracked ? 'tracked' : undefined,
  );

  const post = await buildDocumentSnapshot(doc, { includeDomains: ['blocks', 'lists'] });
  const postList = (post.lists ?? []).find((l) => l.items.some((it) => it.nodeId === range[0]!.nodeId));
  const allInOneList = postList != null && range.every((b) => postList.items.some((it) => it.nodeId === b.nodeId));
  return {
    status: allInOneList ? 'ok' : 'partial',
    intent: 'convert_list',
    listKind: kind,
    itemsConverted: range.length,
    note: allInOneList
      ? `${range.length} paragraphs converted in place into one ${kind} list — text untouched.`
      : 'conversion ran but the paragraphs did not land in a single list - re-inspect before further edits.',
    verification: [
      {
        check: { kind: 'paragraphs-form-one-list', expected: range.length } as AgentVerificationCheck,
        passed: allInOneList,
      },
    ],
  };
}

async function runConvertList(doc: BoundDocApi, args: Record<string, unknown>): Promise<AgentReceipt> {
  const kind = args.kind === 'ordered' || args.kind === 'bullet' ? args.kind : null;
  if (!kind) {
    return {
      status: 'failed',
      intent: 'convert_list',
      errors: [{ code: 'INVALID_ARGUMENT', message: "convert_list requires kind: 'ordered' | 'bullet'" }],
    };
  }
  // Marker-range path: numbered CLAUSES (heading-styled blocks carrying
  // numbering) are invisible to the lists domain, but they convert cleanly
  // via detach + create-from-range. The model passes the rendered markers
  // it saw in superdoc_inspect: { fromMarker: "2.1.", toMarker: "2.3." }.
  if (typeof args.fromMarker === 'string' && typeof args.toMarker === 'string') {
    return convertNumberedRange(doc, args.fromMarker, args.toMarker, kind, args.changeMode === 'tracked');
  }
  // Paragraph-range path: "these points should be a list" on plain
  // paragraphs. Without this, models recreate the content as a new list and
  // delete the originals — two chances to lose text. fromText/toText bound a
  // contiguous run of paragraphs; lists.create(fromParagraphs) converts them
  // in place.
  if (typeof args.fromText === 'string' && args.fromText.length > 0) {
    return convertParagraphRange(
      doc,
      args.fromText,
      typeof args.toText === 'string' && args.toText.length > 0 ? args.toText : args.fromText,
      kind,
      args.changeMode === 'tracked',
    );
  }

  const pre = await buildDocumentSnapshot(doc, { includeDomains: ['lists'] });
  const lists = pre.lists ?? [];
  const chosen = chooseListFromSnapshot(lists, args);
  if (!chosen || chosen.items.length === 0) {
    return {
      status: 'failed',
      intent: 'convert_list',
      errors: [
        {
          code: 'TARGET_NOT_FOUND',
          message:
            `could not pick a list (document has ${lists.length}). ` +
            `Pass listOrdinal (1-based) or anchorText matching an item of the list to convert. ` +
            `Lists: ${lists
              .slice(0, 5)
              .map((l, i) => `#${i + 1} ${l.kind} ${l.items.length} items ("${l.items[0]?.text.slice(0, 30) ?? ''}…")`)
              .join('; ')}`,
        },
      ],
    };
  }
  const setTypeFn = maybeMethod(doc, ['lists', 'setType']);
  const createFn = maybeMethod(doc, ['lists', 'create']);
  if (!setTypeFn) {
    throw new SuperDocCliError('doc.lists.setType is not available on the document handle.', {
      code: 'TOOL_DISPATCH_NOT_FOUND',
    });
  }
  const changeMode = args.changeMode === 'tracked' ? { changeMode: 'tracked' } : {};
  let result: unknown;
  // Record the operations that ACTUALLY ran so the receipt reflects the real
  // mutation path (setType, or the create / detach+create fallbacks) rather
  // than always claiming setType.
  const executedOperations: Array<{ operationId: string; result?: unknown }> = [];
  try {
    // Dual dialect — see executeCreateParagraph.
    result = await setTypeFn(
      {
        target: { kind: 'block', nodeType: 'listItem', nodeId: chosen.items[0]!.nodeId },
        kind,
        ...changeMode,
      },
      args.changeMode === 'tracked' ? { changeMode: 'tracked' } : undefined,
    );
    executedOperations.push({ operationId: 'doc.lists.setType', result: compactOpResult(result) });
  } catch (error) {
    // Imported documents often render "bullets" whose numbering setType
    // cannot retarget: plain paragraphs without numbering metadata, or
    // abstract numbering definitions missing the requested level ("Requested
    // level does not exist in the abstract definition"). lists.create
    // converts the paragraph range into a fresh real list instead — the
    // correct result in every one of these cases.
    const message = error instanceof Error ? error.message : String(error);
    const recoverable = /numbering metadata|abstract definition|level does not exist/i.test(message);
    if (!recoverable || !createFn) {
      throw error;
    }
    const first = chosen.items[0]!;
    const last = chosen.items[chosen.items.length - 1]!;
    const createFromParagraphs = () =>
      createListFromParagraphRange(
        createFn,
        kind,
        first.nodeId,
        last.nodeId,
        args.changeMode === 'tracked' ? 'tracked' : undefined,
      );
    try {
      result = await createFromParagraphs();
      executedOperations.push({ operationId: 'doc.lists.create', result: compactOpResult(result) });
    } catch (secondError) {
      // "Ghost" list items: listItem nodes with no numbering metadata.
      // setType/applyPreset/create all refuse them — detach to plain
      // paragraphs first (nodeIds are stable), then create the real list.
      const second = secondError instanceof Error ? secondError.message : String(secondError);
      const detachFn = maybeMethod(doc, ['lists', 'detach']);
      if (!/already list items/i.test(second) || !detachFn) {
        throw secondError;
      }
      for (const item of chosen.items) {
        const detachResult = await detachFn({ target: { kind: 'block', nodeType: 'listItem', nodeId: item.nodeId } });
        executedOperations.push({ operationId: 'doc.lists.detach', result: compactOpResult(detachResult) });
      }
      result = await createFromParagraphs();
      executedOperations.push({ operationId: 'doc.lists.create', result: compactOpResult(result) });
    }
  }

  const post = await buildDocumentSnapshot(doc, { includeDomains: ['lists'] });
  const postList = (post.lists ?? []).find((l) => l.items.some((it) => it.nodeId === chosen!.items[0]!.nodeId));
  const passed = postList?.kind === kind;
  return {
    status: passed ? 'ok' : 'failed',
    intent: 'convert_list',
    convertedListKind: postList?.kind ?? 'unknown',
    itemCount: postList?.items.length ?? 0,
    executedOperations,
    verification: [{ check: { kind: 'list-kind-equals', expected: kind } as AgentVerificationCheck, passed }],
  };
}

// ---------------------------------------------------------------------------
// Ghost-list handling for add_list_items — joins the TARGET list even when
// its items are "ghosts" (list-looking paragraphs with no numbering metadata,
// common in imported documents). The workflow path silently falls back to
// creating a brand-new list at the document end in that case — the receipt
// said "ok" while the item landed in the wrong place with the wrong marker.
// Returns null when not applicable (real lists take the stock path).
// ---------------------------------------------------------------------------

async function insertListItemsIntoGhostList(
  doc: BoundDocApi,
  args: Record<string, unknown>,
): Promise<AgentReceipt | null> {
  const items = Array.isArray(args.items)
    ? args.items.filter((t): t is string => typeof t === 'string' && t.length > 0)
    : [];
  if (items.length === 0) return null;
  const pre = await buildDocumentSnapshot(doc, { includeDomains: ['lists'] });
  const lists = pre.lists ?? [];
  const chosen = chooseListFromSnapshot(lists, args);

  if (!chosen || chosen.items.length === 0) return null;

  const isGhost = (chosen.listId ?? '') === '';
  if (!isGhost) {
    // REAL list: insert directly at the target via lists.insert — the
    // workflow path can silently create a brand-new list at the document end
    // while reporting success.
    const insertFn = maybeMethod(doc, ['lists', 'insert']);
    if (!insertFn) return null;
    let anchorId = chosen.items[chosen.items.length - 1]!.nodeId;
    const changeMode = parseChangeMode(args.changeMode);
    for (const text of items) {
      // changeMode is a MutationOption — pass it in the second options arg, not
      // the input (lists.insert reads options.changeMode; input.changeMode is ignored).
      const created = (await insertFn(
        {
          target: { kind: 'block', nodeType: 'listItem', nodeId: anchorId },
          position: 'after',
          text,
        },
        changeMode ? { changeMode } : undefined,
      )) as { item?: { nodeId?: string }; nodeId?: string } | null;
      anchorId = created?.item?.nodeId ?? created?.nodeId ?? anchorId;
    }
    const post = await buildDocumentSnapshot(doc, { includeDomains: ['lists'] });
    const postList = (post.lists ?? []).find((l) => l.items.some((it) => it.nodeId === chosen!.items[0]!.nodeId));
    const expected = chosen.items.length + items.length;
    const grewInPlace = postList != null && postList.items.length === expected;
    const textsPresent =
      postList != null && items.every((t) => postList.items.some((it) => (it.text ?? '').includes(t.slice(0, 40))));
    const passed = grewInPlace && textsPresent;
    return {
      status: passed ? 'ok' : 'failed',
      intent: 'add_list_items',
      listKind: chosen.kind,
      itemsAdded: items.length,
      listItemCount: postList?.items.length ?? 0,
      ...(passed
        ? {}
        : {
            errors: [
              {
                code: 'ACTION_FAILED',
                message: `items did not join the target list (now ${postList?.items.length ?? 0} items, expected ${expected}) — re-inspect before retrying.`,
                recovery: { kind: 'reinspect' as const },
              },
            ],
          }),
      verification: [
        { check: { kind: 'single-list-with-expected-items', expected } as AgentVerificationCheck, passed },
      ],
    };
  }

  const detachFn = maybeMethod(doc, ['lists', 'detach']);
  const createFn = maybeMethod(doc, ['lists', 'create']);
  const createParagraphFn = maybeMethod(doc, ['create', 'paragraph']);
  if (!detachFn || !createFn || !createParagraphFn) return null;

  const firstItem = chosen.items[0]!;
  const lastItem = chosen.items[chosen.items.length - 1]!;
  const kind = chosen.kind === 'ordered' ? 'ordered' : 'bullet';

  // 1. New paragraphs after the last item, in order.
  let anchor: { nodeType: string; nodeId: string } = { nodeType: 'listItem', nodeId: lastItem.nodeId };
  let lastNewId: string | null = null;
  const ghostChangeMode = parseChangeMode(args.changeMode);
  for (const text of items) {
    // Dual dialect — see executeCreateParagraph.
    const created = (await createParagraphFn(
      {
        text,
        at: { kind: 'after', target: { kind: 'block', nodeType: anchor.nodeType, nodeId: anchor.nodeId } },
        ...(ghostChangeMode ? { changeMode: ghostChangeMode } : {}),
      },
      ghostChangeMode ? { changeMode: ghostChangeMode } : undefined,
    )) as { paragraph?: { nodeId?: string }; nodeId?: string } | null;
    const newId = created?.paragraph?.nodeId ?? created?.nodeId ?? null;
    if (!newId) {
      return {
        status: 'failed',
        intent: 'add_list_items',
        errors: [{ code: 'ACTION_FAILED', message: 'could not create a paragraph for the new item' }],
      };
    }
    lastNewId = newId;
    anchor = { nodeType: 'paragraph', nodeId: newId };
  }

  // 2. Normalize: detach ghosts, then one real list across old + new.
  for (const item of chosen.items) {
    await detachFn({ target: { kind: 'block', nodeType: 'listItem', nodeId: item.nodeId } });
  }
  await createListFromParagraphRange(createFn, kind, firstItem.nodeId, lastNewId, parseChangeMode(args.changeMode));

  // 3. Verify: the target items + new items form ONE list of the right size.
  const post = await buildDocumentSnapshot(doc, { includeDomains: ['lists'] });
  const postList = (post.lists ?? []).find((l) => l.items.some((it) => it.nodeId === firstItem.nodeId));
  const expected = chosen.items.length + items.length;
  const passed =
    postList != null && postList.items.length === expected && postList.items.some((it) => it.nodeId === lastNewId);
  return {
    status: passed ? 'ok' : 'failed',
    intent: 'add_list_items',
    listKind: kind,
    itemsAdded: items.length,
    listItemCount: postList?.items.length ?? 0,
    note:
      'target list had no numbering metadata (imported "ghost" list); it was normalized to a real ' +
      kind +
      ' list while appending — markers unchanged.',
    verification: [{ check: { kind: 'single-list-with-expected-items', expected } as AgentVerificationCheck, passed }],
  };
}

// ---------------------------------------------------------------------------
// Placement-honoring append_list. The workflow behind the stock action always
// appends at document end; a model's placement:{at:"after",selector} put the
// list below the signature block while the receipt said ok. When placement
// targets a specific block, build the list there: chained paragraph creates
// at the anchor, then lists.create(fromParagraphs) across them. Returns null
// when no positional placement was requested (stock document-end append).
// ---------------------------------------------------------------------------

async function appendListAtPlacement(doc: BoundDocApi, args: Record<string, unknown>): Promise<AgentReceipt | null> {
  const items = Array.isArray(args.items)
    ? args.items.filter((t): t is string => typeof t === 'string' && t.length > 0)
    : [];
  const placement = isRecord(args.placement) ? args.placement : null;
  const at = placement && typeof placement.at === 'string' ? placement.at : null;
  const selector = placement && isRecord(placement.selector) ? placement.selector : null;
  if (items.length === 0 || !placement || (at !== 'after' && at !== 'before') || !selector) return null;

  const pre = await buildDocumentSnapshot(doc, { includeDomains: ['blocks'] });
  const blocks = pre.blocks ?? [];
  // Resolve through the SHARED selector resolver so the full selector
  // vocabulary works (nodeId / textSearch / ordinal / relative / ref) and
  // options like caseSensitive and nodeTypes are honored. The previous
  // hand-rolled nodeId/textSearch branch ignored those options (it always
  // lowercased) and silently mis-anchored or failed on other selector kinds.
  const parsedSelector = parseSelector(selector);
  const resolved = parsedSelector ? selectorToBlockTarget(parsedSelector, pre) : null;
  const anchor: (typeof blocks)[number] | null = resolved
    ? (blocks.find((b) => b.nodeId === resolved.nodeId) ?? null)
    : null;
  if (!anchor?.nodeId) {
    return {
      status: 'failed',
      intent: 'append_list',
      errors: [
        {
          code: 'TARGET_NOT_FOUND',
          message:
            'append_list placement selector did not match a block. Use {kind:"nodeId",nodeId} from superdoc_inspect, or {kind:"textSearch",terms:[...]}. Nothing was inserted.',
          recovery: { kind: 'reinspect' },
        },
      ],
    };
  }

  const createParagraphFn = maybeMethod(doc, ['create', 'paragraph']);
  const listsCreateFn = maybeMethod(doc, ['lists', 'create']);
  if (!createParagraphFn || !listsCreateFn) return null;

  const kind = args.kind === 'bullet' ? 'bullet' : 'ordered';
  const changeMode = parseChangeMode(args.changeMode);
  const texts =
    typeof args.headingText === 'string' && args.headingText.length > 0 ? [args.headingText, ...items] : items;
  const createdIds: string[] = [];
  let prev: { nodeType: string; nodeId: string } = { nodeType: anchor.nodeType, nodeId: anchor.nodeId };
  for (let i = 0; i < texts.length; i += 1) {
    const where = i === 0 && at === 'before' ? 'before' : 'after';
    // Dual dialect — see executeCreateParagraph.
    const created = (await createParagraphFn(
      {
        text: texts[i],
        at: { kind: where, target: { kind: 'block', nodeType: prev.nodeType, nodeId: prev.nodeId } },
        ...(changeMode ? { changeMode } : {}),
      },
      changeMode ? { changeMode } : undefined,
    )) as { paragraph?: { nodeId?: string }; nodeId?: string } | null;
    const newId = created?.paragraph?.nodeId ?? created?.nodeId ?? null;
    if (!newId) {
      const revertCall = `superdoc_perform_action {"action":"undo_changes","steps":${createdIds.length}}`;
      return {
        status: createdIds.length > 0 ? 'partial' : 'failed',
        intent: 'append_list',
        itemsInserted: createdIds.length,
        errors: [{ code: 'ACTION_FAILED', message: `could not create paragraph ${i + 1} of ${texts.length}` }],
        ...(createdIds.length > 0
          ? { revertHint: revertCall, recovery: { kind: 'revert' as const, call: revertCall } }
          : {}),
      };
    }
    createdIds.push(newId);
    prev = { nodeType: 'paragraph', nodeId: newId };
  }

  const listIds =
    typeof args.headingText === 'string' && args.headingText.length > 0 ? createdIds.slice(1) : createdIds;
  await createListFromParagraphRange(
    listsCreateFn,
    kind,
    listIds[0]!,
    listIds[listIds.length - 1]!,
    parseChangeMode(args.changeMode),
  );

  // Verify both promises: the items form one list AND it sits at the anchor.
  const post = await buildDocumentSnapshot(doc, { includeDomains: ['blocks', 'lists'] });
  const postBlocks = post.blocks ?? [];
  const postList = (post.lists ?? []).find((l) => l.items.some((it) => it.nodeId === listIds[0]));
  const listOk = postList != null && listIds.every((id) => postList.items.some((it) => it.nodeId === id));
  const anchorIdx = postBlocks.findIndex((b) => b.nodeId === anchor!.nodeId);
  const firstIdx = postBlocks.findIndex((b) => b.nodeId === createdIds[0]);
  const placementOk =
    anchorIdx >= 0 &&
    firstIdx >= 0 &&
    (at === 'after' ? firstIdx === anchorIdx + 1 : firstIdx === anchorIdx - texts.length);
  return {
    status: listOk && placementOk ? 'ok' : 'partial',
    intent: 'append_list',
    listKind: kind,
    itemsAdded: items.length,
    placement: placementOk
      ? `inserted ${at} the anchor block`
      : 'items inserted but adjacency check failed - re-inspect',
    verification: [
      { check: { kind: 'items-form-one-list', expected: listIds.length } as AgentVerificationCheck, passed: listOk },
      {
        check: { kind: 'placement-honored', at, anchorNodeId: anchor.nodeId } as AgentVerificationCheck,
        passed: placementOk,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Contextual formatting — inserted blocks must blend into their surroundings.
// Documents rarely look like their styles: real-world blocks carry direct
// formatting on top of styleIds (the 2.3 clauses are Heading3 but 10pt black,
// while a fresh Heading3 renders 12pt theme blue). After an insert action
// runs, copy the effective look of the nearest same-type sibling onto the new
// block — style first, then the visual props blocks.list reports. The model
// never has to think about matching; the tool blends in by default. What was
// (or could not be) matched is reported in the receipt — never swallowed.
// ---------------------------------------------------------------------------

type BlockIndent = { left?: number; right?: number; firstLine?: number; hanging?: number };
function indentsEqual(a: BlockIndent | undefined, b: BlockIndent | undefined): boolean {
  const keys = ['left', 'right', 'firstLine', 'hanging'] as const;
  return keys.every((k) => (a?.[k] ?? 0) === (b?.[k] ?? 0));
}

async function matchOneBlock(
  doc: BoundDocApi,
  postBlocks: BlockRow[],
  preIds: Set<string | undefined>,
  created: BlockRow,
  createdIndex: number,
  anchorRow: BlockRow | null,
  allowNumberingAttach: boolean,
  isTitle = false,
): Promise<Record<string, unknown> | null> {
  try {
    // Reference: placement anchor first, then nearest same-type sibling
    // (previous preferred), skipping empties and other fresh blocks.
    let reference: BlockRow | null = anchorRow && !anchorRow.isEmpty ? anchorRow : null;
    if (!reference) {
      for (let i = createdIndex - 1; i >= 0; i--) {
        const b = postBlocks[i]!;
        if (preIds.has(b.nodeId) && b.nodeType === created.nodeType && !b.isEmpty) {
          reference = b;
          break;
        }
      }
    }
    if (!reference) {
      for (let i = createdIndex + 1; i < postBlocks.length; i++) {
        const b = postBlocks[i]!;
        if (preIds.has(b.nodeId) && b.nodeType === created.nodeType && !b.isEmpty) {
          reference = b;
          break;
        }
      }
    }
    if (!reference) return null;

    const applied: Record<string, unknown> = {};

    // Numbering: when the reference participates in a numbering scheme and
    // the new block does not, attach it to the same sequence — this is what
    // makes "add item 2.4" actually render "2.4." (engine resolveListItem
    // accepts any numbering-bearing block as the attach anchor).
    const refNumbering = blockNumbering(reference);
    if (allowNumberingAttach && refNumbering && !blockNumbering(created)) {
      const attachFn = maybeMethod(doc, ['lists', 'attach']);
      if (attachFn) {
        try {
          const level = Array.isArray(refNumbering.path) ? Math.max(0, refNumbering.path.length - 1) : 0;
          await attachFn({
            target: { kind: 'block', nodeType: 'paragraph', nodeId: created.nodeId },
            attachTo: { kind: 'block', nodeType: 'listItem', nodeId: reference.nodeId },
            level,
          });
          applied.numbering = { attachedTo: reference.nodeId, level };
        } catch (err) {
          // style/format matching continues, but the receipt must say so
          applied.numberingSkipped = err instanceof Error ? err.message : String(err);
        }
      }
    }

    if (reference.styleId && reference.styleId !== created.styleId) {
      const setStyleFn = maybeMethod(doc, ['styles', 'paragraph', 'setStyle']);
      if (setStyleFn) {
        await setStyleFn({
          target: { kind: 'block', nodeType: created.nodeType, nodeId: created.nodeId },
          styleId: reference.styleId,
        });
        applied.styleId = reference.styleId;
      }
    }

    // Same "inline look" the style-copy paths use, minus properties the
    // create already produced — contextual matching only applies the DELTA.
    const inline = inlineLookFromRow(reference);
    if (inline.fontFamily === created.fontFamily) delete inline.fontFamily;
    if (inline.fontSize === created.fontSize) delete inline.fontSize;
    if (inline.color === created.color) delete inline.color;
    if (created.bold === true) delete inline.bold;

    if (Object.keys(inline).length > 0) {
      const formatApplyFn = maybeMethod(doc, ['format', 'apply']);
      if (formatApplyFn) {
        const textLength = (created.textPreview ?? '').length;
        const post = await buildDocumentSnapshot(doc, { includeDomains: ['blocks'] });
        const full = post.blocks.find((b) => b.nodeId === created.nodeId)?.text ?? '';
        await formatApplyFn({
          blockId: created.nodeId,
          start: 0,
          end: Math.max(full.length, textLength, 1),
          inline,
        });
        Object.assign(applied, inline);
      }
    }

    // Paragraph indentation: align the new block with its neighbor. The body
    // paragraphs often carry a direct left indent that the style does not, so
    // copying styleId alone leaves the insert flush against the margin.
    // EXCEPTION: a section TITLE must stay flush-left like a heading — never
    // inherit the body sibling's indent.
    const refIndent = isTitle ? undefined : reference.indent;
    if (refIndent && Object.keys(refIndent).length > 0 && !indentsEqual(refIndent, created.indent)) {
      const setIndentFn = maybeMethod(doc, ['format', 'paragraph', 'setIndentation']);
      if (setIndentFn) {
        await setIndentFn({
          target: { kind: 'block', nodeType: created.nodeType ?? 'paragraph', nodeId: created.nodeId },
          ...refIndent,
        });
        applied.indent = refIndent;
      }
    }

    if (Object.keys(applied).length > 0) {
      return { matchedSibling: reference.nodeId, applied };
    }
    return null;
  } catch (err) {
    return { matchedSibling: null, skipped: err instanceof Error ? err.message : String(err) };
  }
}

async function matchInsertedBlockFormatting(
  doc: BoundDocApi,
  preBlocks: BlockRow[],
  receipt: AgentReceipt,
  args?: Record<string, unknown>,
): Promise<AgentReceipt> {
  if (receipt.status !== 'ok') return receipt;
  try {
    const postBlocks = await listBlockRows(doc);
    const preIds = new Set(preBlocks.map((b) => b.nodeId));
    const createdRows = postBlocks
      .map((b, i) => ({ row: b, index: i }))
      .filter(({ row }) => row.nodeId && !preIds.has(row.nodeId) && !row.isEmpty);
    if (createdRows.length === 0) return receipt;

    // The placement anchor, when the action targeted one, is the user's own
    // statement of "blend in with THIS" — prefer it over type-matched siblings.
    const placement = isRecord(args?.placement) ? (args!.placement as Record<string, unknown>) : null;
    const anchorSelector =
      placement && isRecord(placement.selector) ? (placement.selector as Record<string, unknown>) : null;
    const anchorId = anchorSelector && typeof anchorSelector.nodeId === 'string' ? anchorSelector.nodeId : null;
    const anchorRow = anchorId ? (postBlocks.find((b) => b.nodeId === anchorId) ?? null) : null;

    const allApplied: Array<Record<string, unknown>> = [];
    for (let ci = 0; ci < createdRows.length; ci += 1) {
      const { row: created, index: createdIndex } = createdRows[ci]!;
      // The first of several inserted blocks is the section TITLE — it should
      // read like a heading (flush-left), so it must NOT inherit the body
      // sibling's left indent even though it matches the same anchor.
      const isTitle = createdRows.length > 1 && ci === 0;
      const result = await matchOneBlock(
        doc,
        postBlocks,
        preIds,
        created,
        createdIndex,
        anchorRow,
        createdRows.length === 1,
        isTitle,
      );
      if (result) allApplied.push(result);
    }
    if (allApplied.length === 0) return receipt;
    return { ...receipt, contextualFormatting: allApplied.length === 1 ? allApplied[0] : allApplied };
  } catch (err) {
    // Formatting matching is best-effort polish: never fail a successful
    // insert because of it — but the receipt says it was skipped.
    return {
      ...receipt,
      contextualFormatting: { skipped: err instanceof Error ? err.message : String(err) },
    };
  }
}

// ---------------------------------------------------------------------------
// undo_changes — deterministic revert. Loops doc.history.undo until the
// requested marker reappears in the block list (or N steps / history
// exhaustion). The hand-rolled version of this loop is exactly the kind of
// script models get subtly wrong; receipts beat reassurances.
// ---------------------------------------------------------------------------

async function runUndoChanges(doc: BoundDocApi, args: Record<string, unknown>): Promise<AgentReceipt> {
  const undoFn = maybeMethod(doc, ['history', 'undo']);
  if (!undoFn) {
    throw new SuperDocCliError('doc.history.undo is not available on the document handle.', {
      code: 'TOOL_DISPATCH_NOT_FOUND',
    });
  }
  const untilMarker = typeof args.untilMarker === 'string' && args.untilMarker.length > 0 ? args.untilMarker : null;
  const maxSteps = Math.min(Math.max(Number(args.steps ?? (untilMarker ? 25 : 1)) || 1, 1), 25);

  const markersNow = async () => {
    const rows = await listBlockRows(doc);
    return rows.map((r) => blockNumbering(r)?.marker).filter((m): m is string => typeof m === 'string' && m.length > 0);
  };

  let undone = 0;
  let exhausted = false;
  let restored = untilMarker ? (await markersNow()).some((m) => normMarker(m) === normMarker(untilMarker)) : false;
  while (!restored && undone < maxSteps) {
    const res = (await undoFn({})) as { noop?: boolean } | null;
    if (res && res.noop === true) {
      exhausted = true;
      break;
    }
    undone += 1;
    if (untilMarker) {
      restored = (await markersNow()).some((m) => normMarker(m) === normMarker(untilMarker));
    }
  }

  const finalMarkers = await markersNow();
  const passed = untilMarker ? restored : undone > 0;
  return {
    status: passed ? 'ok' : 'failed',
    intent: 'undo_changes',
    undone,
    ...(untilMarker ? { untilMarker, restored } : {}),
    ...(exhausted ? { historyExhausted: true } : {}),
    ...(undone > 0
      ? { note: `overshot? redo_changes {steps:${undone}} steps history forward again to recover what you undid.` }
      : {}),
    markersNow: finalMarkers.slice(0, 20),
    verification: [
      {
        check: (untilMarker
          ? { kind: 'marker-restored', marker: untilMarker }
          : { kind: 'steps-undone' }) as AgentVerificationCheck,
        passed,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// redo_changes — the inverse of undo_changes: steps the edit-history stack
// FORWARD (doc.history.redo), re-applying edits a prior undo_changes removed.
// The recovery path when an undo overshot. Only reaches the forward branch
// until a NEW edit is made (standard history-stack behavior) — after a fresh
// mutation the undone steps are gone.
// ---------------------------------------------------------------------------

async function runRedoChanges(doc: BoundDocApi, args: Record<string, unknown>): Promise<AgentReceipt> {
  const redoFn = maybeMethod(doc, ['history', 'redo']);
  if (!redoFn) {
    throw new SuperDocCliError('doc.history.redo is not available on the document handle.', {
      code: 'TOOL_DISPATCH_NOT_FOUND',
    });
  }
  const maxSteps = Math.min(Math.max(Number(args.steps ?? 1) || 1, 1), 25);

  const markersNow = async () => {
    const rows = await listBlockRows(doc);
    return rows.map((r) => blockNumbering(r)?.marker).filter((m): m is string => typeof m === 'string' && m.length > 0);
  };

  let redone = 0;
  let exhausted = false;
  while (redone < maxSteps) {
    const res = (await redoFn({})) as { noop?: boolean } | null;
    if (res && res.noop === true) {
      exhausted = true;
      break;
    }
    redone += 1;
  }

  const finalMarkers = await markersNow();
  const passed = redone > 0;
  return {
    status: passed ? 'ok' : 'failed',
    intent: 'redo_changes',
    redone,
    ...(exhausted ? { historyExhausted: true } : {}),
    ...(passed ? {} : { note: 'nothing to redo — redo only works right after an undo, before any new edit.' }),
    markersNow: finalMarkers.slice(0, 20),
    verification: [{ check: { kind: 'steps-redone' } as unknown as AgentVerificationCheck, passed }],
  };
}

// ---------------------------------------------------------------------------
// attach_numbering — make an EXISTING block a numbered clause in the same
// scheme as a sibling. "Make this the section 11 heading" in a clause-numbered
// document = attach the block at the same level as the block rendering "10.".
// The insert path does this automatically; this action covers blocks that
// already exist (no vocabulary for it previously — models improvised scripts
// and corrupted documents).
// ---------------------------------------------------------------------------

async function runAttachNumbering(doc: BoundDocApi, args: Record<string, unknown>): Promise<AgentReceipt> {
  const likeMarker = typeof args.likeMarker === 'string' && args.likeMarker.length > 0 ? args.likeMarker : null;
  if (!likeMarker) {
    return {
      status: 'failed',
      intent: 'attach_numbering',
      errors: [
        {
          code: 'INVALID_ARGUMENT',
          message: 'attach_numbering requires likeMarker - the rendered marker of a sibling clause (e.g. "10.").',
        },
      ],
    };
  }
  const rows = await listBlockRows(doc);

  let target: BlockRow | undefined;
  if (typeof args.nodeId === 'string') {
    target = rows.find((r) => r.nodeId === args.nodeId);
  } else if (typeof args.anchorText === 'string' && (args.anchorText as string).length > 0) {
    const needle = (args.anchorText as string).toLowerCase();
    target = rows.find((r) => (r.textPreview ?? '').toLowerCase().includes(needle));
  }
  if (!target) {
    return {
      status: 'failed',
      intent: 'attach_numbering',
      errors: [
        {
          code: 'TARGET_NOT_FOUND',
          message: 'pass nodeId or anchorText matching the block to number.',
          recovery: { kind: 'reinspect' },
        },
      ],
    };
  }
  const scheme = rows.find((r) => normMarker(blockNumbering(r)?.marker ?? '') === normMarker(likeMarker));
  if (!scheme) {
    const available = rows
      .filter((r) => blockNumbering(r)?.marker)
      .map((r) => blockNumbering(r)!.marker)
      .slice(0, 25);
    return {
      status: 'failed',
      intent: 'attach_numbering',
      errors: [
        {
          code: 'TARGET_NOT_FOUND',
          message: `no block renders marker ${JSON.stringify(likeMarker)}. Available: ${available.join(' ')}`,
          recovery: { kind: 'reinspect' },
        },
      ],
    };
  }
  const attachFn = maybeMethod(doc, ['lists', 'attach']);
  if (!attachFn) {
    throw new SuperDocCliError('doc.lists.attach is not available on the document handle.', {
      code: 'TOOL_DISPATCH_NOT_FOUND',
    });
  }
  const level = Array.isArray(blockNumbering(scheme)?.path) ? Math.max(0, blockNumbering(scheme)!.path!.length - 1) : 0;
  const changeMode = parseChangeMode(args.changeMode);
  // Dual dialect — see executeCreateParagraph: the CLI transport encodes only
  // INPUT keys (input.changeMode → --change-mode → MutationOptions host-side),
  // while in-process hosts read the 2nd MutationOptions arg. Options-only here
  // silently dropped tracking over the transport (no w:pPrChange recorded).
  await attachFn(
    {
      target: { kind: 'block', nodeType: 'paragraph', nodeId: target.nodeId },
      attachTo: { kind: 'block', nodeType: 'listItem', nodeId: scheme.nodeId },
      level,
      ...(changeMode ? { changeMode } : {}),
    },
    changeMode ? { changeMode } : undefined,
  );
  const post = await listBlockRows(doc);
  const updated = post.find((r) => r.nodeId === target!.nodeId);
  const newMarker = blockNumbering(updated)?.marker ?? null;
  return {
    status: newMarker ? 'ok' : 'failed',
    intent: 'attach_numbering',
    marker: newMarker,
    level,
    ...(newMarker
      ? {}
      : {
          errors: [{ code: 'ACTION_FAILED', message: 'attach reported success but no marker rendered - re-inspect.' }],
        }),
    verification: [{ check: { kind: 'marker-rendered' } as AgentVerificationCheck, passed: !!newMarker }],
  };
}

export async function superdocPerformAction(doc: BoundDocApi, args: unknown): Promise<AgentReceipt> {
  if (!isRecord(args)) {
    throw new SuperDocCliError('superdoc_perform_action arguments must be an object', {
      code: 'INVALID_ARGUMENT',
    });
  }
  const action = args.action;
  if (!isActionName(action)) {
    throw new SuperDocCliError(
      `superdoc_perform_action received unknown action: ${asString(action) ?? String(action)}`,
      {
        code: 'INVALID_ARGUMENT',
        details: { action },
      },
    );
  }
  switch (action) {
    case 'insert_paragraphs': {
      // Accept either `texts` (in order) or a single `text` for one paragraph.
      const singleText = asString(args.text);
      const texts = parseStringArray(args.texts) ?? (singleText ? [singleText] : undefined);
      if (!texts || texts.length === 0) {
        throw new SuperDocCliError(
          'insert_paragraphs requires a non-empty "texts" array (or a "text" string for a single paragraph)',
          {
            code: 'INVALID_ARGUMENT',
          },
        );
      }
      const headingLevel = asNumber(args.headingLevel);
      const preRows = await listBlockRows(doc);
      const receipt = await runInsertParagraphs(doc, {
        action,
        texts,
        placement: parsePlacement(args.placement),
        changeMode: parseChangeMode(args.changeMode),
        headingLevel:
          headingLevel != null && Number.isInteger(headingLevel) && headingLevel >= 1 && headingLevel <= 6
            ? headingLevel
            : undefined,
      });
      return matchInsertedBlockFormatting(doc, preRows, receipt, args);
    }
    case 'insert_heading': {
      const text = asString(args.text);
      const level = asNumber(args.level);
      if (!text || level == null || !Number.isInteger(level) || level < 1 || level > 6) {
        throw new SuperDocCliError('insert_heading requires "text" string and integer "level" 1-6', {
          code: 'INVALID_ARGUMENT',
        });
      }
      const preRows = await listBlockRows(doc);
      const receipt = await runInsertHeading(doc, {
        action,
        text,
        level,
        placement: parsePlacement(args.placement),
        changeMode: parseChangeMode(args.changeMode),
      });
      return matchInsertedBlockFormatting(doc, preRows, receipt, args);
    }
    case 'replace_text': {
      const edits = parseEdits(args.edits);
      if (!edits || edits.length === 0) {
        throw new SuperDocCliError('replace_text requires a non-empty "edits" array of {find, replace}', {
          code: 'INVALID_ARGUMENT',
        });
      }
      // Selector-scoped replaces take the span-targeted path: per-find
      // text.rewrite spans inside the one selected block, so tabs/breaks/
      // images outside the spans survive and the receipt reports per-edit
      // applied/skipped truth.
      const scoped = parseScopedReplaceArgs(args);
      if (scoped) {
        return runScopedReplace(doc, scoped);
      }
      const selector = args.selector != null ? parseSelector(args.selector) : undefined;
      if (args.selector != null && selector == null) {
        throw new SuperDocCliError('replace_text: invalid "selector"', { code: 'INVALID_ARGUMENT' });
      }
      return runReplaceText(doc, {
        action,
        edits,
        selector,
        caseSensitive: args.caseSensitive === true,
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'delete_text': {
      const finds = parseStringArray(args.finds);
      if (!finds || finds.length === 0) {
        throw new SuperDocCliError('delete_text requires a non-empty "finds" array of strings', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runDeleteText(doc, {
        action,
        finds,
        selector: parseSelector(args.selector) ?? undefined,
        caseSensitive: args.caseSensitive === true,
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'append_list': {
      const items = parseStringArray(args.items);
      if (!items || items.length === 0) {
        throw new SuperDocCliError('append_list requires a non-empty "items" array of strings', {
          code: 'INVALID_ARGUMENT',
        });
      }
      // Positional placement builds the list AT the anchor; the workflow
      // behind the stock path only ever appends at document end.
      const placed = await appendListAtPlacement(doc, args);
      if (placed) return placed;
      const kindRaw = asString(args.kind);
      const headingLevel = asNumber(args.headingLevel);
      return runAppendList(doc, {
        action,
        items,
        kind: kindRaw === 'bullet' ? 'bullet' : 'ordered',
        headingText: asString(args.headingText),
        headingLevel:
          headingLevel != null && Number.isInteger(headingLevel) && headingLevel >= 1 && headingLevel <= 6
            ? headingLevel
            : undefined,
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'create_table': {
      const rows = asNumber(args.rows);
      const columns = asNumber(args.columns);
      if (rows == null || columns == null) {
        throw new SuperDocCliError('create_table requires "rows" and "columns" numbers', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runCreateTable(doc, {
        action,
        rows,
        columns,
        cellTexts: parseCellTexts(args.cellTexts),
        placement: parsePlacement(args.placement),
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'comment_paragraphs': {
      const commentText = asString(args.commentText);
      if (!commentText) {
        throw new SuperDocCliError('comment_paragraphs requires a non-empty "commentText" string', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runCommentParagraphs(doc, {
        action,
        commentText,
        scope: args.scope === 'all' ? 'all' : 'body',
        excludeBlockQuotes: args.excludeBlockQuotes === true,
      });
    }
    case 'add_comments': {
      const commentText = asString(args.commentText);
      const selector = parseSelector(args.selector);
      const selectors = Array.isArray(args.selectors)
        ? args.selectors.map((s) => parseSelector(s)).filter((s): s is AgentSelector => Boolean(s))
        : undefined;
      if (!commentText || (!selector && !(selectors && selectors.length))) {
        throw new SuperDocCliError(
          'add_comments requires "commentText" and a "selector" or non-empty "selectors" array',
          {
            code: 'INVALID_ARGUMENT',
          },
        );
      }
      return runAddComments(doc, { action, commentText, selector: selector ?? undefined, selectors });
    }
    case 'resolve_comments':
      return runResolveComments(doc, {
        action,
        anchorText: asString(args.anchorText),
        reopen: args.reopen === true,
      });
    case 'reply_to_comment': {
      const commentText = asString(args.commentText);
      const anchorText = asString(args.anchorText);
      const commentId = asString(args.commentId);
      if (!commentText || (!anchorText && !commentId)) {
        throw new SuperDocCliError('reply_to_comment requires "commentText" and an "anchorText" or "commentId"', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runReplyToComment(doc, { action, commentText, anchorText, commentId });
    }
    case 'rewrite_block': {
      const text = asString(args.text);
      const selector = parseSelector(args.selector);
      if (!text || !selector) {
        throw new SuperDocCliError('rewrite_block requires "text" and "selector"', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runRewriteBlock(doc, {
        action,
        text,
        selector,
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'accept_tracked_changes':
      return runAcceptTrackedChanges(doc, {
        action,
        author: asString(args.author),
        changeType: parseTrackedChangeKind(args.changeType),
      });
    case 'reject_tracked_changes':
      return runRejectTrackedChanges(doc, {
        action,
        author: asString(args.author),
        changeType: parseTrackedChangeKind(args.changeType),
      });
    case 'normalize_body_font_size': {
      const fontSize = asNumber(args.fontSize);
      if (fontSize == null) {
        throw new SuperDocCliError('normalize_body_font_size requires a numeric "fontSize" (points)', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runNormalizeBodyFontSize(doc, {
        action,
        fontSize,
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'set_font_family': {
      const fontFamily = asString(args.fontFamily);
      if (!fontFamily) {
        throw new SuperDocCliError('set_font_family requires a non-empty "fontFamily" string', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runSetFontFamily(doc, {
        action,
        fontFamily,
        selector: parseSelector(args.selector) ?? undefined,
        targetText: asString(args.targetText),
        targetTexts: parseLooseStringArray(args.targetTexts),
        caseSensitive: args.caseSensitive === true,
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'apply_letter_spacing': {
      const selector = parseSelector(args.selector);
      const letterSpacing = asNumber(args.letterSpacing);
      if (!selector || letterSpacing == null) {
        throw new SuperDocCliError('apply_letter_spacing requires "selector" and numeric "letterSpacing"', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runApplyLetterSpacing(doc, {
        action,
        selector,
        letterSpacing,
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'fill_placeholders': {
      const values = parseLooseStringArray(args.values);
      const fields = parsePlaceholderFields(args.fields);
      if ((values == null || values.length === 0) && (fields == null || fields.length === 0)) {
        throw new SuperDocCliError('fill_placeholders requires non-empty "values" or "fields"', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runFillPlaceholders(doc, {
        action,
        values: values ?? undefined,
        fields: fields ?? undefined,
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'move_range': {
      const fromText = asString(args.fromText);
      if (fromText == null || fromText.trim().length === 0) {
        throw new SuperDocCliError('move_range requires fromText (text in the first block of the range to move)', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runMoveRange(doc, {
        action,
        fromText,
        toText: asString(args.toText),
        afterText: asString(args.afterText),
        beforeText: asString(args.beforeText),
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'insert_toc':
      return runInsertToc(doc, {
        action,
        title: asString(args.title),
        placement: parsePlacement(args.placement),
        changeMode: parseChangeMode(args.changeMode),
      });
    case 'style_table': {
      const tableOrdinal = asNumber(args.tableOrdinal);
      return runStyleTable(doc, {
        action,
        tableOrdinal: tableOrdinal != null && Number.isInteger(tableOrdinal) && tableOrdinal >= 1 ? tableOrdinal : 1,
        accentColor: asString(args.accentColor),
      });
    }
    case 'move_table': {
      const placement = parsePlacement(args.placement);
      if (!placement) {
        throw new SuperDocCliError(
          'move_table requires a "placement" destination, e.g. {at:"document_end"} or {at:"after",selector:{...}}',
          { code: 'INVALID_ARGUMENT' },
        );
      }
      const tableOrdinal = asNumber(args.tableOrdinal);
      return runMoveTable(doc, {
        action,
        tableOrdinal: tableOrdinal != null && Number.isInteger(tableOrdinal) && tableOrdinal >= 1 ? tableOrdinal : 1,
        placement,
      });
    }
    case 'delete_table': {
      const tableOrdinal = asNumber(args.tableOrdinal);
      return runDeleteTable(doc, {
        action,
        tableOrdinal: tableOrdinal != null && Number.isInteger(tableOrdinal) && tableOrdinal >= 1 ? tableOrdinal : 1,
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'insert_table_row': {
      const tableOrdinal = asNumber(args.tableOrdinal);
      const rowIndex = asNumber(args.rowIndex);
      const position =
        args.position === 'before' ||
        args.position === 'after' ||
        args.position === 'above' ||
        args.position === 'below'
          ? args.position
          : undefined;
      const cellTexts = parseLooseStringArray(args.cellTexts);
      return runInsertTableRow(doc, {
        action,
        tableOrdinal:
          tableOrdinal != null && Number.isInteger(tableOrdinal) && tableOrdinal >= 1 ? tableOrdinal : undefined,
        rowIndex: rowIndex != null && Number.isInteger(rowIndex) && rowIndex >= 0 ? rowIndex : undefined,
        position,
        cellTexts: cellTexts ?? undefined,
        changeMode: parseChangeMode(args.changeMode),
        dryRun: args.dryRun === true,
      });
    }
    case 'insert_table_column': {
      const tableOrdinal = asNumber(args.tableOrdinal);
      const columnIndex = asNumber(args.columnIndex);
      const position = args.position === 'left' ? 'left' : args.position === 'right' ? 'right' : undefined;
      return runInsertTableColumn(doc, {
        action,
        tableOrdinal:
          tableOrdinal != null && Number.isInteger(tableOrdinal) && tableOrdinal >= 1 ? tableOrdinal : undefined,
        columnIndex: columnIndex != null && Number.isInteger(columnIndex) && columnIndex >= 0 ? columnIndex : undefined,
        position,
        headerText: asString(args.headerText),
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'delete_table_row': {
      const tableOrdinal = asNumber(args.tableOrdinal);
      const rowIndex = asNumber(args.rowIndex);
      if (rowIndex == null || !Number.isInteger(rowIndex) || rowIndex < 0) {
        throw new SuperDocCliError('delete_table_row requires an integer rowIndex >= 0', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runDeleteTableRow(doc, {
        action,
        tableOrdinal:
          tableOrdinal != null && Number.isInteger(tableOrdinal) && tableOrdinal >= 1 ? tableOrdinal : undefined,
        rowIndex,
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'delete_table_column': {
      const tableOrdinal = asNumber(args.tableOrdinal);
      const columnIndex = asNumber(args.columnIndex);
      if (columnIndex == null || !Number.isInteger(columnIndex) || columnIndex < 0) {
        throw new SuperDocCliError('delete_table_column requires an integer columnIndex >= 0', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runDeleteTableColumn(doc, {
        action,
        tableOrdinal:
          tableOrdinal != null && Number.isInteger(tableOrdinal) && tableOrdinal >= 1 ? tableOrdinal : undefined,
        columnIndex,
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'split_table': {
      const tableOrdinal = asNumber(args.tableOrdinal);
      const rowIndex = asNumber(args.rowIndex);
      if (rowIndex == null || !Number.isInteger(rowIndex) || rowIndex < 1) {
        throw new SuperDocCliError('split_table requires an integer rowIndex >= 1', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runSplitTable(doc, {
        action,
        tableOrdinal:
          tableOrdinal != null && Number.isInteger(tableOrdinal) && tableOrdinal >= 1 ? tableOrdinal : undefined,
        rowIndex,
        separatorText: asString(args.separatorText),
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'format_text': {
      const selector = args.selector != null ? parseSelector(args.selector) : undefined;
      if (args.selector != null && selector == null) {
        throw new SuperDocCliError('format_text: invalid "selector"', { code: 'INVALID_ARGUMENT' });
      }
      const fontSize = asNumber(args.fontSize);
      return runFormatText(doc, {
        action,
        targetText: asString(args.targetText),
        targetTexts: parseStringArray(args.targetTexts),
        selector,
        caseSensitive: args.caseSensitive === true,
        bold: args.bold === true,
        italic: args.italic === true,
        underline: args.underline === true,
        strike: args.strike === true,
        highlight: asString(args.highlight),
        color: asString(args.color),
        fontSize: fontSize != null && fontSize > 0 ? fontSize : undefined,
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'apply_style': {
      const selector = parseSelector(args.selector);
      if (!selector) {
        throw new SuperDocCliError('apply_style requires a valid "selector"', { code: 'INVALID_ARGUMENT' });
      }
      const headingLevel = asNumber(args.headingLevel);
      return runApplyStyle(doc, {
        action,
        selector,
        styleId: asString(args.styleId),
        headingLevel:
          headingLevel != null && Number.isInteger(headingLevel) && headingLevel >= 1 && headingLevel <= 6
            ? headingLevel
            : undefined,
        likeText: asString(args.likeText),
      });
    }
    case 'format_paragraph': {
      const selector = parseSelector(args.selector);
      if (!selector) {
        throw new SuperDocCliError('format_paragraph requires a valid "selector"', { code: 'INVALID_ARGUMENT' });
      }
      return runFormatParagraph(doc, {
        action,
        selector,
        alignment: asString(args.alignment) ?? '',
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'move_text': {
      const text = asString(args.text);
      if (!text) {
        throw new SuperDocCliError('move_text requires the exact "text" of the clause to move', {
          code: 'INVALID_ARGUMENT',
        });
      }
      return runMoveText(doc, {
        action,
        text,
        afterText: asString(args.afterText),
        changeMode: parseChangeMode(args.changeMode),
      });
    }
    case 'set_paragraph_spacing': {
      const selector = parseSelector(args.selector);
      if (!selector) {
        throw new SuperDocCliError('set_paragraph_spacing requires a valid "selector"', { code: 'INVALID_ARGUMENT' });
      }
      return runSetParagraphSpacing(doc, {
        action,
        selector,
        lineSpacing: asNumber(args.lineSpacing) ?? undefined,
        spaceBefore: asNumber(args.spaceBefore) ?? undefined,
        spaceAfter: asNumber(args.spaceAfter) ?? undefined,
      });
    }
    case 'insert_page_break': {
      const selector = parseSelector(args.selector);
      if (!selector) {
        throw new SuperDocCliError('insert_page_break requires a valid "selector"', { code: 'INVALID_ARGUMENT' });
      }
      return runInsertPageBreak(doc, { action, selector });
    }
    case 'add_hyperlink': {
      const text = asString(args.text);
      const url = asString(args.url);
      if (!text || !url) {
        throw new SuperDocCliError('add_hyperlink requires "text" and "url"', { code: 'INVALID_ARGUMENT' });
      }
      return runAddHyperlink(doc, {
        action,
        text,
        url,
        tooltip: asString(args.tooltip),
      });
    }
    case 'convert_list':
      return runConvertList(doc, args);
    case 'split_list': {
      const anchorText = asString(args.anchorText);
      if (!anchorText) {
        throw new SuperDocCliError(
          'split_list requires "anchorText" (text inside the item that should start the new list)',
          { code: 'INVALID_ARGUMENT' },
        );
      }
      return runSplitList(doc, { action, anchorText, restartNumbering: args.restartNumbering !== false });
    }
    case 'undo_changes':
      return runUndoChanges(doc, args);
    case 'redo_changes':
      return runRedoChanges(doc, args);
    case 'attach_numbering':
      return runAttachNumbering(doc, args);
    case 'add_list_items': {
      const anchorText = asString(args.anchorText) ?? '';
      const listOrdinalRaw = asNumber(args.listOrdinal);
      const listOrdinal =
        listOrdinalRaw != null && Number.isInteger(listOrdinalRaw) && listOrdinalRaw >= 1 ? listOrdinalRaw : undefined;
      const rawEntries = Array.isArray(args.entries) ? args.entries : [];
      const entries = rawEntries
        .map((e) => {
          if (typeof e === 'string') return { text: e, level: 0 };
          if (isRecord(e) && typeof e.text === 'string') {
            // Preserve NEGATIVE levels (dedent toward the top); runAddListItems
            // clamps the final outline level at 0.
            const lvl = asNumber(e.level);
            return { text: e.text, level: lvl != null ? Math.floor(lvl) : 0 };
          }
          return null;
        })
        .filter((e): e is { text: string; level: number } => e != null);
      // `items` is a plain-string alias for `entries` at the list's base level.
      const plainItems = parseStringArray(args.items);
      if (entries.length === 0 && plainItems) {
        for (const t of plainItems) entries.push({ text: t, level: 0 });
      }
      if (entries.length === 0) {
        throw new SuperDocCliError('add_list_items requires non-empty "entries" or "items"', {
          code: 'INVALID_ARGUMENT',
        });
      }
      if (!anchorText && listOrdinal == null) {
        throw new SuperDocCliError('add_list_items requires "anchorText" or "listOrdinal" to locate the list', {
          code: 'INVALID_ARGUMENT',
        });
      }
      const changeMode = parseChangeMode(args.changeMode);

      // Preferred path: a real NUMBERED list found by anchorText — attaches each
      // entry at the right nesting level, reusing the list's marker scheme.
      if (anchorText) {
        const attached = await runAddListItems(
          doc,
          { action, anchorText, entries, changeMode },
          { fallbackOnMissing: true },
        );
        if (attached) return attached;
      }

      // Fallback: ghost lists (imported list-looking paragraphs with no
      // numbering) and listOrdinal addressing. Nesting collapses to the base
      // level on this path.
      const flatItems = entries.map((e) => e.text);
      const ghost = await insertListItemsIntoGhostList(doc, {
        items: flatItems,
        anchorText: anchorText || undefined,
        listOrdinal,
        changeMode,
      });
      if (ghost) return ghost;
      return runInsertListItems(doc, { items: flatItems, listOrdinal, changeMode });
    }
  }
}

function parseChangeMode(value: unknown): AgentChangeMode | undefined {
  if (value === 'direct' || value === 'tracked') return value;
  return undefined;
}

function parseTrackedChangeKind(value: unknown): TrackedChangeKind | undefined {
  if (value === 'insert' || value === 'delete' || value === 'replacement' || value === 'format') return value;
  return undefined;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0) return undefined;
    result.push(entry);
  }
  return result;
}

function parseLooseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') return undefined;
    result.push(entry);
  }
  return result;
}

function parseEdits(value: unknown): Array<{ find: string; replace: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: Array<{ find: string; replace: string }> = [];
  for (const entry of value) {
    if (!isRecord(entry)) return undefined;
    const find = asString(entry.find);
    const replace = asString(entry.replace) ?? '';
    if (!find) return undefined;
    result.push({ find, replace });
  }
  return result;
}

function parseCellTexts(value: unknown): ReadonlyArray<ReadonlyArray<string>> | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: string[][] = [];
  for (const row of value) {
    if (!Array.isArray(row)) return undefined;
    const cells: string[] = [];
    for (const cell of row) {
      if (typeof cell !== 'string') return undefined;
      cells.push(cell);
    }
    result.push(cells);
  }
  return result;
}

function parsePlaceholderFields(value: unknown): Array<{ label?: string; value: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: Array<{ label?: string; value: string }> = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.value !== 'string') return undefined;
    const label = asString(entry.label);
    result.push(label ? { label, value: entry.value } : { value: entry.value });
  }
  return result;
}

function parsePlacement(value: unknown): ActionPlacement | undefined {
  if (!isRecord(value)) return undefined;
  const at = asString(value.at);
  if (at === 'document_end' || at === 'document_start') {
    return { at };
  }
  if (at === 'after' || at === 'before') {
    const selector = parseSelector(value.selector);
    if (!selector) return undefined;
    return { at, selector };
  }
  return undefined;
}

function parseSelector(value: unknown): AgentSelector | undefined {
  if (!isRecord(value)) return undefined;
  const kind = asString(value.kind);
  if (kind === 'nodeId') {
    const nodeId = asString(value.nodeId);
    return nodeId ? { kind: 'nodeId', nodeId } : undefined;
  }
  if (kind === 'ref') {
    const ref = asString(value.ref);
    return ref ? { kind: 'ref', ref } : undefined;
  }
  if (kind === 'ordinal') {
    const ordinalKindStr = asString(value.ordinalKind);
    const numericValue = asNumber(value.value);
    const validOrdinalKinds = new Set([
      'blockOrdinal',
      'paragraphOrdinal',
      'bodyParagraphOrdinal',
      'headingOrdinal',
      'listOrdinal',
      'tableOrdinal',
      'sectionOrdinal',
    ]);
    if (
      !ordinalKindStr ||
      !validOrdinalKinds.has(ordinalKindStr) ||
      numericValue == null ||
      !Number.isInteger(numericValue) ||
      numericValue < 1
    ) {
      return undefined;
    }
    return {
      kind: 'ordinal',
      ordinalKind: ordinalKindStr as Extract<AgentSelector, { kind: 'ordinal' }>['ordinalKind'],
      value: numericValue,
    };
  }
  if (kind === 'tableCell') {
    const tableOrdinal = asNumber(value.tableOrdinal);
    const rowIndex = asNumber(value.rowIndex);
    const columnIndex = asNumber(value.columnIndex);
    if (
      tableOrdinal == null ||
      !Number.isInteger(tableOrdinal) ||
      tableOrdinal < 1 ||
      rowIndex == null ||
      !Number.isInteger(rowIndex) ||
      rowIndex < 0 ||
      columnIndex == null ||
      !Number.isInteger(columnIndex) ||
      columnIndex < 0
    ) {
      return undefined;
    }
    return {
      kind: 'tableCell',
      tableOrdinal,
      rowIndex,
      columnIndex,
    };
  }
  if (kind === 'textSearch') {
    const terms = parseStringArray(value.terms);
    const match = asString(value.match);
    const occurrence = asNumber(value.occurrence);
    const caseSensitive = value.caseSensitive === true;
    const nodeTypesRaw = Array.isArray(value.nodeTypes) ? value.nodeTypes : undefined;
    const nodeTypes =
      nodeTypesRaw == null
        ? undefined
        : nodeTypesRaw.every((entry) => entry === 'paragraph' || entry === 'heading' || entry === 'listItem')
          ? (nodeTypesRaw as Array<'paragraph' | 'heading' | 'listItem'>)
          : undefined;
    if (
      !terms ||
      terms.length === 0 ||
      (match != null && match !== 'all' && match !== 'any') ||
      (occurrence != null && (!Number.isInteger(occurrence) || occurrence < 1)) ||
      (nodeTypesRaw != null && nodeTypes == null)
    ) {
      return undefined;
    }
    return {
      kind: 'textSearch',
      terms,
      match: match === 'any' ? 'any' : 'all',
      occurrence: occurrence != null ? occurrence : undefined,
      caseSensitive: caseSensitive || undefined,
      nodeTypes,
    };
  }
  if (kind === 'entity') {
    const entityTypeStr = asString(value.entityType);
    const entityId = asString(value.entityId);
    const validEntities = new Set(['comment', 'trackedChange', 'bookmark', 'image', 'hyperlink', 'field']);
    if (!entityTypeStr || !validEntities.has(entityTypeStr) || !entityId) return undefined;
    return {
      kind: 'entity',
      entityType: entityTypeStr as Extract<AgentSelector, { kind: 'entity' }>['entityType'],
      entityId,
    };
  }
  if (kind === 'document') return { kind: 'document' };
  if (kind === 'placement') {
    const at = asString(value.at);
    if (at !== 'document_start' && at !== 'document_end') return undefined;
    return { kind: 'placement', at };
  }
  if (kind === 'relative') {
    const position = asString(value.position);
    if (position !== 'before' && position !== 'after') return undefined;
    const target = parseSelector(value.target);
    if (!target) return undefined;
    return { kind: 'relative', position, target };
  }
  return undefined;
}

export const ACTION_NAMES_LIST: readonly ActionName[] = ACTION_NAMES;
