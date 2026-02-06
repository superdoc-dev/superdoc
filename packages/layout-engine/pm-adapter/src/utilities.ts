/**
 * Shared utility functions for PM adapter
 *
 * Contains type guards, normalization, conversion, and position mapping utilities
 * used across multiple adapter modules.
 */

import type {
  BoxSpacing,
  DrawingBlock,
  DrawingContentSnapshot,
  ImageBlock,
  ShapeGroupChild,
  ShapeGroupDrawing,
  ShapeGroupImageChild,
  ShapeGroupTransform,
  FlowBlock,
  ImageRun,
  ParagraphBlock,
  Run,
  TableBlock,
} from '@superdoc/contracts';
import type { PMNode, PositionMap, BlockIdGenerator } from './types.js';
import { TWIPS_PER_INCH, PX_PER_INCH, PX_PER_PT, ATOMIC_INLINE_TYPES } from './constants.js';

export type LineEnd = {
  type?: string;
  width?: string;
  length?: string;
};

export type LineEnds = {
  head?: LineEnd;
  tail?: LineEnd;
};

export type EffectExtent = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

// ============================================================================
// Unit Conversion Utilities
// ============================================================================

/**
 * Converts a value from twips to pixels.
 *
 * Twips (twentieth of a point) are a common unit in document formats like DOCX.
 * This function converts them to pixels using standard conversion ratios.
 *
 * @param value - The value in twips to convert
 * @returns The equivalent value in pixels
 *
 * @example
 * ```typescript
 * const pixels = twipsToPx(1440); // 96px (1 inch at 96 DPI)
 * ```
 */
export const twipsToPx = (value: number): number => (value / TWIPS_PER_INCH) * PX_PER_INCH;

/**
 * Converts a value from points to pixels.
 *
 * @param pt - The value in points to convert (optional, nullable)
 * @returns The equivalent value in pixels, or undefined if input is null/undefined/not finite
 *
 * @example
 * ```typescript
 * const pixels = ptToPx(12); // 16px (12pt font at 96 DPI)
 * ptToPx(null); // undefined
 * ptToPx(NaN); // undefined
 * ```
 */
export const ptToPx = (pt?: number | null): number | undefined => {
  if (pt == null || !Number.isFinite(pt)) return undefined;
  return pt * PX_PER_PT;
};

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a finite number.
 *
 * Ensures the value is of type 'number' and is not NaN, Infinity, or -Infinity.
 *
 * @param value - The value to check
 * @returns True if the value is a finite number, false otherwise
 *
 * @example
 * ```typescript
 * isFiniteNumber(42); // true
 * isFiniteNumber(3.14); // true
 * isFiniteNumber(NaN); // false
 * isFiniteNumber(Infinity); // false
 * isFiniteNumber("42"); // false
 * isFiniteNumber(null); // false
 * ```
 */
export const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * Type guard to check if a value is a plain object.
 *
 * A plain object is a non-null, non-array object that can be indexed by string keys.
 * This includes class instances (like Date, RegExp, etc.) - not just POJOs.
 *
 * @param value - The value to check
 * @returns True if the value is a plain object, false otherwise
 *
 * @example
 * ```typescript
 * isPlainObject({ key: 'value' }); // true
 * isPlainObject({}); // true
 * isPlainObject([]); // false
 * isPlainObject(null); // false
 * isPlainObject("string"); // false
 * isPlainObject(new Date()); // true (class instances are considered objects)
 * isPlainObject(new Map()); // true (any object that's not an array)
 * ```
 */
export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// ============================================================================
// Normalization / Coercion Functions
// ============================================================================

/**
 * Normalizes a prefix string, ensuring it's a valid string.
 *
 * @param value - The prefix value to normalize (optional)
 * @returns Empty string if value is falsy, otherwise the string representation of the value
 *
 * @example
 * ```typescript
 * normalizePrefix("abc"); // "abc"
 * normalizePrefix(""); // ""
 * normalizePrefix(undefined); // ""
 * normalizePrefix(null); // ""
 * ```
 */
export const normalizePrefix = (value?: string): string => {
  if (!value) return '';
  return String(value);
};

/**
 * Attempts to extract a numeric value from unknown input.
 *
 * If the value is already a finite number, returns it. If it's a string,
 * attempts to parse it as a float.
 *
 * @param value - The value to extract a number from
 * @returns The numeric value, or undefined if conversion is not possible
 *
 * @example
 * ```typescript
 * pickNumber(42); // 42
 * pickNumber("3.14"); // 3.14
 * pickNumber("invalid"); // undefined (NaN result)
 * pickNumber(true); // undefined
 * pickNumber(null); // undefined
 * ```
 */
export const pickNumber = (value: unknown): number | undefined => {
  if (isFiniteNumber(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

/**
 * Normalizes a color string, ensuring it has a leading '#' symbol.
 *
 * Filters out special values like 'auto' and 'none'. Prepends '#' if not present.
 *
 * @param value - The color value to normalize
 * @returns The normalized color string with '#' prefix, or undefined if invalid/special
 *
 * @example
 * ```typescript
 * normalizeColor("FF0000"); // "#FF0000"
 * normalizeColor("#00FF00"); // "#00FF00"
 * normalizeColor("auto"); // undefined
 * normalizeColor("none"); // undefined
 * normalizeColor(""); // undefined
 * normalizeColor(123); // undefined
 * ```
 */
export const normalizeColor = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'auto' || trimmed === 'none') return undefined;
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
};

/**
 * Normalizes a string by trimming whitespace.
 *
 * Returns undefined for non-strings or empty/whitespace-only strings.
 *
 * @param value - The string value to normalize
 * @returns The trimmed string, or undefined if empty or not a string
 *
 * @example
 * ```typescript
 * normalizeString("  hello  "); // "hello"
 * normalizeString(""); // undefined
 * normalizeString("   "); // undefined
 * normalizeString(123); // undefined
 * normalizeString(null); // undefined
 * ```
 */
export const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

/**
 * Coerces a value to a number if possible.
 *
 * Accepts numbers and numeric strings. Returns undefined for invalid inputs.
 *
 * @param value - The value to coerce to a number
 * @returns The numeric value, or undefined if coercion fails
 *
 * @example
 * ```typescript
 * coerceNumber(42); // 42
 * coerceNumber("3.14"); // 3.14
 * coerceNumber("  100  "); // 100
 * coerceNumber("invalid"); // undefined
 * coerceNumber(""); // undefined
 * coerceNumber(true); // undefined
 * coerceNumber(NaN); // undefined
 * ```
 */
export function coerceNumber(value: unknown): number | undefined {
  if (isFiniteNumber(value)) return Number(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Coerces a value to a positive number, with a fallback.
 *
 * Returns the coerced value if it's a positive number, otherwise returns the fallback.
 * Validates that the fallback itself is a positive number.
 *
 * @param value - The value to coerce to a positive number
 * @param fallback - The fallback value to use if coercion fails (must be positive)
 * @returns The coerced positive number or the fallback
 * @throws {Error} If the fallback is not a positive finite number
 *
 * @example
 * ```typescript
 * coercePositiveNumber(10, 5); // 10
 * coercePositiveNumber("15", 5); // 15
 * coercePositiveNumber(0, 5); // 5 (not positive)
 * coercePositiveNumber(-10, 5); // 5 (not positive)
 * coercePositiveNumber("invalid", 5); // 5
 * coercePositiveNumber(10, -5); // throws Error
 * coercePositiveNumber(10, 0); // throws Error
 * ```
 */
export function coercePositiveNumber(value: unknown, fallback: number): number {
  if (!isFiniteNumber(fallback) || fallback <= 0) {
    throw new Error(`coercePositiveNumber: fallback must be a positive number, got ${fallback}`);
  }

  const numeric = coerceNumber(value);
  if (numeric != null && numeric > 0) {
    return numeric;
  }
  return fallback;
}

/**
 * Coerces a value to a boolean with comprehensive string parsing.
 *
 * This is the most comprehensive boolean coercion function, supporting multiple
 * string formats including 'yes'/'no' and 'on'/'off'. Use this when you need
 * maximum flexibility in accepting boolean-like values from external sources.
 *
 * Recognized truthy strings: 'true', '1', 'yes', 'on'
 * Recognized falsy strings: 'false', '0', 'no', 'off'
 *
 * @param value - The value to coerce to a boolean
 * @returns Boolean value, or undefined if the value cannot be interpreted as boolean
 *
 * @example
 * ```typescript
 * coerceBoolean(true); // true
 * coerceBoolean(1); // true
 * coerceBoolean("yes"); // true
 * coerceBoolean("on"); // true
 * coerceBoolean(false); // false
 * coerceBoolean(0); // false
 * coerceBoolean("no"); // false
 * coerceBoolean("off"); // false
 * coerceBoolean(2); // undefined
 * coerceBoolean("maybe"); // undefined
 * ```
 */
export function coerceBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return undefined;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return undefined;
}

/**
 * Coerces a value to a boolean with basic string parsing.
 *
 * This is a simpler boolean coercion function that only recognizes 'true'/'false'
 * and '1'/'0' strings. Use this when you have more controlled input and don't need
 * to support 'yes'/'no' or 'on'/'off' variations.
 *
 * Note: Unlike coerceBoolean, this does NOT support 'yes'/'no' or 'on'/'off'.
 *
 * Recognized truthy strings: 'true', '1'
 * Recognized falsy strings: 'false', '0'
 *
 * @param value - The value to coerce to a boolean
 * @returns Boolean value, or undefined if the value cannot be interpreted as boolean
 *
 * @example
 * ```typescript
 * toBoolean(true); // true
 * toBoolean(1); // true
 * toBoolean("true"); // true
 * toBoolean("1"); // true
 * toBoolean(false); // false
 * toBoolean(0); // false
 * toBoolean("false"); // false
 * toBoolean("0"); // false
 * toBoolean("yes"); // undefined (not supported)
 * toBoolean("on"); // undefined (not supported)
 * toBoolean(2); // undefined
 * ```
 */
export const toBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0') return false;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return undefined;
};

// ============================================================================
// Box Spacing Utilities
// ============================================================================

/**
 * Converts a spacing object to a BoxSpacing type with validated numeric values.
 *
 * Extracts top, right, bottom, and left spacing values, keeping only those that
 * are finite numbers. Returns undefined if no valid spacing values exist.
 *
 * @param spacing - Object potentially containing spacing values
 * @returns BoxSpacing object with validated numeric values, or undefined if no valid values
 *
 * @example
 * ```typescript
 * toBoxSpacing({ top: 10, right: 20, bottom: 10, left: 20 });
 * // { top: 10, right: 20, bottom: 10, left: 20 }
 *
 * toBoxSpacing({ top: 10, right: "invalid" });
 * // { top: 10 }
 *
 * toBoxSpacing({ invalid: 10 });
 * // undefined (no recognized spacing properties)
 *
 * toBoxSpacing(null);
 * // undefined
 * ```
 */
export function toBoxSpacing(spacing?: Record<string, unknown>): BoxSpacing | undefined {
  if (!spacing) {
    return undefined;
  }

  const result: BoxSpacing = {};
  (['top', 'right', 'bottom', 'left'] as const).forEach((side) => {
    const value = spacing[side];
    if (isFiniteNumber(value)) {
      result[side] = Number(value);
    }
  });

  return Object.keys(result).length > 0 ? result : undefined;
}

// ============================================================================
// Position Map Building
// ============================================================================

/**
 * Builds a position map for ProseMirror nodes, tracking start/end positions.
 *
 * This function recursively traverses a ProseMirror node tree and calculates the
 * absolute position (offset from document start) for each node. Text nodes are
 * sized by character count, atomic inline nodes (like images) take 1 position,
 * and block nodes add opening/closing positions (except for the root 'doc' node).
 *
 * The resulting WeakMap allows O(1) lookup of any node's position range without
 * storing references that would prevent garbage collection.
 *
 * @param root - The root ProseMirror node to build position map from
 * @param options - Optional atom node type metadata for schema-aware position sizing
 * @returns A WeakMap mapping each node to its { start, end } position range
 *
 * @example
 * ```typescript
 * const doc = {
 *   type: 'doc',
 *   content: [
 *     { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }
 *   ]
 * };
 * const map = buildPositionMap(doc, { atomNodeTypes: ['customAtom'] });
 * const paragraph = doc.content[0];
 * map.get(paragraph); // { start: 0, end: 7 } (1 open + 5 text + 1 close)
 * ```
 */
type BuildPositionMapOptions = {
  atomNodeTypes?: Iterable<string>;
};

export const buildPositionMap = (root: PMNode, options?: BuildPositionMapOptions): PositionMap => {
  const map: PositionMap = new WeakMap();
  const atomNodeTypes = new Set(ATOMIC_INLINE_TYPES);

  if (options?.atomNodeTypes) {
    for (const nodeType of options.atomNodeTypes) {
      if (typeof nodeType === 'string' && nodeType.length > 0) {
        atomNodeTypes.add(nodeType);
      }
    }
  }

  const visit = (node: PMNode, pos: number): number => {
    if (node.type === 'text') {
      const size = node.text?.length ?? 0;
      const end = pos + size;
      map.set(node, { start: pos, end });
      return end;
    }

    if (atomNodeTypes.has(node.type)) {
      const end = pos + 1;
      map.set(node, { start: pos, end });
      return end;
    }

    const open = node.type === 'doc' ? 0 : 1;
    const close = node.type === 'doc' ? 0 : 1;
    let nextPos = pos + open;
    const content = Array.isArray(node.content) ? node.content : [];
    map.set(node, { start: pos, end: pos }); // placeholder, end updated after children
    content.forEach((child) => {
      nextPos = visit(child, nextPos);
    });
    const end = nextPos + close;
    map.set(node, { start: pos, end });
    return end;
  };

  visit(root, 0);
  return map;
};

// ============================================================================
// Block ID Generation
// ============================================================================

/**
 * Creates a block ID generator function with sequential numbering.
 *
 * Returns a closure that generates unique block IDs by combining an optional prefix,
 * an auto-incrementing counter, and a kind identifier. This ensures stable, predictable
 * IDs during document transformation.
 *
 * @param prefix - Optional prefix to prepend to all generated IDs (defaults to empty string)
 * @returns A generator function that takes a kind string and returns a unique ID
 *
 * @example
 * ```typescript
 * const genId = createBlockIdGenerator('doc-');
 * genId('paragraph'); // 'doc-0-paragraph'
 * genId('paragraph'); // 'doc-1-paragraph'
 * genId('image'); // 'doc-2-image'
 *
 * const genIdNoPrefix = createBlockIdGenerator();
 * genIdNoPrefix('heading'); // '0-heading'
 * genIdNoPrefix('heading'); // '1-heading'
 * ```
 */
export const createBlockIdGenerator = (prefix: string = ''): BlockIdGenerator => {
  let counter = 0;
  return (kind: string) => `${prefix}${counter++}-${kind}`;
};

// ============================================================================
// Drawing/Shape Utilities
// ============================================================================

/**
 * Converts an unknown value to a validated DrawingContentSnapshot.
 *
 * Validates that the value has a string 'name' property and optionally
 * includes 'attributes' (as a plain object) and 'elements' (as an array of objects).
 * Performs validation on array contents to ensure they are objects.
 *
 * @param value - The value to convert to a DrawingContentSnapshot
 * @returns A validated DrawingContentSnapshot, or undefined if validation fails
 *
 * @example
 * ```typescript
 * toDrawingContentSnapshot({ name: 'rect' });
 * // { name: 'rect' }
 *
 * toDrawingContentSnapshot({
 *   name: 'group',
 *   attributes: { fill: 'red' },
 *   elements: [{ type: 'circle' }]
 * });
 * // { name: 'group', attributes: { fill: 'red' }, elements: [{ type: 'circle' }] }
 *
 * toDrawingContentSnapshot({ name: 'rect', elements: [null, { valid: true }] });
 * // { name: 'rect', elements: [{ valid: true }] } (null filtered out)
 *
 * toDrawingContentSnapshot('invalid');
 * // undefined
 * ```
 */
export function toDrawingContentSnapshot(value: unknown): DrawingContentSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const name = raw.name;
  if (typeof name !== 'string') return undefined;

  const snapshot: DrawingContentSnapshot = { name };

  // Validate attributes is a plain object (not an array)
  if (raw.attributes && typeof raw.attributes === 'object' && !Array.isArray(raw.attributes)) {
    snapshot.attributes = { ...(raw.attributes as Record<string, unknown>) };
  }

  // Validate elements array contents
  if (Array.isArray(raw.elements)) {
    const validElements = raw.elements.filter(
      (el): el is Record<string, unknown> => el != null && typeof el === 'object',
    );
    if (validElements.length > 0) {
      snapshot.elements = validElements;
    }
  }

  return snapshot;
}

/**
 * Type guard to check if a value is a ShapeGroupTransform.
 *
 * A valid ShapeGroupTransform must have at least one finite numeric property
 * among: x, y, width, height, childWidth, childHeight, childX, childY.
 *
 * @param value - The value to check
 * @returns True if the value has at least one valid transform property
 *
 * @example
 * ```typescript
 * isShapeGroupTransform({ x: 10, y: 20 }); // true
 * isShapeGroupTransform({ width: 100 }); // true
 * isShapeGroupTransform({ childX: 5, childY: 10 }); // true
 * isShapeGroupTransform({}); // false
 * isShapeGroupTransform({ invalid: 10 }); // false
 * isShapeGroupTransform(null); // false
 * ```
 */
export function isShapeGroupTransform(value: unknown): value is ShapeGroupTransform {
  if (!value || typeof value !== 'object') return false;
  const maybe = value as Record<string, unknown>;
  return (
    isFiniteNumber(maybe.x) ||
    isFiniteNumber(maybe.y) ||
    isFiniteNumber(maybe.width) ||
    isFiniteNumber(maybe.height) ||
    isFiniteNumber(maybe.childWidth) ||
    isFiniteNumber(maybe.childHeight) ||
    isFiniteNumber(maybe.childX) ||
    isFiniteNumber(maybe.childY)
  );
}

/**
 * Normalizes a shape size object, extracting width and height properties.
 *
 * Coerces width and height to numbers if possible. Returns undefined if both
 * properties are missing or invalid.
 *
 * @param value - Object potentially containing width and height
 * @returns Object with validated width/height, or undefined if none are valid
 *
 * @example
 * ```typescript
 * normalizeShapeSize({ width: 100, height: 50 });
 * // { width: 100, height: 50 }
 *
 * normalizeShapeSize({ width: "200", height: 100 });
 * // { width: 200, height: 100 }
 *
 * normalizeShapeSize({ width: 100 });
 * // { width: 100 }
 *
 * normalizeShapeSize({ invalid: 100 });
 * // undefined
 *
 * normalizeShapeSize(null);
 * // undefined
 * ```
 */
export function normalizeShapeSize(value: unknown): { width?: number; height?: number } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const maybe = value as Record<string, unknown>;
  const width = coerceNumber(maybe.width);
  const height = coerceNumber(maybe.height);
  if (width == null && height == null) {
    return undefined;
  }
  const result: { width?: number; height?: number } = {};
  if (width != null) result.width = width;
  if (height != null) result.height = height;
  return result;
}

/** Valid size values for line end markers (sm, med, lg) */
const LINE_END_SIZES = new Set(['sm', 'med', 'lg']);

/**
 * Normalizes a single line end configuration from an unknown value.
 *
 * @param value - The value to normalize
 * @returns A validated LineEnd object, or undefined if invalid or type is 'none'
 */
const normalizeLineEnd = (value: unknown): LineEnd | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const maybe = value as Record<string, unknown>;
  const type = typeof maybe.type === 'string' ? maybe.type : undefined;
  if (!type || type === 'none') return undefined;
  const width = typeof maybe.width === 'string' && LINE_END_SIZES.has(maybe.width) ? maybe.width : undefined;
  const length = typeof maybe.length === 'string' && LINE_END_SIZES.has(maybe.length) ? maybe.length : undefined;
  return { type, width, length };
};

/**
 * Normalizes line end markers (arrowheads) configuration from an unknown value.
 *
 * Validates and extracts head and tail line end configurations.
 * Returns undefined if input is invalid or neither head nor tail is present.
 *
 * @param value - Value to normalize (expected to have head/tail properties)
 * @returns A validated LineEnds object, or undefined if invalid
 *
 * @example
 * ```typescript
 * normalizeLineEnds({ head: { type: 'triangle', width: 'sm' } });
 * // { head: { type: 'triangle', width: 'sm' } }
 *
 * normalizeLineEnds({ tail: { type: 'none' } });
 * // undefined (type 'none' is filtered out)
 *
 * normalizeLineEnds(null);
 * // undefined
 * ```
 */
export function normalizeLineEnds(value: unknown): LineEnds | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const maybe = value as Record<string, unknown>;
  const head = normalizeLineEnd(maybe.head);
  const tail = normalizeLineEnd(maybe.tail);
  if (!head && !tail) return undefined;
  return { head, tail };
}

/**
 * Normalizes effect extent values from an unknown value.
 *
 * Effect extents define additional space around a shape for effects like shadows
 * or arrowheads. Negative values are clamped to 0.
 *
 * @param value - Value to normalize (expected to have left/top/right/bottom properties)
 * @returns A validated EffectExtent object, or undefined if all values are null/undefined
 *
 * @example
 * ```typescript
 * normalizeEffectExtent({ left: 10, top: 5, right: 10, bottom: 5 });
 * // { left: 10, top: 5, right: 10, bottom: 5 }
 *
 * normalizeEffectExtent({ left: -5, right: 10 });
 * // { left: 0, top: 0, right: 10, bottom: 0 }
 *
 * normalizeEffectExtent(null);
 * // undefined
 * ```
 */
export function normalizeEffectExtent(value: unknown): EffectExtent | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const maybe = value as Record<string, unknown>;
  const left = coerceNumber(maybe.left);
  const top = coerceNumber(maybe.top);
  const right = coerceNumber(maybe.right);
  const bottom = coerceNumber(maybe.bottom);

  if (left == null && top == null && right == null && bottom == null) {
    return undefined;
  }

  const clamp = (val: number | null | undefined) => (val != null && val > 0 ? val : 0);
  return {
    left: clamp(left),
    top: clamp(top),
    right: clamp(right),
    bottom: clamp(bottom),
  };
}

/**
 * Normalizes and validates shape group children from an array.
 *
 * Filters out invalid entries, keeping only objects that have a string 'shapeType' property.
 * Returns an empty array if input is not an array.
 *
 * @param value - Value to extract shape group children from
 * @returns Array of validated ShapeGroupChild objects (may be empty)
 *
 * @example
 * ```typescript
 * normalizeShapeGroupChildren([
 *   { shapeType: 'rect', x: 0, y: 0 },
 *   { shapeType: 'circle', cx: 50, cy: 50 }
 * ]);
 * // [{ shapeType: 'rect', x: 0, y: 0 }, { shapeType: 'circle', cx: 50, cy: 50 }]
 *
 * normalizeShapeGroupChildren([
 *   { shapeType: 'rect' },
 *   null,
 *   { invalid: true },
 *   { shapeType: 'line' }
 * ]);
 * // [{ shapeType: 'rect' }, { shapeType: 'line' }]
 *
 * normalizeShapeGroupChildren(null);
 * // []
 *
 * normalizeShapeGroupChildren("not an array");
 * // []
 * ```
 */
export function normalizeShapeGroupChildren(value: unknown): ShapeGroupChild[] {
  if (!Array.isArray(value)) return [];
  return value.filter((child): child is ShapeGroupChild => {
    if (!child || typeof child !== 'object') return false;
    return typeof (child as { shapeType?: unknown }).shapeType === 'string';
  });
}

// ============================================================================
// Media/Image Utilities
// ============================================================================

/**
 * Normalizes a media key by removing leading path prefixes and converting to forward slashes.
 *
 * Converts backslashes to forward slashes, then removes all leading './' and '/' prefixes.
 * This ensures consistent path formatting across different file systems and sources.
 *
 * @param value - The media key/path to normalize (optional)
 * @returns The normalized media key, or undefined if no value provided
 *
 * @example
 * ```typescript
 * normalizeMediaKey('word/media/image1.jpg'); // 'word/media/image1.jpg'
 * normalizeMediaKey('/media/image1.jpg'); // 'media/image1.jpg'
 * normalizeMediaKey('./media/image1.jpg'); // 'media/image1.jpg'
 * normalizeMediaKey('///media/image1.jpg'); // 'media/image1.jpg'
 * normalizeMediaKey('.////media/image1.jpg'); // 'media/image1.jpg'
 * normalizeMediaKey('word\\media\\image1.jpg'); // 'word/media/image1.jpg'
 * normalizeMediaKey('\\\\media\\image1.jpg'); // 'media/image1.jpg'
 * normalizeMediaKey(undefined); // undefined
 * ```
 */
export function normalizeMediaKey(value?: string): string | undefined {
  if (!value) return undefined;
  return value
    .replace(/\\/g, '/') // Convert backslashes first
    .replace(/^(\.\/|\/)+/, ''); // Remove all leading ./ and /
}

/**
 * Infers the file extension from a file path string.
 *
 * Handles edge cases like hidden files (starting with '.'), trailing dots,
 * and paths with multiple directory separators. Only returns valid extensions
 * from the filename portion of the path.
 *
 * @param value - The file path to extract extension from (optional, nullable)
 * @returns The lowercase file extension, or undefined if none exists
 *
 * @example
 * ```typescript
 * inferExtensionFromPath('image.jpg'); // 'jpg'
 * inferExtensionFromPath('document.PDF'); // 'pdf'
 * inferExtensionFromPath('path/to/file.png'); // 'png'
 * inferExtensionFromPath('path\\to\\file.gif'); // 'gif'
 * inferExtensionFromPath('.gitignore'); // undefined (hidden file)
 * inferExtensionFromPath('file.'); // undefined (trailing dot)
 * inferExtensionFromPath('noextension'); // undefined
 * inferExtensionFromPath('file.tar.gz'); // 'gz'
 * inferExtensionFromPath(null); // undefined
 * inferExtensionFromPath(''); // undefined
 * ```
 */
export function inferExtensionFromPath(value?: string | null): string | undefined {
  if (!value) return undefined;

  // Extract filename only (handle both forward and backward slashes)
  const fileName = value.split('/').pop()?.split('\\').pop();
  if (!fileName || fileName.startsWith('.')) return undefined; // Hidden file or no filename

  const parts = fileName.split('.');
  if (parts.length < 2) return undefined; // No extension

  const ext = parts.at(-1);
  if (!ext || ext.length === 0) return undefined; // Trailing dot

  return ext.toLowerCase();
}

/**
 * Hydrates image blocks by converting file path references to base64 data URLs.
 *
 * This function processes multiple types of blocks containing images:
 * - **ImageBlocks**: Top-level image blocks with `kind: 'image'`
 * - **ParagraphBlocks**: Paragraphs containing ImageRuns (inline images)
 * - **DrawingBlocks**: Drawing blocks with `drawingKind === 'shapeGroup'` that contain image children
 * - **TableBlocks**: Tables containing cells with any of the above block types
 *
 * For each image, attempts to resolve the image source by checking multiple
 * candidate paths against the provided media files map. Uses path normalization
 * and extension inference to maximize match success rate.
 *
 * **Candidate Path Search Order:**
 * 1. Block's `src` property (normalized)
 * 2. Block's `attrs.src` if present (normalized)
 * 3. `word/media/{rId}.{ext}` if `attrs.rId` exists
 * 4. `media/{rId}.{ext}` if `attrs.rId` exists
 *
 * Extension is inferred from:
 * - `attrs.extension` (highest priority)
 * - Extension from the src path
 * - Default to 'jpeg' if neither available
 *
 * **Images are left unchanged if:**
 * - No media files are provided
 * - The src already starts with 'data:' (already a data URL)
 * - No matching media file is found in any candidate path
 *
 * @param blocks - Array of FlowBlocks to process
 * @param mediaFiles - Map of file paths to base64-encoded image data (without 'data:' prefix)
 * @returns New array of FlowBlocks with image blocks hydrated to data URLs
 *
 * @example
 * ```typescript
 * // Hydrating a top-level ImageBlock
 * const blocks = [
 *   { kind: 'image', src: 'word/media/image1.jpg', attrs: { rId: 'rId5' } }
 * ];
 * const mediaFiles = { 'word/media/image1.jpg': 'iVBORw0KGgoAAAANS...' };
 * const hydrated = hydrateImageBlocks(blocks, mediaFiles);
 * // Result: [{ kind: 'image', src: 'data:image/jpg;base64,iVBORw0KGgoAAAANS...' }]
 * ```
 *
 * @example
 * ```typescript
 * // Hydrating a DrawingBlock with shapeGroup containing image children
 * const blocks = [
 *   {
 *     kind: 'drawing',
 *     drawingKind: 'shapeGroup',
 *     shapes: [
 *       { shapeType: 'image', attrs: { src: 'word/media/img.png', x: 0, y: 0 } }
 *     ]
 *   }
 * ];
 * const mediaFiles = { 'word/media/img.png': 'base64data...' };
 * const hydrated = hydrateImageBlocks(blocks, mediaFiles);
 * // Image child's src is hydrated to data URL
 * ```
 *
 * @example
 * ```typescript
 * // Using rId fallback when direct path doesn't match
 * const blocks = [
 *   { kind: 'image', src: './image.png', attrs: { rId: 'rId3', extension: 'png' } }
 * ];
 * const mediaFiles = { 'word/media/rId3.png': 'base64data...' };
 * const hydrated = hydrateImageBlocks(blocks, mediaFiles);
 * // Matches via candidate path: word/media/rId3.png
 * ```
 */
export function hydrateImageBlocks(blocks: FlowBlock[], mediaFiles?: Record<string, string>): FlowBlock[] {
  if (!mediaFiles || Object.keys(mediaFiles).length === 0) {
    return blocks;
  }

  const normalizedMedia = new Map<string, string>();
  Object.entries(mediaFiles).forEach(([key, value]) => {
    const normalized = normalizeMediaKey(key);
    if (normalized) {
      normalizedMedia.set(normalized, value);
    }
  });

  if (normalizedMedia.size === 0) {
    return blocks;
  }

  /**
   * Helper to resolve an image source path to a data URL.
   * Tries multiple candidate paths to find a match in the media files.
   */
  const resolveImageSrc = (src: string, relId?: string, attrSrc?: string, extension?: string): string | undefined => {
    if (!src || src.startsWith('data:')) {
      return undefined;
    }

    const candidates = new Set<string>();
    candidates.add(src);
    if (attrSrc) candidates.add(attrSrc);
    if (relId) {
      const inferredExt = extension ?? inferExtensionFromPath(src) ?? 'jpeg';
      candidates.add(`word/media/${relId}.${inferredExt}`);
      candidates.add(`media/${relId}.${inferredExt}`);
    }

    for (const candidate of candidates) {
      const normalized = normalizeMediaKey(candidate);
      if (!normalized) continue;
      const base64 = normalizedMedia.get(normalized);
      if (!base64) continue;

      const finalExt = extension ?? inferExtensionFromPath(normalized) ?? 'jpeg';
      // Check if base64 already has data URI prefix (some sources store full data URIs)
      return base64.startsWith('data:') ? base64 : `data:image/${finalExt};base64,${base64}`;
    }

    return undefined;
  };

  /**
   * Helper to hydrate ImageRuns inside a paragraph block.
   *
   * Iterates through all runs in a paragraph and converts any ImageRun instances
   * with file path references to data URLs using the mediaFiles map.
   *
   * OPTIMIZATION: Returns the original array if no changes are made to avoid
   * unnecessary object allocation and re-rendering.
   *
   * @param runs - Array of runs (may include TextRuns, TabRuns, and ImageRuns)
   * @returns New array with hydrated ImageRuns, or original array if no changes
   *
   * @example
   * ```typescript
   * const runs = [
   *   { text: 'Hello' },
   *   { kind: 'image', src: 'media/logo.png', width: 100, height: 100 },
   *   { text: 'World' }
   * ];
   * const hydrated = hydrateRuns(runs);
   * // Returns: [
   * //   { text: 'Hello' },
   * //   { kind: 'image', src: 'data:image/png;base64,...', width: 100, height: 100 },
   * //   { text: 'World' }
   * // ]
   * ```
   */
  const hydrateRuns = (runs: Run[]): Run[] => {
    let hasChanges = false;
    const hydratedRuns = runs.map((run) => {
      if ((run as ImageRun).kind !== 'image') {
        return run;
      }
      const imageRun = run as ImageRun;
      if (!imageRun.src || imageRun.src.startsWith('data:')) {
        return run;
      }

      // ImageRun doesn't have attrs like ImageBlock, so we just use the src directly
      const resolvedSrc = resolveImageSrc(imageRun.src);
      if (resolvedSrc) {
        hasChanges = true;
        return { ...imageRun, src: resolvedSrc };
      }
      return run;
    });

    return hasChanges ? hydratedRuns : runs;
  };

  return blocks.map((block) => {
    const hydrateBlock = (blk: FlowBlock): FlowBlock => {
      // Handle ImageBlocks (top-level images)
      if (blk.kind === 'image') {
        if (!blk.src || blk.src.startsWith('data:')) {
          return blk;
        }

        const attrs = (blk.attrs ?? {}) as Record<string, unknown>;
        const relId = typeof attrs.rId === 'string' ? attrs.rId : undefined;
        const attrSrc = typeof attrs.src === 'string' ? attrs.src : undefined;
        const extension = typeof attrs.extension === 'string' ? attrs.extension.toLowerCase() : undefined;

        const resolvedSrc = resolveImageSrc(blk.src, relId, attrSrc, extension);
        if (resolvedSrc) {
          return { ...blk, src: resolvedSrc };
        }
        return blk;
      }

      // Handle ParagraphBlocks (may contain ImageRuns)
      if (blk.kind === 'paragraph') {
        const paragraphBlock = blk as ParagraphBlock;
        if (!paragraphBlock.runs || paragraphBlock.runs.length === 0) {
          return blk;
        }

        const hydratedRuns = hydrateRuns(paragraphBlock.runs);
        if (hydratedRuns !== paragraphBlock.runs) {
          return { ...paragraphBlock, runs: hydratedRuns };
        }
        return blk;
      }

      if (blk.kind === 'table') {
        let rowsChanged = false;
        const newRows = blk.rows.map((row) => {
          let cellsChanged = false;
          const newCells = row.cells.map((cell) => {
            let cellChanged = false;
            const hydratedBlocks = (cell.blocks ?? (cell.paragraph ? [cell.paragraph] : [])).map((cb) =>
              hydrateBlock(cb as unknown as FlowBlock),
            );

            if (cell.blocks && hydratedBlocks !== cell.blocks) {
              cellChanged = true;
            }

            // Backward compatibility: hydrate legacy cell.paragraph
            let hydratedParagraph = cell.paragraph;
            if (!cell.blocks && cell.paragraph && cell.paragraph.kind === 'paragraph') {
              const hydratedPara = hydrateBlock(cell.paragraph) as ParagraphBlock;
              if (hydratedPara !== cell.paragraph) {
                hydratedParagraph = hydratedPara;
                cellChanged = true;
              }
            }

            if (cellChanged) {
              return {
                ...cell,
                // Cast to expected type - hydrateBlock preserves block kinds, just hydrates image sources
                blocks: (hydratedBlocks.length > 0 ? hydratedBlocks : cell.blocks) as
                  | (ParagraphBlock | ImageBlock | DrawingBlock | TableBlock)[]
                  | undefined,
                paragraph: hydratedParagraph,
              };
            }
            return cell;
          });

          if (newCells.some((c, idx) => c !== row.cells[idx])) {
            cellsChanged = true;
          }

          if (cellsChanged) {
            rowsChanged = true;
            return { ...row, cells: newCells };
          }
          return row;
        });

        if (rowsChanged) {
          return { ...blk, rows: newRows };
        }
        return blk;
      }

      // Handle DrawingBlocks with shapeGroup kind (contain image children)
      if (blk.kind === 'drawing') {
        const drawingBlock = blk as DrawingBlock;
        if (drawingBlock.drawingKind !== 'shapeGroup') {
          return blk;
        }

        const shapeGroupBlock = drawingBlock as ShapeGroupDrawing;
        if (!shapeGroupBlock.shapes || shapeGroupBlock.shapes.length === 0) {
          return blk;
        }

        let shapesChanged = false;
        const hydratedShapes = shapeGroupBlock.shapes.map((shape) => {
          // Only process image children
          if (shape.shapeType !== 'image') {
            return shape;
          }

          const imageChild = shape as ShapeGroupImageChild;
          const src = imageChild.attrs?.src;
          if (!src || src.startsWith('data:')) {
            return shape;
          }

          const resolvedSrc = resolveImageSrc(src);
          if (resolvedSrc) {
            shapesChanged = true;
            return {
              ...imageChild,
              attrs: { ...imageChild.attrs, src: resolvedSrc },
            };
          }
          return shape;
        });

        if (shapesChanged) {
          return { ...shapeGroupBlock, shapes: hydratedShapes };
        }
        return blk;
      }

      return blk;
    };

    return hydrateBlock(block);
  });
}

// ============================================================================
// Shallow Object Comparison
// ============================================================================
/**
 * Performs a shallow equality comparison between two objects.
 *
 * Compares objects by checking if they have the same number of keys and if
 * all values for matching keys are strictly equal (using ===). Does not perform
 * deep comparison of nested objects or arrays.
 *
 * Both undefined objects are considered equal. If only one is undefined, they are not equal.
 *
 * @param x - First object to compare (optional)
 * @param y - Second object to compare (optional)
 * @returns True if objects are shallowly equal, false otherwise
 *
 * @example
 * ```typescript
 * shallowObjectEquals({ a: 1, b: 2 }, { a: 1, b: 2 }); // true
 * shallowObjectEquals({ a: 1 }, { a: 1, b: 2 }); // false (different keys)
 * shallowObjectEquals({ a: 1 }, { a: 2 }); // false (different values)
 * shallowObjectEquals(undefined, undefined); // true
 * shallowObjectEquals({}, undefined); // false
 * shallowObjectEquals({ a: { nested: 1 } }, { a: { nested: 1 } }); // false (different references)
 * shallowObjectEquals({ a: [1, 2] }, { a: [1, 2] }); // false (different array references)
 *
 * const arr = [1, 2];
 * shallowObjectEquals({ a: arr }, { a: arr }); // true (same reference)
 * ```
 */
export function shallowObjectEquals(x?: Record<string, unknown>, y?: Record<string, unknown>): boolean {
  if (!x && !y) return true;
  if (!x || !y) return false;
  const kx = Object.keys(x);
  const ky = Object.keys(y);
  if (kx.length !== ky.length) return false;
  return kx.every((k) => x[k] === y[k]);
}

// ============================================================================
// Shape Fill/Stroke/Text Normalizers (for Phase 2: PM-Adapter Fix)
// ============================================================================

/**
 * Type guard to check if a value is a GradientFill object.
 *
 * Validates that:
 * - The object has type: 'gradient'
 * - gradientType is either 'linear' or 'radial'
 * - angle is a finite number (for linear gradients)
 * - stops is a non-empty array with proper structure
 *
 * @param value - The value to check
 * @returns True if value is a valid GradientFill object
 *
 * @example
 * ```typescript
 * isGradientFill({ type: 'gradient', gradientType: 'linear', stops: [...], angle: 90 }); // true
 * isGradientFill({ type: 'gradient', gradientType: 'radial', stops: [...] }); // true
 * isGradientFill({ type: 'gradient', gradientType: 'invalid', stops: [...] }); // false
 * isGradientFill('#FF0000'); // false
 * isGradientFill(null); // false
 * ```
 */
export function isGradientFill(value: unknown): value is import('@superdoc/contracts').GradientFill {
  if (!isPlainObject(value)) return false;
  if (value.type !== 'gradient') return false;

  // Validate gradientType is 'linear' or 'radial'
  const gradientType = value.gradientType;
  if (gradientType !== 'linear' && gradientType !== 'radial') return false;

  // Validate angle is a number (required for linear gradients)
  if (gradientType === 'linear') {
    if (typeof value.angle !== 'number' || !Number.isFinite(value.angle)) {
      return false;
    }
  }

  // Validate stops array has proper structure
  if (!Array.isArray(value.stops) || value.stops.length === 0) return false;

  // Validate each stop has required properties
  return value.stops.every((stop: unknown) => {
    if (!isPlainObject(stop)) return false;
    return (
      typeof stop.position === 'number' &&
      Number.isFinite(stop.position) &&
      typeof stop.color === 'string' &&
      (stop.alpha === undefined || (typeof stop.alpha === 'number' && Number.isFinite(stop.alpha)))
    );
  });
}

/**
 * Type guard to check if a value is a SolidFillWithAlpha object.
 *
 * @param value - The value to check
 * @returns True if value is a valid SolidFillWithAlpha object
 *
 * @example
 * ```typescript
 * isSolidFillWithAlpha({ type: 'solidWithAlpha', color: '#FF0000', alpha: 0.5 }); // true
 * isSolidFillWithAlpha('#FF0000'); // false
 * isSolidFillWithAlpha(null); // false
 * ```
 */
export function isSolidFillWithAlpha(value: unknown): value is import('@superdoc/contracts').SolidFillWithAlpha {
  return (
    isPlainObject(value) &&
    value.type === 'solidWithAlpha' &&
    typeof value.color === 'string' &&
    typeof value.alpha === 'number'
  );
}

/**
 * Normalizes a fill color value to a valid FillColor type.
 * Preserves gradient objects, solid with alpha objects, string colors, and null.
 *
 * @param value - Raw fill color value from ProseMirror node
 * @returns Normalized FillColor or undefined if invalid
 *
 * @example
 * ```typescript
 * normalizeFillColor('#FF0000'); // '#FF0000' (string pass-through)
 * normalizeFillColor({ type: 'gradient', ... }); // GradientFill object
 * normalizeFillColor({ type: 'solidWithAlpha', color: '#FF0000', alpha: 0.5 }); // SolidFillWithAlpha
 * normalizeFillColor(null); // null (no fill)
 * normalizeFillColor(123); // undefined (invalid)
 * ```
 */
export function normalizeFillColor(value: unknown): import('@superdoc/contracts').FillColor | undefined {
  if (value === null) return null;
  if (typeof value === 'string') return value;
  if (isGradientFill(value)) return value;
  if (isSolidFillWithAlpha(value)) return value;
  return undefined;
}

/**
 * Normalizes a stroke color value to a valid StrokeColor type.
 * Null explicitly means "no border" (not a default black border).
 *
 * @param value - Raw stroke color value from ProseMirror node
 * @returns Normalized StrokeColor or undefined if invalid
 *
 * @example
 * ```typescript
 * normalizeStrokeColor('#000000'); // '#000000' (string)
 * normalizeStrokeColor(null); // null (explicit no border)
 * normalizeStrokeColor(undefined); // undefined
 * normalizeStrokeColor(123); // undefined (invalid)
 * ```
 */
export function normalizeStrokeColor(value: unknown): import('@superdoc/contracts').StrokeColor | undefined {
  if (value === null) return null; // Explicit no-border
  if (typeof value === 'string') return value;
  return undefined;
}

/**
 * Normalizes text content for shapes.
 * Validates structure and filters out invalid text parts.
 *
 * @param value - Raw text content value from ProseMirror node
 * @returns Normalized ShapeTextContent or undefined if invalid
 *
 * @example
 * ```typescript
 * normalizeTextContent({ parts: [{ text: 'Hello' }], horizontalAlign: 'center' });
 * // { parts: [{ text: 'Hello' }], horizontalAlign: 'center' }
 *
 * normalizeTextContent({ parts: [] }); // undefined (empty parts)
 * normalizeTextContent({ parts: [{ text: 'A' }, null, { text: 'B' }] });
 * // { parts: [{ text: 'A' }, { text: 'B' }] } (null filtered)
 * ```
 */
export function normalizeTextContent(value: unknown): import('@superdoc/contracts').ShapeTextContent | undefined {
  if (!isPlainObject(value)) return undefined;
  if (!Array.isArray(value.parts)) return undefined;
  if (value.parts.length === 0) return undefined;

  // Filter valid text parts
  const validParts = value.parts.filter((p: unknown) => isPlainObject(p) && typeof p.text === 'string');

  if (validParts.length === 0) return undefined;

  const result: import('@superdoc/contracts').ShapeTextContent = {
    parts: validParts as import('@superdoc/contracts').TextPart[],
  };

  // Validate horizontal alignment
  if (['left', 'center', 'right'].includes(value.horizontalAlign as string)) {
    result.horizontalAlign = value.horizontalAlign as 'left' | 'center' | 'right';
  }

  return result;
}

/**
 * Normalizes vertical text alignment value.
 *
 * @param value - Raw vertical alignment value from node attributes
 * @returns Normalized vertical alignment or undefined if invalid
 *
 * @example
 * ```typescript
 * normalizeTextVerticalAlign('top'); // 'top'
 * normalizeTextVerticalAlign('center'); // 'center'
 * normalizeTextVerticalAlign('bottom'); // 'bottom'
 * normalizeTextVerticalAlign('invalid'); // undefined
 * ```
 */
export function normalizeTextVerticalAlign(value: unknown): 'top' | 'center' | 'bottom' | undefined {
  if (typeof value !== 'string') return undefined;
  if (value === 'top' || value === 'center' || value === 'bottom') {
    return value;
  }
  return undefined;
}

/**
 * Normalizes text insets object.
 *
 * @param value - Raw text insets object from node attributes
 * @returns Normalized text insets or undefined if invalid
 *
 * @example
 * ```typescript
 * normalizeTextInsets({ top: 4.8, right: 9.6, bottom: 4.8, left: 9.6 });
 * // { top: 4.8, right: 9.6, bottom: 4.8, left: 9.6 }
 * normalizeTextInsets(null); // undefined
 * ```
 */
export function normalizeTextInsets(
  value: unknown,
): { top: number; right: number; bottom: number; left: number } | undefined {
  if (!isPlainObject(value)) return undefined;
  const top = pickNumber(value.top);
  const right = pickNumber(value.right);
  const bottom = pickNumber(value.bottom);
  const left = pickNumber(value.left);

  if (top == null || right == null || bottom == null || left == null) {
    return undefined;
  }

  return { top, right, bottom, left };
}

/**
 * Base z-index offset for OOXML relativeHeight values.
 *
 * OOXML relativeHeight values typically start around 251658240 (a base value).
 * By subtracting this base, we get the relative stacking order within the document.
 * This preserves fine-grained differences between overlapping elements.
 *
 * For example:
 * - 251658240 (base) → 0 (background layer)
 * - 251658242 → 2 (slightly above base)
 * - 251658291 → 51 (further above)
 */
export const OOXML_Z_INDEX_BASE = 251658240;

// ============================================================================
// OOXML Element Utilities (z-index from relativeHeight)
// ============================================================================

/**
 * Coerces relativeHeight from OOXML (number or string) to a finite number.
 */
export function coerceRelativeHeight(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Normalizes z-index from OOXML relativeHeight value.
 *
 * OOXML uses large numbers starting around 251658240. To preserve the relative
 * stacking order, we subtract the base value to get a small positive number
 * suitable for CSS z-index. This ensures elements with close relativeHeight
 * values maintain their correct stacking order.
 *
 * @param originalAttributes - The originalAttributes object from ProseMirror node attrs
 * @returns Normalized z-index number or undefined if no relativeHeight
 *
 * @example
 * ```typescript
 * normalizeZIndex({ relativeHeight: 251658240 }); // 0 (background)
 * normalizeZIndex({ relativeHeight: 251658242 }); // 2 (above background)
 * normalizeZIndex({ relativeHeight: 251658291 }); // 51 (further above)
 * normalizeZIndex({}); // undefined
 * normalizeZIndex(null); // undefined
 * ```
 */
export function normalizeZIndex(originalAttributes: unknown): number | undefined {
  if (!isPlainObject(originalAttributes)) return undefined;
  const relativeHeight = coerceRelativeHeight(originalAttributes.relativeHeight);
  if (relativeHeight === undefined) return undefined;
  return Math.max(0, relativeHeight - OOXML_Z_INDEX_BASE);
}

/**
 * Resolves the CSS z-index for a floating object based on its behindDoc flag
 * and an OOXML-derived raw value.
 *
 * - behindDoc objects always return 0.
 * - Non-behindDoc objects are clamped to at least 1 so they never share the
 *   behindDoc sentinel value (0).
 *
 * @param behindDoc - Whether the object is behind body text
 * @param raw - OOXML-derived z-index (from normalizeZIndex or block.zIndex)
 * @param fallback - Value to use when raw is undefined (default: 1)
 * @returns Resolved z-index
 */
export function resolveFloatingZIndex(behindDoc: boolean, raw: number | undefined, fallback = 1): number {
  if (behindDoc) return 0;
  if (raw === undefined) return Math.max(1, fallback);
  return Math.max(1, raw);
}

/**
 * Returns z-index for an image or drawing block.
 *
 * We cannot rely on `block.zIndex` only: when the flow-block cache hits, the
 * paragraph handler reuses cached blocks and never calls the image/shape
 * converters, so those blocks never get `zIndex` set. This helper uses
 * `block.zIndex` when present, otherwise derives from
 * `block.attrs.originalAttributes.relativeHeight` via normalizeZIndex,
 * otherwise behindDoc ? 0 : 1.
 *
 * Rendering policy:
 * - behindDoc anchored objects always return 0.
 * - Anchored objects with text wrapping (Square/Tight/Through/TopAndBottom, or
 *   missing wrap metadata) keep OOXML relativeHeight ordering but are clamped
 *   to at least 1 (never 0 unless behindDoc=true).
 * - Front/no-wrap anchored objects (wrap None) also preserve OOXML relativeHeight order.
 */
export function getFragmentZIndex(block: ImageBlock | DrawingBlock): number {
  const attrs = block.attrs as { originalAttributes?: unknown } | undefined;
  const raw = typeof block.zIndex === 'number' ? block.zIndex : normalizeZIndex(attrs?.originalAttributes);

  return resolveFloatingZIndex(block.anchor?.behindDoc === true, raw);
}
