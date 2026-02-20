/**
 * Shared utility functions for PM adapter
 *
 * Contains type guards, normalization, conversion, and position mapping utilities
 * used across multiple adapter modules.
 */
import type {
  BoxSpacing,
  DrawingContentSnapshot,
  ParagraphIndent,
  ShapeGroupChild,
  ShapeGroupTransform,
  FlowBlock,
} from '@superdoc/contracts';
import type { PMNode, PositionMap, BlockIdGenerator } from './types.js';
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
export declare const twipsToPx: (value: number) => number;
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
export declare const ptToPx: (pt?: number | null) => number | undefined;
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
export declare const isFiniteNumber: (value: unknown) => value is number;
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
export declare const isPlainObject: (value: unknown) => value is Record<string, unknown>;
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
export declare const normalizePrefix: (value?: string) => string;
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
export declare const pickNumber: (value: unknown) => number | undefined;
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
export declare const normalizeColor: (value: unknown) => string | undefined;
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
export declare const normalizeString: (value: unknown) => string | undefined;
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
export declare function coerceNumber(value: unknown): number | undefined;
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
export declare function coercePositiveNumber(value: unknown, fallback: number): number;
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
export declare function coerceBoolean(value: unknown): boolean | undefined;
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
export declare const toBoolean: (value: unknown) => boolean | undefined;
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
export declare function toBoxSpacing(spacing?: Record<string, unknown>): BoxSpacing | undefined;
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
 * const map = buildPositionMap(doc);
 * const paragraph = doc.content[0];
 * map.get(paragraph); // { start: 0, end: 7 } (1 open + 5 text + 1 close)
 * ```
 */
type BuildPositionMapOptions = {
  atomNodeTypes?: Iterable<string>;
};
export declare const buildPositionMap: (root: PMNode, options?: BuildPositionMapOptions) => PositionMap;
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
export declare const createBlockIdGenerator: (prefix?: string) => BlockIdGenerator;
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
export declare function toDrawingContentSnapshot(value: unknown): DrawingContentSnapshot | undefined;
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
export declare function isShapeGroupTransform(value: unknown): value is ShapeGroupTransform;
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
export declare function normalizeShapeSize(value: unknown):
  | {
      width?: number;
      height?: number;
    }
  | undefined;
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
export declare function normalizeShapeGroupChildren(value: unknown): ShapeGroupChild[];
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
export declare function normalizeMediaKey(value?: string): string | undefined;
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
export declare function inferExtensionFromPath(value?: string | null): string | undefined;
/**
 * Hydrates image blocks by converting file path references to base64 data URLs.
 *
 * For each image block, attempts to resolve the image source by checking multiple
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
 * **Image blocks are left unchanged if:**
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
 * // Using rId fallback when direct path doesn't match
 * const blocks = [
 *   { kind: 'image', src: './image.png', attrs: { rId: 'rId3', extension: 'png' } }
 * ];
 * const mediaFiles = { 'word/media/rId3.png': 'base64data...' };
 * const hydrated = hydrateImageBlocks(blocks, mediaFiles);
 * // Matches via candidate path: word/media/rId3.png
 * ```
 */
export declare function hydrateImageBlocks(blocks: FlowBlock[], mediaFiles?: Record<string, string>): FlowBlock[];
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
export declare function shallowObjectEquals(x?: Record<string, unknown>, y?: Record<string, unknown>): boolean;
