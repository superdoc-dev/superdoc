import type { Editor } from './Editor.js';
import type { EditorOptions } from './types/EditorConfig.js';
import type { PresentationEditor } from './presentation-editor/index.js';

/**
 * Options for creating a story editor (header, footer, footnote, endnote, etc.).
 */
export interface StoryEditorOptions {
  /**
   * Unique identifier for the story (e.g. section relationship ID).
   * Falls back to 'story' if not provided.
   */
  documentId?: string;

  /**
   * Whether this story is a header or footer.
   * When true, the editor sets `isHeaderOrFooter` which disables pagination
   * and enables page-number field resolution.
   * @default true
   */
  isHeaderOrFooter?: boolean;

  /**
   * Force headless mode regardless of the parent editor's setting.
   * When true, the editor is created without a DOM view.
   * Defaults to the parent editor's `isHeadless` value.
   */
  headless?: boolean;

  /**
   * The current page number for PAGE field resolution.
   * Must be a positive integer.
   * @default 1
   */
  currentPageNumber?: number;

  /**
   * The current formatted PAGE field display text for section-aware story editors.
   */
  currentPageNumberText?: string;

  /**
   * The current numeric PAGE display value for field-local formatting.
   */
  currentPageDisplayNumber?: number;

  /**
   * The current PAGE chapter prefix for field-local formatting.
   */
  currentPageChapterNumberText?: string;

  /**
   * The current PAGE chapter separator for field-local formatting.
   */
  currentPageChapterSeparator?: 'hyphen' | 'period' | 'colon' | 'emDash' | 'enDash';

  /**
   * The total page count for NUMPAGES field resolution.
   * Must be a positive integer.
   * @default 1
   */
  totalPageCount?: number;

  /**
   * The current section's physical page count for SECTIONPAGES field resolution.
   * Must be a positive integer.
   * @default 1
   */
  sectionPageCount?: number;

  /**
   * The container element to mount the editor into.
   * Required for non-headless mode; ignored when headless.
   */
  element?: HTMLElement | null;

  /**
   * Extra EditorOptions to merge into the story editor.
   * These are applied last and can override any computed defaults.
   */
  editorOptions?: Partial<EditorOptions>;
}

/**
 * Creates a lightweight "story" editor linked to a parent editor.
 *
 * A story editor is a secondary ProseMirror editor used to render and edit
 * sub-documents such as headers, footers, footnotes, and endnotes. It shares
 * the parent editor's schema, media, fonts, and list numbering context, but
 * runs with pagination, collaboration, comments, and tracked changes disabled.
 *
 * This factory handles only the core editor construction. It does NOT handle:
 * - DOM layout, styling, or positioning
 * - Event binding (onCreate, onBlur, toolbar wiring)
 * - Container element creation or appending to a host
 *
 * Those UI concerns are left to the caller (e.g. `createHeaderFooterEditor`
 * in pagination-helpers.js for PresentationEditor sessions).
 *
 * @param parentEditor - The parent editor whose schema, media, fonts, and
 *   numbering context should be inherited.
 * @param content - PM JSON content to load into the story editor.
 * @param options - Optional configuration for the story editor.
 * @returns A new Editor instance configured as a story sub-editor.
 *
 * @throws {TypeError} If parentEditor or content is missing.
 *
 * @example
 * ```ts
 * // Headless usage (document-api / tests)
 * const editor = createStoryEditor(parentEditor, headerJson, {
 *   documentId: 'rId7',
 *   headless: true,
 * });
 *
 * // UI usage (via pagination-helpers wrapper)
 * const editor = createStoryEditor(parentEditor, footerJson, {
 *   documentId: sectionId,
 *   element: editorContainer,
 *   editorOptions: {
 *     onCreate: (evt) => handleCreate(evt),
 *     onBlur: (evt) => handleBlur(evt),
 *   },
 * });
 * ```
 */
export function createStoryEditor(
  parentEditor: Editor,
  content: Record<string, unknown>,
  options: StoryEditorOptions = {},
): Editor {
  if (!parentEditor) {
    throw new TypeError('parentEditor is required');
  }
  if (!content) {
    throw new TypeError('content is required');
  }

  const {
    documentId = 'story',
    isHeaderOrFooter = true,
    headless,
    currentPageNumber = 1,
    currentPageNumberText,
    currentPageDisplayNumber,
    currentPageChapterNumberText,
    currentPageChapterSeparator,
    totalPageCount = 1,
    sectionPageCount,
    element = null,
    editorOptions = {},
  } = options;

  // Resolve headless: explicit option > parent setting
  const isHeadless = headless ?? parentEditor.options.isHeadless ?? false;

  // Inherit media from the parent's image storage (canonical source).
  // Extension storage is typed as Record<string, unknown>, so we cast
  // through the image extension's storage shape.
  const imageStorage = parentEditor.storage?.image as { media?: Record<string, unknown> } | undefined;
  const media = imageStorage?.media ?? parentEditor.options.media ?? {};
  const inheritedExtensions = parentEditor.options.extensions?.length
    ? [...parentEditor.options.extensions]
    : undefined;
  const inheritedTrackedChanges = parentEditor.options.trackedChanges
    ? { ...parentEditor.options.trackedChanges }
    : undefined;
  const StoryEditorClass = parentEditor.constructor as new (options: Partial<EditorOptions>) => Editor;

  const storyEditor = new StoryEditorClass({
    role: parentEditor.options.role,
    loadFromSchema: true,
    mode: 'docx',
    content,
    // Reuse the parent's extension definitions instead of importing the
    // starter bundle here, which keeps story-runtime resolution from
    // eagerly pulling the full UI extension graph into headless callers.
    extensions: inheritedExtensions,
    documentId,
    media,
    mediaFiles: media,
    fonts: parentEditor.options.fonts,
    user: parentEditor.options.user,
    trackedChanges: inheritedTrackedChanges,
    isHeaderOrFooter,
    isHeadless,
    pagination: false,
    annotations: true,
    currentPageNumber,
    currentPageNumberText,
    currentPageDisplayNumber,
    currentPageChapterNumberText,
    currentPageChapterSeparator,
    totalPageCount,
    sectionPageCount,
    editable: false,
    documentMode: 'viewing',

    // Only set element when not headless
    ...(isHeadless ? {} : { element }),

    // Disable collaboration and comment threading for story editors.
    // Tracked-change configuration is inherited from the parent editor so
    // suggesting-mode story sessions honor the same replacement model.
    ydoc: null,
    collaborationProvider: null,
    isCommentsEnabled: false,
    fragment: null,

    // Caller-provided overrides (e.g. onCreate, onBlur)
    ...editorOptions,

    // Document opens are tracked by the parent editor. Force off after
    // caller overrides so sub-editors never emit telemetry.
    telemetry: { enabled: false },
  } as Partial<EditorOptions>);

  const inheritedPresentationEditor =
    parentEditor.presentationEditor ??
    (parentEditor as Editor & { _presentationEditor?: PresentationEditor | null })._presentationEditor ??
    null;
  if (inheritedPresentationEditor) {
    storyEditor.presentationEditor = inheritedPresentationEditor;
    (storyEditor as Editor & { _presentationEditor?: PresentationEditor | null })._presentationEditor =
      inheritedPresentationEditor;
  }

  // Store parent editor reference as a non-enumerable property to avoid
  // circular reference issues during serialization while still allowing
  // access when needed.
  if (storyEditor.options && typeof storyEditor.options === 'object') {
    Object.defineProperty(storyEditor.options, 'parentEditor', {
      enumerable: false,
      configurable: true,
      get() {
        return parentEditor;
      },
    });
  }

  // Start non-editable; the caller (e.g. PresentationEditor) will enable
  // editing when entering edit mode.
  if (typeof storyEditor.setEditable === 'function') {
    storyEditor.setEditable(false, false);
  }

  return storyEditor;
}
