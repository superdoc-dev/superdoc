import { toFlowBlocks } from '@superdoc/pm-adapter';
import { getAtomNodeTypes as getAtomNodeTypesFromSchema } from '../presentation-editor/utils/SchemaNodeTypes.js';
import type { FlowBlock } from '@superdoc/contracts';
import type { HeaderFooterBatch } from '@superdoc/layout-bridge';
import type { Editor } from '@core/Editor.js';
import { EventEmitter } from '@core/EventEmitter.js';
import { createHeaderFooterEditor, onHeaderFooterDataUpdate } from '@extensions/pagination/pagination-helpers.js';
import type { ConverterContext } from '@superdoc/pm-adapter/converter-context.js';

const HEADER_FOOTER_VARIANTS = ['default', 'first', 'even', 'odd'] as const;
const DEFAULT_HEADER_FOOTER_HEIGHT = 100;
const EDITOR_READY_TIMEOUT_MS = 5000;
const MAX_CACHED_EDITORS_LIMIT = 100;

type MinimalConverterContext = {
  docx?: Record<string, unknown>;
  numbering?: {
    definitions?: Record<string, unknown>;
    abstracts?: Record<string, unknown>;
  };
  linkedStyles?: Array<{
    id: string;
    definition?: {
      styles?: Record<string, unknown>;
      attrs?: Record<string, unknown>;
    };
  }>;
};

/**
 * Extended Editor interface that includes the converter property.
 * Used for type-safe access to header/footer data stored in the converter.
 */
interface EditorWithConverter extends Editor {
  converter: HeaderFooterCollections;
}

export type HeaderFooterKind = 'header' | 'footer';
export type HeaderFooterVariant = (typeof HEADER_FOOTER_VARIANTS)[number];

/**
 * Descriptor identifying a unique header or footer section in a document.
 *
 * Each descriptor combines a relationship ID (from DOCX structure), a kind
 * (header/footer), and an optional variant (default/first/even/odd) to
 * uniquely identify a section for editing and layout.
 *
 * @property id - Relationship ID from DOCX structure (e.g., "rId-header-default")
 * @property kind - Section type: 'header' or 'footer'
 * @property variant - Optional page variant: 'default', 'first', 'even', or 'odd'
 */
export type HeaderFooterDescriptor = {
  id: string;
  kind: HeaderFooterKind;
  variant?: HeaderFooterVariant;
};

/**
 * Structure representing header/footer data stored in the converter.
 * Contains the JSON document content and relationship IDs for each variant.
 */
type HeaderFooterCollections = {
  headers?: Record<string, unknown>;
  footers?: Record<string, unknown>;
  headerIds?: Record<string, string | string[] | boolean | null | undefined>;
  footerIds?: Record<string, string | string[] | boolean | null | undefined>;
};

/**
 * Structure representing a header/footer document in JSON format.
 * This is the ProseMirror document structure for a header or footer section.
 */
export interface HeaderFooterDocument {
  type: string;
  content?: unknown[];
  [key: string]: unknown;
}

type HeaderFooterLayoutCacheEntry = {
  docRef: unknown;
  blocks: FlowBlock[];
};

type HeaderFooterEditorEntry = {
  descriptor: HeaderFooterDescriptor;
  editor: Editor;
  container: HTMLElement;
  disposer: () => void;
  ready: Promise<void>;
};

type ContentChangedPayload = {
  descriptor: HeaderFooterDescriptor;
};

type SyncErrorPayload = {
  descriptor: HeaderFooterDescriptor;
  error: unknown;
};

type ErrorPayload = {
  descriptor: HeaderFooterDescriptor;
  error: unknown;
};

/**
 * Event types emitted by HeaderFooterEditorManager.
 */
type _HeaderFooterManagerEvents = {
  contentChanged: ContentChangedPayload;
  syncError: SyncErrorPayload;
  error: ErrorPayload;
};

type _ConverterEditorEntry = {
  id: string;
  editor: Editor;
};

export type HeaderFooterCacheStats = {
  /** Total number of cached editors */
  cachedEditors: number;
  /** Maximum cache size limit */
  maxCachedEditors: number;
  /** Number of times ensureEditor returned a cached editor */
  cacheHits: number;
  /** Number of times ensureEditor created a new editor */
  cacheMisses: number;
  /** Number of editors evicted due to LRU policy */
  evictions: number;
  /** Cache hit rate (0-1), or 0 if no accesses yet */
  hitRate: number;
};

export class HeaderFooterEditorManager extends EventEmitter {
  #editor: Editor;
  #descriptors: Map<string, HeaderFooterDescriptor> = new Map();
  #collections: HeaderFooterCollections | null = null;
  #editorEntries: Map<string, HeaderFooterEditorEntry> = new Map();
  #maxCachedEditors = 10;
  #editorAccessOrder: string[] = [];
  #pendingCreations: Map<string, Promise<Editor | null>> = new Map();
  #cacheHits = 0;
  #cacheMisses = 0;
  #evictions = 0;

  /**
   * Creates a new HeaderFooterEditorManager for managing header and footer editors.
   *
   * Note: This constructor has a side effect - it calls refresh() to immediately
   * scan the root editor's converter for header/footer data and build the initial
   * descriptor registry.
   *
   * @param editor - The root editor instance containing the converter with header/footer data
   */
  constructor(editor: Editor) {
    super();
    this.#editor = editor;
    this.refresh();
  }

  /**
   * Type guard to check if an editor has a converter property.
   *
   * @param editor - The editor instance to check
   * @returns True if the editor has a converter property
   */
  #hasConverter(editor: Editor): editor is EditorWithConverter {
    return 'converter' in editor && editor.converter !== undefined && editor.converter !== null;
  }

  /**
   * Refreshes the internal header/footer descriptor registry by re-scanning
   * the root editor's converter data.
   *
   * This method should be called when the document structure changes in a way
   * that adds or removes header/footer sections (e.g., after document conversion,
   * section additions/deletions, or page setup changes).
   *
   * Side effects:
   * - Re-extracts collections from the converter
   * - Rebuilds the descriptor map
   * - Tears down editors for sections that no longer exist
   *
   * @throws Never throws - errors during editor teardown are caught and logged
   */
  refresh(): void {
    this.#collections = this.#extractCollections();
    const nextDescriptors = this.#collectDescriptors(this.#collections);
    this.#teardownMissingEditors(nextDescriptors);
    this.#descriptors = nextDescriptors;
  }

  /**
   * Destroys all managed header/footer editors and cleans up resources.
   * After calling destroy(), the manager should not be used.
   *
   * @throws May throw if individual editor cleanup fails, but continues cleanup
   */
  destroy() {
    this.#descriptors.clear();
    this.#collections = null;
    this.#teardownEditors();
    this.removeAllListeners();
  }

  /**
   * Ensures an editor instance exists for the given descriptor.
   *
   * If an editor already exists, it will be marked as recently used and returned.
   * Otherwise, a new editor is created, cached, and tracked in the LRU access order.
   * When the cache exceeds its size limit, the least recently used editor is evicted.
   *
   * Handles concurrent calls for the same descriptor by tracking pending creations
   * and returning the same promise to all callers.
   *
   * @param descriptor - The header or footer descriptor. Must have a valid id property.
   * @param options - Optional configuration for editor creation
   * @param options.editorHost - The HTMLElement to mount the editor in. If provided, must be a valid HTMLElement.
   * @param options.availableWidth - The width of the editing region in pixels. Must be a positive number if provided.
   * @param options.availableHeight - The height of the editing region in pixels. Must be a positive number if provided.
   * @param options.currentPageNumber - The current page number for PAGE field resolution. Must be a positive integer if provided.
   * @param options.totalPageCount - The total page count for NUMPAGES field resolution. Must be a positive integer if provided.
   * @returns The editor instance, or null if creation failed
   *
   * @throws Never throws - errors are logged and emitted as events. Invalid parameters return null with error logged.
   */
  async ensureEditor(
    descriptor: HeaderFooterDescriptor,
    options?: {
      editorHost?: HTMLElement;
      availableWidth?: number;
      availableHeight?: number;
      currentPageNumber?: number;
      totalPageCount?: number;
    },
  ): Promise<Editor | null> {
    if (!descriptor?.id) return null;

    // Validate options if provided
    if (options) {
      // Validate editorHost type
      if (options.editorHost !== undefined && !(options.editorHost instanceof HTMLElement)) {
        console.error('[HeaderFooterEditorManager] editorHost must be an HTMLElement');
        this.emit('error', {
          descriptor,
          error: new TypeError('editorHost must be an HTMLElement'),
        });
        return null;
      }

      // Validate numeric parameters
      if (options.availableWidth !== undefined) {
        if (
          typeof options.availableWidth !== 'number' ||
          !Number.isFinite(options.availableWidth) ||
          options.availableWidth <= 0
        ) {
          console.error('[HeaderFooterEditorManager] availableWidth must be a positive number');
          this.emit('error', {
            descriptor,
            error: new TypeError('availableWidth must be a positive number'),
          });
          return null;
        }
      }

      if (options.availableHeight !== undefined) {
        if (
          typeof options.availableHeight !== 'number' ||
          !Number.isFinite(options.availableHeight) ||
          options.availableHeight <= 0
        ) {
          console.error('[HeaderFooterEditorManager] availableHeight must be a positive number');
          this.emit('error', {
            descriptor,
            error: new TypeError('availableHeight must be a positive number'),
          });
          return null;
        }
      }

      if (options.currentPageNumber !== undefined) {
        if (
          typeof options.currentPageNumber !== 'number' ||
          !Number.isInteger(options.currentPageNumber) ||
          options.currentPageNumber < 1
        ) {
          console.error('[HeaderFooterEditorManager] currentPageNumber must be a positive integer');
          this.emit('error', {
            descriptor,
            error: new TypeError('currentPageNumber must be a positive integer'),
          });
          return null;
        }
      }

      if (options.totalPageCount !== undefined) {
        if (
          typeof options.totalPageCount !== 'number' ||
          !Number.isInteger(options.totalPageCount) ||
          options.totalPageCount < 1
        ) {
          console.error('[HeaderFooterEditorManager] totalPageCount must be a positive integer');
          this.emit('error', {
            descriptor,
            error: new TypeError('totalPageCount must be a positive integer'),
          });
          return null;
        }
      }
    }

    const existing = this.#editorEntries.get(descriptor.id);
    if (existing) {
      // Cache hit - editor already exists
      this.#cacheHits += 1;

      // Track access order for LRU eviction
      this.#updateAccessOrder(descriptor.id);

      await existing.ready.catch((error) => {
        console.error('[HeaderFooterEditorManager] Editor initialization failed:', error);
        this.emit('error', { descriptor, error });
      });

      // Move editor container to the new editorHost if provided
      // This is necessary because cached editors may have been appended elsewhere
      if (existing.container && options?.editorHost) {
        // Only move if not already in the target host
        if (existing.container.parentElement !== options.editorHost) {
          options.editorHost.appendChild(existing.container);
        }
      }

      // Update editor options if provided
      if (existing.editor && options) {
        const updateOptions: Record<string, unknown> = {};
        if (options.currentPageNumber !== undefined) {
          updateOptions.currentPageNumber = options.currentPageNumber;
        }
        if (options.totalPageCount !== undefined) {
          updateOptions.totalPageCount = options.totalPageCount;
        }
        if (options.availableWidth !== undefined) {
          updateOptions.availableWidth = options.availableWidth;
        }
        if (options.availableHeight !== undefined) {
          updateOptions.availableHeight = options.availableHeight;
        }
        if (Object.keys(updateOptions).length > 0) {
          existing.editor.setOptions(updateOptions);
        }
      }

      return existing.editor;
    }

    // Check if creation is already in progress for this descriptor
    const pending = this.#pendingCreations.get(descriptor.id);
    if (pending) {
      // Don't count as cache miss - creation already in progress
      return pending;
    }

    // Cache miss - need to create new editor
    this.#cacheMisses += 1;

    // Start creation and track the promise
    const creationPromise = (async () => {
      try {
        const entry = await this.#createEditor(descriptor, options);
        if (!entry) return null;

        this.#editorEntries.set(descriptor.id, entry);

        // Track access order for LRU eviction
        this.#updateAccessOrder(descriptor.id);

        // Enforce cache size limit by evicting least recently used
        this.#enforceCacheSizeLimit();

        await entry.ready.catch((error) => {
          console.error('[HeaderFooterEditorManager] Editor initialization failed:', error);
          this.emit('error', { descriptor, error });
        });
        return entry.editor;
      } finally {
        // Remove from pending map once creation is complete
        this.#pendingCreations.delete(descriptor.id);
      }
    })();

    this.#pendingCreations.set(descriptor.id, creationPromise);
    return creationPromise;
  }

  /**
   * Retrieves the editor instance for a given header/footer descriptor,
   * if one has been created.
   *
   * This method only returns already-created editors. To ensure an editor
   * exists (creating it if necessary), use ensureEditor() instead.
   *
   * @param descriptor - The header or footer descriptor
   * @returns The editor instance if it exists, null otherwise
   *
   * @example
   * ```typescript
   * const descriptor = manager.getDescriptorById('rId-header-default');
   * const editor = manager.getEditor(descriptor);
   * if (editor) {
   *   // Editor exists, can be used immediately
   * }
   * ```
   */
  getEditor(descriptor: HeaderFooterDescriptor): Editor | null {
    if (!descriptor?.id) return null;
    return this.#editorEntries.get(descriptor.id)?.editor ?? null;
  }

  /**
   * Returns all header/footer descriptors, optionally filtered by kind.
   *
   * @param kind - Optional filter: 'header' or 'footer'. If omitted, returns all descriptors.
   * @returns Array of descriptors matching the filter criteria
   *
   * @example
   * ```typescript
   * // Get all descriptors
   * const all = manager.getDescriptors();
   *
   * // Get only headers
   * const headers = manager.getDescriptors('header');
   *
   * // Get only footers
   * const footers = manager.getDescriptors('footer');
   * ```
   */
  getDescriptors(kind?: HeaderFooterKind): HeaderFooterDescriptor[] {
    const entries = Array.from(this.#descriptors.values());
    if (!kind) return entries;
    return entries.filter((descriptor) => descriptor.kind === kind);
  }

  /**
   * Retrieves a header/footer descriptor by its relationship ID.
   *
   * @param id - The relationship ID (e.g., 'rId-header-default')
   * @returns The descriptor if found, undefined otherwise
   *
   * @example
   * ```typescript
   * const descriptor = manager.getDescriptorById('rId-header-default');
   * if (descriptor) {
   *   console.log(`Found ${descriptor.kind} with variant ${descriptor.variant}`);
   * }
   * ```
   */
  getDescriptorById(id: string): HeaderFooterDescriptor | undefined {
    return this.#descriptors.get(id);
  }

  /**
   * Retrieves the ProseMirror document JSON for a header/footer section.
   *
   * This method first attempts to get the live document from an active editor
   * (if one exists). If that fails or no editor exists, it falls back to the
   * converter's snapshot of the document.
   *
   * @param descriptor - The header or footer descriptor
   * @returns The document JSON structure, or null if not found
   *
   * @example
   * ```typescript
   * const descriptor = manager.getDescriptorById('rId-header-default');
   * const json = manager.getDocumentJson(descriptor);
   * if (json) {
   *   // Process the ProseMirror document structure
   * }
   * ```
   */
  getDocumentJson(descriptor: HeaderFooterDescriptor): HeaderFooterDocument | null {
    if (!descriptor?.id) {
      return null;
    }
    const liveEntry = this.#editorEntries.get(descriptor.id);
    if (liveEntry) {
      try {
        return liveEntry.editor.getJSON?.() as HeaderFooterDocument | null;
      } catch {
        // fallback to converter snapshot
      }
    }
    const collections = this.#collections;
    if (!collections) {
      return null;
    }
    if (descriptor.kind === 'header') {
      return (collections.headers?.[descriptor.id] as HeaderFooterDocument) ?? null;
    }
    return (collections.footers?.[descriptor.id] as HeaderFooterDocument) ?? null;
  }

  /**
   * Returns the root editor instance that this manager was created with.
   *
   * @returns The root editor containing the main document
   */
  get rootEditor(): Editor {
    return this.#editor;
  }

  /**
   * Returns the relationship ID associated with the requested Word header/footer variant.
   *
   * @param kind - The header or footer kind
   * @param variant - The page variant (default, first, even, or odd)
   * @returns The relationship ID if found, null otherwise
   */
  getVariantId(kind: HeaderFooterKind, variant: HeaderFooterVariant): string | null {
    const collections = this.#collections;
    if (!collections) return null;
    const source = kind === 'header' ? collections.headerIds : collections.footerIds;
    const value = source?.[variant];
    if (typeof value === 'string') return value;
    return null;
  }

  /**
   * Extracts header/footer collections from the root editor's converter.
   * Uses type guard for safe access to converter property.
   *
   * @returns The collections object, or null if no converter exists
   */
  #extractCollections(): HeaderFooterCollections | null {
    if (!this.#hasConverter(this.#editor)) {
      return null;
    }
    const converter = this.#editor.converter;
    if (!converter) return null;
    return {
      headers: converter.headers,
      footers: converter.footers,
      headerIds: converter.headerIds,
      footerIds: converter.footerIds,
    };
  }

  /**
   * Collects all unique header/footer descriptors from the collections data.
   * Uses proper type guards to safely handle variant IDs and array IDs.
   *
   * @param collections - The header/footer collections data
   * @returns Map of relationship ID to descriptor
   */
  #collectDescriptors(collections: HeaderFooterCollections | null): Map<string, HeaderFooterDescriptor> {
    const descriptors = new Map<string, HeaderFooterDescriptor>();
    if (!collections) return descriptors;

    const register = (kind: HeaderFooterKind, rId: string | null | undefined, variant?: HeaderFooterVariant) => {
      // Type guard: only proceed if rId is a non-empty string
      if (typeof rId !== 'string' || rId.length === 0) return;

      const existing = descriptors.get(rId);
      if (existing) {
        if (variant && !existing.variant) {
          existing.variant = variant;
        }
        return;
      }
      descriptors.set(rId, { id: rId, kind, variant });
    };

    HEADER_FOOTER_VARIANTS.forEach((variant) => {
      const headerId = collections.headerIds?.[variant];
      const footerId = collections.footerIds?.[variant];

      // Type guard: ensure the value is a string before passing to register
      if (typeof headerId === 'string') {
        register('header', headerId, variant);
      }
      if (typeof footerId === 'string') {
        register('footer', footerId, variant);
      }
    });

    // Type guard: ensure ids is an array before processing
    const headerIdsArray = collections.headerIds?.ids;
    if (Array.isArray(headerIdsArray)) {
      headerIdsArray.forEach((rId) => {
        // Type guard: verify each element is a string
        if (typeof rId === 'string' && !descriptors.has(rId)) {
          register('header', rId);
        }
      });
    }

    const footerIdsArray = collections.footerIds?.ids;
    if (Array.isArray(footerIdsArray)) {
      footerIdsArray.forEach((rId) => {
        // Type guard: verify each element is a string
        if (typeof rId === 'string' && !descriptors.has(rId)) {
          register('footer', rId);
        }
      });
    }

    return descriptors;
  }

  #teardownMissingEditors(nextDescriptors: Map<string, HeaderFooterDescriptor>) {
    const toRemove: string[] = [];
    this.#editorEntries.forEach((entry, key) => {
      if (!nextDescriptors.has(key)) {
        try {
          entry.disposer();
        } catch (error) {
          console.warn('[HeaderFooterEditorManager] Cleanup failed for editor:', key, error);
        }
        toRemove.push(key);
      }
    });
    toRemove.forEach((key) => this.#editorEntries.delete(key));
  }

  #teardownEditors() {
    this.#editorEntries.forEach((entry) => {
      try {
        entry.disposer();
      } catch (error) {
        console.warn('[HeaderFooterEditorManager] Cleanup failed:', error);
      }
    });
    this.#editorEntries.clear();
  }

  async #createEditor(
    descriptor: HeaderFooterDescriptor,
    options?: {
      editorHost?: HTMLElement;
      availableWidth?: number;
      availableHeight?: number;
      currentPageNumber?: number;
      totalPageCount?: number;
    },
  ): Promise<HeaderFooterEditorEntry | null> {
    const json = this.getDocumentJson(descriptor);
    if (!json) return null;

    let editor: Editor;
    let container: HTMLElement;
    try {
      container = this.#createEditorContainer();
      editor = createHeaderFooterEditor({
        editor: this.#editor,
        data: json,
        editorContainer: container,
        editorHost: options?.editorHost,
        sectionId: descriptor.id,
        type: descriptor.kind,
        availableWidth: options?.availableWidth,
        availableHeight: options?.availableHeight ?? DEFAULT_HEADER_FOOTER_HEIGHT,
        currentPageNumber: options?.currentPageNumber ?? 1,
        totalPageCount: options?.totalPageCount ?? 1,
      }) as Editor;
    } catch (error) {
      console.error('[HeaderFooterEditorManager] Editor creation failed:', error);
      return null;
    }

    const handleUpdate = async ({ transaction }: { transaction?: unknown }) => {
      this.emit('contentChanged', { descriptor } as ContentChangedPayload);
      try {
        // Update the converter data structures with the latest content
        // Note: onHeaderFooterDataUpdate handles Yjs JSON sync (lightweight ~1KB)
        // but does NOT call updateYdocDocxData - that's handled by the debounced
        // main document listener to avoid ~80KB broadcasts on every keystroke
        onHeaderFooterDataUpdate({ editor, transaction }, this.#editor, descriptor.id, descriptor.kind);
      } catch (error) {
        console.error('[HeaderFooterEditorManager] Failed to sync header/footer update', { descriptor, error });
        // Emit error event so consumers can handle sync failures
        // This prevents silent failures and allows for retry logic or user notification
        this.emit('syncError', { descriptor, error });
      }
    };
    editor.on('update', handleUpdate);

    this.#registerConverterEditor(descriptor, editor);

    // Defensive disposer with comprehensive error handling to prevent resource leaks
    // Even if individual cleanup steps fail, we ensure all cleanup operations are attempted
    const disposer = () => {
      try {
        // Remove event listener to prevent memory leaks from accumulating handlers
        editor.off?.('update', handleUpdate);
      } catch (error) {
        console.warn('[HeaderFooterEditorManager] Failed to remove update listener:', error);
      }

      try {
        // Destroy the editor instance to free up resources
        editor.destroy?.();
      } catch (error) {
        console.warn('[HeaderFooterEditorManager] Failed to destroy editor:', error);
      }

      try {
        // Remove DOM element to prevent memory leaks
        if (container.parentNode) {
          container.parentNode.removeChild(container);
        }
      } catch (error) {
        console.warn('[HeaderFooterEditorManager] Failed to remove container from DOM:', error);
      }

      try {
        // Unregister from converter to maintain consistency
        this.#unregisterConverterEditor(descriptor);
      } catch (error) {
        console.warn('[HeaderFooterEditorManager] Failed to unregister converter editor:', error);
      }
    };

    const ready = new Promise<void>((resolve, reject) => {
      let isResolved = false;

      // Set up timeout to prevent promise from hanging indefinitely
      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          const error = new Error(
            `Editor initialization timed out after ${EDITOR_READY_TIMEOUT_MS}ms for ${descriptor.kind} ${descriptor.id}`,
          );
          reject(error);
        }
      }, EDITOR_READY_TIMEOUT_MS);

      // Listen for successful creation
      editor.once?.('create', () => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);
          resolve();
        }
      });

      // Listen for error during creation
      editor.once?.('error', (error: unknown) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });

    return {
      descriptor,
      editor,
      container,
      disposer,
      ready,
    };
  }

  #createEditorContainer(): HTMLElement {
    const doc =
      (this.#editor.options?.element?.ownerDocument as Document | undefined) ?? globalThis.document ?? undefined;
    const container = doc?.createElement('div') ?? document.createElement('div');
    return container;
  }

  /**
   * Registers an editor instance with the converter's editor tracking arrays.
   * Uses type guard for safe access to converter property.
   *
   * @param descriptor - The header/footer descriptor
   * @param editor - The editor instance to register
   */
  #registerConverterEditor(descriptor: HeaderFooterDescriptor, editor: Editor): void {
    if (!this.#hasConverter(this.#editor)) {
      return;
    }
    const converter = this.#editor.converter as Record<string, unknown>;
    if (!converter) return;

    const targetKey = descriptor.kind === 'header' ? 'headerEditors' : 'footerEditors';

    // Ensure the target array exists
    if (!Array.isArray(converter[targetKey])) {
      converter[targetKey] = [];
    }

    const converterEditors = converter[targetKey];
    // Type guard: verify it's actually an array of editor entries
    if (!Array.isArray(converterEditors)) return;

    // Check if already registered
    const exists = converterEditors.some((entry) => {
      // Type guard: ensure entry has required structure
      return entry && typeof entry === 'object' && 'id' in entry && entry.id === descriptor.id;
    });

    if (!exists) {
      converterEditors.push({ id: descriptor.id, editor });
    }
  }

  /**
   * Unregisters an editor instance from the converter's editor tracking arrays.
   * Uses type guard for safe access to converter property.
   *
   * @param descriptor - The header/footer descriptor to unregister
   */
  #unregisterConverterEditor(descriptor: HeaderFooterDescriptor): void {
    if (!this.#hasConverter(this.#editor)) {
      return;
    }
    const converter = this.#editor.converter as Record<string, unknown>;
    if (!converter) return;

    const targetKey = descriptor.kind === 'header' ? 'headerEditors' : 'footerEditors';

    const converterEditors = converter[targetKey];
    // Type guard: verify it's an array before filtering
    if (!Array.isArray(converterEditors)) {
      return;
    }

    converter[targetKey] = converterEditors.filter((entry) => {
      // Type guard: ensure entry has required structure
      return !(entry && typeof entry === 'object' && 'id' in entry && entry.id === descriptor.id);
    });
  }

  /**
   * Updates the LRU access order by moving the given ID to the end (most recently used).
   *
   * This method maintains the access order array by removing any existing occurrence
   * of the ID and appending it to the end, marking it as the most recently used.
   *
   * @param id - The descriptor ID to mark as recently accessed
   */
  #updateAccessOrder(id: string): void {
    this.#editorAccessOrder = this.#editorAccessOrder.filter((existingId) => existingId !== id);
    this.#editorAccessOrder.push(id);
  }

  /**
   * Enforces the cache size limit by evicting least recently used editors.
   *
   * When the number of cached editors exceeds `#maxCachedEditors`, this method
   * removes the oldest editors (from the front of the access order array) until
   * the cache size is within the limit. Each evicted editor is properly disposed.
   */
  #enforceCacheSizeLimit(): void {
    while (this.#editorAccessOrder.length > this.#maxCachedEditors) {
      const oldestId = this.#editorAccessOrder.shift();
      if (!oldestId) break;

      const oldEntry = this.#editorEntries.get(oldestId);
      if (oldEntry) {
        try {
          oldEntry.disposer();
          this.#evictions += 1;
        } catch (error) {
          console.warn('[HeaderFooterEditorManager] LRU eviction cleanup failed:', error);
        }
        this.#editorEntries.delete(oldestId);
      }
    }
  }

  /**
   * Sets the maximum number of cached header/footer editors.
   *
   * Least recently used editors will be disposed when this limit is exceeded.
   * If the new limit is lower than the current number of cached editors,
   * excess editors are immediately evicted.
   *
   * @param max - Maximum number of editors to keep in memory (must be between 1 and 100, and an integer)
   * @throws Error if max is less than 1, greater than 100, or not an integer
   *
   * @example
   * ```typescript
   * manager.setMaxCachedEditors(5); // Limit to 5 cached editors
   * ```
   */
  setMaxCachedEditors(max: number): void {
    if (max < 1) {
      throw new Error('Max cached editors must be at least 1');
    }
    if (max > MAX_CACHED_EDITORS_LIMIT) {
      throw new Error(`Max cached editors must not exceed ${MAX_CACHED_EDITORS_LIMIT}`);
    }
    if (!Number.isInteger(max)) {
      throw new Error('Max cached editors must be an integer');
    }
    this.#maxCachedEditors = max;

    // Immediately enforce new limit if needed
    this.#enforceCacheSizeLimit();
  }

  /**
   * Returns cache performance statistics for monitoring and debugging.
   *
   * Provides metrics about cache effectiveness, including hit rate, number of
   * cached editors, and eviction counts. Useful for tuning cache size and
   * understanding access patterns in production.
   *
   * @returns Object containing cache statistics
   *
   * @example
   * ```typescript
   * const stats = manager.getCacheStats();
   * console.log(`Cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
   * console.log(`Evictions: ${stats.evictions}`);
   * ```
   */
  getCacheStats(): HeaderFooterCacheStats {
    const totalAccesses = this.#cacheHits + this.#cacheMisses;
    const hitRate = totalAccesses > 0 ? this.#cacheHits / totalAccesses : 0;

    return {
      cachedEditors: this.#editorEntries.size,
      maxCachedEditors: this.#maxCachedEditors,
      cacheHits: this.#cacheHits,
      cacheMisses: this.#cacheMisses,
      evictions: this.#evictions,
      hitRate,
    };
  }

  /**
   * Resets cache statistics (hits, misses, evictions) to zero.
   * Does not clear cached editors or affect cache behavior.
   *
   * Useful for starting fresh measurements after configuration changes
   * or for periodic monitoring resets.
   *
   * @example
   * ```typescript
   * manager.resetCacheStats();
   * // ... perform operations ...
   * const stats = manager.getCacheStats(); // Fresh stats from reset point
   * ```
   */
  resetCacheStats(): void {
    this.#cacheHits = 0;
    this.#cacheMisses = 0;
    this.#evictions = 0;
  }
}

/**
 * Adapter for converting header/footer editor content to layout-engine FlowBlocks.
 *
 * This class bridges the gap between the HeaderFooterEditorManager (which manages
 * ProseMirror editors for header/footer sections) and the layout engine (which
 * requires FlowBlock representations for rendering).
 *
 * Features:
 * - Converts ProseMirror JSON documents to FlowBlock arrays
 * - Caches conversion results for performance
 * - Provides invalidation mechanisms when content changes
 * - Organizes blocks by variant (default, first, even, odd) for page-based layout
 *
 * @example
 * ```typescript
 * const adapter = new HeaderFooterLayoutAdapter(manager, mediaFiles);
 * const headerBatch = adapter.getBatch('header');
 * // Returns: { default: [...blocks], first: [...blocks], ... }
 * ```
 */
export class HeaderFooterLayoutAdapter {
  #manager: HeaderFooterEditorManager;
  #mediaFiles?: Record<string, string>;
  #blockCache: Map<string, HeaderFooterLayoutCacheEntry> = new Map();

  /**
   * Creates a new HeaderFooterLayoutAdapter.
   *
   * @param manager - The HeaderFooterEditorManager instance to source content from
   * @param mediaFiles - Optional mapping of media IDs to URLs for image resolution
   */
  constructor(manager: HeaderFooterEditorManager, mediaFiles?: Record<string, string>) {
    this.#manager = manager;
    this.#mediaFiles = mediaFiles;
  }

  /**
   * Retrieves FlowBlock batches for all variants of a given header/footer kind.
   *
   * This method converts the ProseMirror documents for all available variants
   * (default, first, even, odd) into FlowBlock arrays suitable for the layout engine.
   * Results are cached based on document identity to avoid redundant conversions.
   *
   * @param kind - The type of section to retrieve: 'header' or 'footer'
   * @returns An object mapping variant names to FlowBlock arrays, or undefined if no content exists
   *
   * @example
   * ```typescript
   * const headerBatch = adapter.getBatch('header');
   * if (headerBatch) {
   *   // headerBatch.default contains blocks for default pages
   *   // headerBatch.first contains blocks for first page (if exists)
   * }
   * ```
   */
  getBatch(kind: HeaderFooterKind): HeaderFooterBatch | undefined {
    const descriptors = this.#manager.getDescriptors(kind);
    if (!descriptors.length) {
      return undefined;
    }

    const batch: HeaderFooterBatch = {};
    let hasBlocks = false;

    descriptors.forEach((descriptor) => {
      if (!descriptor.variant) {
        return;
      }
      const blocks = this.#getBlocks(descriptor);
      if (blocks && blocks.length > 0) {
        batch[descriptor.variant] = blocks;
        hasBlocks = true;
      }
    });

    return hasBlocks ? batch : undefined;
  }

  /**
   * Retrieves FlowBlocks for ALL header/footer content, keyed by relationship ID.
   *
   * Unlike getBatch() which only returns content for variant-associated IDs,
   * this method returns content for ALL registered header/footer IDs. This is
   * essential for multi-section documents where different sections may use
   * different content for the same variant type.
   *
   * @param kind - The type of section to retrieve: 'header' or 'footer'
   * @returns A Map of rId to FlowBlock arrays, or undefined if no content exists
   *
   * @example
   * ```typescript
   * const footersByRId = adapter.getBlocksByRId('footer');
   * if (footersByRId) {
   *   // footersByRId.get('rId14') - blocks for footer with rId14
   *   // footersByRId.get('rId18') - blocks for footer with rId18 (different section)
   * }
   * ```
   */
  getBlocksByRId(kind: HeaderFooterKind): Map<string, FlowBlock[]> | undefined {
    const descriptors = this.#manager.getDescriptors(kind);
    if (!descriptors.length) return undefined;

    const blocksMap = new Map<string, FlowBlock[]>();

    descriptors.forEach((descriptor) => {
      const blocks = this.#getBlocks(descriptor);
      if (blocks && blocks.length > 0) {
        blocksMap.set(descriptor.id, blocks);
      }
    });

    return blocksMap.size > 0 ? blocksMap : undefined;
  }

  /**
   * Retrieves FlowBlocks for a specific header/footer by its relationship ID.
   *
   * @param rId - The relationship ID (e.g., 'rId14')
   * @returns FlowBlock array for the specified rId, or undefined if not found
   */
  getBlocksForRId(rId: string): FlowBlock[] | undefined {
    const descriptor = this.#manager.getDescriptorById(rId);
    if (!descriptor) return undefined;
    return this.#getBlocks(descriptor);
  }

  /**
   * Invalidates the cached FlowBlocks for a specific header/footer section.
   *
   * Call this method when the content of a specific section changes to force
   * re-conversion on the next getBatch() call.
   *
   * @param rId - The relationship ID of the section to invalidate
   *
   * @example
   * ```typescript
   * // After editing a header
   * manager.on('contentChanged', ({ descriptor }) => {
   *   adapter.invalidate(descriptor.id);
   * });
   * ```
   */
  invalidate(rId: string): void {
    this.#blockCache.delete(rId);
  }

  /**
   * Invalidates all cached FlowBlocks.
   *
   * Should be called when mediaFiles are updated globally, as image references
   * in blocks may need to be regenerated with new media URLs. Also useful when
   * the converter context changes (styles, numbering, etc.).
   *
   * @example
   * ```typescript
   * // After updating media files
   * adapter.invalidateAll();
   * const freshBatch = adapter.getBatch('header'); // Will re-convert all sections
   * ```
   */
  invalidateAll(): void {
    this.#blockCache.clear();
  }

  /**
   * Clears all cached FlowBlocks.
   *
   * Alias for invalidateAll(). Useful for cleanup operations.
   */
  clear(): void {
    this.#blockCache.clear();
  }

  #getBlocks(descriptor: HeaderFooterDescriptor): FlowBlock[] | undefined {
    const doc = this.#manager.getDocumentJson(descriptor);
    if (!doc) return undefined;

    const cacheEntry = this.#blockCache.get(descriptor.id);
    if (cacheEntry?.docRef === doc) {
      return cacheEntry.blocks;
    }

    const blockIdPrefix = `hf-${descriptor.kind}-${descriptor.id}-`;
    const converterContext = this.#getConverterContext();
    const rootConverter = (this.#manager.rootEditor as EditorWithConverter | undefined)?.converter as
      | { media?: Record<string, string>; getDocumentDefaultStyles?: () => { typeface?: string; fontSizePt?: number } }
      | undefined;
    const providedMedia = this.#mediaFiles;
    const fallbackMedia = rootConverter?.media;
    const mediaFiles = providedMedia && Object.keys(providedMedia).length > 0 ? providedMedia : fallbackMedia;
    const atomNodeTypes = getAtomNodeTypesFromSchema((this.#manager.rootEditor as Editor | undefined)?.schema ?? null);

    // Get document defaults for consistent rendering with main document
    const docDefaults = rootConverter?.getDocumentDefaultStyles?.();
    const defaultFont = docDefaults?.typeface;
    // Convert pt to px: 1pt = 96/72 px ≈ 1.333px
    const defaultSize = docDefaults?.fontSizePt != null ? docDefaults.fontSizePt * (96 / 72) : undefined;

    const result = toFlowBlocks(doc as object, {
      mediaFiles,
      blockIdPrefix,
      converterContext,
      defaultFont,
      defaultSize,
      ...(atomNodeTypes.length > 0 ? { atomNodeTypes } : {}),
    });
    const blocks = result.blocks;

    this.#blockCache.set(descriptor.id, { docRef: doc, blocks });
    return blocks;
  }
  /**
   * Extracts converter context needed for FlowBlock conversion.
   * Uses type guard for safe access to converter property.
   *
   * @returns The converter context containing document metadata, or undefined if not available
   */
  #getConverterContext(): ConverterContext | undefined {
    const rootEditor = this.#manager.rootEditor;
    if (!('converter' in rootEditor)) {
      return undefined;
    }
    const converter = (rootEditor as EditorWithConverter).converter as Record<string, unknown> | undefined;
    if (!converter) return undefined;

    const context: ConverterContext = {
      docx: converter.convertedXml,
      numbering: converter.numbering,
      translatedLinkedStyles: converter.translatedLinkedStyles,
      translatedNumbering: converter.translatedNumbering,
    } as ConverterContext;

    return context;
  }
}
