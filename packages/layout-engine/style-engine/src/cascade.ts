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

import { ParagraphProperties, RunFontFamilyProperties, RunProperties } from './ooxml/types';

export type PropertyObject = ParagraphProperties | RunProperties;

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
export function combineProperties<T extends PropertyObject>(
  propertiesArray: T[],
  options: {
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
    specialHandling?: Record<string, (target: Record<string, unknown>, source: Record<string, unknown>) => unknown>;
  } = {},
): T {
  const { fullOverrideProps = [], specialHandling = {} } = options;

  if (!propertiesArray || propertiesArray.length === 0) {
    return {} as T;
  }

  /**
   * Deep merges two objects while respecting override lists and per-key handlers.
   */
  const merge = (target: Record<string, unknown>, source: Record<string, unknown>): PropertyObject => {
    const output: Record<string, unknown> = { ...target };

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
              output[key] = merge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
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

  return propertiesArray.reduce((acc, current) => merge(acc, (current ?? {}) as Record<string, unknown>), {}) as T;
}

/**
 * Determines whether the supplied value is a mergeable plain object.
 * @param item - Value to inspect.
 * @returns True when the value is a non-array object.
 */
function isObject(item: unknown): item is PropertyObject {
  return item != null && typeof item === 'object' && !Array.isArray(item);
}

// ---------------------------------------------------------------------------
// Style Chain Ordering
// ---------------------------------------------------------------------------

/**
 * Combines run property objects while fully overriding certain keys.
 * This is a convenience wrapper for run properties (w:rPr).
 *
 * @param propertiesArray - Ordered list of run property objects.
 * @returns Combined run property object.
 */
export function combineRunProperties(propertiesArray: RunProperties[]): RunProperties {
  return combineProperties(propertiesArray, {
    fullOverrideProps: ['color'],
    specialHandling: {
      fontFamily: (target: Record<string, unknown>, source: Record<string, unknown>): unknown => {
        const fontFamilySource = { ...(source.fontFamily as object) } as RunFontFamilyProperties;
        const fontFamilyTarget = { ...(target.fontFamily as object) } as RunFontFamilyProperties;
        if (fontFamilySource.asciiTheme != null) {
          delete fontFamilyTarget.ascii;
          delete fontFamilyTarget.asciiTheme;
        }
        if (fontFamilySource.ascii != null) {
          delete fontFamilyTarget.asciiTheme;
        }
        return { ...(fontFamilyTarget as object), ...(fontFamilySource as object) };
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Indent Special Handling
// ---------------------------------------------------------------------------
/**
 * Combines indent properties with special handling for firstLine/hanging mutual exclusivity.
 *
 * @param indentChain - Ordered list of indent property objects (or objects with indent property).
 * @returns Combined indent object.
 */
export function combineIndentProperties(indentChain: ParagraphProperties[]): ParagraphProperties {
  // Extract just the indent properties from each object
  const indentOnly = indentChain.map((props) => (props.indent != null ? { indent: props.indent } : {}));

  return combineProperties(indentOnly, {
    specialHandling: {
      firstLine: (target: Record<string, unknown>, source: Record<string, unknown>): unknown => {
        // If a higher priority source defines firstLine, remove hanging from the final result
        if (target.hanging != null && source.firstLine != null) {
          delete target.hanging;
        }
        return source.firstLine;
      },
      hanging: (target: Record<string, unknown>, source: Record<string, unknown>): unknown => {
        // If a higher priority source defines hanging, remove firstLine from the final result
        if (target.firstLine != null && source.hanging != null) {
          delete target.firstLine;
        }
        return source.hanging;
      },
    },
  });
}
