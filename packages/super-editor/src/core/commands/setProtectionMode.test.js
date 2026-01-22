import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setProtectionMode } from './setProtectionMode.js';

const SETTINGS_PATH = 'word/settings.xml';

const createBaseSettings = () => ({
  elements: [
    {
      type: 'element',
      name: 'w:settings',
      attributes: {
        'xmlns:w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
      },
      elements: [
        {
          type: 'element',
          name: 'w:zoom',
          attributes: { 'w:percent': '120' },
        },
      ],
    },
  ],
});

const clone = (obj) => JSON.parse(JSON.stringify(obj));

const buildEditor = (settings = createBaseSettings()) => {
  const editor = {
    converter: {
      convertedXml: {
        [SETTINGS_PATH]: clone(settings),
      },
    },
    updateInternalXmlFile: vi.fn(),
  };

  return editor;
};

describe('setProtectionMode command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts docProtection node for the requested mode', () => {
    const editor = buildEditor();
    const command = setProtectionMode('allowOnlyReading');
    const result = command({ editor });

    expect(result).toBe(true);
    const updatedSettings = editor.converter.convertedXml[SETTINGS_PATH];
    const rootElements = updatedSettings.elements[0].elements;
    expect(rootElements[0].name).toBe('w:documentProtection');
    expect(rootElements[0].attributes).toMatchObject({ 'w:edit': 'readOnly', 'w:enforcement': '1' });
    expect(editor.updateInternalXmlFile).toHaveBeenCalledWith(SETTINGS_PATH, updatedSettings);
  });

  it('supports AllowOnlyFormFields casing and replaces existing node', () => {
    const base = createBaseSettings();
    base.elements[0].elements.unshift({
      type: 'element',
      name: 'w:documentProtection',
      attributes: { 'w:edit': 'comments', 'w:enforcement': '1' },
    });

    const editor = buildEditor(base);
    const command = setProtectionMode('allowOnlyFormFields');
    const success = command({ editor });

    expect(success).toBe(true);
    const updated = editor.converter.convertedXml[SETTINGS_PATH].elements[0].elements;
    expect(updated[0].attributes['w:edit']).toBe('forms');
    expect(updated).toHaveLength(base.elements[0].elements.length);
  });

  it('removes docProtection node when switching to noProtection', () => {
    const base = createBaseSettings();
    base.elements[0].elements.unshift({
      type: 'element',
      name: 'w:documentProtection',
      attributes: { 'w:edit': 'trackedChanges', 'w:enforcement': '1' },
    });

    const editor = buildEditor(base);
    const removed = setProtectionMode('noProtection')({ editor });

    expect(removed).toBe(true);
    const nodes = editor.converter.convertedXml[SETTINGS_PATH].elements[0].elements;
    expect(nodes.find((node) => node.name === 'w:documentProtection')).toBeUndefined();
  });

  it('returns false when settings.xml is missing', () => {
    const editor = buildEditor();
    delete editor.converter.convertedXml[SETTINGS_PATH];
    const result = setProtectionMode('allowOnlyComments')({ editor });
    expect(result).toBe(false);
    expect(editor.updateInternalXmlFile).not.toHaveBeenCalled();
  });

  it('rejects invalid modes without mutating the XML', () => {
    const editor = buildEditor();
    const before = clone(editor.converter.convertedXml[SETTINGS_PATH]);
    const result = setProtectionMode('unsupported-mode')({ editor });

    expect(result).toBe(false);
    expect(editor.converter.convertedXml[SETTINGS_PATH]).toEqual(before);
    expect(editor.updateInternalXmlFile).not.toHaveBeenCalled();
  });
});
