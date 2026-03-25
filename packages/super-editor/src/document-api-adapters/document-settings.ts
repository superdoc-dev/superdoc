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
