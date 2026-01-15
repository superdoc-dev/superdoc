/**
 * Constants and default values for PM adapter
 */

import type { TextRun, TrackedChangeKind } from '@superdoc/contracts';
import type { HyperlinkConfig } from './types.js';
import { SectionType } from './types.js';

/**
 * Unit conversion constants
 */
export const TWIPS_PER_INCH = 1440;
export const PX_PER_INCH = 96;
export const PX_PER_PT = 96 / 72;

/**
 * Default typography settings
 */
export const DEFAULT_FONT = 'Arial';
export const DEFAULT_SIZE = 16;

/**
 * List formatting defaults
 */
export const DEFAULT_LIST_INDENT_BASE_PX = 24;
export const DEFAULT_LIST_INDENT_STEP_PX = 24;
export const DEFAULT_LIST_HANGING_PX = 18;
export const DEFAULT_NUMBERING_TYPE = 'decimal';
export const DEFAULT_LVL_TEXT = '%1.';

/**
 * Locale defaults
 */
export const DEFAULT_DECIMAL_SEPARATOR = '.';

/**
 * Section defaults
 */
export const DEFAULT_COLUMN_GAP_INCHES = 0.5; // 720 twips = 0.5 inches

/**
 * BiDi indentation defaults
 */
export const MIN_BIDI_CLAMP_INDENT_PX = 1;
export const DEFAULT_BIDI_INDENT_PX = 24;

/**
 * Section type defaults
 */
export const DEFAULT_PARAGRAPH_SECTION_TYPE: SectionType = SectionType.NEXT_PAGE; // Word's default when w:type omitted
export const DEFAULT_BODY_SECTION_TYPE: SectionType = SectionType.CONTINUOUS; // Body sectPr doesn't force page break at end

/**
 * Tracked changes mark types
 */
export const TRACK_INSERT_MARK = 'trackInsert';
export const TRACK_DELETE_MARK = 'trackDelete';
export const TRACK_FORMAT_MARK = 'trackFormat';

/**
 * Map mark types to tracked change kinds
 */
export const TRACK_CHANGE_KIND_MAP: Record<string, TrackedChangeKind> = {
  [TRACK_INSERT_MARK]: 'insert',
  [TRACK_DELETE_MARK]: 'delete',
  [TRACK_FORMAT_MARK]: 'format',
};

/**
 * Tracked change priority for selecting between overlapping marks
 */
export const TRACK_CHANGE_PRIORITY: Record<TrackedChangeKind, number> = {
  insert: 3,
  delete: 3,
  format: 1,
};

/**
 * Valid tracked changes mode values.
 * Used for runtime validation to prevent unsafe type casts.
 */
export const VALID_TRACKED_MODES = ['review', 'original', 'final', 'off'] as const;

/**
 * Maximum allowed length for JSON-stringified run mark payloads.
 * Set to 10KB to balance flexibility with DoS protection.
 */
export const MAX_RUN_MARK_JSON_LENGTH = 10_000;

/**
 * Maximum number of marks allowed in before/after arrays.
 * Prevents memory exhaustion from malicious payloads while supporting
 * reasonable formatting complexity.
 */
export const MAX_RUN_MARK_ARRAY_LENGTH = 100;

/**
 * Maximum nesting depth for mark attribute objects.
 * Protects against stack overflow from deeply nested structures.
 */
export const MAX_RUN_MARK_DEPTH = 5;

/**
 * Default hyperlink configuration
 */
export const DEFAULT_HYPERLINK_CONFIG: HyperlinkConfig = {
  enableRichHyperlinks: false,
};

/**
 * Atomic inline node types that cannot contain content.
 *
 * These nodes have `atom: true` in their ProseMirror schema definition, meaning they:
 * - Occupy exactly 1 position in the document (not 2 like container nodes)
 * - Cannot be directly edited or contain nested content
 * - Are treated as a single unit for selection and cursor positioning
 *
 * CRITICAL: This set must stay in sync with schema definitions. If a node type has
 * `atom: true` in its schema but is NOT listed here, buildPositionMap() will incorrectly
 * calculate positions, leading to cursor positioning bugs during hit testing.
 *
 * Node types with atom: true:
 * - image: Inline images
 * - hardBreak, lineBreak: Line breaks
 * - page-number, total-page-number: Document tokens
 * - indexEntry: Index entry field markers (see index-entry.js)
 * - tab: Tab stops (see tab.js)
 * - passthroughInline: Passthrough content like FORMCHECKBOX (see passthrough.js)
 * - bookmarkEnd: Bookmark end markers (see bookmark-end.js)
 *
 * Note: bookmarkStart is NOT atomic - it has content: 'inline*' in the schema,
 * allowing it to wrap inline content and therefore occupying 2 positions (open + close).
 */
export const ATOMIC_INLINE_TYPES = new Set([
  'image',
  'hardBreak',
  'lineBreak',
  'page-number',
  'total-page-number',
  'indexEntry',
  'tab',
  'footnoteReference',
  'passthroughInline',
  'bookmarkEnd',
]);

/**
 * Token inline types mapping
 */
export const TOKEN_INLINE_TYPES = new Map<string, TextRun['token']>([
  ['page-number', 'pageNumber'],
  ['total-page-number', 'totalPageCount'],
]);

/**
 * Valid link target values
 */
export const VALID_LINK_TARGETS = new Set(['_blank', '_self', '_parent', '_top']);

/**
 * Bullet marker characters
 */
export const BULLET_MARKERS = ['•', '◦', '▪', '‣'];

/**
 * Valid wrap types for images/drawings
 */
export const WRAP_TYPES = new Set(['None', 'Square', 'Tight', 'Through', 'TopAndBottom', 'Inline']);

/**
 * Valid wrap text values
 */
export const WRAP_TEXT_VALUES = new Set(['bothSides', 'left', 'right', 'largest']);

/**
 * Valid horizontal relative positioning values
 */
export const H_RELATIVE_VALUES = new Set(['column', 'page', 'margin']);

/**
 * Valid vertical relative positioning values
 */
export const V_RELATIVE_VALUES = new Set(['paragraph', 'page', 'margin']);

/**
 * Valid horizontal alignment values
 */
export const H_ALIGN_VALUES = new Set(['left', 'center', 'right']);

/**
 * Valid vertical alignment values
 */
export const V_ALIGN_VALUES = new Set(['top', 'center', 'bottom']);
