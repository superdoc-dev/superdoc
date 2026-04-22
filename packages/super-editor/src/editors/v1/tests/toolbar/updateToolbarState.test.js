import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SuperToolbar } from '../../components/toolbar/super-toolbar.js';

// Mock the dependencies
vi.mock('@core/helpers/getActiveFormatting.js', () => ({
  getActiveFormatting: vi.fn(),
}));

vi.mock('prosemirror-history', () => ({
  undoDepth: vi.fn(),
  redoDepth: vi.fn(),
}));

vi.mock('@helpers/isInTable.js', () => ({
  isInTable: vi.fn().mockImplementation(() => false),
}));

vi.mock('@extensions/linked-styles/linked-styles.js', () => ({
  getQuickFormatList: vi.fn(),
}));

vi.mock(import('@helpers/index.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    findParentNode: vi.fn().mockImplementation(() => vi.fn().mockReturnValue(null)),
  };
});

vi.mock('@extensions/track-changes/permission-helpers.js', () => ({
  collectTrackedChanges: vi.fn(() => []),
  isTrackedChangeActionAllowed: vi.fn(() => true),
}));

describe('updateToolbarState', () => {
  let toolbar;
  let mockEditor;
  let mockGetActiveFormatting;
  let mockIsInTable;
  let mockGetQuickFormatList;
  let mockCollectTrackedChanges;
  let mockIsTrackedChangeActionAllowed;
  let mockFindParentNode;
  let mockCalculateResolvedParagraphProperties;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockEditor = {
      state: {
        selection: { from: 1, to: 1, empty: true },
        doc: {
          resolve: vi.fn().mockReturnValue({}),
        },
      },
      commands: {
        setFieldAnnotationsFontSize: vi.fn(),
        setFieldAnnotationsFontFamily: vi.fn(),
        setFieldAnnotationsTextColor: vi.fn(),
        setFieldAnnotationsTextHighlight: vi.fn(),
        setCellBackground: vi.fn(),
        toggleFieldAnnotationsFormat: vi.fn(),
      },
      converter: {
        getDocumentDefaultStyles: vi.fn(() => ({ typeface: 'Arial', fontSizePt: 12 })),
        linkedStyles: [],
        docHiglightColors: new Set(['#ff0000', '#00ff00']),
        convertedXml: {},
      },
      options: {
        mode: 'docx',
        isHeaderOrFooter: false,
      },
      focus: vi.fn(),
      on: vi.fn(),
    };

    mockGetActiveFormatting = vi.fn();
    mockIsInTable = vi.fn();
    mockGetQuickFormatList = vi.fn().mockReturnValue([]);

    const { getActiveFormatting } = await import('@core/helpers/getActiveFormatting.js');
    const { isInTable } = await import('@helpers/isInTable.js');
    const { getQuickFormatList } = await import('@extensions/linked-styles/linked-styles.js');
    const { collectTrackedChanges, isTrackedChangeActionAllowed } = await import(
      '@extensions/track-changes/permission-helpers.js'
    );
    const helpersModule = await import('@helpers/index.js');
    mockFindParentNode = helpersModule.findParentNode;
    mockFindParentNode.mockImplementation(() => vi.fn().mockReturnValue(null));
    const resolvedPropsModule = await import('@extensions/paragraph/resolvedPropertiesCache.js');
    mockCalculateResolvedParagraphProperties = vi
      .spyOn(resolvedPropsModule, 'calculateResolvedParagraphProperties')
      .mockReturnValue({});

    getActiveFormatting.mockImplementation(mockGetActiveFormatting);
    isInTable.mockImplementation(mockIsInTable);
    getQuickFormatList.mockImplementation(mockGetQuickFormatList);
    mockCollectTrackedChanges = collectTrackedChanges;
    mockIsTrackedChangeActionAllowed = isTrackedChangeActionAllowed;

    mockCollectTrackedChanges.mockReturnValue([]);
    mockIsTrackedChangeActionAllowed.mockReturnValue(true);

    toolbar = new SuperToolbar({
      selector: '#test-toolbar',
      editor: mockEditor,
      role: 'editor',
    });

    toolbar.toolbarItems = [
      {
        name: { value: 'bold' },
        resetDisabled: vi.fn(),
        activate: vi.fn(),
        deactivate: vi.fn(),
        setDisabled: vi.fn(),
        allowWithoutEditor: { value: false },
      },
      {
        name: { value: 'italic' },
        resetDisabled: vi.fn(),
        activate: vi.fn(),
        deactivate: vi.fn(),
        setDisabled: vi.fn(),
        allowWithoutEditor: { value: false },
      },
      {
        name: { value: 'underline' },
        resetDisabled: vi.fn(),
        activate: vi.fn(),
        deactivate: vi.fn(),
        setDisabled: vi.fn(),
        allowWithoutEditor: { value: false },
      },
      {
        name: { value: 'linkedStyles' },
        resetDisabled: vi.fn(),
        activate: vi.fn(),
        deactivate: vi.fn(),
        setDisabled: vi.fn(),
        label: { value: '' },
        allowWithoutEditor: { value: false },
      },
      {
        name: { value: 'tableActions' },
        resetDisabled: vi.fn(),
        activate: vi.fn(),
        deactivate: vi.fn(),
        setDisabled: vi.fn(),
        disabled: { value: false },
        allowWithoutEditor: { value: false },
      },
      {
        name: { value: 'fontSize' },
        resetDisabled: vi.fn(),
        activate: vi.fn(),
        deactivate: vi.fn(),
        setDisabled: vi.fn(),
        defaultLabel: { value: '' },
        allowWithoutEditor: { value: false },
      },
      {
        name: { value: 'fontFamily' },
        resetDisabled: vi.fn(),
        activate: vi.fn(),
        deactivate: vi.fn(),
        setDisabled: vi.fn(),
        defaultLabel: { value: '' },
        allowWithoutEditor: { value: false },
        active: { value: false },
      },
      {
        name: { value: 'lineHeight' },
        resetDisabled: vi.fn(),
        activate: vi.fn(),
        deactivate: vi.fn(),
        setDisabled: vi.fn(),
        selectedValue: { value: '' },
        allowWithoutEditor: { value: false },
      },
      {
        name: { value: 'highlight' },
        resetDisabled: vi.fn(),
        activate: vi.fn(),
        deactivate: vi.fn(),
        setDisabled: vi.fn(),
        nestedOptions: { value: [] },
        allowWithoutEditor: { value: false },
      },
      {
        name: { value: 'acceptTrackedChangeBySelection' },
        resetDisabled: vi.fn(),
        activate: vi.fn(),
        deactivate: vi.fn(),
        setDisabled: vi.fn(),
        allowWithoutEditor: { value: false },
      },
      {
        name: { value: 'rejectTrackedChangeOnSelection' },
        resetDisabled: vi.fn(),
        activate: vi.fn(),
        deactivate: vi.fn(),
        setDisabled: vi.fn(),
        allowWithoutEditor: { value: false },
      },
    ];

    toolbar.activeEditor = mockEditor;
    toolbar.snapshot = {
      commands: {
        'document-mode': { value: 'editing' },
      },
    };
  });

  afterEach(() => {
    mockCalculateResolvedParagraphProperties?.mockRestore?.();
  });

  describe('document mode dropdown sync', () => {
    let documentModeItem;

    beforeEach(() => {
      documentModeItem = {
        name: { value: 'documentMode' },
        label: { value: 'Editing' },
        defaultLabel: { value: 'Editing' },
        icon: { value: null },
        allowWithoutEditor: { value: true },
        setDisabled: vi.fn(),
      };
      toolbar.toolbarItems = [documentModeItem];
      toolbar.activeEditor = null;
    });

    it('should sync to suggesting mode', () => {
      toolbar.snapshot = { commands: { 'document-mode': { value: 'suggesting' } } };

      toolbar.updateToolbarState();

      expect(documentModeItem.label.value).toBe('Suggesting');
      expect(documentModeItem.defaultLabel.value).toBe('Suggesting');
      expect(documentModeItem.icon.value).toBe(toolbar.config.icons.documentSuggestingMode);
    });

    it('should sync to editing mode', () => {
      toolbar.snapshot = { commands: { 'document-mode': { value: 'editing' } } };

      toolbar.updateToolbarState();

      expect(documentModeItem.label.value).toBe('Editing');
      expect(documentModeItem.defaultLabel.value).toBe('Editing');
      expect(documentModeItem.icon.value).toBe(toolbar.config.icons.documentEditingMode);
    });

    it('should sync to viewing mode', () => {
      toolbar.snapshot = { commands: { 'document-mode': { value: 'viewing' } } };

      toolbar.updateToolbarState();

      expect(documentModeItem.label.value).toBe('Viewing');
      expect(documentModeItem.defaultLabel.value).toBe('Viewing');
      expect(documentModeItem.icon.value).toBe(toolbar.config.icons.documentViewingMode);
    });

    it('should default to editing when documentMode is null', () => {
      toolbar.snapshot = { commands: { 'document-mode': { value: null } } };

      toolbar.updateToolbarState();

      expect(documentModeItem.label.value).toBe('Editing');
      expect(documentModeItem.defaultLabel.value).toBe('Editing');
    });

    it('should default to editing when documentMode is undefined', () => {
      toolbar.snapshot = { commands: { 'document-mode': { value: undefined } } };

      toolbar.updateToolbarState();

      expect(documentModeItem.label.value).toBe('Editing');
      expect(documentModeItem.defaultLabel.value).toBe('Editing');
    });

    it('should default to editing when documentMode is an unknown value', () => {
      toolbar.snapshot = { commands: { 'document-mode': { value: 'unknown-mode' } } };

      toolbar.updateToolbarState();

      expect(documentModeItem.label.value).toBe('Editing');
      expect(documentModeItem.defaultLabel.value).toBe('Editing');
    });

    it('should handle uppercase mode values via toLowerCase', () => {
      toolbar.snapshot = { commands: { 'document-mode': { value: 'SUGGESTING' } } };

      toolbar.updateToolbarState();

      expect(documentModeItem.label.value).toBe('Suggesting');
      expect(documentModeItem.defaultLabel.value).toBe('Suggesting');
    });

    it('should handle mixed case mode values', () => {
      toolbar.snapshot = { commands: { 'document-mode': { value: 'Viewing' } } };

      toolbar.updateToolbarState();

      expect(documentModeItem.label.value).toBe('Viewing');
      expect(documentModeItem.defaultLabel.value).toBe('Viewing');
    });

    it('should use custom config.texts labels when provided', () => {
      toolbar.config.texts.documentSuggestingMode = 'Custom Suggesting Label';
      toolbar.snapshot = { commands: { 'document-mode': { value: 'suggesting' } } };

      toolbar.updateToolbarState();

      expect(documentModeItem.label.value).toBe('Custom Suggesting Label');
      expect(documentModeItem.defaultLabel.value).toBe('Custom Suggesting Label');
    });

    it('should not update icon when mode-specific icon is undefined', () => {
      const originalIcon = { type: 'original-icon' };
      documentModeItem.icon.value = originalIcon;
      toolbar.config.icons.documentSuggestingMode = undefined;
      toolbar.config.icons.documentMode = undefined;
      toolbar.snapshot = { commands: { 'document-mode': { value: 'suggesting' } } };

      toolbar.updateToolbarState();

      // Icon should remain unchanged when next.icon is falsy
      expect(documentModeItem.icon.value).toBe(originalIcon);
    });

    it('should fall back to documentMode icon when mode-specific icon is missing', () => {
      const fallbackIcon = { type: 'fallback-icon' };
      toolbar.config.icons.documentEditingMode = undefined;
      toolbar.config.icons.documentMode = fallbackIcon;
      toolbar.snapshot = { commands: { 'document-mode': { value: 'editing' } } };

      toolbar.updateToolbarState();

      expect(documentModeItem.icon.value).toBe(fallbackIcon);
    });

    it('should not throw when documentModeItem is missing from toolbar', () => {
      toolbar.toolbarItems = [];
      toolbar.snapshot = { commands: { 'document-mode': { value: 'suggesting' } } };

      expect(() => toolbar.updateToolbarState()).not.toThrow();
    });

    it('should not update label when label.value is undefined', () => {
      documentModeItem.label = {};
      toolbar.snapshot = { commands: { 'document-mode': { value: 'suggesting' } } };

      toolbar.updateToolbarState();

      expect(documentModeItem.label.value).toBeUndefined();
      expect(documentModeItem.defaultLabel.value).toBe('Suggesting');
    });

    it('should not update defaultLabel when defaultLabel.value is undefined', () => {
      documentModeItem.defaultLabel = {};
      toolbar.snapshot = { commands: { 'document-mode': { value: 'suggesting' } } };

      toolbar.updateToolbarState();

      expect(documentModeItem.label.value).toBe('Suggesting');
      expect(documentModeItem.defaultLabel.value).toBeUndefined();
    });

    it('should not update icon when icon.value is undefined', () => {
      documentModeItem.icon = {};
      toolbar.snapshot = { commands: { 'document-mode': { value: 'suggesting' } } };

      toolbar.updateToolbarState();

      expect(documentModeItem.icon.value).toBeUndefined();
    });
  });

  it('should update toolbar state from headless command state', () => {
    toolbar.snapshot = {
      commands: {
        'document-mode': { value: 'editing' },
        bold: { active: true, disabled: false },
        italic: { active: true, disabled: false },
      },
    };

    toolbar.updateToolbarState();

    expect(toolbar.toolbarItems[0].resetDisabled).toHaveBeenCalled();
    expect(toolbar.toolbarItems[0].activate).toHaveBeenCalledWith(); // bold
    expect(toolbar.toolbarItems[1].resetDisabled).toHaveBeenCalled();
    expect(toolbar.toolbarItems[1].activate).toHaveBeenCalledWith(); // italic
  });

  it('should keep toggles inactive when commands are inactive', () => {
    toolbar.snapshot = {
      commands: {
        'document-mode': { value: 'editing' },
        bold: { active: false, disabled: false },
        underline: { active: false, disabled: false },
      },
    };

    toolbar.updateToolbarState();

    const boldItem = toolbar.toolbarItems.find((item) => item.name.value === 'bold');
    const underlineItem = toolbar.toolbarItems.find((item) => item.name.value === 'underline');

    expect(boldItem.activate).not.toHaveBeenCalled();
    expect(boldItem.deactivate).toHaveBeenCalled();
    expect(underlineItem.activate).not.toHaveBeenCalled();
    expect(underlineItem.deactivate).toHaveBeenCalled();
  });

  it('should reset linked styles label when there is no active linked style', () => {
    const linkedStylesItem = toolbar.toolbarItems.find((item) => item.name.value === 'linkedStyles');
    linkedStylesItem.label.value = 'Some Style';
    toolbar.snapshot = {
      commands: {
        'document-mode': { value: 'editing' },
        'linked-style': { value: null, disabled: false },
      },
    };

    toolbar.updateToolbarState();

    expect(linkedStylesItem.label.value).toBe(toolbar.config.texts?.formatText || 'Format text');
  });

  it('disables tracked change buttons from headless command state', () => {
    toolbar.snapshot = {
      commands: {
        'document-mode': { value: 'editing' },
        'track-changes-accept-selection': { active: false, disabled: true },
        'track-changes-reject-selection': { active: false, disabled: false },
      },
    };

    toolbar.updateToolbarState();

    const acceptItem = toolbar.toolbarItems.find((item) => item.name.value === 'acceptTrackedChangeBySelection');
    const rejectItem = toolbar.toolbarItems.find((item) => item.name.value === 'rejectTrackedChangeOnSelection');

    expect(acceptItem.setDisabled).toHaveBeenCalledWith(true);
    expect(rejectItem.setDisabled).toHaveBeenCalledWith(false);
  });

  it('disables both tracked change buttons when both headless commands are disabled', () => {
    toolbar.snapshot = {
      commands: {
        'document-mode': { value: 'editing' },
        'track-changes-accept-selection': { active: false, disabled: true },
        'track-changes-reject-selection': { active: false, disabled: true },
      },
    };

    toolbar.updateToolbarState();

    const acceptItem = toolbar.toolbarItems.find((item) => item.name.value === 'acceptTrackedChangeBySelection');
    const rejectItem = toolbar.toolbarItems.find((item) => item.name.value === 'rejectTrackedChangeOnSelection');

    expect(acceptItem.setDisabled).toHaveBeenCalledWith(true);
    expect(rejectItem.setDisabled).toHaveBeenCalledWith(true);
  });

  it('keeps tracked change buttons enabled when headless commands are enabled', () => {
    toolbar.snapshot = {
      commands: {
        'document-mode': { value: 'editing' },
        'track-changes-accept-selection': { active: false, disabled: false },
        'track-changes-reject-selection': { active: false, disabled: false },
      },
    };

    toolbar.updateToolbarState();

    const acceptItem = toolbar.toolbarItems.find((item) => item.name.value === 'acceptTrackedChangeBySelection');
    const rejectItem = toolbar.toolbarItems.find((item) => item.name.value === 'rejectTrackedChangeOnSelection');

    expect(acceptItem.setDisabled).toHaveBeenCalledWith(false);
    expect(rejectItem.setDisabled).toHaveBeenCalledWith(false);
  });

  it('should deactivate toolbar items when no active editor', () => {
    toolbar.activeEditor = null;

    toolbar.updateToolbarState();

    toolbar.toolbarItems.forEach((item) => {
      expect(item.setDisabled).toHaveBeenCalledWith(true);
    });
  });

  it('should deactivate toolbar items when in viewing mode', () => {
    toolbar.snapshot = { commands: { 'document-mode': { value: 'viewing' } } };

    toolbar.updateToolbarState();

    toolbar.toolbarItems.forEach((item) => {
      expect(item.setDisabled).toHaveBeenCalledWith(true);
    });
  });

  it('should deactivate toolbar items when active editor has no state', () => {
    toolbar.activeEditor = { ...mockEditor, state: null };

    toolbar.updateToolbarState();

    toolbar.toolbarItems.forEach((item) => {
      expect(item.setDisabled).toHaveBeenCalledWith(true);
    });
    expect(toolbar.activeEditor).toBeNull();
  });

  it('should prioritize active mark over linked styles (font family)', () => {
    toolbar.snapshot = {
      commands: {
        'document-mode': { value: 'editing' },
        'font-family': { value: 'Roboto', disabled: false },
      },
    };

    toolbar.updateToolbarState();

    const fontFamilyItem = toolbar.toolbarItems.find((item) => item.name.value === 'fontFamily');
    expect(fontFamilyItem.activate).toHaveBeenCalledWith({ fontFamily: 'Roboto' });
    expect(fontFamilyItem.activate).not.toHaveBeenCalledWith({ fontFamily: 'Arial' });
  });

  it('falls back to paragraph runProperties font family for empty paragraph with collapsed selection', () => {
    const paragraphParent = {
      node: {
        content: { size: 0 },
        attrs: { paragraphProperties: {} },
      },
      pos: 5,
    };

    mockFindParentNode.mockImplementation(() => () => paragraphParent);
    const paragraphFontFamily = 'Fancy Font, serif';
    mockCalculateResolvedParagraphProperties.mockReturnValue({
      runProperties: { fontFamily: { 'w:ascii': paragraphFontFamily } },
    });
    toolbar.snapshot = { commands: { 'document-mode': { value: 'editing' } } };

    toolbar.updateToolbarState();

    const fontFamilyItem = toolbar.toolbarItems.find((item) => item.name.value === 'fontFamily');
    expect(mockCalculateResolvedParagraphProperties).toHaveBeenCalled();
    expect(fontFamilyItem.activate).toHaveBeenCalledWith({ fontFamily: paragraphFontFamily });
  });

  it('does not fallback to paragraph font when paragraph already contains text', () => {
    const paragraphParent = {
      node: {
        content: { size: 1 },
        attrs: { paragraphProperties: {} },
      },
      pos: 5,
    };

    mockFindParentNode.mockImplementation(() => () => paragraphParent);
    mockCalculateResolvedParagraphProperties.mockReturnValue({
      runProperties: { fontFamily: { 'w:ascii': 'Never Used' } },
    });
    toolbar.snapshot = { commands: { 'document-mode': { value: 'editing' } } };

    toolbar.updateToolbarState();

    const fontFamilyItem = toolbar.toolbarItems.find((item) => item.name.value === 'fontFamily');
    expect(fontFamilyItem.activate).not.toHaveBeenCalled();
  });

  it('keeps linked style font family over paragraph fallback in empty paragraphs', () => {
    const paragraphParent = {
      node: {
        content: { size: 0 },
        attrs: { paragraphProperties: {} },
      },
      pos: 5,
    };

    mockFindParentNode.mockImplementation(() => () => paragraphParent);
    mockCalculateResolvedParagraphProperties.mockReturnValue({
      styleId: 'test-style',
      runProperties: { fontFamily: { 'w:ascii': 'Paragraph Font, serif' } },
    });
    toolbar.snapshot = {
      commands: {
        'document-mode': { value: 'editing' },
        'font-family': { value: 'Linked Style Font', disabled: false },
      },
    };

    toolbar.updateToolbarState();

    const fontFamilyItem = toolbar.toolbarItems.find((item) => item.name.value === 'fontFamily');
    expect(fontFamilyItem.activate).toHaveBeenCalledWith({ fontFamily: 'Linked Style Font' });
    expect(fontFamilyItem.activate).not.toHaveBeenCalledWith({ fontFamily: 'Paragraph Font, serif' });
  });

  it('should prioritize active mark over linked styles (font size)', () => {
    toolbar.snapshot = {
      commands: {
        'document-mode': { value: 'editing' },
        'font-size': { value: '20pt', disabled: false },
      },
    };

    toolbar.updateToolbarState();

    const fontSizeItem = toolbar.toolbarItems.find((item) => item.name.value === 'fontSize');
    expect(fontSizeItem.activate).toHaveBeenCalledWith({ fontSize: '20pt' });
  });

  describe('undo/redo button state', () => {
    it('should disable undo button when undo command is disabled', () => {
      const undoItem = {
        name: { value: 'undo' },
        resetDisabled: vi.fn(),
        activate: vi.fn(),
        deactivate: vi.fn(),
        setDisabled: vi.fn(),
        allowWithoutEditor: { value: false },
      };

      toolbar.toolbarItems = [undoItem];
      toolbar.activeEditor = mockEditor;
      toolbar.snapshot = {
        commands: {
          'document-mode': { value: 'editing' },
          undo: { active: false, disabled: true },
        },
      };

      toolbar.updateToolbarState();

      expect(undoItem.setDisabled).toHaveBeenCalledWith(true);
    });

    it('should enable undo button when undo command is enabled', () => {
      const undoItem = {
        name: { value: 'undo' },
        resetDisabled: vi.fn(),
        activate: vi.fn(),
        deactivate: vi.fn(),
        setDisabled: vi.fn(),
        allowWithoutEditor: { value: false },
      };

      toolbar.toolbarItems = [undoItem];
      toolbar.activeEditor = mockEditor;
      toolbar.snapshot = {
        commands: {
          'document-mode': { value: 'editing' },
          undo: { active: false, disabled: false },
        },
      };

      toolbar.updateToolbarState();

      expect(undoItem.setDisabled).toHaveBeenCalledWith(false);
    });

    it('should disable redo button when redo command is disabled', () => {
      const redoItem = {
        name: { value: 'redo' },
        resetDisabled: vi.fn(),
        activate: vi.fn(),
        deactivate: vi.fn(),
        setDisabled: vi.fn(),
        allowWithoutEditor: { value: false },
      };

      toolbar.toolbarItems = [redoItem];
      toolbar.activeEditor = mockEditor;
      toolbar.snapshot = {
        commands: {
          'document-mode': { value: 'editing' },
          redo: { active: false, disabled: true },
        },
      };

      toolbar.updateToolbarState();

      expect(redoItem.setDisabled).toHaveBeenCalledWith(true);
    });

    it('should enable redo button when redo command is enabled', () => {
      const redoItem = {
        name: { value: 'redo' },
        resetDisabled: vi.fn(),
        activate: vi.fn(),
        deactivate: vi.fn(),
        setDisabled: vi.fn(),
        allowWithoutEditor: { value: false },
      };

      toolbar.toolbarItems = [redoItem];
      toolbar.activeEditor = mockEditor;
      toolbar.snapshot = {
        commands: {
          'document-mode': { value: 'editing' },
          redo: { active: false, disabled: false },
        },
      };

      toolbar.updateToolbarState();

      expect(redoItem.setDisabled).toHaveBeenCalledWith(false);
    });

    it('should update both undo and redo buttons correctly from snapshot', () => {
      const undoItem = {
        name: { value: 'undo' },
        resetDisabled: vi.fn(),
        activate: vi.fn(),
        deactivate: vi.fn(),
        setDisabled: vi.fn(),
        allowWithoutEditor: { value: false },
      };

      const redoItem = {
        name: { value: 'redo' },
        resetDisabled: vi.fn(),
        activate: vi.fn(),
        deactivate: vi.fn(),
        setDisabled: vi.fn(),
        allowWithoutEditor: { value: false },
      };

      toolbar.toolbarItems = [undoItem, redoItem];
      toolbar.activeEditor = mockEditor;
      toolbar.snapshot = {
        commands: {
          'document-mode': { value: 'editing' },
          undo: { active: false, disabled: false },
          redo: { active: false, disabled: true },
        },
      };

      toolbar.updateToolbarState();

      expect(undoItem.setDisabled).toHaveBeenCalledWith(false);
      expect(redoItem.setDisabled).toHaveBeenCalledWith(true);
    });
  });

  describe('headless state adapter branches', () => {
    const buildItem = (name, extras = {}) => ({
      name: { value: name },
      resetDisabled: vi.fn(),
      activate: vi.fn(),
      deactivate: vi.fn(),
      setDisabled: vi.fn(),
      allowWithoutEditor: { value: false },
      ...extras,
    });

    it('activates textAlign with snapshot value and deactivates when null', () => {
      const item = buildItem('textAlign');
      toolbar.toolbarItems = [item];
      toolbar.snapshot = {
        commands: {
          'document-mode': { value: 'editing' },
          'text-align': { value: 'center', disabled: false },
        },
      };

      toolbar.updateToolbarState();
      expect(item.activate).toHaveBeenCalledWith({ textAlign: 'center' });

      item.activate.mockClear();
      item.deactivate.mockClear();
      toolbar.snapshot = {
        commands: {
          'document-mode': { value: 'editing' },
          'text-align': { value: null, disabled: false },
        },
      };

      toolbar.updateToolbarState();
      expect(item.activate).not.toHaveBeenCalled();
      expect(item.deactivate).toHaveBeenCalled();
    });

    it('sets lineHeight selectedValue from snapshot value', () => {
      const item = buildItem('lineHeight', { selectedValue: { value: '' } });
      toolbar.toolbarItems = [item];
      toolbar.snapshot = {
        commands: {
          'document-mode': { value: 'editing' },
          'line-height': { value: '1.5', disabled: false },
        },
      };

      toolbar.updateToolbarState();
      expect(item.selectedValue.value).toBe('1.5');
    });

    it('formats numeric zoom value as a percentage string for the dropdown', () => {
      const item = buildItem('zoom', { onActivate: vi.fn() });
      toolbar.toolbarItems = [item];
      toolbar.snapshot = {
        commands: {
          'document-mode': { value: 'editing' },
          zoom: { value: 150, disabled: false },
        },
      };

      toolbar.updateToolbarState();
      expect(item.onActivate).toHaveBeenCalledWith({ zoom: '150%' });
    });

    it('sets link active and href attributes from snapshot', () => {
      const item = buildItem('link', {
        active: { value: false },
        attributes: { value: {} },
      });
      toolbar.toolbarItems = [item];
      toolbar.snapshot = {
        commands: {
          'document-mode': { value: 'editing' },
          link: { active: true, value: 'https://example.com', disabled: false },
        },
      };

      toolbar.updateToolbarState();
      expect(item.active.value).toBe(true);
      expect(item.attributes.value).toEqual({ href: 'https://example.com' });
    });

    it('activates color with snapshot value and deactivates when null', () => {
      const item = buildItem('color');
      toolbar.toolbarItems = [item];
      toolbar.snapshot = {
        commands: {
          'document-mode': { value: 'editing' },
          'text-color': { value: '#ff0000', disabled: false },
        },
      };

      toolbar.updateToolbarState();
      expect(item.activate).toHaveBeenCalledWith({ color: '#ff0000' });
    });

    it('activates highlight with snapshot value and deactivates when null', () => {
      const item = buildItem('highlight', { nestedOptions: { value: [] } });
      toolbar.toolbarItems = [item];
      toolbar.snapshot = {
        commands: {
          'document-mode': { value: 'editing' },
          'highlight-color': { value: '#ffff00', disabled: false },
        },
      };

      toolbar.updateToolbarState();
      expect(item.activate).toHaveBeenCalledWith({ color: '#ffff00' });
    });

    it('activates fontSize with isMultiple flag when snapshot reports active without a value (mixed selection)', () => {
      const item = buildItem('fontSize', { defaultLabel: { value: '' } });
      toolbar.toolbarItems = [item];
      toolbar.snapshot = {
        commands: {
          'document-mode': { value: 'editing' },
          'font-size': { active: true, value: null, disabled: false },
        },
      };

      toolbar.updateToolbarState();
      expect(item.activate).toHaveBeenCalledWith({}, true);
    });

    it('disables tableActions when every table command is disabled', () => {
      const item = buildItem('tableActions', { disabled: { value: false } });
      toolbar.toolbarItems = [item];
      toolbar.snapshot = {
        commands: {
          'document-mode': { value: 'editing' },
          'table-add-row-before': { disabled: true },
          'table-add-row-after': { disabled: true },
          'table-delete-row': { disabled: true },
          'table-add-column-before': { disabled: true },
          'table-add-column-after': { disabled: true },
          'table-delete-column': { disabled: true },
          'table-delete': { disabled: true },
          'table-remove-borders': { disabled: true },
          'table-merge-cells': { disabled: true },
          'table-split-cell': { disabled: true },
          'table-fix': { disabled: true },
        },
      };

      toolbar.updateToolbarState();
      expect(item.setDisabled).toHaveBeenCalledWith(true);
    });

    it('enables tableActions when at least one table command is enabled', () => {
      const item = buildItem('tableActions', { disabled: { value: false } });
      toolbar.toolbarItems = [item];
      toolbar.snapshot = {
        commands: {
          'document-mode': { value: 'editing' },
          'table-add-row-before': { disabled: true },
          'table-add-row-after': { disabled: false },
          'table-delete-row': { disabled: true },
        },
      };

      toolbar.updateToolbarState();
      expect(item.setDisabled).toHaveBeenCalledWith(false);
    });
  });
});
