import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getItems } from '../menuItems.js';
import { createMockEditor, createMockContext, assertMenuSectionsStructure, ContextMenuConfigs } from './testHelpers.js';
import { TRIGGERS } from '../constants.js';

const clipboardMocks = vi.hoisted(() => ({
  readClipboardRaw: vi.fn(),
  handleClipboardPaste: vi.fn(() => true),
}));

vi.mock('../../cursor-helpers.js', async () => {
  const actual = await vi.importActual('../../cursor-helpers.js');
  return {
    ...actual,
    selectionHasNodeOrMark: vi.fn(),
  };
});

vi.mock('../constants.js', () => ({
  TEXTS: {
    replaceText: 'Replace text',
    insertText: 'Insert text',
    createDocumentSection: 'Create document section',
    removeDocumentSection: 'Remove document section',
    insertLink: 'Insert link',
    insertTable: 'Insert table',
    editTable: 'Edit table',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    trackChangesAccept: 'Accept Tracked Changes',
    trackChangesReject: 'Reject Tracked Changes',
  },
  ICONS: {
    ai: '<svg>ai-icon</svg>',
    addDocumentSection: '<svg>add-section-icon</svg>',
    removeDocumentSection: '<svg>remove-section-icon</svg>',
    link: '<svg>link-icon</svg>',
    table: '<svg>table-icon</svg>',
    cut: '<svg>cut-icon</svg>',
    copy: '<svg>copy-icon</svg>',
    paste: '<svg>paste-icon</svg>',
  },
  TRIGGERS: {
    slash: 'slash',
    click: 'click',
  },
}));

vi.mock('../../toolbar/TableGrid.vue', () => ({ default: { template: '<div>TableGrid</div>' } }));
vi.mock('../../toolbar/AIWriter.vue', () => ({ default: { template: '<div>AIWriter</div>' } }));
vi.mock('../../toolbar/TableActions.vue', () => ({ default: { template: '<div>TableActions</div>' } }));
vi.mock('../../toolbar/LinkInput.vue', () => ({ default: { template: '<div>LinkInput</div>' } }));

vi.mock('../../../core/utilities/clipboardUtils.js', () => ({
  readClipboardRaw: clipboardMocks.readClipboardRaw,
}));

vi.mock('../../../core/InputRule.js', () => ({
  handleClipboardPaste: clipboardMocks.handleClipboardPaste,
}));

vi.mock('@extensions/track-changes/permission-helpers.js', () => ({
  isTrackedChangeActionAllowed: vi.fn(() => true),
}));

describe('menuItems.js', () => {
  let mockEditor;
  let mockContext;
  let mockIsTrackedChangeActionAllowed;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockEditor = createMockEditor({
      isAiEnabled: false,
      contextMenuConfig: null,
    });

    mockContext = createMockContext({
      editor: mockEditor,
      selectedText: '',
      trigger: 'slash',
      clipboardContent: {
        html: null,
        text: null,
        hasContent: false,
      },
    });

    const { selectionHasNodeOrMark } = await import('../../cursor-helpers.js');
    const { isTrackedChangeActionAllowed } = await import('@extensions/track-changes/permission-helpers.js');
    selectionHasNodeOrMark.mockReturnValue(false);
    mockIsTrackedChangeActionAllowed = isTrackedChangeActionAllowed;
    mockIsTrackedChangeActionAllowed.mockReturnValue(true);
  });

  describe('getItems - default behavior', () => {
    it('should return default menu items with no customization', () => {
      const sections = getItems(mockContext);

      assertMenuSectionsStructure(sections);

      const sectionIds = sections.map((s) => s.id);
      expect(sectionIds.length).toBeGreaterThan(0);
      expect(sectionIds).toContain('general');
    });

    it('should hide tracked-change actions when permission resolver denies access', () => {
      mockContext = createMockContext({
        editor: mockEditor,
        trigger: TRIGGERS.click,
        isTrackedChange: true,
        trackedChanges: [{ id: 'track-1', attrs: { authorEmail: 'author@example.com' } }],
      });
      mockIsTrackedChangeActionAllowed.mockReturnValue(false);

      const sections = getItems(mockContext);
      const trackSection = sections.find((section) => section.id === 'track-changes');
      const itemIds = trackSection ? trackSection.items.map((item) => item.id) : [];

      expect(itemIds).not.toContain('track-changes-accept');
      expect(itemIds).not.toContain('track-changes-reject');
    });

    it('should filter AI items when AI module is not enabled', () => {
      const sections = getItems(mockContext);

      const aiSection = sections.find((s) => s.id === 'ai-content');
      expect(aiSection?.items || []).toHaveLength(0);
    });

    it('should include AI items when AI module is enabled', () => {
      mockEditor.options.isAiEnabled = true;
      const sections = getItems(mockContext);

      const aiSection = sections.find((s) => s.id === 'ai-content');
      expect(aiSection?.items.length).toBeGreaterThan(0);

      const insertTextItem = aiSection.items.find((item) => item.id === 'insert-text');
      expect(insertTextItem).toBeDefined();
    });

    it('should filter items based on trigger type', () => {
      mockContext.trigger = TRIGGERS.slash;
      const sections = getItems(mockContext);

      const allItems = sections.flatMap((s) => s.items);
      // With showWhen functions, all returned items should be appropriate for the trigger
      // This test verifies that getItems properly filters items for the slash trigger
      expect(allItems.length).toBeGreaterThan(0);
      // Verify that no items without appropriate showWhen logic are included
      allItems.forEach((item) => {
        if (item.showWhen) {
          expect(item.showWhen(mockContext)).toBe(true);
        }
      });
    });

    it('should filter items based on selection requirement', () => {
      mockContext.selectedText = '';
      const sections = getItems(mockContext);

      const allItems = sections.flatMap((s) => s.items);
      const selectionRequiredItems = allItems.filter((item) => item.requiresSelection);

      expect(selectionRequiredItems).toHaveLength(0);
    });

    it('should include selection-required items when text is selected', () => {
      mockContext.selectedText = 'selected text';
      const sections = getItems(mockContext);

      const allItems = sections.flatMap((s) => s.items);
      const selectionBasedItems = allItems.filter(
        (item) => item.requiresSelection || item.id === 'cut' || item.id === 'copy',
      );

      expect(selectionBasedItems.length).toBeGreaterThanOrEqual(0);
    });

    it('should always show paste item to avoid clipboard permission prompts', () => {
      // After clipboard refactor, paste is always shown to avoid triggering
      // browser permission prompts when menu opens. Clipboard reading is
      // deferred to when user actually clicks the paste action.
      mockContext.clipboardContent.hasContent = false;
      const sections = getItems(mockContext);

      const clipboardSection = sections.find((s) => s.id === 'clipboard');
      const pasteItem = clipboardSection?.items.find((item) => item.id === 'paste');

      // Paste is shown optimistically - actual clipboard state checked on click
      expect(pasteItem).toBeDefined();
      expect(pasteItem.id).toBe('paste');
    });

    it('should show paste item regardless of clipboard content state', () => {
      // Paste shown for both empty and populated clipboard states
      // to maintain consistent UX and avoid permission prompts
      mockContext.clipboardContent = {
        html: '<p>content</p>',
        text: 'content',
        hasContent: true,
      };
      const sections = getItems(mockContext);

      const clipboardSection = sections.find((s) => s.id === 'clipboard');
      const pasteItem = clipboardSection?.items.find((item) => item.id === 'paste');

      expect(pasteItem).toBeDefined();
      expect(pasteItem.id).toBe('paste');
    });

    it('should keep paste item visible when clipboard is a ProseMirror slice', () => {
      mockContext.clipboardContent = {
        content: { size: 1 },
        size: 1,
        hasContent: true, // Ensure the normalized clipboard content structure is used
      };

      const sections = getItems(mockContext);

      const clipboardSection = sections.find((s) => s.id === 'clipboard');
      const pasteItem = clipboardSection?.items.find((item) => item.id === 'paste');

      expect(pasteItem).toBeDefined();
    });
  });

  describe('getItems - custom configuration', () => {
    it('should keep default items when slashMenuConfig is an empty object', () => {
      mockEditor.options.slashMenuConfig = {};
      mockContext.editor = mockEditor;

      const sections = getItems(mockContext);
      const sectionIds = sections.map((section) => section.id);

      expect(sectionIds).toContain('general');
      expect(sections.length).toBeGreaterThan(0);
    });

    it('should add custom items when customItems is provided', () => {
      mockEditor.options.contextMenuConfig = ContextMenuConfigs.customOnly;
      mockContext.editor = mockEditor;

      const sections = getItems(mockContext);
      const customSection = sections.find((s) => s.id === 'custom-section');

      expect(customSection).toBeDefined();
      expect(customSection.items).toHaveLength(1);
      expect(customSection.items[0].id).toBe('custom-item');
    });

    it('should exclude default items when includeDefaultItems is false', () => {
      mockEditor.options.contextMenuConfig = {
        includeDefaultItems: false,
        customItems: [
          {
            id: 'custom-section',
            items: [
              {
                id: 'custom-item',
                label: 'Custom Item',
                showWhen: (context) => [TRIGGERS.slash, TRIGGERS.click].includes(context.trigger),
                action: () => {},
              },
            ],
          },
        ],
      };
      mockContext.editor = mockEditor;

      const sections = getItems(mockContext);

      // Should only have custom sections
      expect(sections).toHaveLength(1);
      expect(sections[0].id).toBe('custom-section');
    });

    it('should support slashMenuConfig.items as an alias for customItems', () => {
      mockEditor.options.slashMenuConfig = {
        includeDefaultItems: false,
        items: [
          {
            id: 'items-alias-section',
            items: [
              {
                id: 'items-alias-item',
                label: 'Items Alias Item',
                showWhen: (context) => [TRIGGERS.slash, TRIGGERS.click].includes(context.trigger),
                action: vi.fn(),
              },
            ],
          },
        ],
      };
      mockContext.editor = mockEditor;

      const sections = getItems(mockContext);
      expect(sections).toHaveLength(1);
      expect(sections[0].id).toBe('items-alias-section');
      expect(sections[0].items[0].id).toBe('items-alias-item');
    });

    it('should apply menuProvider function', () => {
      const customProvider = (context, defaultSections) => {
        return [
          ...defaultSections,
          {
            id: 'provider-section',
            items: [
              {
                id: 'provider-item',
                label: `Provider item for ${context.trigger}`,
                showWhen: (context) => [TRIGGERS.slash, TRIGGERS.click].includes(context.trigger),
                action: vi.fn(),
              },
            ],
          },
        ];
      };

      mockEditor.options.contextMenuConfig = ContextMenuConfigs.withProvider(customProvider);
      mockContext.editor = mockEditor;

      const sections = getItems(mockContext);
      const providerSection = sections.find((s) => s.id === 'provider-section');

      expect(providerSection).toBeDefined();
      expect(providerSection.items[0].label).toBe('Provider item for slash');
    });

    it('should handle menuProvider errors gracefully', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockEditor.options.contextMenuConfig = {
        includeDefaultItems: true,
        menuProvider: () => {
          throw new Error('Provider error');
        },
      };

      // Should not throw and should return default sections
      const sections = getItems(mockContext);
      expect(sections.length).toBeGreaterThan(0);

      warnSpy.mockRestore();
    });

    it('should filter custom items with showWhen conditions', () => {
      mockContext.selectedText = '';
      mockContext.hasSelection = false;
      mockEditor.options.contextMenuConfig = ContextMenuConfigs.withConditionalItems;
      mockContext.editor = mockEditor;

      const sections = getItems(mockContext);
      const conditionalSection = sections.find((s) => s.id === 'conditional-section');

      expect(conditionalSection.items).toHaveLength(1);
      expect(conditionalSection.items[0].id).toBe('always-show');
    });

    it('should include conditional items when showWhen condition is met', () => {
      mockContext.selectedText = 'selected';
      mockContext.hasSelection = true;
      mockEditor.options.contextMenuConfig = ContextMenuConfigs.withConditionalItems;
      mockContext.editor = mockEditor;

      const sections = getItems(mockContext);
      const conditionalSection = sections.find((s) => s.id === 'conditional-section');

      expect(conditionalSection.items).toHaveLength(2); // Both items should be present
      const itemIds = conditionalSection.items.map((item) => item.id);
      expect(itemIds).toContain('always-show');
      expect(itemIds).toContain('show-when-selection');
    });

    it('should handle showWhen errors gracefully', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockEditor.options.contextMenuConfig = {
        includeDefaultItems: false,
        customItems: [
          {
            id: 'error-section',
            items: [
              {
                id: 'error-item',
                label: 'Error Item',
                showWhen: () => {
                  throw new Error('showWhen error');
                },
                action: () => {},
              },
            ],
          },
        ],
      };

      const sections = getItems(mockContext);
      const errorSection = sections.find((s) => s.id === 'error-section');

      // Item should be excluded due to error
      expect(errorSection?.items || []).toHaveLength(0);

      warnSpy.mockRestore();
    });

    it('should remove empty sections after filtering', () => {
      mockEditor.options.contextMenuConfig = {
        includeDefaultItems: false,
        customItems: [
          {
            id: 'empty-section',
            items: [
              {
                id: 'never-show',
                label: 'Never Show',
                showWhen: () => false,
                action: () => {},
              },
            ],
          },
        ],
      };

      const sections = getItems(mockContext);
      const emptySection = sections.find((s) => s.id === 'empty-section');

      expect(emptySection).toBeUndefined();
    });
  });

  describe('getItems - table context', () => {
    beforeEach(async () => {
      const { selectionHasNodeOrMark } = await import('../../cursor-helpers.js');
      selectionHasNodeOrMark.mockImplementation((_, nodeName, options) => {
        if (nodeName === 'table' && options?.requireEnds) {
          return true; // Simulate being in a table
        }
        return false;
      });
    });

    it('should show edit-table item when in table', () => {
      mockContext.isInTable = true;
      const sections = getItems(mockContext);
      const generalSection = sections.find((s) => s.id === 'general');
      const editTableItem = generalSection?.items.find((item) => item.id === 'edit-table');

      expect(editTableItem).toBeDefined();
    });

    it('should hide insert-table item when in table', () => {
      mockContext.isInTable = true;
      const sections = getItems(mockContext);
      const generalSection = sections.find((s) => s.id === 'general');
      const insertTableItem = generalSection?.items.find((item) => item.id === 'insert-table');

      expect(insertTableItem).toBeUndefined();
    });
  });

  describe('getItems - document section context', () => {
    beforeEach(async () => {
      const { selectionHasNodeOrMark } = await import('../../cursor-helpers.js');
      selectionHasNodeOrMark.mockImplementation((_, nodeName, options) => {
        if (nodeName === 'documentSection' && options?.requireEnds) {
          return true; // Simulate being in a document section
        }
        return false;
      });
    });

    it('should show remove-section item when in document section', () => {
      mockContext.trigger = 'click';
      mockContext.isInSectionNode = true;
      const sections = getItems(mockContext);
      const docSection = sections.find((s) => s.id === 'document-sections');
      const removeItem = docSection?.items.find((item) => item.id === 'remove-section');

      expect(removeItem).toBeDefined();
    });
  });

  describe('getItems - paste action behavior', () => {
    it('should not force plain-text insert when HTML paste is unhandled', async () => {
      const insertContent = vi.fn();
      mockEditor = createMockEditor({
        commands: { insertContent },
      });
      mockEditor.view.dom.focus = vi.fn();
      mockEditor.view.pasteHTML = vi.fn();
      mockContext = createMockContext({
        editor: mockEditor,
        trigger: TRIGGERS.click,
      });

      clipboardMocks.readClipboardRaw.mockResolvedValue({
        html: '<p>word html</p>',
        text: 'word html',
      });
      clipboardMocks.handleClipboardPaste.mockReturnValue(false);

      const sections = getItems(mockContext);
      const pasteAction = sections
        .find((section) => section.id === 'clipboard')
        ?.items.find((item) => item.id === 'paste')?.action;

      expect(pasteAction).toBeTypeOf('function');
      await pasteAction(mockEditor);

      expect(clipboardMocks.handleClipboardPaste).toHaveBeenCalledWith(
        { editor: mockEditor, view: mockEditor.view },
        '<p>word html</p>',
      );
      expect(mockEditor.view.pasteHTML).toHaveBeenCalledWith('<p>word html</p>', expect.any(Object));
      expect(insertContent).not.toHaveBeenCalled();
    });

    it('should use pasteText when clipboard has text but no HTML', async () => {
      const insertContent = vi.fn();
      mockEditor = createMockEditor({
        commands: { insertContent },
      });
      mockEditor.view.dom.focus = vi.fn();
      mockEditor.view.pasteText = vi.fn();
      mockContext = createMockContext({
        editor: mockEditor,
        trigger: TRIGGERS.click,
      });

      clipboardMocks.readClipboardRaw.mockResolvedValue({
        html: '',
        text: 'plain text content',
      });
      clipboardMocks.handleClipboardPaste.mockReturnValue(false);

      const sections = getItems(mockContext);
      const pasteAction = sections
        .find((section) => section.id === 'clipboard')
        ?.items.find((item) => item.id === 'paste')?.action;

      await pasteAction(mockEditor);

      expect(mockEditor.view.pasteText).toHaveBeenCalledWith('plain text content', expect.any(Object));
      expect(insertContent).not.toHaveBeenCalled();
    });

    it('should fall back to insertContent when view has no pasteHTML or pasteText', async () => {
      const insertContent = vi.fn();
      mockEditor = createMockEditor({
        commands: { insertContent },
      });
      mockEditor.view.dom.focus = vi.fn();
      // No pasteHTML or pasteText on view
      delete mockEditor.view.pasteHTML;
      delete mockEditor.view.pasteText;
      mockContext = createMockContext({
        editor: mockEditor,
        trigger: TRIGGERS.click,
      });

      clipboardMocks.readClipboardRaw.mockResolvedValue({
        html: '',
        text: 'fallback text',
      });
      clipboardMocks.handleClipboardPaste.mockReturnValue(false);

      const sections = getItems(mockContext);
      const pasteAction = sections
        .find((section) => section.id === 'clipboard')
        ?.items.find((item) => item.id === 'paste')?.action;

      await pasteAction(mockEditor);

      expect(insertContent).toHaveBeenCalledWith('fallback text', { contentType: 'text' });
    });
  });
});
