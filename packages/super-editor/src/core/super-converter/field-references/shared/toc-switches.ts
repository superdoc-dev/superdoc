/**
 * Shared TOC instruction parser/serializer — single source of truth.
 *
 * Handles all OOXML TOC field switches:
 * - "Ship now" switches: \o, \u, \h, \z, \n, \p (configurable via toc.configure)
 * - "Parse-preserve" switches: \t, \b, \f, \l, \a, \c, \d, \s, \w (round-tripped, not configurable)
 * - Unrecognized switches: stored in rawExtensions for lossless round-trip
 */

import type {
  TocSwitchConfig,
  TocSourceConfig,
  TocDisplayConfig,
  TocPreservedSwitches,
  TocConfigurePatch,
} from '@superdoc/document-api';

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

export function parseTocInstruction(instruction: string): TocSwitchConfig {
  const source: TocSourceConfig = {};
  const display: TocDisplayConfig = {};
  const preserved: TocPreservedSwitches = {};
  const rawExtensions: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = SWITCH_PATTERN.exec(instruction)) !== null) {
    const switchChar = match[1].toLowerCase();
    const arg = match[2] ?? '';

    switch (switchChar) {
      // Ship-now source switches
      case 'o': {
        const range = parseLevelRange(arg);
        if (range) source.outlineLevels = range;
        break;
      }
      case 'u':
        source.useAppliedOutlineLevel = true;
        break;

      // Ship-now display switches
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

      // Parse-preserve switches
      case 't':
        if (arg) preserved.customStyles = parseCustomStyles(arg);
        break;
      case 'b':
        if (arg) preserved.bookmarkName = arg;
        break;
      case 'f':
        if (arg) preserved.tcFieldIdentifier = arg;
        break;
      case 'l': {
        const range = parseLevelRange(arg);
        if (range) preserved.tcFieldLevels = range;
        break;
      }
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

  return { source, display, preserved };
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

/**
 * Serializes a TocSwitchConfig back to a canonical instruction string.
 *
 * Switch order is deterministic:
 * \o, \u, \t, \h, \z, \n, \p, then preserved (\a, \b, \c, \d, \f, \l, \s, \w),
 * then rawExtensions in original order.
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

  // Preserved switches in alphabetical order: \a, \b, \c, \d, \f, \l, \s, \w
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
  if (preserved.tcFieldIdentifier) {
    parts.push(`\\f "${preserved.tcFieldIdentifier}"`);
  }
  if (preserved.tcFieldLevels) {
    parts.push(`\\l "${preserved.tcFieldLevels.from}-${preserved.tcFieldLevels.to}"`);
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
 * Merges a TocConfigurePatch into an existing TocSwitchConfig.
 * Only configurable fields (source + display) are patchable.
 * Preserved switches are carried through untouched.
 */
export function applyTocPatch(existing: TocSwitchConfig, patch: TocConfigurePatch): TocSwitchConfig {
  return {
    source: {
      ...existing.source,
      ...(patch.outlineLevels !== undefined && { outlineLevels: patch.outlineLevels }),
      ...(patch.useAppliedOutlineLevel !== undefined && { useAppliedOutlineLevel: patch.useAppliedOutlineLevel }),
    },
    display: {
      ...existing.display,
      ...(patch.hyperlinks !== undefined && { hyperlinks: patch.hyperlinks }),
      ...(patch.hideInWebView !== undefined && { hideInWebView: patch.hideInWebView }),
      ...(patch.omitPageNumberLevels !== undefined && { omitPageNumberLevels: patch.omitPageNumberLevels }),
      ...(patch.separator !== undefined && { separator: patch.separator }),
    },
    preserved: { ...existing.preserved },
  };
}

// ---------------------------------------------------------------------------
// Config equality check (for NO_OP detection)
// ---------------------------------------------------------------------------

export function areTocConfigsEqual(a: TocSwitchConfig, b: TocSwitchConfig): boolean {
  return serializeTocInstruction(a) === serializeTocInstruction(b);
}
