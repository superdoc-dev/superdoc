// @ts-check
import { carbonCopy } from '@core/utilities/carbonCopy.js';

const SETTINGS_PATH = 'word/settings.xml';
const DOC_PROTECTION_NODE = 'w:documentProtection';

const PROTECTION_VALUE_MAP = Object.freeze({
  noProtection: null,
  allowOnlyRevisions: 'trackedChanges',
  allowOnlyComments: 'comments',
  allowOnlyFormFields: 'forms',
  allowOnlyReading: 'readOnly',
});

const DEFAULT_MODE = 'noProtection';

/**
 * Normalize the caller provided document protection mode.
 * @param {string} mode
 * @returns {keyof typeof PROTECTION_VALUE_MAP}
 */
function normalizeMode(mode) {
  const normalized = typeof mode === 'string' ? mode.trim() : '';
  return /** @type {keyof typeof PROTECTION_VALUE_MAP} */ (normalized || DEFAULT_MODE);
}

/**
 * Build the document protection XML node.
 * @param {string} editValue
 * @returns {Object}
 */
function createDocProtectionNode(editValue) {
  return {
    type: 'element',
    name: DOC_PROTECTION_NODE,
    attributes: {
      'w:edit': editValue,
      'w:enforcement': '1',
    },
  };
}

/**
 * Update the DOCX settings to enforce or remove document protection.
 * @param {'noProtection' | 'allowOnlyRevisions' | 'allowOnlyComments' | 'allowOnlyFormFields' | 'allowOnlyReading'} mode
 * @returns {import('./types').Command}
 */
export const setProtectionMode = (mode) => {
  return ({ editor }) => {
    if (!mode || typeof mode !== 'string') return false;
    const convertedXml = editor?.converter?.convertedXml;
    if (!convertedXml) return false;

    const normalizedMode = normalizeMode(mode);
    if (!(normalizedMode in PROTECTION_VALUE_MAP)) return false;
    const settingsXml = convertedXml[SETTINGS_PATH];
    const settingsRoot = settingsXml?.elements?.[0];
    if (!settingsRoot) return false;

    const updatedSettings = carbonCopy(settingsXml);
    const updatedRoot = updatedSettings.elements?.[0];
    if (!updatedRoot) return false;

    if (!Array.isArray(updatedRoot.elements)) {
      updatedRoot.elements = [];
    }

    const elements = updatedRoot.elements;
    const existingIndex = elements.findIndex((node) => node?.name === DOC_PROTECTION_NODE);
    if (existingIndex !== -1) {
      elements.splice(existingIndex, 1);
    }

    const mappedValue = PROTECTION_VALUE_MAP[normalizedMode];
    if (mappedValue) {
      const protectionNode = createDocProtectionNode(mappedValue);
      const insertIndex = existingIndex >= 0 ? existingIndex : 0;
      elements.splice(insertIndex, 0, protectionNode);
    }

    convertedXml[SETTINGS_PATH] = updatedSettings;
    editor.updateInternalXmlFile(SETTINGS_PATH, updatedSettings);
    return true;
  };
};
