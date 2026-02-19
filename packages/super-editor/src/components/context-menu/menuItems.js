import TableGrid from '../toolbar/TableGrid.vue';
import AIWriter from '../toolbar/AIWriter.vue';
import TableActions from '../toolbar/TableActions.vue';
import LinkInput from '../toolbar/LinkInput.vue';
import { TEXTS, ICONS, TRIGGERS } from './constants.js';
import { isTrackedChangeActionAllowed } from '@extensions/track-changes/permission-helpers.js';
import { readClipboardRaw } from '../../core/utilities/clipboardUtils.js';
import { handleClipboardPaste } from '../../core/InputRule.js';

/**
 * Build a minimal clipboard event-like object so ProseMirror paste hooks
 * can access text/html and text/plain data.
 * @param {{ html?: string, text?: string }} clipboard
 * @returns {{ clipboardData: { getData: (type: string) => string } }}
 */
const createPasteEventShim = (clipboard) => {
  const html = clipboard?.html || '';
  const text = clipboard?.text || '';

  return {
    type: 'paste',
    preventDefault: () => {},
    stopPropagation: () => {},
    clipboardData: {
      getData: (type) => {
        if (type === 'text/html') return html;
        if (type === 'text/plain') return text;
        return '';
      },
    },
  };
};

/**
 * Check if a module is enabled based on editor options
 * This is used for hiding menu items based on module availability
 *
 *  Example for future use cases
 *  case 'comments':
 *     return !!editorOptions?.isCommentsEnabled;
 *
 * @param {Object} editorOptions - Editor options
 * @param {string} moduleName - Name of the module to check (e.g. 'ai')
 * @returns {boolean} Whether the module is enabled
 */
const isModuleEnabled = (editorOptions, moduleName) => {
  switch (moduleName) {
    case 'ai':
      return !!editorOptions?.isAiEnabled;

    default:
      return true;
  }
};

/**
 * Universal menu item filtering function using showWhen logic
 * @param {Object} item - Menu item to check
 * @param {Object} context - Editor context with all necessary information
 * @returns {boolean} Whether the item should be shown
 */
const shouldShowItem = (item, context) => {
  // If item has a custom showWhen function, use it
  if (typeof item.showWhen === 'function') {
    try {
      return Boolean(item.showWhen(context));
    } catch (error) {
      console.warn('[ContextMenu] showWhen error for item', item.id, ':', error);
      return false;
    }
  }
  // Items without showWhen are always shown
  return true;
};

const canPerformTrackedChange = (context, action) => {
  if (!context?.editor) return true;
  return isTrackedChangeActionAllowed({
    editor: context.editor,
    action,
    trackedChanges: context.trackedChanges ?? [],
  });
};

/**
 * Get menu sections based on context (trigger, selection, node, etc)
 * @param {Object} context - { editor, selectedText, pos, node, event, trigger }
 * @param {Array} customItems - Optional custom menu items from configuration
 * @param {boolean} includeDefaultItems - Whether to include default items
 * @returns {Array} Array of menu sections
 */
export function getItems(context, customItems = [], includeDefaultItems = true) {
  const { selectedText, editor } = context;

  if (editor?.options?.slashMenuConfig && !editor?.options?.contextMenuConfig) {
    console.warn('[ContextMenu] editor.options.slashMenuConfig is deprecated. Use contextMenuConfig instead.');
  }
  const menuConfig = editor?.options?.contextMenuConfig ?? editor?.options?.slashMenuConfig;
  if (arguments.length === 1 && menuConfig) {
    customItems = menuConfig.items || menuConfig.customItems || [];
    includeDefaultItems = menuConfig.includeDefaultItems !== false;
  }

  // Enhanced context object - ensure we have all necessary computed properties
  const enhancedContext = {
    ...context,
    isInTable: context.isInTable ?? false,
    isInSectionNode: context.isInSectionNode ?? false,
    isTrackedChange: context.isTrackedChange ?? false,
    clipboardContent: context.clipboardContent ?? { hasContent: false },
    selectedText: context.selectedText ?? '',
    hasSelection: context.hasSelection ?? Boolean(context.selectedText),
  };

  // Define default sections with isDefault flag
  const defaultSections = [
    {
      id: 'ai-content',
      isDefault: true,
      items: [
        {
          id: 'insert-text',
          label: selectedText ? TEXTS.replaceText : TEXTS.insertText,
          icon: ICONS.ai,
          component: AIWriter,
          isDefault: true,
          action: (editor) => {
            if (editor?.commands && typeof editor.commands?.insertAiMark === 'function') {
              editor.commands.insertAiMark();
            }
          },
          showWhen: (context) => {
            const { trigger } = context;
            const allowedTriggers = [TRIGGERS.slash, TRIGGERS.click];
            return allowedTriggers.includes(trigger) && isModuleEnabled(context.editor?.options, 'ai');
          },
        },
      ],
    },
    {
      id: 'track-changes',
      isDefault: true,
      items: [
        {
          id: 'track-changes-accept',
          icon: ICONS.trackChangesAccept,
          label: TEXTS.trackChangesAccept,
          isDefault: true,
          action: (editor, context) => {
            if (context?.trackedChangeId) {
              editor.commands.acceptTrackedChangeById(context.trackedChangeId);
            } else {
              editor.commands.acceptTrackedChangeBySelection();
            }
          },
          showWhen: (context) => {
            const { trigger, isTrackedChange } = context;
            return trigger === TRIGGERS.click && isTrackedChange && canPerformTrackedChange(context, 'accept');
          },
        },
        {
          id: 'track-changes-reject',
          label: TEXTS.trackChangesReject,
          icon: ICONS.trackChangesReject,
          isDefault: true,
          action: (editor, context) => {
            if (context?.trackedChangeId) {
              editor.commands.rejectTrackedChangeById(context.trackedChangeId);
            } else {
              editor.commands.rejectTrackedChangeOnSelection();
            }
          },
          showWhen: (context) => {
            const { trigger, isTrackedChange } = context;
            return trigger === TRIGGERS.click && isTrackedChange && canPerformTrackedChange(context, 'reject');
          },
        },
      ],
    },
    {
      id: 'document-sections',
      isDefault: true,
      items: [
        {
          id: 'insert-document-section',
          label: TEXTS.createDocumentSection,
          icon: ICONS.addDocumentSection,
          isDefault: true,
          action: (editor) => {
            editor.commands.createDocumentSection();
          },
          // TODO: Temporarily disabled - restore original: `return trigger === TRIGGERS.click;`
          showWhen: () => {
            return false;
          },
        },
        {
          id: 'remove-section',
          label: TEXTS.removeDocumentSection,
          icon: ICONS.removeDocumentSection,
          isDefault: true,
          action: (editor) => {
            editor.commands.removeSectionAtSelection();
          },
          showWhen: (context) => {
            const { trigger, isInSectionNode } = context;
            return trigger === TRIGGERS.click && isInSectionNode;
          },
        },
      ],
    },
    {
      id: 'general',
      isDefault: true,
      items: [
        {
          id: 'insert-link',
          label: TEXTS.insertLink,
          icon: ICONS.link,
          component: LinkInput,
          isDefault: true,
          showWhen: (context) => {
            const { trigger } = context;
            return trigger === TRIGGERS.click;
          },
        },
        {
          id: 'insert-table',
          label: TEXTS.insertTable,
          icon: ICONS.table,
          component: TableGrid,
          isDefault: true,
          showWhen: (context) => {
            const { trigger, isInTable } = context;
            const allowedTriggers = [TRIGGERS.slash, TRIGGERS.click];
            return allowedTriggers.includes(trigger) && !isInTable;
          },
        },
        {
          id: 'edit-table',
          label: TEXTS.editTable,
          icon: ICONS.table,
          component: TableActions,
          isDefault: true,
          showWhen: (context) => {
            const { trigger, isInTable } = context;
            const allowedTriggers = [TRIGGERS.slash, TRIGGERS.click];
            return allowedTriggers.includes(trigger) && isInTable;
          },
        },
      ],
    },
    {
      id: 'clipboard',
      isDefault: true,
      items: [
        {
          id: 'cut',
          label: TEXTS.cut,
          icon: ICONS.cut,
          isDefault: true,
          action: (editor) => {
            editor.focus?.();
            document.execCommand('cut');
          },
          showWhen: (context) => {
            const { trigger, selectedText } = context;
            return trigger === TRIGGERS.click && selectedText;
          },
        },
        {
          id: 'copy',
          label: TEXTS.copy,
          icon: ICONS.copy,
          isDefault: true,
          action: (editor) => {
            editor.focus?.();
            document.execCommand('copy');
          },
          showWhen: (context) => {
            const { trigger, selectedText } = context;
            return trigger === TRIGGERS.click && selectedText;
          },
        },
        {
          id: 'paste',
          label: TEXTS.paste,
          icon: ICONS.paste,
          isDefault: true,
          action: async (editor) => {
            const { view } = editor ?? {};
            if (!view) return;
            view.dom.focus();
            const { html, text } = await readClipboardRaw();
            const handled = html ? handleClipboardPaste({ editor, view }, html) : false;
            if (!handled) {
              const pasteEvent = createPasteEventShim({ html, text });

              if (html && typeof view.pasteHTML === 'function') {
                view.pasteHTML(html, pasteEvent);
                return;
              }

              if (text && typeof view.pasteText === 'function') {
                view.pasteText(text, pasteEvent);
                return;
              }

              if (text && editor.commands?.insertContent) {
                editor.commands.insertContent(text, { contentType: 'text' });
              }
            }
          },
          showWhen: (context) => {
            const { trigger } = context;
            const allowedTriggers = [TRIGGERS.click, TRIGGERS.slash];
            return allowedTriggers.includes(trigger);
          },
        },
      ],
    },
  ];

  let allSections = [];

  if (includeDefaultItems) {
    allSections = [...defaultSections];
  }

  if (customItems.length > 0) {
    customItems.forEach((customSection) => {
      const existingSectionIndex = allSections.findIndex((section) => section.id === customSection.id);

      if (existingSectionIndex !== -1) {
        allSections[existingSectionIndex].items = [
          ...allSections[existingSectionIndex].items,
          ...customSection.items.map((item) => ({ ...item, isDefault: false })),
        ];
      } else {
        allSections.push({
          ...customSection,
          isDefault: false,
          items: customSection.items.map((item) => ({ ...item, isDefault: false })),
        });
      }
    });
  }

  // Apply menuProvider if present - advanced use case
  if (menuConfig?.menuProvider) {
    try {
      allSections = menuConfig.menuProvider(enhancedContext, allSections) || allSections;
    } catch (error) {
      console.warn('[ContextMenu] menuProvider error:', error);
    }
  }

  const filteredSections = allSections
    .map((section) => {
      const filteredItems = section.items.filter((item) => shouldShowItem(item, enhancedContext));

      return {
        ...section,
        items: filteredItems,
      };
    })
    .filter((section) => section.items.length > 0);

  return filteredSections;
}
