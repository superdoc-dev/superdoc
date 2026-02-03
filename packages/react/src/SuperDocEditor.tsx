import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ForwardedRef } from 'react';
import { generateId } from './utils';
import type { DocumentMode, SuperDocEditorProps, SuperDocInstance, SuperDocRef } from './types';

/**
 * SuperDocEditor - React wrapper component for SuperDoc
 *
 * Provides a component-based API with proper lifecycle management
 * and React Strict Mode compatibility.
 *
 * NOTE: This is a client-only component. It returns null during SSR.
 * For Next.js, use dynamic import with { ssr: false }.
 */
function SuperDocEditorInner(props: SuperDocEditorProps, ref: ForwardedRef<SuperDocRef>) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Destructure React-specific props and key rebuild triggers
  const {
    // React-specific
    id,
    renderLoading,
    hideToolbar = false,
    className,
    style,
    // Callbacks (stored in ref to avoid triggering rebuilds)
    onReady,
    onEditorCreate,
    onEditorDestroy,
    onEditorUpdate,
    onContentError,
    onException,
    // Key props that trigger rebuild when changed
    document: documentProp,
    user,
    users,
    modules,
    // All other props passed through
    ...restProps
  } = props;

  // Apply defaults
  const documentMode = props.documentMode ?? 'editing';
  const role = props.role ?? 'editor';

  const instanceRef = useRef<SuperDocInstance | null>(null);
  const toolbarContainerRef = useRef<HTMLDivElement | null>(null);

  // Generate stable IDs once per component instance (use provided id if available)
  const idsRef = useRef<{ containerId: string; toolbarId: string } | null>(null);
  if (idsRef.current === null) {
    const baseId = id ?? generateId();
    idsRef.current = { containerId: baseId, toolbarId: `${baseId}-toolbar` };
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

  // Queue mode changes that happen during init
  const pendingModeRef = useRef<DocumentMode | null>(null);
  const isInitializingRef = useRef(false);

  // Track documentMode changes and apply imperatively
  const prevDocumentModeRef = useRef(documentMode);
  useEffect(() => {
    if (prevDocumentModeRef.current !== documentMode) {
      if (instanceRef.current) {
        // Instance exists, apply immediately
        instanceRef.current.setDocumentMode(documentMode);
      } else if (isInitializingRef.current) {
        // Instance is initializing, queue the mode change
        pendingModeRef.current = documentMode;
      }
    }
    prevDocumentModeRef.current = documentMode;
  }, [documentMode]);

  // Expose ref methods - simplified API with just getInstance()
  useImperativeHandle(
    ref,
    () => ({
      getInstance: () => instanceRef.current,
    }),
    [],
  );

  // Main effect: create and destroy SuperDoc instance
  useEffect(() => {
    // Skip on server-side
    if (typeof window === 'undefined') return;

    // Reset loading state when document changes
    setIsLoading(true);
    isInitializingRef.current = true;

    let destroyed = false;
    let instance: SuperDocInstance | null = null;

    const initSuperDoc = async () => {
      try {
        // Dynamic import for SSR safety
        const modulePath = 'superdoc';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const superdocModule: any = await import(/* @vite-ignore */ modulePath);
        const SuperDoc = superdocModule.SuperDoc as new (config: Record<string, unknown>) => SuperDocInstance;

        // Check if we were destroyed while loading
        if (destroyed) return;

        // Build configuration - pass through all props
        const superdocConfig = {
          ...restProps,
          selector: `#${containerId}`,
          // Use internal toolbar container unless hideToolbar is true
          ...(!hideToolbar && toolbarContainerRef.current ? { toolbar: `#${toolbarId}` } : {}),
          documentMode,
          role,
          ...(documentProp != null ? { document: documentProp } : {}),
          ...(user ? { user } : {}),
          ...(users ? { users } : {}),
          ...(modules ? { modules } : {}),
          // Wire up callbacks with lifecycle guards
          onReady: (event: { superdoc: SuperDocInstance }) => {
            if (!destroyed) {
              setIsLoading(false);
              isInitializingRef.current = false;

              // Apply any pending mode changes
              if (pendingModeRef.current && pendingModeRef.current !== documentMode) {
                event.superdoc.setDocumentMode(pendingModeRef.current);
                pendingModeRef.current = null;
              }

              callbacksRef.current.onReady?.(event);
            }
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onEditorCreate: (event: any) => {
            if (!destroyed) {
              callbacksRef.current.onEditorCreate?.(event);
            }
          },
          onEditorDestroy: () => {
            if (!destroyed) {
              callbacksRef.current.onEditorDestroy?.();
            }
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onEditorUpdate: (event: any) => {
            if (!destroyed) {
              callbacksRef.current.onEditorUpdate?.(event);
            }
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onContentError: (event: any) => {
            if (!destroyed) {
              callbacksRef.current.onContentError?.(event);
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
          isInitializingRef.current = false;
          console.error('[SuperDocEditor] Failed to initialize SuperDoc:', error);
          callbacksRef.current.onException?.({ error: error as Error });
        }
      }
    };

    initSuperDoc();

    // Cleanup function
    return () => {
      destroyed = true;
      isInitializingRef.current = false;
      pendingModeRef.current = null;
      if (instance) {
        instance.destroy();
        instanceRef.current = null;
      }
    };
    // Only these props trigger a full rebuild. Other props (rulers, etc.) are
    // initial values - use getInstance() methods to change them at runtime.
    // Note: restProps is intentionally excluded to avoid rebuilds on every render.
  }, [documentProp, user, users, modules, role, hideToolbar]);

  const wrapperClassName = ['superdoc-wrapper', className].filter(Boolean).join(' ');

  // Client-only: render nothing on server, show loading until hydrated
  if (!isClient) {
    return renderLoading ? (
      <div className={wrapperClassName} style={style}>
        {renderLoading()}
      </div>
    ) : null;
  }

  return (
    <div className={wrapperClassName} style={style}>
      {!hideToolbar && <div ref={toolbarContainerRef} id={toolbarId} className='superdoc-toolbar-container' />}
      <div id={containerId} className='superdoc-editor-container' />
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
