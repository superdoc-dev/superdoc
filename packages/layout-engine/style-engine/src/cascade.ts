/**
 * @superdoc/style-engine/cascade
 *
 * Generic cascade utilities for OOXML style resolution.
 * This module is the SINGLE SOURCE OF TRUTH for property merging and cascade rules.
 *
 * These utilities are format-agnostic and work with plain JavaScript objects.
 * They are used by both:
 * - super-editor's styles.js (for DOCX import/export)
 * - layout-engine's style resolution (for rendering)
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Properties that must be explicitly overridden by inline formatting.
 * These properties require special handling because inline w:rPr formatting must
 * always take precedence over character style (w:rStyle) properties, even though
 * both are merged in the style chain. This explicit override ensures that direct
 * formatting (e.g., w:sz for fontSize) always wins over linked character styles.
 *
 * Note: fontFamily and color are already handled by combineProperties with full override logic.
 */
export const INLINE_OVERRIDE_PROPERTIES = [
  'fontSize',
  'bold',
  'italic',
  'strike',
  'underline',
  'letterSpacing',
] as const;

/**
 * Default font size in half-points (20 half-points = 10pt).
 * This baseline ensures all text has a valid, positive font size when no other source provides one.
 * Used as the final fallback in fontSize resolution cascade:
 * 1. Inline formatting (highest priority)
 * 2. Character style
 * 3. Paragraph style
 * 4. Document defaults
 * 5. Normal style
 * 6. DEFAULT_FONT_SIZE_HALF_POINTS (this constant)
 */
export const DEFAULT_FONT_SIZE_HALF_POINTS = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PropertyObject = Record<string, unknown>;

export type SpecialHandler<T = unknown> = (target: PropertyObject, source: PropertyObject) => T;

export interface CombinePropertiesOptions {
  /**
   * Keys that should completely overwrite instead of deep merge.
   * Use this for complex objects like fontFamily or color that should
   * be replaced entirely rather than merged property-by-property.
   */
  fullOverrideProps?: string[];

  /**
   * Custom merge handlers for specific keys.
   * The handler receives the accumulated target and current source,
   * and returns the new value for that key.
   */
  specialHandling?: Record<string, SpecialHandler>;
}

// ---------------------------------------------------------------------------
// Core Cascade Functions
// ---------------------------------------------------------------------------

/**
 * Determines whether the supplied value is a mergeable plain object.
 * @param item - Value to inspect.
 * @returns True when the value is a non-array object.
 */
function isObject(item: unknown): item is PropertyObject {
  return item != null && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Performs a deep merge on an ordered list of property objects.
 *
 * This is the core cascade function used throughout style resolution.
 * Properties from later objects in the array override earlier ones.
 *
 * @param propertiesArray - Ordered list of property objects to combine (low -> high priority).
 * @param options - Configuration for full overrides and special handling.
 * @returns Combined property object.
 *
 * @example
 * ```typescript
 * import { combineProperties } from '@superdoc/style-engine/cascade';
 *
 * const result = combineProperties([
 *   { fontSize: 22, bold: true },           // from style
 *   { fontSize: 24, italic: true },         // from inline (wins for fontSize)
 * ]);
 * // result: { fontSize: 24, bold: true, italic: true }
 *
 * // With full override for color (replaces entire object, not merge):
 * const result2 = combineProperties(
 *   [
 *     { color: { val: 'FF0000', theme: 'accent1' } },
 *     { color: { val: '00FF00' } },
 *   ],
 *   { fullOverrideProps: ['color'] }
 * );
 * // result2: { color: { val: '00FF00' } } - NOT merged
 * ```
 */
export function combineProperties(
  propertiesArray: PropertyObject[],
  options: CombinePropertiesOptions = {},
): PropertyObject {
  const { fullOverrideProps = [], specialHandling = {} } = options;

  if (!propertiesArray || propertiesArray.length === 0) {
    return {};
  }

  /**
   * Deep merges two objects while respecting override lists and per-key handlers.
   */
  const merge = (target: PropertyObject, source: PropertyObject): PropertyObject => {
    const output: PropertyObject = { ...target };

    if (isObject(target) && isObject(source)) {
      for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          const handler = specialHandling[key];

          if (handler && typeof handler === 'function') {
            // Use custom handler for this key
            output[key] = handler(output, source);
          } else if (!fullOverrideProps.includes(key) && isObject(source[key])) {
            // Deep merge nested objects (unless marked for full override)
            if (key in target && isObject(target[key])) {
              output[key] = merge(target[key] as PropertyObject, source[key] as PropertyObject);
            } else {
              output[key] = source[key];
            }
          } else {
            // Simple assignment (primitives or full override keys)
            output[key] = source[key];
          }
        }
      }
    }

    return output;
  };

  return propertiesArray.reduce((acc, current) => merge(acc, current ?? {}), {});
}

/**
 * Combines run property objects while fully overriding certain keys.
 * This is a convenience wrapper for run properties (w:rPr).
 *
 * @param propertiesArray - Ordered list of run property objects.
 * @returns Combined run property object.
 */
export function combineRunProperties(propertiesArray: PropertyObject[]): PropertyObject {
  return combineProperties(propertiesArray, {
    fullOverrideProps: ['fontFamily', 'color'],
  });
}

/**
 * Applies inline override properties to ensure direct formatting always wins.
 *
 * Even though inline properties come last in the style chain, we explicitly
 * override to guarantee correctness. This is critical for properties like
 * fontSize where inline w:sz must override w:rStyle fontSize.
 *
 * @param finalProps - The merged properties from the style chain.
 * @param inlineProps - The inline (direct) formatting properties.
 * @param overrideKeys - Which keys to force override (defaults to INLINE_OVERRIDE_PROPERTIES).
 * @returns The finalProps object with inline overrides applied.
 */
export function applyInlineOverrides(
  finalProps: PropertyObject,
  inlineProps: PropertyObject | null | undefined,
  overrideKeys: readonly string[] = INLINE_OVERRIDE_PROPERTIES,
): PropertyObject {
  if (!inlineProps) return finalProps;

  for (const prop of overrideKeys) {
    if (inlineProps[prop] != null) {
      finalProps[prop] = inlineProps[prop];
    }
  }

  return finalProps;
}

// ---------------------------------------------------------------------------
// Font Size Fallback
// ---------------------------------------------------------------------------

/**
 * Validates that a font size value is valid (positive finite number).
 */
export function isValidFontSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Resolves font size with fallback cascade.
 *
 * Falls back through multiple sources to ensure all text has a valid font size:
 * 1. The provided value (if valid)
 * 2. Document defaults
 * 3. Normal style
 * 4. Baseline constant (DEFAULT_FONT_SIZE_HALF_POINTS = 20 = 10pt)
 *
 * @param value - The resolved font size from the style chain.
 * @param defaultProps - Document default properties.
 * @param normalProps - Normal style properties.
 * @returns A valid positive font size in half-points.
 */
export function resolveFontSizeWithFallback(
  value: unknown,
  defaultProps?: PropertyObject | null,
  normalProps?: PropertyObject | null,
): number {
  // If the value is already valid, use it
  if (isValidFontSize(value)) {
    return value;
  }

  // Try document defaults
  if (defaultProps && isValidFontSize(defaultProps.fontSize)) {
    return defaultProps.fontSize;
  }

  // Try Normal style
  if (normalProps && isValidFontSize(normalProps.fontSize)) {
    return normalProps.fontSize;
  }

  // Final fallback: 20 half-points = 10pt
  return DEFAULT_FONT_SIZE_HALF_POINTS;
}

// ---------------------------------------------------------------------------
// Style Chain Ordering
// ---------------------------------------------------------------------------

/**
 * Determines the correct ordering for defaults and Normal style in the cascade.
 *
 * Per OOXML spec, when Normal style is marked as w:default="1", it should
 * come AFTER document defaults in the cascade (so Normal values override defaults).
 * When Normal is NOT the default style, defaults should come after Normal.
 *
 * @param defaultProps - Document default properties.
 * @param normalProps - Normal style properties.
 * @param isNormalDefault - Whether Normal style has w:default="1".
 * @returns Ordered array [first, second] for the cascade.
 */
export function orderDefaultsAndNormal(
  defaultProps: PropertyObject,
  normalProps: PropertyObject,
  isNormalDefault: boolean,
): [PropertyObject, PropertyObject] {
  if (isNormalDefault) {
    // Normal is default: [defaults, Normal] - Normal wins when both exist
    return [defaultProps, normalProps];
  } else {
    // Normal is NOT default: [Normal, defaults] - defaults win when both exist
    return [normalProps, defaultProps];
  }
}

// ---------------------------------------------------------------------------
// Indent Special Handling
// ---------------------------------------------------------------------------

/**
 * Creates a special handler for firstLine indent that removes hanging when firstLine is set.
 *
 * Per OOXML, when a higher priority source defines firstLine, it should
 * remove hanging from the final result (they are mutually exclusive).
 */
export function createFirstLineIndentHandler(): SpecialHandler {
  return (target: PropertyObject, source: PropertyObject): unknown => {
    // If a higher priority source defines firstLine, remove hanging from the final result
    if (target.hanging != null && source.firstLine != null) {
      delete target.hanging;
    }
    return source.firstLine;
  };
}

/**
 * Creates a special handler for hanging indent that removes firstLine when hanging is set.
 *
 * Per OOXML, when a higher priority source defines hanging, it should
 * remove firstLine from the final result (they are mutually exclusive).
 *
 * @returns A SpecialHandler function that processes hanging indent values and
 *   removes conflicting firstLine values from the target object
 */
export function createHangingIndentHandler(): SpecialHandler {
  return (target: PropertyObject, source: PropertyObject): unknown => {
    // If a higher priority source defines hanging, remove firstLine from the final result
    if (target.firstLine != null && source.hanging != null) {
      delete target.firstLine;
    }
    return source.hanging;
  };
}

/**
 * Combines indent properties with special handling for firstLine/hanging mutual exclusivity.
 *
 * @param indentChain - Ordered list of indent property objects (or objects with indent property).
 * @returns Combined indent object.
 */
export function combineIndentProperties(indentChain: PropertyObject[]): PropertyObject {
  // Extract just the indent properties from each object
  const indentOnly = indentChain.map((props) => (props.indent != null ? { indent: props.indent } : {}));

  return combineProperties(indentOnly, {
    specialHandling: {
      firstLine: createFirstLineIndentHandler(),
      hanging: createHangingIndentHandler(),
    },
  });
}
