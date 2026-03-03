import type { XmlElement } from './helpers/sections-xml.js';

const SETTINGS_PART_PATH = 'word/settings.xml';

export interface ConverterWithDocumentSettings {
  convertedXml?: Record<string, unknown>;
  pageStyles?: {
    alternateHeaders?: boolean;
  };
}

function createSettingsPart(): XmlElement {
  return {
    type: 'element',
    name: 'document',
    elements: [
      {
        type: 'element',
        name: 'w:settings',
        elements: [],
      },
    ],
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

export function ensureSettingsRoot(converter: ConverterWithDocumentSettings): XmlElement {
  if (!converter.convertedXml) converter.convertedXml = {};

  let part = converter.convertedXml[SETTINGS_PART_PATH] as XmlElement | undefined;
  if (!part) {
    part = createSettingsPart();
    converter.convertedXml[SETTINGS_PART_PATH] = part;
  }

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
