import { PluginKey } from 'prosemirror-state';
import { Editor as SuperEditor } from '@core/Editor.js';
import { getStarterExtensions } from '@extensions/index.js';
import {
  pushHeaderFooterToYjs,
  isApplyingRemoteHeaderFooterChanges,
} from '@extensions/collaboration/collaboration-helpers.js';
import { applyStyleIsolationClass } from '@utils/styleIsolation.js';
import { isHeadless } from '@utils/headless-helpers.js';

export const PaginationPluginKey = new PluginKey('paginationPlugin');

/**
 * Initialize the pagination data for the editor
 * This will fetch the header and footer data from the converter and calculate their height
 * @param {SuperEditor} editor The editor instance
 * @returns {Object} The data for the headers and footers
 */
export const initPaginationData = async (editor) => {
  if (isHeadless(editor) || !editor.converter) return;

  const sectionData = { headers: {}, footers: {} };
  const headerIds = editor.converter.headerIds.ids;
  const footerIds = editor.converter.footerIds.ids;

  for (let key in headerIds) {
    const sectionId = headerIds[key];
    if (!sectionId) continue;

    const dataForThisSection = editor.converter.headers[sectionId];
    if (!sectionData.headers[sectionId]) sectionData.headers[sectionId] = {};
    sectionData.headers[sectionId].data = dataForThisSection;
    // Wait for the height to be resolved
    const { height, sectionEditor, sectionContainer } = await getSectionHeight(editor, dataForThisSection);
    sectionData.headers[sectionId].height = height;
    sectionData.headers[sectionId].sectionEditor = sectionEditor;
    sectionData.headers[sectionId].sectionContainer = sectionContainer;
  }

  for (let key in footerIds) {
    const sectionId = footerIds[key];
    if (!sectionId) continue;

    const dataForThisSection = editor.converter.footers[sectionId];
    if (!sectionData.headers[sectionId]) sectionData.footers[sectionId] = {};
    sectionData.footers[sectionId].data = dataForThisSection;
    // Wait for the height to be resolved
    const { height, sectionEditor, sectionContainer } = await getSectionHeight(editor, dataForThisSection);
    sectionData.footers[sectionId].height = height;
    sectionData.footers[sectionId].sectionEditor = sectionEditor;
    sectionData.footers[sectionId].sectionContainer = sectionContainer;
  }

  return sectionData;
};

/**
 * Get the height of a section
 * @param {SuperEditor} editor The editor instance
 * @param {Object} data The data for the section
 * @returns {Promise<Object>} An object containing the height of the section, the section editor and the section container
 */
const getSectionHeight = async (editor, data) => {
  if (!data) return {};

  return new Promise((resolve) => {
    const editorContainer = document.createElement('div');
    editorContainer.className = 'super-editor';
    applyStyleIsolationClass(editorContainer);
    editorContainer.style.padding = '0';
    editorContainer.style.margin = '0';

    const sectionEditor = createHeaderFooterEditor({ editor, data, editorContainer });

    sectionEditor.on('create', () => {
      sectionEditor.setEditable(false, false);
      requestAnimationFrame(() => {
        const height = editorContainer.offsetHeight;
        document.body.removeChild(editorContainer);
        resolve({ height, sectionEditor, sectionContainer: editorContainer });
      });
    });
  });
};

/**
 * Creates a header or footer editor instance.
 *
 * This function creates a ProseMirror editor configured for header/footer editing
 * with proper styling, dimensions, and page number context.
 *
 * @param {Object} params - Configuration parameters
 * @param {Editor} params.editor - The parent editor instance. Required.
 * @param {Object} params.data - The ProseMirror document data for the header/footer. Required.
 * @param {HTMLElement} params.editorContainer - The container element to mount the editor. Required.
 * @param {HTMLElement} [params.editorHost] - The host element for the editor (optional, for sibling architecture).
 * @param {string} [params.sectionId] - The section relationship ID for tracking.
 * @param {('header'|'footer')} [params.type] - The type of section being edited.
 * @param {number} [params.availableWidth] - The width of the editing region in pixels. Must be positive.
 * @param {number} [params.availableHeight] - The height of the editing region in pixels. Must be positive.
 * @param {number} [params.currentPageNumber] - The current page number for PAGE field resolution. Must be a positive integer.
 * @param {number} [params.totalPageCount] - The total page count for NUMPAGES field resolution. Must be a positive integer.
 * @returns {Editor} The created header/footer editor instance
 *
 * @throws {TypeError} If required parameters are missing or have invalid types
 * @throws {RangeError} If numeric parameters are out of valid range
 */
export const createHeaderFooterEditor = ({
  editor,
  data,
  editorContainer,
  editorHost,
  sectionId,
  type,
  availableWidth,
  availableHeight,
  currentPageNumber,
  totalPageCount,
}) => {
  // Validate required parameters
  if (!editor) {
    throw new TypeError('editor parameter is required');
  }
  if (!data) {
    throw new TypeError('data parameter is required');
  }
  if (!editorContainer) {
    throw new TypeError('editorContainer parameter is required');
  }

  // Type-check editorContainer as HTMLElement
  if (!(editorContainer instanceof HTMLElement)) {
    throw new TypeError('editorContainer must be an HTMLElement');
  }

  // Type-check editorHost if provided
  if (editorHost !== undefined && !(editorHost instanceof HTMLElement)) {
    throw new TypeError('editorHost must be an HTMLElement or undefined');
  }

  // Range-check numeric parameters
  if (availableWidth !== undefined) {
    if (typeof availableWidth !== 'number' || !Number.isFinite(availableWidth) || availableWidth <= 0) {
      throw new RangeError('availableWidth must be a positive number');
    }
  }

  if (availableHeight !== undefined) {
    if (typeof availableHeight !== 'number' || !Number.isFinite(availableHeight) || availableHeight <= 0) {
      throw new RangeError('availableHeight must be a positive number');
    }
  }

  if (currentPageNumber !== undefined) {
    if (typeof currentPageNumber !== 'number' || !Number.isInteger(currentPageNumber) || currentPageNumber < 1) {
      throw new RangeError('currentPageNumber must be a positive integer');
    }
  }

  if (totalPageCount !== undefined) {
    if (typeof totalPageCount !== 'number' || !Number.isInteger(totalPageCount) || totalPageCount < 1) {
      throw new RangeError('totalPageCount must be a positive integer');
    }
  }

  const parentStyles = editor.converter.getDocumentDefaultStyles();
  const { fontSizePt, typeface, fontFamilyCss } = parentStyles;
  const fontSizeInPixles = fontSizePt * 1.3333;
  const lineHeight = fontSizeInPixles * 1.2;

  applyStyleIsolationClass(editorContainer);

  const isFooter = type === 'footer';

  Object.assign(editorContainer.style, {
    padding: '0',
    margin: '0',
    border: 'none',
    boxSizing: 'border-box',
    position: 'absolute',
    top: '0',
    left: '0',
    width: availableWidth ? `${availableWidth}px` : '100%',
    height: availableHeight ? `${availableHeight}px` : 'auto',
    maxWidth: 'none',
    fontFamily: fontFamilyCss || typeface,
    fontSize: `${fontSizeInPixles}px`,
    lineHeight: `${lineHeight}px`,
    overflow: isFooter ? 'visible' : 'hidden',
    pointerEvents: 'auto', // Critical: enables click interaction
    backgroundColor: 'white', // Ensure editor has white background
  });

  // Append to editor host (sibling container) instead of document.body
  if (editorHost) {
    editorHost.appendChild(editorContainer);
  } else {
    // Fallback to body for backward compatibility (should not happen in new code)
    console.warn('[createHeaderFooterEditor] No editorHost provided, falling back to document.body');
    document.body.appendChild(editorContainer);
  }

  const headerFooterEditor = new SuperEditor({
    role: editor.options.role,
    loadFromSchema: true,
    mode: 'docx',
    element: editorContainer,
    content: data,
    extensions: getStarterExtensions(),
    documentId: sectionId || 'sectionId',
    media: editor.storage.image.media,
    mediaFiles: editor.storage.image.media,
    fonts: editor.options.fonts,
    isHeaderOrFooter: true, // This flag prevents pagination from being enabled
    isHeadless: editor.options.isHeadless,
    pagination: false, // Explicitly disable pagination
    annotations: true,
    currentPageNumber: currentPageNumber ?? 1,
    totalPageCount: totalPageCount ?? 1,
    // Don't set parentEditor to avoid circular reference issues
    // parentEditor: editor,
    // IMPORTANT: Start with editable: false to prevent triggering update cascades during creation.
    // PresentationEditor#enterHeaderFooterMode will call setEditable(true) when entering edit mode.
    editable: false,
    documentMode: 'viewing',
    onCreate: (evt) => setEditorToolbar(evt, editor),
    onBlur: (evt) => onHeaderFooterDataUpdate(evt, editor, sectionId, type),
  });

  // Store parent editor reference separately to avoid circular reference in options
  // This allows access when needed without creating serialization issues
  Object.defineProperty(headerFooterEditor.options, 'parentEditor', {
    enumerable: false, // Don't include in serialization
    configurable: true,
    get() {
      return editor;
    },
  });
  headerFooterEditor.setEditable(false, false);

  const pm = editorContainer.querySelector('.ProseMirror');
  if (pm) {
    pm.style.maxHeight = '100%';
    pm.style.minHeight = '100%';
    pm.style.outline = 'none';
    pm.style.border = 'none';

    pm.setAttribute('role', 'textbox');
    pm.setAttribute('aria-multiline', true);
    pm.setAttribute('aria-label', `${type} content area. Double click to start typing.`);
  }

  return headerFooterEditor;
};

export const broadcastEditorEvents = (editor, sectionEditor) => {
  const eventNames = [
    'fieldAnnotationDropped',
    'fieldAnnotationPaste',
    'fieldAnnotationSelected',
    'fieldAnnotationClicked',
    'fieldAnnotationDoubleClicked',
    'fieldAnnotationDeleted',
  ];
  eventNames.forEach((eventName) => {
    sectionEditor.on(eventName, (...args) => {
      editor.emit(eventName, ...args);
      console.debug('broadcastEditorEvents', { eventName, args });
    });
  });
};

export const toggleHeaderFooterEditMode = ({ editor, focusedSectionEditor, isEditMode, documentMode }) => {
  if (isHeadless(editor)) return;

  editor.converter.headerEditors.forEach((item) => {
    item.editor.setEditable(isEditMode, false);
    item.editor.view.dom.setAttribute('aria-readonly', !isEditMode);
    item.editor.view.dom.setAttribute('documentmode', documentMode);
  });

  editor.converter.footerEditors.forEach((item) => {
    item.editor.setEditable(isEditMode, false);
    item.editor.view.dom.setAttribute('aria-readonly', !isEditMode);
    item.editor.view.dom.setAttribute('documentmode', documentMode);
  });

  if (isEditMode) {
    const pm = editor.view?.dom || editor.options.element?.querySelector?.('.ProseMirror');
    if (pm) {
      pm.classList.add('header-footer-edit');
      pm.setAttribute('aria-readonly', true);
    }
  }

  if (focusedSectionEditor) {
    focusedSectionEditor.view.focus();
  }
};

/**
 * Handle header/footer data updates.
 * Updates converter storage and syncs JSON to Yjs for real-time collaboration.
 * Note: Does NOT call updateYdocDocxData - that is handled by the debounced
 * main document listener to avoid excessive full DOCX broadcasts.
 */
export const onHeaderFooterDataUpdate = ({ editor, transaction }, mainEditor, sectionId, type) => {
  if (!type || !sectionId) return;

  // Skip if we're currently applying remote changes to prevent ping-pong loop
  if (isApplyingRemoteHeaderFooterChanges()) {
    return;
  }

  const updatedData = editor.getUpdatedJson();
  const editorsList = mainEditor.converter[`${type}Editors`];
  if (Array.isArray(editorsList)) {
    editorsList.forEach((item) => {
      if (item.id === sectionId) {
        item.editor.setOptions({
          media: editor.options.media,
          mediaFiles: editor.options.mediaFiles,
        });
        // Only replaceContent on OTHER editors, not the one that triggered this update
        // Otherwise we get an infinite loop: replaceContent -> update event -> onHeaderFooterDataUpdate -> replaceContent
        if (item.editor !== editor) {
          item.editor.replaceContent(updatedData);
        }
      }
      item.editor.setOptions({
        lastSelection: transaction?.selection,
      });
    });
  }
  mainEditor.converter[`${type}s`][sectionId] = updatedData;
  mainEditor.setOptions({ isHeaderFooterChanged: editor.docChanged });
  if (editor.docChanged && mainEditor.converter) {
    mainEditor.converter.headerFooterModified = true;
  }

  // Push header/footer JSON to Yjs for real-time sync with collaborators
  // This is lightweight (~1KB) and provides immediate visual sync
  pushHeaderFooterToYjs(mainEditor, type, sectionId, updatedData);

  // NOTE: We intentionally do NOT call updateYdocDocxData here.
  // The full DOCX sync is handled by the debounced main document listener
  // which will pick up header/footer changes via the Y.Doc afterTransaction event.
  // This prevents the ~80KB broadcast on every keystroke.
};

const setEditorToolbar = ({ editor }, mainEditor) => {
  editor.setToolbar(mainEditor.toolbar);
};
