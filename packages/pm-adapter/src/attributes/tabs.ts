/**
 * Tab Stop Normalization Module
 *
 * Functions for normalizing OOXML tab stop specifications from various input formats
 * to the canonical TabStop format used by the layout engine.
 */

import type { TabStop } from '@superdoc/contracts';
import { pickNumber } from '../utilities.js';

/**
 * Conversion constant: 96 DPI standard (1 inch = 96px, 1 inch = 1440 twips)
 * Therefore: 1px = 15 twips
 */
const PX_TO_TWIPS = 15;

/**
 * Heuristic threshold to distinguish twips from pixels.
 * Values > 1000 are assumed to be twips (representing > 66px or > 0.69 inches).
 * This threshold works because typical tab stops in pixels are under 1000px,
 * while twips values are typically much larger (720 twips = 0.5 inch).
 */
const TWIPS_THRESHOLD = 1000;

/**
 * Normalize OOXML tab stops from various input formats to canonical TabStop format.
 *
 * Supports multiple input formats:
 * 1. SuperConverter format: { val, pos (in px), originalPos (in twips), leader }
 * 2. Super-editor format: { tab: { tabType, pos (in twips), leader } }
 *
 * Position resolution priority:
 * 1. originalPos (exact OOXML twips) - highest priority
 * 2. pos/position/offset with automatic px→twips conversion
 *
 * @param tabs - Array of tab stop objects in various formats
 * @returns Normalized array of TabStop objects in twips, or undefined if empty/invalid
 *
 * @example
 * // Super-editor format (nested, twips)
 * normalizeOoxmlTabs([{ tab: { tabType: 'left', pos: 4320 } }])
 * // Returns: [{ val: 'start', pos: 4320 }]
 *
 * @example
 * // SuperConverter format (flat, pixels with originalPos)
 * normalizeOoxmlTabs([{ val: 'center', pos: 48, originalPos: 720 }])
 * // Returns: [{ val: 'center', pos: 720 }] (uses originalPos)
 *
 * @example
 * // Mixed formats in same array
 * normalizeOoxmlTabs([
 *   { tab: { tabType: 'left', pos: 2880 } },
 *   { val: 'center', originalPos: 5760 }
 * ])
 * // Returns: [{ val: 'start', pos: 2880 }, { val: 'center', pos: 5760 }]
 */
export const normalizeOoxmlTabs = (tabs: unknown): TabStop[] | undefined => {
  if (!Array.isArray(tabs)) return undefined;
  const normalized: TabStop[] = [];

  for (const entry of tabs) {
    if (!entry || typeof entry !== 'object') continue;
    const rawEntry = entry as Record<string, unknown>;

    // Handle super-editor's nested format: { tab: { tabType, pos, leader } }
    const isNestedTab = Boolean(rawEntry.tab && typeof rawEntry.tab === 'object');
    const source = isNestedTab ? (rawEntry.tab as Record<string, unknown>) : rawEntry;

    // Resolve position: prefer originalPos (twips), fallback to pos/position/offset
    // Nested OOXML-style tabs (super-editor) already use twips; skip px heuristic for them.
    const posTwips = resolveTabPosition(source, isNestedTab);
    if (posTwips == null) continue;

    // Support 'tabType' from super-editor in addition to 'val'/'align'/'type'
    const val = normalizeTabVal(source.val ?? source.align ?? source.alignment ?? source.type ?? source.tabType);
    if (!val) continue;

    const tab: TabStop = {
      val,
      pos: posTwips,
    };

    const leader = normalizeTabLeader(source.leader);
    if (leader) tab.leader = leader;

    normalized.push(tab);
  }

  return normalized.length > 0 ? normalized : undefined;
};

/**
 * Resolve tab stop position from various property names and units.
 *
 * Priority order:
 * 1. originalPos (already in twips from OOXML)
 * 2. pos/position/offset (may be px or twips, auto-detected)
 *
 * Auto-detection heuristic:
 * - Values > 1000 are assumed to be twips (super-editor format)
 * - Values <= 1000 are assumed to be pixels and converted (SuperConverter format)
 *
 * @param source - Tab stop object with position properties
 * @param treatPosAsTwips - When true, treats pos/position/offset values as twips and skips
 *                          the px→twips heuristic conversion. Used for nested OOXML-style
 *                          tab formats (e.g., { tab: { tabType, pos } }) where pos is
 *                          already in twips. Defaults to false for backward compatibility.
 * @returns Position in twips, or undefined if no valid position found
 */
const resolveTabPosition = (source: Record<string, unknown>, treatPosAsTwips = false): number | undefined => {
  // Prefer originalPos (exact OOXML twips)
  const originalPos = pickNumber(source.originalPos);
  if (originalPos != null) {
    return originalPos;
  }

  // Fallback to pos/position/offset with auto-detection
  const posValue = pickNumber(source.pos ?? source.position ?? source.offset);
  if (posValue == null) {
    return undefined;
  }

  // Nested OOXML tabs are already in twips; avoid px heuristic.
  if (treatPosAsTwips) {
    return posValue;
  }

  // Heuristic: if pos > 1000, it's likely twips; otherwise px
  if (posValue > TWIPS_THRESHOLD) {
    return posValue; // Already twips (super-editor format)
  } else {
    // px → twips at 96 DPI
    return Math.round(posValue * PX_TO_TWIPS);
  }
};

/**
 * Normalize tab alignment value to OOXML 'val' format.
 *
 * Maps legacy directional values ('left', 'right') to bidirectional-safe
 * values ('start', 'end') for proper RTL (right-to-left) text support.
 *
 * Supported OOXML values:
 * - start: Left-aligned in LTR, right-aligned in RTL
 * - center: Center-aligned
 * - end: Right-aligned in LTR, left-aligned in RTL
 * - decimal: Aligned on decimal separator
 * - bar: Vertical bar (not a tab stop, but a visual decoration)
 * - clear: Clears inherited tab stop
 *
 * @param value - Raw alignment value from input format
 * @returns Normalized OOXML alignment value, or undefined if invalid
 *
 * @example
 * normalizeTabVal('left') // Returns: 'start'
 * normalizeTabVal('right') // Returns: 'end'
 * normalizeTabVal('dec') // Returns: 'decimal'
 * normalizeTabVal('invalid') // Returns: undefined
 */
export const normalizeTabVal = (value: unknown): TabStop['val'] | undefined => {
  switch (value) {
    case 'start':
    case 'center':
    case 'end':
    case 'decimal':
    case 'bar':
    case 'clear':
      return value;
    case 'left':
    case 'num':
      return 'start'; // Legacy mapping for RTL support
    case 'right':
      return 'end'; // Legacy mapping for RTL support
    case 'dec':
      return 'decimal'; // Abbreviation mapping
    default:
      return undefined;
  }
};

/**
 * Normalize tab leader value to OOXML format.
 *
 * Tab leaders are visual decorations that fill the space created by a tab,
 * commonly used in tables of contents (dots leading to page numbers).
 *
 * Supported OOXML values:
 * - none: No leader (default)
 * - dot: Dotted line (e.g., "Chapter 1...........42")
 * - hyphen: Dashed line
 * - heavy: Thick solid line
 * - underscore: Thin solid line
 * - middleDot: Centered dot pattern
 *
 * @param value - Raw leader value from input format
 * @returns Normalized OOXML leader value, or undefined if invalid
 *
 * @example
 * normalizeTabLeader('dot') // Returns: 'dot'
 * normalizeTabLeader('thick') // Returns: 'heavy'
 * normalizeTabLeader('invalid') // Returns: undefined
 */
export const normalizeTabLeader = (value: unknown): TabStop['leader'] | undefined => {
  switch (value) {
    case 'none':
    case 'dot':
    case 'hyphen':
    case 'heavy':
    case 'underscore':
    case 'middleDot':
      return value;
    case 'thick':
      return 'heavy'; // Legacy mapping
    default:
      return undefined;
  }
};
