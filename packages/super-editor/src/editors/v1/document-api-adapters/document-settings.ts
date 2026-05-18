import type { XmlElement } from './helpers/sections-xml.js';
import type { DocumentProtectionState, EditingRestrictionMode } from '@superdoc/document-api';
import { DEFAULT_PROTECTION_STATE } from '@superdoc/document-api';

export const SETTINGS_PART_PATH = 'word/settings.xml';

export interface ConverterWithDocumentSettings {
  convertedXml?: Record<string, unknown>;
  pageStyles?: {
    alternateHeaders?: boolean;
  };
}

function findSettingsRoot(part: XmlElement): XmlElement | null {
  if (part.name === 'w:settings') return part;
  if (!Array.isArray(part.elements)) return null;
  return part.elements.find((entry) => entry.name === 'w:settings') ?? null;
}

function ensureSettingsRootElements(settingsRoot: XmlElement): XmlElement[] {
  if (!Array.isArray(settingsRoot.elements)) settingsRoot.elements = [];
  return settingsRoot.elements;
}

/**
 * Read-only lookup: returns the existing settings root without creating parts.
 * Returns null when word/settings.xml is absent.
 */
export function readSettingsRoot(converter: ConverterWithDocumentSettings): XmlElement | null {
  const part = converter.convertedXml?.[SETTINGS_PART_PATH] as XmlElement | undefined;
  if (!part) return null;
  return findSettingsRoot(part);
}

/**
 * Navigate to the `w:settings` root element inside the given part XML.
 *
 * Must be called from inside a `mutatePart` callback where the part is
 * guaranteed to exist (via `settingsPartDescriptor.ensurePart`). If the
 * `w:settings` element is missing, a fallback root is created in place.
 */
export function ensureSettingsRoot(part: XmlElement): XmlElement {
  const settingsRoot = findSettingsRoot(part);
  if (settingsRoot) return settingsRoot;

  const fallbackRoot: XmlElement = {
    type: 'element',
    name: 'w:settings',
    elements: [],
  };
  if (!Array.isArray(part.elements)) part.elements = [];
  part.elements.push(fallbackRoot);
  return fallbackRoot;
}

// ──────────────────────────────────────────────────────────────────────────────
// w:defaultTableStyle
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Reads `w:defaultTableStyle` from settings.xml.
 * Returns the style ID (`w:val`) or null if not present.
 */
export function readDefaultTableStyle(settingsRoot: XmlElement): string | null {
  const el = settingsRoot.elements?.find((entry) => entry.name === 'w:defaultTableStyle');
  if (!el) return null;
  const val = (el.attributes as Record<string, unknown> | undefined)?.['w:val'];
  return typeof val === 'string' && val.length > 0 ? val : null;
}

/**
 * Sets `w:defaultTableStyle` in settings.xml to the given style ID.
 * Creates the element if absent, replaces it if already present.
 */
export function setDefaultTableStyle(settingsRoot: XmlElement, styleId: string): void {
  const elements = ensureSettingsRootElements(settingsRoot);
  const idx = elements.findIndex((entry) => entry.name === 'w:defaultTableStyle');

  const newEl: XmlElement = {
    type: 'element',
    name: 'w:defaultTableStyle',
    attributes: { 'w:val': styleId },
    elements: [],
  };

  if (idx !== -1) {
    elements[idx] = newEl;
  } else {
    elements.push(newEl);
  }
}

/**
 * Removes `w:defaultTableStyle` from settings.xml.
 */
export function removeDefaultTableStyle(settingsRoot: XmlElement): void {
  const elements = ensureSettingsRootElements(settingsRoot);
  settingsRoot.elements = elements.filter((entry) => entry.name !== 'w:defaultTableStyle');
}

// ──────────────────────────────────────────────────────────────────────────────
// w:footnotePr / w:endnotePr  — number format
// (SD-2986/B1)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Reads the document-wide footnote number format from
 * `w:settings/w:footnotePr/w:numFmt[@val]`. Returns the OOXML format
 * string (e.g., "decimal", "upperRoman") or null if not present.
 *
 * Section-level overrides (`w:sectPr/w:footnotePr/w:numFmt`) are not yet
 * honored — they require per-page numbering context which is tracked in
 * SD-2986/B2.
 */
export function readFootnoteNumberFormat(settingsRoot: XmlElement): string | null {
  return readNoteNumberFormat(settingsRoot, 'w:footnotePr');
}

/**
 * Reads the document-wide endnote number format from
 * `w:settings/w:endnotePr/w:numFmt[@val]`. Returns the OOXML format
 * string or null if not present.
 */
export function readEndnoteNumberFormat(settingsRoot: XmlElement): string | null {
  return readNoteNumberFormat(settingsRoot, 'w:endnotePr');
}

function readNoteNumberFormat(settingsRoot: XmlElement, containerName: 'w:footnotePr' | 'w:endnotePr'): string | null {
  const container = settingsRoot.elements?.find((entry) => entry.name === containerName);
  if (!container || !Array.isArray(container.elements)) return null;
  const numFmt = container.elements.find((entry) => entry.name === 'w:numFmt');
  if (!numFmt) return null;
  const val = (numFmt.attributes as Record<string, unknown> | undefined)?.['w:val'];
  return typeof val === 'string' && val.length > 0 ? val : null;
}

/**
 * SD-2986/B2: Reads `w:settings/w:footnotePr/w:numStart[@val]`. Returns the
 * starting cardinal (1-based) or null if not specified. Word's default is 1.
 */
export function readFootnoteNumberStart(settingsRoot: XmlElement): number | null {
  return readNoteNumberStart(settingsRoot, 'w:footnotePr');
}

/**
 * SD-2986/B2: Reads `w:settings/w:endnotePr/w:numStart[@val]`. Returns the
 * starting cardinal or null. Word's endnote default is 1 (not the lowerRoman
 * default that endnotes typically use for *format*).
 */
export function readEndnoteNumberStart(settingsRoot: XmlElement): number | null {
  return readNoteNumberStart(settingsRoot, 'w:endnotePr');
}

function readNoteNumberStart(settingsRoot: XmlElement, containerName: 'w:footnotePr' | 'w:endnotePr'): number | null {
  const container = settingsRoot.elements?.find((entry) => entry.name === containerName);
  if (!container || !Array.isArray(container.elements)) return null;
  const numStart = container.elements.find((entry) => entry.name === 'w:numStart');
  if (!numStart) return null;
  const val = (numStart.attributes as Record<string, unknown> | undefined)?.['w:val'];
  if (typeof val !== 'string' && typeof val !== 'number') return null;
  const n = Number(val);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
}

// ──────────────────────────────────────────────────────────────────────────────
// w:footnotePr / w:endnotePr  — w:pos (§17.11.21, ST_FtnPos §17.18.34)
// Document-level only — section-level pos shall be ignored per §17.11.21.
// ──────────────────────────────────────────────────────────────────────────────

export type FootnotePosition = 'pageBottom' | 'beneathText' | 'sectEnd' | 'docEnd';

export function readFootnotePosition(settingsRoot: XmlElement): FootnotePosition | null {
  return readNotePosition(settingsRoot, 'w:footnotePr');
}

export function readEndnotePosition(settingsRoot: XmlElement): FootnotePosition | null {
  return readNotePosition(settingsRoot, 'w:endnotePr');
}

function readNotePosition(
  settingsRoot: XmlElement,
  containerName: 'w:footnotePr' | 'w:endnotePr',
): FootnotePosition | null {
  const container = settingsRoot.elements?.find((entry) => entry.name === containerName);
  if (!container || !Array.isArray(container.elements)) return null;
  const el = container.elements.find((entry) => entry.name === 'w:pos');
  if (!el) return null;
  const val = (el.attributes as Record<string, unknown> | undefined)?.['w:val'];
  if (val === 'pageBottom' || val === 'beneathText' || val === 'sectEnd' || val === 'docEnd') return val;
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// w:footnotePr / w:endnotePr  — w:numRestart (§17.11.19, ST_RestartNumber §17.18.74)
// ──────────────────────────────────────────────────────────────────────────────

export type NoteNumberRestart = 'continuous' | 'eachPage' | 'eachSect';

export function readFootnoteNumberRestart(settingsRoot: XmlElement): NoteNumberRestart | null {
  return readNoteNumberRestart(settingsRoot, 'w:footnotePr');
}

export function readEndnoteNumberRestart(settingsRoot: XmlElement): NoteNumberRestart | null {
  return readNoteNumberRestart(settingsRoot, 'w:endnotePr');
}

function readNoteNumberRestart(
  settingsRoot: XmlElement,
  containerName: 'w:footnotePr' | 'w:endnotePr',
): NoteNumberRestart | null {
  const container = settingsRoot.elements?.find((entry) => entry.name === containerName);
  if (!container || !Array.isArray(container.elements)) return null;
  const el = container.elements.find((entry) => entry.name === 'w:numRestart');
  if (!el) return null;
  const val = (el.attributes as Record<string, unknown> | undefined)?.['w:val'];
  if (val === 'continuous' || val === 'eachPage' || val === 'eachSect') return val;
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Section-level w:sectPr/w:footnotePr (§17.11.11) — per-section overrides for
// numFmt, numStart, numRestart. Section-level w:pos is parsed for round-trip but
// must be IGNORED at render per §17.11.21.
// ──────────────────────────────────────────────────────────────────────────────

export type SectionNoteConfig = {
  numFmt?: string;
  numStart?: number;
  numRestart?: NoteNumberRestart;
};

/**
 * Walks `word/document.xml` for `w:sectPr` blocks (both standalone at body level
 * and inside `w:p/w:pPr`), extracts their `w:footnotePr` / `w:endnotePr`
 * children, and returns the per-section override config keyed by 0-based
 * section index. Sections without overrides are absent from the map.
 *
 * Per §17.11.11: each property is an override of the document-wide value. Per
 * §17.11.21: section-level `w:pos` is ignored at render time (we omit it here).
 */
export function readSectionNoteConfigs(
  documentRoot: XmlElement | undefined,
  containerName: 'w:footnotePr' | 'w:endnotePr',
): Map<number, SectionNoteConfig> {
  const result = new Map<number, SectionNoteConfig>();
  if (!documentRoot) return result;

  const bodyEl = findBody(documentRoot);
  if (!bodyEl) return result;

  let sectionIndex = 0;
  for (const child of bodyEl.elements ?? []) {
    if (child.name === 'w:sectPr') {
      const config = extractSectionNoteConfig(child, containerName);
      if (config) result.set(sectionIndex, config);
      sectionIndex += 1;
    } else if (child.name === 'w:p') {
      const sectPr = findChildByName(findChildByName(child, 'w:pPr'), 'w:sectPr');
      if (sectPr) {
        const config = extractSectionNoteConfig(sectPr, containerName);
        if (config) result.set(sectionIndex, config);
        sectionIndex += 1;
      }
    }
  }

  return result;
}

function findBody(root: XmlElement): XmlElement | null {
  if (root.name === 'w:body') return root;
  if (!Array.isArray(root.elements)) return null;
  for (const child of root.elements) {
    if (child.name === 'w:body') return child;
    const inner = child.elements?.find((g) => g.name === 'w:body');
    if (inner) return inner;
  }
  return null;
}

function findChildByName(parent: XmlElement | null | undefined, name: string): XmlElement | null {
  if (!parent) return null;
  return parent.elements?.find((entry) => entry.name === name) ?? null;
}

function extractSectionNoteConfig(
  sectPr: XmlElement,
  containerName: 'w:footnotePr' | 'w:endnotePr',
): SectionNoteConfig | null {
  const container = findChildByName(sectPr, containerName);
  if (!container) return null;
  const config: SectionNoteConfig = {};

  const numFmt = findChildByName(container, 'w:numFmt');
  if (numFmt) {
    const val = (numFmt.attributes as Record<string, unknown> | undefined)?.['w:val'];
    if (typeof val === 'string' && val.length > 0) config.numFmt = val;
  }

  const numStart = findChildByName(container, 'w:numStart');
  if (numStart) {
    const val = (numStart.attributes as Record<string, unknown> | undefined)?.['w:val'];
    const n = typeof val === 'string' || typeof val === 'number' ? Number(val) : NaN;
    if (Number.isFinite(n) && n >= 1) config.numStart = Math.floor(n);
  }

  const numRestart = findChildByName(container, 'w:numRestart');
  if (numRestart) {
    const val = (numRestart.attributes as Record<string, unknown> | undefined)?.['w:val'];
    if (val === 'continuous' || val === 'eachPage' || val === 'eachSect') config.numRestart = val;
  }

  return Object.keys(config).length > 0 ? config : null;
}

// ──────────────────────────────────────────────────────────────────────────────
// w:evenAndOddHeaders
// ──────────────────────────────────────────────────────────────────────────────

export function hasOddEvenHeadersFooters(settingsRoot: XmlElement): boolean {
  return settingsRoot.elements?.some((entry) => entry.name === 'w:evenAndOddHeaders') === true;
}

export function setOddEvenHeadersFooters(settingsRoot: XmlElement, enabled: boolean): boolean {
  const elements = ensureSettingsRootElements(settingsRoot);
  const hadFlag = hasOddEvenHeadersFooters(settingsRoot);

  if (enabled) {
    if (!hadFlag) {
      elements.push({ type: 'element', name: 'w:evenAndOddHeaders', elements: [] });
    }
  } else {
    settingsRoot.elements = elements.filter((entry) => entry.name !== 'w:evenAndOddHeaders');
  }

  const hasFlag = hasOddEvenHeadersFooters(settingsRoot);
  return hadFlag !== hasFlag;
}

// ──────────────────────────────────────────────────────────────────────────────
// w:updateFields
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Reads the `w:updateFields` flag from settings.xml.
 * Returns true when the element is present with `w:val="true"` (or `"1"`).
 */
export function hasUpdateFields(settingsRoot: XmlElement): boolean {
  const el = settingsRoot.elements?.find((entry) => entry.name === 'w:updateFields');
  if (!el) return false;
  const val = (el.attributes as Record<string, unknown> | undefined)?.['w:val'];
  return val === 'true' || val === '1' || val === true;
}

/**
 * Sets the `w:updateFields` flag in settings.xml.
 * Creates the element if absent, updates its value if present.
 * Only upserts the targeted element — all other settings are preserved.
 */
export function setUpdateFields(settingsRoot: XmlElement, enabled: boolean): void {
  const elements = ensureSettingsRootElements(settingsRoot);
  const idx = elements.findIndex((entry) => entry.name === 'w:updateFields');

  if (enabled) {
    const newEl: XmlElement = {
      type: 'element',
      name: 'w:updateFields',
      attributes: { 'w:val': 'true' },
      elements: [],
    };
    if (idx !== -1) {
      elements[idx] = newEl;
    } else {
      elements.push(newEl);
    }
  } else if (idx !== -1) {
    elements.splice(idx, 1);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// w:documentProtection — parsing
// ──────────────────────────────────────────────────────────────────────────────

const VALID_EDIT_MODES = new Set<string>(['readOnly', 'comments', 'trackedChanges', 'forms']);

/** XML boolean: `"1"`, `1`, `"true"`, `"on"` → true */
function isXmlTrue(value: unknown): boolean {
  return value === '1' || value === 1 || value === 'true' || value === 'on' || value === true;
}

/** Whether hash/salt/verifier fields indicate a password was set. */
function hasVerifierFields(attrs: Record<string, string | number | boolean>): boolean {
  return !!(
    attrs['w:cryptAlgorithmSid'] ||
    attrs['w:hash'] ||
    attrs['w:salt'] ||
    attrs['w:cryptProviderType'] ||
    attrs['w:cryptAlgorithmType'] ||
    attrs['w:cryptAlgorithmClass'] ||
    attrs['w:cryptSpinCount']
  );
}

/**
 * Parse `w:documentProtection` and `w:writeProtection` from settings root
 * into a normalized `DocumentProtectionState`.
 */
export function parseProtectionState(settingsRoot: XmlElement | null): DocumentProtectionState {
  if (!settingsRoot) return { ...DEFAULT_PROTECTION_STATE };

  const elements = settingsRoot.elements ?? [];

  // --- Editing restriction ---
  const docProtEl = elements.find((el) => el.name === 'w:documentProtection');
  const dpAttrs = docProtEl?.attributes ?? {};

  const rawMode = dpAttrs['w:edit'] as string | undefined;
  const mode: EditingRestrictionMode =
    rawMode && VALID_EDIT_MODES.has(rawMode) ? (rawMode as EditingRestrictionMode) : 'none';
  const enforced = isXmlTrue(dpAttrs['w:enforcement']);
  const formattingRestricted = isXmlTrue(dpAttrs['w:formatting']);
  const passwordProtected = docProtEl ? hasVerifierFields(dpAttrs) : false;

  // runtimeEnforced: only readOnly+enforced is actively enforced in this engine version
  const runtimeEnforced = mode === 'readOnly' && enforced;

  // --- Write protection ---
  const writeProt = elements.find((el) => el.name === 'w:writeProtection');
  const wpAttrs = writeProt?.attributes ?? {};
  const writeEnabled = !!writeProt;
  const writePasswordProtected = writeProt ? hasVerifierFields(wpAttrs) : false;

  // --- Read-only recommended ---
  const readOnlyRecommended = isXmlTrue(wpAttrs['w:recommended']);

  return {
    editingRestriction: {
      mode,
      enforced,
      runtimeEnforced,
      passwordProtected,
      formattingRestricted,
    },
    writeProtection: {
      enabled: writeEnabled,
      passwordProtected: writePasswordProtected,
    },
    readOnlyRecommended,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// w:documentProtection — writing
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Write or replace `w:documentProtection` in settings.xml.
 * Creates the element if absent, updates attributes if present.
 * Preserves verifier/hash fields from the existing element.
 */
export function setDocumentProtection(
  settingsRoot: XmlElement,
  opts: { mode: EditingRestrictionMode; enforced: boolean; formattingRestricted?: boolean },
): void {
  const elements = ensureSettingsRootElements(settingsRoot);
  const idx = elements.findIndex((el) => el.name === 'w:documentProtection');

  // Preserve existing verifier fields if element exists
  const existingAttrs = idx !== -1 ? { ...(elements[idx].attributes ?? {}) } : {};

  const attrs: Record<string, string | number | boolean> = {
    ...existingAttrs,
    'w:edit': opts.mode,
    'w:enforcement': opts.enforced ? '1' : '0',
  };

  if (opts.formattingRestricted !== undefined) {
    attrs['w:formatting'] = opts.formattingRestricted ? '1' : '0';
  }

  const newEl: XmlElement = {
    type: 'element',
    name: 'w:documentProtection',
    attributes: attrs,
    elements: [],
  };

  if (idx !== -1) {
    elements[idx] = newEl;
  } else {
    elements.push(newEl);
  }
}

/**
 * Disable enforcement on `w:documentProtection` while preserving the element
 * and its metadata (mode, formatting, verifier fields) for round-trip fidelity.
 */
export function clearDocumentProtectionEnforcement(settingsRoot: XmlElement): void {
  const elements = settingsRoot.elements ?? [];
  const el = elements.find((e) => e.name === 'w:documentProtection');
  if (!el) return;

  if (!el.attributes) el.attributes = {};
  el.attributes['w:enforcement'] = '0';
}
