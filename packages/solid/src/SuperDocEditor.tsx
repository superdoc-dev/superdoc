import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  mergeProps,
  on,
  onCleanup,
  onMount,
  Show,
  splitProps,
  type JSX,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import type {
  DocumentMode,
  SuperDocContentErrorEvent,
  SuperDocEditorCreateEvent,
  SuperDocEditorProps,
  SuperDocEditorUpdateEvent,
  SuperDocExceptionEvent,
  SuperDocInstance,
  SuperDocReadyEvent,
  SuperDocTransactionEvent,
} from './types';
import { shallowJsonEqual } from './utils';

/**
 * SuperDocEditor - Solid wrapper component for SuperDoc
 *
 * Provides a component-based API with proper lifecycle management.
 * Container divs are always rendered (hidden until initialized)
 * so SuperDoc can mount into them on the first client-side effect.
 */
export function SuperDocEditor(props: SuperDocEditorProps) {
  const [hasError, setHasError] = createSignal(false);

  const mergedProps = mergeProps(
    {
      hideToolbar: false,
      contained: false,
      documentMode: 'editing',
      role: 'editor',
    } satisfies SuperDocEditorProps,
    props,
  );

  const [solidProps, callbacks, rebuildTriggeringProps, restProps] = splitProps(
    mergedProps,
    ['id', 'renderLoading', 'hideToolbar', 'contained', 'class', 'style', 'ref'],
    [
      'onReady',
      'onEditorCreate',
      'onEditorDestroy',
      'onEditorUpdate',
      'onTransaction',
      'onContentError',
      'onException',
    ],
    ['document', 'user', 'users', 'modules'],
  );

  // `user` and `users` are memoized by value so inline literals don't
  // trigger a rebuild. `modules` stays on reference identity — it can
  // carry functions and live objects (e.g. `collaboration.provider`)
  // that a consumer may intentionally swap. See SD-2635.
  const user = createMemo(() => rebuildTriggeringProps.user, undefined, { equals: shallowJsonEqual });
  const users = createMemo(() => rebuildTriggeringProps.users, undefined, { equals: shallowJsonEqual });

  let instanceRef: SuperDocInstance | null = null;
  let toolbarContainerRef: HTMLDivElement | undefined;

  // Generate stable IDs (useStableId returns the same value across re-renders)
  const generatedId = createUniqueId();
  const baseId = () => solidProps.id ?? `superdoc${generatedId}`;
  const containerId = () => baseId();
  const toolbarId = () => `${baseId()}-toolbar`;

  const [isLoading, setIsLoading] = createSignal(true);

  // Queue mode changes that happen during init
  let pendingModeRef: DocumentMode | null = null;
  let isInitializingRef = false;

  // Track documentMode changes and apply imperatively
  let prevDocumentModeRef = restProps.documentMode;
  createEffect(
    on(
      () => restProps.documentMode,
      (documentMode) => {
        if (prevDocumentModeRef !== documentMode) {
          if (instanceRef) {
            // Instance exists, apply immediately
            instanceRef?.setDocumentMode(documentMode);
          } else if (isInitializingRef) {
            // Instance is initializing, queue the mode change
            pendingModeRef = documentMode;
          }
        }
        prevDocumentModeRef = documentMode;
      },
    ),
  );

  onMount(() => {
    // Expose ref methods - simplified API with just getInstance()
    if (solidProps.ref) {
      const refObj = { getInstance: () => instanceRef };
      if (typeof solidProps.ref === 'function') {
        solidProps.ref(refObj);
      } else {
        solidProps.ref = refObj;
      }
    }
  });

  // Main effect: create and destroy SuperDoc instance
  createEffect(
    on(
      // Only these props trigger a full rebuild. Other props (rulers, etc.) are
      // initial values — use getInstance() methods to change them at runtime.
      // restProps is intentionally excluded to avoid rebuilds on every render.
      // documentMode is handled separately via setDocumentMode() for efficiency.
      [
        user,
        users,
        containerId,
        toolbarId,
        () => restProps.role,
        () => solidProps.contained,
        () => solidProps.hideToolbar,
        () => rebuildTriggeringProps.modules,
        () => rebuildTriggeringProps.document,
      ],
      ([
        userResolved,
        usersResolved,
        containerIdResolved,
        toolbarIdResolved,
        role,
        documentMode,
        contained,
        hideToolbar,
        modules,
      ]) => {
        batch(() => {
          // Reset states when document changes
          setIsLoading(true);
          setHasError(false);
          isInitializingRef = true;
        });

        let destroyed = false;
        let instance: SuperDocInstance | null = null;

        const initSuperDoc = async () => {
          try {
            // Dynamic import for SSR safety
            const modulePath = 'superdoc';
            const superdocModule = await import(/* @vite-ignore */ modulePath);
            const SuperDoc = superdocModule.SuperDoc as new (config: Record<string, unknown>) => SuperDocInstance;

            // Check if we were destroyed while loading
            if (destroyed) return;

            // Build configuration - pass through all props
            const superdocConfig = {
              ...restProps,
              selector: `#${CSS.escape(containerIdResolved)}`,
              // Use internal toolbar container unless hideToolbar is true
              ...(!hideToolbar && toolbarContainerRef ? { toolbar: `#${CSS.escape(toolbarIdResolved)}` } : {}),
              documentMode,
              role,
              contained,
              ...(rebuildTriggeringProps.document != null ? { document: rebuildTriggeringProps.document } : {}),
              ...(userResolved ? { user: userResolved } : {}),
              ...(usersResolved ? { users: usersResolved } : {}),
              ...(modules ? { modules } : {}),
              // Wire up callbacks with lifecycle guards
              onReady: (event: SuperDocReadyEvent) => {
                if (!destroyed) {
                  setIsLoading(false);
                  isInitializingRef = false;

                  // Apply any pending mode changes
                  if (pendingModeRef && pendingModeRef !== documentMode) {
                    event.superdoc.setDocumentMode(pendingModeRef);
                    pendingModeRef = null;
                  }

                  callbacks.onReady?.(event);
                }
              },
              onEditorCreate: (event: SuperDocEditorCreateEvent) => {
                if (!destroyed) {
                  callbacks.onEditorCreate?.(event);
                }
              },
              onEditorDestroy: () => {
                if (!destroyed) {
                  callbacks.onEditorDestroy?.();
                }
              },
              onEditorUpdate: (event: SuperDocEditorUpdateEvent) => {
                if (!destroyed) {
                  callbacks.onEditorUpdate?.(event);
                }
              },
              onTransaction: (event: SuperDocTransactionEvent) => {
                if (!destroyed) {
                  callbacks.onTransaction?.(event);
                }
              },
              onContentError: (event: SuperDocContentErrorEvent) => {
                if (!destroyed) {
                  callbacks.onContentError?.(event);
                }
              },
              onException: (event: SuperDocExceptionEvent) => {
                if (!destroyed) {
                  callbacks.onException?.(event);
                }
              },
            };

            instance = new SuperDoc(superdocConfig) as SuperDocInstance;
            instanceRef = instance;
          } catch (error) {
            if (!destroyed) {
              batch(() => {
                isInitializingRef = false;
                setIsLoading(false);
                setHasError(true);
                console.error('[SuperDocEditor] Failed to initialize SuperDoc:', error);
                callbacks.onException?.({ error: error as Error });
              });
            }
          }
        };

        initSuperDoc();

        // Cleanup function
        onCleanup(() => {
          isInitializingRef = false;
          pendingModeRef = null;
          if (instance) {
            instance.destroy();
            instanceRef = null;
          }
          destroyed = true;
        });
      },
    ),
  );

  const wrapperClassName = createMemo(() => ['superdoc-wrapper', solidProps.class].filter(Boolean).join(' '));
  const hideWhenLoading = createMemo<JSX.CSSProperties | undefined>(() =>
    isLoading() ? { display: 'none' } : undefined,
  );

  const wrapperStyle = createMemo<JSX.CSSProperties>(() => ({
    ...solidProps.style,
    ...(solidProps.contained && { display: 'flex', flexDirection: 'column' as const }),
  }));

  return (
    <div class={wrapperClassName()} style={wrapperStyle()}>
      <Show when={!solidProps.hideToolbar}>
        <div ref={toolbarContainerRef} id={toolbarId()} class='superdoc-toolbar-container' style={hideWhenLoading()} />
      </Show>

      <div
        id={containerId()}
        class='superdoc-editor-container'
        style={{ ...hideWhenLoading(), ...(solidProps.contained && { flex: 1, minHeight: 0 }) }}
      />
      <Show when={isLoading() && !hasError() && solidProps.renderLoading}>
        {(renderLoading) => (
          <div class='superdoc-loading-container'>
            <Dynamic component={renderLoading()} />
          </div>
        )}
      </Show>
      <Show when={hasError()}>
        <div class='superdoc-error-container'>Failed to load editor. Check console for details.</div>
      </Show>
    </div>
  );
}

export default SuperDocEditor;
