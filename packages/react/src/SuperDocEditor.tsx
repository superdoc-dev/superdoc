import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ForwardedRef } from 'react';
import { generateId } from './utils';
import type {
  DocumentMode,
  ExportOptions,
  SearchResult,
  SuperDocEditorProps,
  SuperDocInstance,
  SuperDocRef,
  TrackedChangesPreferences,
} from './types';

/**
 * SuperDocEditor - React wrapper component for SuperDoc
 *
 * Provides a component-based API with proper lifecycle management,
 * SSR safety, and React Strict Mode compatibility.
 */
function SuperDocEditorInner(props: SuperDocEditorProps, ref: ForwardedRef<SuperDocRef>) {
  const {
    document: documentProp,
    documentMode = 'editing',
    role = 'editor',
    user,
    users,
    modules,
    toolbar = true,
    rulers,
    pagination,
    renderLoading,
    onReady,
    onEditorCreate,
    onEditorDestroy,
    onEditorUpdate,
    onContentError,
    onException,
    config,
    className,
    style,
  } = props;

  const instanceRef = useRef<SuperDocInstance | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const toolbarContainerRef = useRef<HTMLDivElement | null>(null);

  // Generate stable IDs once per component instance
  const idsRef = useRef<{ containerId: string; toolbarId: string } | null>(null);
  if (idsRef.current === null) {
    const id = generateId();
    idsRef.current = { containerId: id, toolbarId: `${id}-toolbar` };
  }
  const { containerId, toolbarId } = idsRef.current;

  const [isLoading, setIsLoading] = useState(true);

  // Store callbacks in refs to avoid triggering effect on callback changes
  const callbacksRef = useRef({
    onReady,
    onEditorCreate,
    onEditorDestroy,
    onEditorUpdate,
    onContentError,
    onException,
  });

  // Update callback refs when props change
  useEffect(() => {
    callbacksRef.current = {
      onReady,
      onEditorCreate,
      onEditorDestroy,
      onEditorUpdate,
      onContentError,
      onException,
    };
  }, [onReady, onEditorCreate, onEditorDestroy, onEditorUpdate, onContentError, onException]);

  // Track documentMode changes and apply imperatively
  const prevDocumentModeRef = useRef(documentMode);
  useEffect(() => {
    if (prevDocumentModeRef.current !== documentMode && instanceRef.current) {
      instanceRef.current.setDocumentMode(documentMode);
    }
    prevDocumentModeRef.current = documentMode;
  }, [documentMode]);

  // Expose ref methods
  useImperativeHandle(
    ref,
    () => ({
      getInstance: () => instanceRef.current,

      setDocumentMode: (mode: DocumentMode) => {
        instanceRef.current?.setDocumentMode(mode);
      },

      export: async (options?: ExportOptions) => {
        return instanceRef.current?.export(options);
      },

      getHTML: (options?: object) => {
        return instanceRef.current?.getHTML(options) ?? [];
      },

      focus: () => {
        instanceRef.current?.focus();
      },

      search: (text: string | RegExp) => {
        return instanceRef.current?.search(text) ?? [];
      },

      goToSearchResult: (match: SearchResult) => {
        instanceRef.current?.goToSearchResult(match);
      },

      setLocked: (locked: boolean) => {
        instanceRef.current?.setLocked(locked);
      },

      setHighContrastMode: (enabled: boolean) => {
        instanceRef.current?.setHighContrastMode(enabled);
      },

      setTrackedChangesPreferences: (prefs: TrackedChangesPreferences) => {
        instanceRef.current?.setTrackedChangesPreferences(prefs);
      },

      save: async () => {
        return instanceRef.current?.save() ?? Promise.resolve([]);
      },

      toggleRuler: () => {
        instanceRef.current?.toggleRuler();
      },

      setDisableContextMenu: (disabled: boolean) => {
        instanceRef.current?.setDisableContextMenu(disabled);
      },

      addCommentsList: (element: HTMLElement) => {
        instanceRef.current?.addCommentsList(element);
      },

      removeCommentsList: () => {
        instanceRef.current?.removeCommentsList();
      },
    }),
    [],
  );

  // Main effect: create and destroy SuperDoc instance
  useEffect(() => {
    // Skip on server-side
    if (typeof window === 'undefined') return;

    let destroyed = false;
    let instance: SuperDocInstance | null = null;

    const initSuperDoc = async () => {
      try {
        // Dynamic import for SSR safety
        // We use a runtime-resolved module path to avoid TypeScript analyzing
        // the import during build. The superdoc package is a peer dependency.
        const modulePath = 'superdoc';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const superdocModule: any = await import(/* @vite-ignore */ modulePath);
        const SuperDoc = superdocModule.SuperDoc as new (config: Record<string, unknown>) => SuperDocInstance;

        // Check if we were destroyed while loading
        if (destroyed) return;

        // Build configuration
        const superdocConfig = {
          selector: `#${containerId}`,
          ...(toolbar && toolbarContainerRef.current ? { toolbar: `#${toolbarId}` } : {}),
          documentMode,
          role,
          ...(documentProp !== undefined ? { document: documentProp } : {}),
          ...(user ? { user } : {}),
          ...(users ? { users } : {}),
          ...(modules ? { modules } : {}),
          ...(rulers !== undefined ? { rulers } : {}),
          ...(pagination !== undefined ? { pagination } : {}),
          ...config,
          // Wire up callbacks
          onReady: (event: { superdoc: SuperDocInstance }) => {
            if (!destroyed) {
              setIsLoading(false);
              callbacksRef.current.onReady?.(event);
            }
          },
          onEditorCreate: (event: { editor: object }) => {
            if (!destroyed) {
              callbacksRef.current.onEditorCreate?.(event as { editor: import('./types').EditorInstance });
            }
          },
          onEditorDestroy: () => {
            if (!destroyed) {
              callbacksRef.current.onEditorDestroy?.();
            }
          },
          onEditorUpdate: (event: { editor: object }) => {
            if (!destroyed) {
              callbacksRef.current.onEditorUpdate?.(event as { editor: import('./types').EditorInstance });
            }
          },
          onContentError: (event: object) => {
            if (!destroyed) {
              callbacksRef.current.onContentError?.(event as import('./types').ContentErrorEvent);
            }
          },
          onException: (event: { error: Error }) => {
            if (!destroyed) {
              callbacksRef.current.onException?.(event);
            }
          },
        };

        instance = new SuperDoc(superdocConfig) as SuperDocInstance;
        instanceRef.current = instance;
      } catch (error) {
        if (!destroyed) {
          console.error('[SuperDocEditor] Failed to initialize SuperDoc:', error);
          callbacksRef.current.onException?.({ error: error as Error });
        }
      }
    };

    initSuperDoc();

    // Cleanup function
    return () => {
      destroyed = true;
      if (instance) {
        instance.destroy();
        instanceRef.current = null;
      }
    };
  }, [documentProp, role, user, users, modules, toolbar, rulers, pagination, config]);

  const wrapperClassName = ['superdoc-wrapper', className].filter(Boolean).join(' ');

  return (
    <div className={wrapperClassName} style={style}>
      {toolbar && <div ref={toolbarContainerRef} id={toolbarId} className='superdoc-toolbar-container' />}
      <div ref={containerRef} id={containerId} className='superdoc-editor-container' />
      {isLoading && renderLoading && <div className='superdoc-loading-container'>{renderLoading()}</div>}
    </div>
  );
}

/**
 * SuperDocEditor component with forwardRef - Initializes SuperDoc instance and handles cleanup.
 */
export const SuperDocEditor = forwardRef<SuperDocRef, SuperDocEditorProps>(SuperDocEditorInner);

SuperDocEditor.displayName = 'SuperDocEditor';

export default SuperDocEditor;
