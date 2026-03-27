/**
 * TC (Table of Contents Entry) instruction parser/serializer — single source of truth.
 *
 * Handles all OOXML TC field switches:
 * - \f (table identifier) — filters which TOC collects this entry
 * - \l (level) — entry level (1-based, default 1)
 * - \n (omit page number) — suppress page number for this entry
 * - Unrecognized switches: stored in rawExtensions for lossless round-trip
 *
 * TC instruction format: TC "Entry Text" [\f identifier] [\l level] [\n]
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TcSwitchConfig {
  /** The display text of the TC entry (quoted string after "TC"). */
  text: string;
  /** Table identifier from \f switch. When set, only TOCs with matching \f collect this entry. */
  tableIdentifier?: string;
  /** Entry level from \l switch (1-based). Default: 1. */
  level: number;
  /** Whether to omit the page number for this entry (\n switch). */
  omitPageNumber: boolean;
  /** Unrecognized switches stored verbatim for lossless round-trip. */
  rawExtensions?: string[];
}

export interface TcEditPatch {
  text?: string;
  tableIdentifier?: string;
  level?: number;
  omitPageNumber?: boolean;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_LEVEL = 1;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/** Extracts the quoted entry text from the instruction string. */
function extractEntryText(instruction: string): { text: string; rest: string } {
  // TC "some text" \switches... — the text is the first quoted string after "TC"
  const tcPrefix = /^TC\s+/i;
  const withoutPrefix = instruction.replace(tcPrefix, '');

  const quoteMatch = withoutPrefix.match(/^"([^"]*)"/);
  if (quoteMatch) {
    const text = quoteMatch[1];
    const rest = withoutPrefix.slice(quoteMatch[0].length);
    return { text, rest };
  }

  // No quoted text found — entire remainder before first switch is the text
  const switchStart = withoutPrefix.indexOf('\\');
  if (switchStart === -1) {
    return { text: withoutPrefix.trim(), rest: '' };
  }
  return { text: withoutPrefix.slice(0, switchStart).trim(), rest: withoutPrefix.slice(switchStart) };
}

/** Regex to match a switch and its optional argument (quoted or unquoted). */
const SWITCH_PATTERN = /\\([a-z])(?:\s*(?:"([^"]*)"|([^\s\\]+)))?/gi;

export function parseTcInstruction(instruction: string): TcSwitchConfig {
  const { text, rest } = extractEntryText(instruction);

  let level = DEFAULT_LEVEL;
  let tableIdentifier: string | undefined;
  let omitPageNumber = false;
  const rawExtensions: string[] = [];

  let match: RegExpExecArray | null;
  SWITCH_PATTERN.lastIndex = 0;
  while ((match = SWITCH_PATTERN.exec(rest)) !== null) {
    const switchChar = match[1].toLowerCase();
    const arg = match[2] ?? match[3] ?? '';

    switch (switchChar) {
      case 'f':
        if (arg) tableIdentifier = arg;
        break;
      case 'l': {
        const parsed = parseInt(arg, 10);
        if (!isNaN(parsed) && parsed >= 1) level = parsed;
        break;
      }
      case 'n':
        omitPageNumber = true;
        break;
      default:
        rawExtensions.push(arg ? `\\${switchChar} "${arg}"` : `\\${switchChar}`);
        break;
    }
  }

  const config: TcSwitchConfig = { text, level, omitPageNumber };
  if (tableIdentifier !== undefined) config.tableIdentifier = tableIdentifier;
  if (rawExtensions.length > 0) config.rawExtensions = rawExtensions;

  return config;
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

/**
 * Serializes a TcSwitchConfig back to a canonical instruction string.
 *
 * Switch order is deterministic: TC "text" \f \l \n, then rawExtensions.
 */
export function serializeTcInstruction(config: TcSwitchConfig): string {
  const parts: string[] = [`TC "${config.text}"`];

  if (config.tableIdentifier) {
    parts.push(`\\f "${config.tableIdentifier}"`);
  }

  if (config.level !== DEFAULT_LEVEL) {
    parts.push(`\\l "${config.level}"`);
  }

  if (config.omitPageNumber) {
    parts.push('\\n');
  }

  if (config.rawExtensions?.length) {
    parts.push(...config.rawExtensions);
  }

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Patch helper (for toc.editEntry)
// ---------------------------------------------------------------------------

/**
 * Merges a TcEditPatch into an existing TcSwitchConfig.
 * Only supplied properties mutate; unspecified are preserved.
 */
export function applyTcPatch(existing: TcSwitchConfig, patch: TcEditPatch): TcSwitchConfig {
  return {
    text: patch.text ?? existing.text,
    level: patch.level ?? existing.level,
    omitPageNumber: patch.omitPageNumber ?? existing.omitPageNumber,
    tableIdentifier: patch.tableIdentifier ?? existing.tableIdentifier,
    rawExtensions: existing.rawExtensions,
  };
}

// ---------------------------------------------------------------------------
// Config equality check (for NO_OP detection)
// ---------------------------------------------------------------------------

export function areTcConfigsEqual(a: TcSwitchConfig, b: TcSwitchConfig): boolean {
  return serializeTcInstruction(a) === serializeTcInstruction(b);
}
