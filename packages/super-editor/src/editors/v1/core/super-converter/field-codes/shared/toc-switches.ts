/**
 * Shared TOC instruction parser/serializer — single source of truth.
 *
 * Handles all OOXML TOC field switches:
 * - Configurable source switches: \o, \u, \f, \l (via toc.configure)
 * - Configurable display switches: \h, \z, \n, \p (via toc.configure)
 * - Preserved switches: \t, \b, \a, \c, \d, \s, \w (round-tripped, not configurable)
 * - Unrecognized switches: stored in rawExtensions for lossless round-trip
 *
 * Note: `includePageNumbers` and `tabLeader` are convenience projections derived
 * from \n and \p respectively. `rightAlignPageNumbers` is NOT handled here — it
 * is stored as a PM node attribute on the tableOfContents node.
 */

import type {
  TocSwitchConfig,
  TocSourceConfig,
  TocDisplayConfig,
  TocPreservedSwitches,
  TocConfigurePatch,
} from '@superdoc/document-api';

// ---------------------------------------------------------------------------
// Tab leader mapping
// ---------------------------------------------------------------------------

const TAB_LEADER_TO_SEPARATOR: Record<string, string> = {
  dot: '.',
  hyphen: '-',
  underscore: '_',
  middleDot: '·',
};

const SEPARATOR_TO_TAB_LEADER: Record<string, string> = {
  '.': 'dot',
  '-': 'hyphen',
  _: 'underscore',
  '·': 'middleDot',
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_SOURCE: TocSourceConfig = {
  outlineLevels: { from: 1, to: 3 },
  useAppliedOutlineLevel: true,
};

const DEFAULT_DISPLAY: TocDisplayConfig = {
  hyperlinks: true,
  hideInWebView: true,
};

export const DEFAULT_TOC_CONFIG: TocSwitchConfig = {
  source: DEFAULT_SOURCE,
  display: DEFAULT_DISPLAY,
  preserved: {},
};

/** The canonical default instruction string (matches deterministic serializer order). */
export const DEFAULT_TOC_INSTRUCTION = 'TOC \\o "1-3" \\u \\h \\z';

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/** Regex to match a switch and its optional quoted argument. */
const SWITCH_PATTERN = /\\([a-z])\s*(?:"([^"]*)")?/gi;

function parseLevelRange(value: string): { from: number; to: number } | undefined {
  const match = value.match(/^(\d+)-(\d+)$/);
  if (!match) return undefined;
  return { from: parseInt(match[1], 10), to: parseInt(match[2], 10) };
}

function parseCustomStyles(value: string): Array<{ styleName: string; level: number }> {
  const entries: Array<{ styleName: string; level: number }> = [];
  const parts = value.split(',');
  for (let i = 0; i < parts.length - 1; i += 2) {
    const styleName = parts[i].trim();
    const level = parseInt(parts[i + 1].trim(), 10);
    if (styleName && !isNaN(level)) {
      entries.push({ styleName, level });
    }
  }
  return entries;
}

/**
 * Derives the `includePageNumbers` boolean from the parsed \n and \o switches.
 *
 * - \n absent → true (page numbers included)
 * - \n present and fully covers \o range (or "1-9" when \o absent) → false
 * - \n present but only partially covers → true (partial is not "no page numbers")
 */
export function deriveIncludePageNumbers(
  omitRange: { from: number; to: number } | undefined,
  outlineLevels: { from: number; to: number } | undefined,
): boolean {
  if (!omitRange) return true;

  const effectiveRange = outlineLevels ?? { from: 1, to: 9 };
  const fullyCovered = omitRange.from <= effectiveRange.from && omitRange.to >= effectiveRange.to;
  return !fullyCovered;
}

/**
 * Derives the `tabLeader` value from the raw \p separator string.
 * Returns undefined if the separator doesn't match a known leader pattern.
 */
function deriveTabLeader(separator: string | undefined): TocDisplayConfig['tabLeader'] | undefined {
  if (!separator) return 'none';
  const leader = SEPARATOR_TO_TAB_LEADER[separator];
  return leader as TocDisplayConfig['tabLeader'] | undefined;
}

export function parseTocInstruction(instruction: string): TocSwitchConfig {
  const source: TocSourceConfig = {};
  const display: TocDisplayConfig = {};
  const preserved: TocPreservedSwitches = {};
  const rawExtensions: string[] = [];

  let match: RegExpExecArray | null;
  SWITCH_PATTERN.lastIndex = 0;
  while ((match = SWITCH_PATTERN.exec(instruction)) !== null) {
    const switchChar = match[1].toLowerCase();
    const arg = match[2] ?? '';

    switch (switchChar) {
      // Configurable source switches
      case 'o': {
        const range = parseLevelRange(arg);
        if (range) source.outlineLevels = range;
        break;
      }
      case 'u':
        source.useAppliedOutlineLevel = true;
        break;
      case 'f':
        if (arg) source.tcFieldIdentifier = arg;
        break;
      case 'l': {
        const range = parseLevelRange(arg);
        if (range) source.tcFieldLevels = range;
        break;
      }

      // Configurable display switches
      case 'h':
        display.hyperlinks = true;
        break;
      case 'z':
        display.hideInWebView = true;
        break;
      case 'n': {
        const range = parseLevelRange(arg);
        if (range) display.omitPageNumberLevels = range;
        break;
      }
      case 'p':
        if (arg) display.separator = arg;
        break;

      // Preserved switches
      case 't':
        if (arg) preserved.customStyles = parseCustomStyles(arg);
        break;
      case 'b':
        if (arg) preserved.bookmarkName = arg;
        break;
      case 'a':
        if (arg) preserved.captionType = arg;
        break;
      case 'c':
        if (arg) preserved.seqFieldIdentifier = arg;
        break;
      case 'd':
        if (arg) preserved.chapterSeparator = arg;
        break;
      case 's':
        if (arg) preserved.chapterNumberSource = arg;
        break;
      case 'w':
        preserved.preserveTabEntries = true;
        break;

      // Unrecognized — store verbatim
      default:
        rawExtensions.push(arg ? `\\${switchChar} "${arg}"` : `\\${switchChar}`);
        break;
    }
  }

  if (rawExtensions.length > 0) {
    preserved.rawExtensions = rawExtensions;
  }

  // Derive convenience projections
  display.includePageNumbers = deriveIncludePageNumbers(display.omitPageNumberLevels, source.outlineLevels);
  const tabLeader = deriveTabLeader(display.separator);
  if (tabLeader !== undefined) {
    display.tabLeader = tabLeader;
  }

  return { source, display, preserved };
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

/**
 * Serializes a TocSwitchConfig back to a canonical instruction string.
 *
 * Switch order is deterministic:
 * \o, \u, \f, \l, \t, \h, \z, \n, \p, then preserved (\a, \b, \c, \d, \s, \w),
 * then rawExtensions in original order.
 *
 * Note: `includePageNumbers`, `tabLeader`, and `rightAlignPageNumbers` are NOT
 * serialized here. `includePageNumbers` controls \n (handled via omitPageNumberLevels).
 * `tabLeader` controls \p (handled via separator). `rightAlignPageNumbers` is a
 * PM node attribute, not a field switch.
 */
export function serializeTocInstruction(config: TocSwitchConfig): string {
  const parts: string[] = ['TOC'];
  const { source, display, preserved } = config;

  // \o — outline levels
  if (source.outlineLevels) {
    parts.push(`\\o "${source.outlineLevels.from}-${source.outlineLevels.to}"`);
  }

  // \u — use applied outline level
  if (source.useAppliedOutlineLevel) {
    parts.push('\\u');
  }

  // \f — TC field identifier (promoted from preserved to source)
  if (source.tcFieldIdentifier) {
    parts.push(`\\f "${source.tcFieldIdentifier}"`);
  }

  // \l — TC field levels (promoted from preserved to source)
  if (source.tcFieldLevels) {
    parts.push(`\\l "${source.tcFieldLevels.from}-${source.tcFieldLevels.to}"`);
  }

  // \t — custom styles (preserved)
  if (preserved.customStyles?.length) {
    const pairs = preserved.customStyles.map((s) => `${s.styleName},${s.level}`).join(',');
    parts.push(`\\t "${pairs}"`);
  }

  // \h — hyperlinks
  if (display.hyperlinks) {
    parts.push('\\h');
  }

  // \z — hide in web view
  if (display.hideInWebView) {
    parts.push('\\z');
  }

  // \n — omit page number levels
  if (display.omitPageNumberLevels) {
    parts.push(`\\n "${display.omitPageNumberLevels.from}-${display.omitPageNumberLevels.to}"`);
  }

  // \p — separator
  if (display.separator) {
    parts.push(`\\p "${display.separator}"`);
  }

  // Preserved switches in alphabetical order: \a, \b, \c, \d, \s, \w
  if (preserved.captionType) {
    parts.push(`\\a "${preserved.captionType}"`);
  }
  if (preserved.bookmarkName) {
    parts.push(`\\b "${preserved.bookmarkName}"`);
  }
  if (preserved.seqFieldIdentifier) {
    parts.push(`\\c "${preserved.seqFieldIdentifier}"`);
  }
  if (preserved.chapterSeparator) {
    parts.push(`\\d "${preserved.chapterSeparator}"`);
  }
  if (preserved.chapterNumberSource) {
    parts.push(`\\s "${preserved.chapterNumberSource}"`);
  }
  if (preserved.preserveTabEntries) {
    parts.push('\\w');
  }

  // Raw unrecognized extensions in original order
  if (preserved.rawExtensions?.length) {
    parts.push(...preserved.rawExtensions);
  }

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Patch helper (for toc.configure)
// ---------------------------------------------------------------------------

/**
 * Computes the \n switch value for `includePageNumbers: false`.
 *
 * Uses the \o range when present, falls back to "1-9" (full OOXML range).
 */
function computeOmitPageNumberRange(source: TocSourceConfig): { from: number; to: number } {
  return source.outlineLevels ?? { from: 1, to: 9 };
}

/**
 * Merges a TocConfigurePatch into an existing TocSwitchConfig.
 *
 * Handles conflict validation:
 * - `tabLeader` + `separator` in the same patch → Error
 * - `includePageNumbers` + `omitPageNumberLevels` in the same patch → Error
 * - `includePageNumbers: true` → removes \n switch
 * - `includePageNumbers: false` → sets \n to match \o range
 * - `tabLeader` → sets \p via mapping
 */
export function applyTocPatch(existing: TocSwitchConfig, patch: TocConfigurePatch): TocSwitchConfig {
  // Conflict: tabLeader vs separator
  if (patch.tabLeader !== undefined && patch.separator !== undefined) {
    throw new Error('INVALID_INPUT: cannot set both tabLeader and separator in the same patch');
  }

  // Conflict: includePageNumbers vs omitPageNumberLevels
  if (patch.includePageNumbers !== undefined && patch.omitPageNumberLevels !== undefined) {
    throw new Error('INVALID_INPUT: cannot set both includePageNumbers and omitPageNumberLevels in the same patch');
  }

  const newSource: TocSourceConfig = {
    ...existing.source,
    ...(patch.outlineLevels !== undefined && { outlineLevels: patch.outlineLevels }),
    ...(patch.useAppliedOutlineLevel !== undefined && { useAppliedOutlineLevel: patch.useAppliedOutlineLevel }),
    ...(patch.tcFieldIdentifier !== undefined && { tcFieldIdentifier: patch.tcFieldIdentifier }),
    ...(patch.tcFieldLevels !== undefined && { tcFieldLevels: patch.tcFieldLevels }),
  };

  const newDisplay: TocDisplayConfig = {
    ...existing.display,
    ...(patch.hyperlinks !== undefined && { hyperlinks: patch.hyperlinks }),
    ...(patch.hideInWebView !== undefined && { hideInWebView: patch.hideInWebView }),
  };

  // Handle includePageNumbers → \n switch mapping
  if (patch.includePageNumbers !== undefined) {
    if (patch.includePageNumbers) {
      // Remove \n entirely
      delete newDisplay.omitPageNumberLevels;
    } else {
      // Set \n to cover the effective range
      newDisplay.omitPageNumberLevels = computeOmitPageNumberRange(newSource);
    }
    newDisplay.includePageNumbers = patch.includePageNumbers;
  } else if (patch.omitPageNumberLevels !== undefined) {
    newDisplay.omitPageNumberLevels = patch.omitPageNumberLevels;
    // Re-derive includePageNumbers from the new omit range
    newDisplay.includePageNumbers = deriveIncludePageNumbers(patch.omitPageNumberLevels, newSource.outlineLevels);
  }

  // Handle tabLeader → \p switch mapping
  if (patch.tabLeader !== undefined) {
    if (patch.tabLeader === 'none') {
      delete newDisplay.separator;
    } else {
      newDisplay.separator = TAB_LEADER_TO_SEPARATOR[patch.tabLeader];
    }
    newDisplay.tabLeader = patch.tabLeader;
  } else if (patch.separator !== undefined) {
    newDisplay.separator = patch.separator;
    // Re-derive tabLeader from new separator
    const derived = deriveTabLeader(patch.separator);
    if (derived !== undefined) {
      newDisplay.tabLeader = derived;
    } else {
      delete newDisplay.tabLeader;
    }
  }

  return {
    source: newSource,
    display: newDisplay,
    preserved: { ...existing.preserved },
  };
}

// ---------------------------------------------------------------------------
// Config equality check (for NO_OP detection)
// ---------------------------------------------------------------------------

export function areTocConfigsEqual(a: TocSwitchConfig, b: TocSwitchConfig): boolean {
  return serializeTocInstruction(a) === serializeTocInstruction(b);
}
