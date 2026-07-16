// Shared layout-related constants used by measuring and layout engine

// Spacing between list marker text and list item text, in px
export const LIST_MARKER_GAP = 8;

// Minimum width reserved for the list marker gutter, in px
export const MIN_MARKER_GUTTER = 24;

// Default list indentation parameters (in px)
export const DEFAULT_LIST_INDENT_BASE_PX = 24;
export const DEFAULT_LIST_INDENT_STEP_PX = 24;
export const DEFAULT_LIST_HANGING_PX = 18;

// Gap in pixels added after list marker when suffix is 'space'
export const SPACE_SUFFIX_GAP_PX = 4;

// Default tab interval in pixels (0.5 inches at 96 DPI)
export const DEFAULT_TAB_INTERVAL_PX = 48;

// --- Atomic inline run sizing (image / math / field annotation) ---
// These describe the intrinsic box of atomic inline runs and are shared between
// the full typography measurer (measuring/dom) and the fast canvas remeasurer
// (layout-bridge/remeasure) so the two paths cannot diverge.

// Field annotation "pill" horizontal overhead, in px: border (2px each side) +
// padding (2px each side). Added to the measured displayLabel width.
export const FIELD_ANNOTATION_PILL_PADDING = 8;

// Field annotation "pill" vertical overhead (padding + border), in px.
export const FIELD_ANNOTATION_VERTICAL_PADDING = 6;

// Line-height multiplier applied to the field annotation font size for pill height.
export const FIELD_ANNOTATION_LINE_HEIGHT_MULTIPLIER = 1.2;

// Default font size for field annotations when the run does not specify one, in px.
export const DEFAULT_FIELD_ANNOTATION_FONT_SIZE = 16;

// Rendered height cap applied to signature-image field annotations, in px.
export const FIELD_ANNOTATION_SIGNATURE_HEIGHT_PX = 28;

// Fallback intrinsic size for math runs missing pre-computed dimensions, in px.
export const MATH_FALLBACK_WIDTH_PX = 20;
export const MATH_FALLBACK_HEIGHT_PX = 24;
