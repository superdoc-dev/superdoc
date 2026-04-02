/**
 * @typedef {Object} User The current user of this superdoc
 * @property {string} name The user's name
 * @property {string} email The user's email
 * @property {string | null} [image] The user's photo
 */

/**
 * @typedef {Object} Document
 * @property {string} [id] The ID of the document
 * @property {string} type The type of the document
 * @property {File | Blob | null} [data] The initial data of the document (File, Blob, or null)
 * @property {string} [name] The name of the document
 * @property {string} [url] The URL of the document
 * @property {boolean} [isNewFile] Whether the document is a new file
 * @property {import('yjs').Doc} [ydoc] The Yjs document for collaboration
 * @property {import('@hocuspocus/provider').HocuspocusProvider} [provider] The provider for collaboration
 */

/**
 * @typedef {Object} CollaborationProvider External collaboration provider interface
 * Accepts any Yjs-compatible provider (HocuspocusProvider, LiveblocksYjsProvider, TiptapCollabProvider, etc.)
 * @property {Object} [awareness] The Yjs awareness instance (optional, may be null)
 * @property {(event: string, handler: Function) => void} [on] Event listener
 * @property {(event: string, handler: Function) => void} [off] Event unsubscriber
 * @property {() => void} [disconnect] Disconnect from the provider
 * @property {() => void} [destroy] Destroy the provider
 * @property {boolean} [synced] Whether the provider has synced
 * @property {boolean} [isSynced] Alternative sync property (used by some providers)
 */

/**
 * @typedef {Object} CollaborationConfig Collaboration module configuration
 * @property {Object} [ydoc] External Yjs document (provider-agnostic mode)
 * @property {CollaborationProvider} [provider] External collaboration provider (provider-agnostic mode)
 * @property {'hocuspocus' | 'superdoc'} [providerType] Internal provider type (deprecated)
 * @property {string} [url] WebSocket URL for internal provider (deprecated)
 * @property {string} [token] Authentication token for internal provider (deprecated)
 * @property {Object} [params] Additional params for internal provider (deprecated)
 */

/** @typedef {import('@superdoc/super-editor').Editor} Editor */
/** @typedef {import('../SuperDoc.js').SuperDoc} SuperDoc */

/**
 * @typedef {Object} UpgradeToCollaborationOptions Options for `upgradeToCollaboration()`
 * @property {import('yjs').Doc} ydoc The target Yjs document to seed and connect to
 * @property {CollaborationProvider} provider The collaboration provider to use
 */

/**
 * Context passed to a link popover resolver when a link is clicked.
 * @typedef {Object} LinkPopoverContext
 * @property {Editor} editor The editor instance
 * @property {string} href The href attribute of the clicked link
 * @property {string | null} target The target attribute of the clicked link
 * @property {string | null} rel The rel attribute of the clicked link
 * @property {string | null} tooltip The title/tooltip attribute of the clicked link
 * @property {HTMLAnchorElement} element The clicked anchor DOM element
 * @property {number} clientX X coordinate of the click
 * @property {number} clientY Y coordinate of the click
 * @property {boolean} isAnchorLink Whether this is an anchor link (href starts with #)
 * @property {string} documentMode Current document mode ('editing', 'viewing', 'suggesting')
 * @property {{ left: string, top: string }} position Computed popover position relative to editor surface
 * @property {() => void} closePopover Close the popover programmatically
 */

/**
 * Context passed to an external (framework-agnostic) popover renderer.
 * @typedef {Object} ExternalPopoverRenderContext
 * @property {HTMLElement} container Empty DOM container positioned where the popover should appear
 * @property {() => void} closePopover Call to close the popover and clean up
 * @property {Editor} editor The editor instance
 * @property {string} href The href of the clicked link
 */

/**
 * Resolution returned by a link popover resolver.
 * @typedef {{ type: 'default' } | { type: 'none' } | { type: 'custom', component: unknown, props?: Record<string, unknown> } | { type: 'external', render: (ctx: ExternalPopoverRenderContext) => ({ destroy?: () => void } | void) }} LinkPopoverResolution
 */

/**
 * Resolver function for customizing the link click popover.
 * Must be synchronous — do not return a Promise.
 * Return null/undefined to use the default popover.
 * @typedef {(ctx: LinkPopoverContext) => LinkPopoverResolution | null | undefined} LinkPopoverResolver
 */

// ---------------------------------------------------------------------------
// Surface system types
// ---------------------------------------------------------------------------

/**
 * Surface presentation mode.
 * @typedef {'dialog' | 'floating'} SurfaceMode
 */

/**
 * @typedef {'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center'} SurfaceFloatingPlacement
 */

/**
 * Intent-based surface request — resolved by the resolver or built-in registry.
 * @typedef {Object} IntentSurfaceRequest
 * @property {string} [id] Optional surface id (auto-generated if omitted)
 * @property {string} kind Opaque intent identifier used by the resolver
 * @property {SurfaceMode} mode Presentation mode
 * @property {string} [title] Optional title rendered in the surface chrome
 * @property {string} [ariaLabel] Accessible name for the surface when no visible title is provided. Used as aria-label fallback when neither title nor ariaLabelledBy is set.
 * @property {string} [ariaLabelledBy] ID of the element that labels the surface. Takes precedence over ariaLabel. Use this when the content component renders its own heading that should serve as the accessible name.
 * @property {boolean} [closeOnEscape] Whether Escape closes the surface (default: true)
 * @property {boolean} [closeOnBackdrop] Whether backdrop click closes a dialog (default: true)
 * @property {{ maxWidth?: string | number }} [dialog] Dialog-specific overrides
 * @property {Object} [floating] Floating-specific overrides
 * @property {SurfaceFloatingPlacement} [floating.placement] Position preset (default: 'top-right'). Ignored when explicit insets are provided.
 * @property {string | number} [floating.top] Exact top inset (overrides placement)
 * @property {string | number} [floating.right] Exact right inset (overrides placement)
 * @property {string | number} [floating.bottom] Exact bottom inset (overrides placement)
 * @property {string | number} [floating.left] Exact left inset (overrides placement)
 * @property {string | number} [floating.width] Surface width
 * @property {string | number} [floating.maxWidth] Max width
 * @property {string | number} [floating.maxHeight] Max height
 * @property {boolean} [floating.autoFocus] Move focus into first focusable child on open (default: true)
 * @property {boolean} [floating.closeOnOutsidePointerDown] Close when pointer down outside the surface (default: false)
 * @property {Record<string, unknown>} [payload] Arbitrary data for the resolver or content
 */

/**
 * Direct-render surface request — provides its own component or external renderer.
 * @typedef {Object} DirectSurfaceRequest
 * @property {string} [id] Optional surface id (auto-generated if omitted)
 * @property {SurfaceMode} mode Presentation mode
 * @property {string} [title] Optional title rendered in the surface chrome
 * @property {string} [ariaLabel] Accessible name for the surface when no visible title is provided. Used as aria-label fallback when neither title nor ariaLabelledBy is set.
 * @property {string} [ariaLabelledBy] ID of the element that labels the surface. Takes precedence over ariaLabel. Use this when the content component renders its own heading that should serve as the accessible name.
 * @property {boolean} [closeOnEscape] Whether Escape closes the surface (default: true)
 * @property {boolean} [closeOnBackdrop] Whether backdrop click closes a dialog (default: true)
 * @property {{ maxWidth?: string | number }} [dialog] Dialog-specific overrides
 * @property {Object} [floating] Floating-specific overrides
 * @property {SurfaceFloatingPlacement} [floating.placement] Position preset (default: 'top-right'). Ignored when explicit insets are provided.
 * @property {string | number} [floating.top] Exact top inset (overrides placement)
 * @property {string | number} [floating.right] Exact right inset (overrides placement)
 * @property {string | number} [floating.bottom] Exact bottom inset (overrides placement)
 * @property {string | number} [floating.left] Exact left inset (overrides placement)
 * @property {string | number} [floating.width] Surface width
 * @property {string | number} [floating.maxWidth] Max width
 * @property {string | number} [floating.maxHeight] Max height
 * @property {boolean} [floating.autoFocus] Move focus into first focusable child on open (default: true)
 * @property {boolean} [floating.closeOnOutsidePointerDown] Close when pointer down outside the surface (default: false)
 * @property {unknown} [component] Vue component to render as the surface content
 * @property {Record<string, unknown>} [props] Extra props passed to the Vue component
 * @property {(ctx: ExternalSurfaceRenderContext) => ({ destroy?: () => void } | void)} [render] External (framework-agnostic) renderer function
 */

/**
 * Combined surface request type (intent-based or direct-render).
 * @typedef {IntentSurfaceRequest | DirectSurfaceRequest} SurfaceRequest
 */

/**
 * Resolution returned by a surface resolver.
 * @typedef {{ type: 'none' } | { type: 'custom', component: unknown, props?: Record<string, unknown> } | { type: 'external', render: (ctx: ExternalSurfaceRenderContext) => ({ destroy?: () => void } | void) }} SurfaceResolution
 */

/**
 * Resolver function for customizing surface rendering.
 * Must be synchronous — do not return a Promise.
 * Return null/undefined to fall through to built-in handling.
 * Return { type: 'none' } to explicitly suppress the surface.
 * @typedef {(request: SurfaceRequest) => SurfaceResolution | null | undefined} SurfaceResolver
 */

/**
 * Outcome of a surface lifecycle. The handle.result promise always resolves
 * with one of these — it never rejects for normal lifecycle events.
 * @template [TResult=unknown]
 * @typedef {Object} SurfaceOutcome
 * @property {'submitted' | 'closed' | 'replaced' | 'destroyed'} status
 * @property {TResult} [data] Present when status is 'submitted'
 * @property {unknown} [reason] Present when status is 'closed'
 * @property {string} [replacedBy] Present when status is 'replaced'
 */

/**
 * Handle returned by openSurface(). Callers use this to await the outcome
 * or close the surface programmatically.
 * @template [TResult=unknown]
 * @typedef {Object} SurfaceHandle
 * @property {string} id Resolved surface id
 * @property {SurfaceMode} mode Presentation mode
 * @property {(reason?: unknown) => void} close Close this surface programmatically
 * @property {Promise<SurfaceOutcome<TResult>>} result Resolves when the surface settles
 */

/**
 * Props passed to a custom Vue component rendered inside a surface shell.
 * Reserved props (surfaceId, mode, request, resolve, close) always win over
 * caller-provided props to prevent accidental lifecycle override.
 * @typedef {Object} SurfaceComponentProps
 * @property {string} surfaceId The surface id
 * @property {SurfaceMode} mode Presentation mode
 * @property {SurfaceRequest} request The original (normalized) request
 * @property {(data?: unknown) => void} resolve Resolves the handle with { status: 'submitted', data }
 * @property {(reason?: unknown) => void} close Resolves the handle with { status: 'closed', reason }
 */

/**
 * Context passed to an external (framework-agnostic) surface renderer.
 * @typedef {Object} ExternalSurfaceRenderContext
 * @property {HTMLElement} container Empty DOM container to render into
 * @property {string} surfaceId The surface id
 * @property {SurfaceMode} mode Presentation mode
 * @property {SurfaceRequest} request The original (normalized) request
 * @property {(data?: unknown) => void} resolve Resolves the handle with { status: 'submitted', data }
 * @property {(reason?: unknown) => void} close Resolves the handle with { status: 'closed', reason }
 */

/**
 * Module-level configuration for the surface system.
 * @typedef {Object} SurfacesModuleConfig
 * @property {SurfaceResolver} [resolver] Global surface resolver
 * @property {Object} [dialog] Default dialog options
 * @property {boolean} [dialog.closeOnEscape] Default escape behavior for dialogs (default: true)
 * @property {boolean} [dialog.closeOnBackdrop] Default backdrop-click behavior for dialogs (default: true)
 * @property {string | number} [dialog.maxWidth] Default dialog max-width
 * @property {Object} [floating] Default floating options
 * @property {SurfaceFloatingPlacement} [floating.placement] Default placement preset (default: 'top-right')
 * @property {string | number} [floating.width] Default floating width
 * @property {string | number} [floating.maxWidth] Default floating max-width
 * @property {string | number} [floating.maxHeight] Default floating max-height
 * @property {boolean} [floating.closeOnEscape] Default escape behavior for floating surfaces (default: true)
 * @property {boolean} [floating.closeOnOutsidePointerDown] Default outside-pointer behavior (default: false)
 * @property {boolean} [floating.autoFocus] Default auto-focus behavior (default: true)
 * @property {boolean | FindReplaceConfig} [findReplace] Built-in find/replace popover for editor-backed documents.
 *   Disabled by default. Set to `true` to intercept Cmd+F / Ctrl+F inside SuperDoc and open the built-in UI.
 *   When an object, allows text customization, custom components, resolvers, and replace-disabling.
 * @property {boolean | PasswordPromptConfig} [passwordPrompt] Built-in password prompt dialog for encrypted DOCX files.
 *   Enabled by default when omitted. Set to `false` to disable. When `true`, uses default titles/labels.
 *   When an object, allows custom titles and labels.
 */

/**
 * All customizable text strings for the password prompt, resolved with defaults.
 * @typedef {Object} ResolvedPasswordPromptTexts
 * @property {string} title Dialog title for first attempt
 * @property {string} invalidTitle Dialog title after wrong password
 * @property {string} description Explanatory text shown below the title
 * @property {string} placeholder Input placeholder text
 * @property {string} inputAriaLabel Accessible label for the password input
 * @property {string} submitLabel Submit button text
 * @property {string} cancelLabel Cancel button text
 * @property {string} busyLabel Submit button text while decrypting
 * @property {string} invalidMessage Error message for wrong password
 * @property {string} timeoutMessage Error message for decryption timeout
 * @property {string} genericErrorMessage Error message for other failures
 */

/**
 * Result of a password attempt via the `attemptPassword` function.
 * @typedef {Object} PasswordPromptAttemptResult
 * @property {boolean} success Whether the password was accepted
 * @property {string} [errorCode] Error code when success is false (e.g. 'DOCX_PASSWORD_INVALID', 'timeout')
 */

/**
 * Handle object injected into custom password prompt UIs as the `passwordPrompt` prop/context field.
 * Provides document metadata, resolved texts, and the retry function.
 * @typedef {Object} PasswordPromptHandle
 * @property {string} documentId The document ID requiring a password
 * @property {string} errorCode The current error code (e.g. 'DOCX_PASSWORD_REQUIRED', 'DOCX_PASSWORD_INVALID')
 * @property {ResolvedPasswordPromptTexts} texts All text strings resolved with defaults
 * @property {(password: string) => Promise<PasswordPromptAttemptResult>} attemptPassword Submit a password attempt. Returns the outcome; do not mutate document state directly.
 */

/**
 * Read-only context passed to a password prompt resolver to decide how to render.
 * Does NOT include `attemptPassword` — the resolver decides, it does not act.
 * @typedef {Object} PasswordPromptContext
 * @property {string} documentId The document ID requiring a password
 * @property {string} errorCode The current error code
 * @property {ResolvedPasswordPromptTexts} texts Resolved text strings
 */

/**
 * Context passed to an external (framework-agnostic) password prompt renderer.
 * @typedef {Object} PasswordPromptRenderContext
 * @property {HTMLElement} container Empty DOM container to render into
 * @property {PasswordPromptHandle} passwordPrompt The password prompt handle
 * @property {(data?: unknown) => void} resolve Resolves the surface with { status: 'submitted', data }
 * @property {(reason?: unknown) => void} close Resolves the surface with { status: 'closed', reason }
 * @property {string} surfaceId The surface id
 * @property {SurfaceMode} mode Presentation mode
 */

/**
 * Resolution returned by a password prompt resolver.
 * @typedef {{ type: 'default' } | { type: 'none' } | { type: 'custom', component: unknown, props?: Record<string, unknown> } | { type: 'external', render: (ctx: PasswordPromptRenderContext) => ({ destroy?: () => void } | void) }} PasswordPromptResolution
 */

/**
 * Configuration for the password prompt surface.
 * @typedef {Object} PasswordPromptConfig
 * @property {string} [title] Dialog title for first attempt (default: 'Password Required')
 * @property {string} [invalidTitle] Dialog title after wrong password (default: 'Incorrect Password')
 * @property {string} [description] Explanatory text (default: 'This document is password protected. Enter the password to open it.')
 * @property {string} [placeholder] Input placeholder (default: 'Enter password')
 * @property {string} [inputAriaLabel] Accessible label for the input (default: 'Document password')
 * @property {string} [submitLabel] Submit button text (default: 'Open')
 * @property {string} [cancelLabel] Cancel button text (default: 'Cancel')
 * @property {string} [busyLabel] Submit button text while decrypting (default: 'Decrypting\u2026')
 * @property {string} [invalidMessage] Error for wrong password (default: 'Incorrect password. Please try again.')
 * @property {string} [timeoutMessage] Error for timeout (default: 'Timed out while decrypting. Please try again.')
 * @property {string} [genericErrorMessage] Error for other failures (default: 'Unable to decrypt this document.')
 * @property {unknown} [component] Vue component to render as custom password prompt content. Mutually exclusive with `render`.
 * @property {Record<string, unknown>} [props] Extra props passed to the custom Vue component. Component-only; ignored for `render`.
 * @property {(ctx: PasswordPromptRenderContext) => ({ destroy?: () => void } | void)} [render] External (framework-agnostic) renderer. Mutually exclusive with `component`.
 * @property {(ctx: PasswordPromptContext) => PasswordPromptResolution | null | undefined} [resolver] Conditional resolver for per-document customization. Can coexist with `component`/`render`.
 */

// ---------------------------------------------------------------------------
// Find/replace surface types
// ---------------------------------------------------------------------------

/**
 * All customizable text strings for the find/replace surface, resolved with defaults.
 * @typedef {Object} ResolvedFindReplaceTexts
 * @property {string} findPlaceholder Input placeholder for the find field
 * @property {string} findAriaLabel Accessible label for the find input
 * @property {string} replacePlaceholder Input placeholder for the replace field
 * @property {string} replaceAriaLabel Accessible label for the replace input
 * @property {string} noResultsLabel Text shown when there are no matches
 * @property {string} previousMatchLabel Button label / title for previous match
 * @property {string} previousMatchAriaLabel Accessible label for previous match button
 * @property {string} nextMatchLabel Button label / title for next match
 * @property {string} nextMatchAriaLabel Accessible label for next match button
 * @property {string} closeLabel Button label / title for close
 * @property {string} closeAriaLabel Accessible label for close button
 * @property {string} replaceLabel Replace button text
 * @property {string} replaceAllLabel Replace-all button text
 * @property {string} toggleReplaceLabel Toggle replace row label
 * @property {string} toggleReplaceAriaLabel Accessible label for toggle replace button
 * @property {string} matchCaseLabel Match case toggle text
 * @property {string} matchCaseAriaLabel Accessible label for match case toggle
 * @property {string} ignoreDiacriticsLabel Ignore diacritics toggle text
 * @property {string} ignoreDiacriticsAriaLabel Accessible label for ignore diacritics toggle
 */

/**
 * Handle object injected into find/replace UIs as the `findReplace` prop/context field.
 * Provides reactive search state and all action functions.
 *
 * @typedef {Object} FindReplaceHandle
 * @property {import('vue').Ref<string>} findQuery Current search query
 * @property {import('vue').Ref<string>} replaceText Current replacement text
 * @property {import('vue').Ref<boolean>} caseSensitive Case-sensitive toggle
 * @property {import('vue').Ref<boolean>} ignoreDiacritics Ignore diacritics toggle
 * @property {import('vue').Ref<boolean>} showReplace Whether replace row is expanded
 * @property {import('vue').Ref<number>} matchCount Total match count (read-only by convention)
 * @property {import('vue').Ref<number>} activeMatchIndex Active match index, -1 when none (read-only by convention)
 * @property {import('vue').ComputedRef<string>} matchLabel Formatted match label e.g. "3 of 12" or "No results"
 * @property {import('vue').ComputedRef<boolean>} hasMatches Whether there are any matches
 * @property {boolean} replaceEnabled Whether replace actions are available (false for find-only mode)
 * @property {ResolvedFindReplaceTexts} texts All text strings resolved with defaults
 * @property {() => void} goNext Navigate to the next match
 * @property {() => void} goPrev Navigate to the previous match
 * @property {() => void} replaceCurrent Replace the active match
 * @property {() => void} replaceAll Replace all matches
 * @property {(fn: () => void) => void} registerFocusFn Register a function the composable calls to refocus the find input
 * @property {(reason?: unknown) => void} close Close the find/replace surface
 */

/**
 * Read-only context passed to a find/replace resolver to decide how to render.
 * Does NOT include action functions — the resolver decides, it does not act.
 * @typedef {Object} FindReplaceContext
 * @property {ResolvedFindReplaceTexts} texts Resolved text strings
 * @property {boolean} replaceEnabled Whether replace is available
 */

/**
 * Context passed to an external (framework-agnostic) find/replace renderer.
 * Vue refs are unwrapped as getter/setter properties for framework neutrality.
 * @typedef {Object} FindReplaceRenderContext
 * @property {HTMLElement} container Empty DOM container to render into
 * @property {Object} findReplace The find/replace handle with getters/setters instead of Vue refs
 * @property {(data?: unknown) => void} resolve Resolves the surface with { status: 'submitted', data }
 * @property {(reason?: unknown) => void} close Resolves the surface with { status: 'closed', reason }
 * @property {string} surfaceId The surface id
 * @property {SurfaceMode} mode Presentation mode
 */

/**
 * Resolution returned by a find/replace resolver.
 * @typedef {{ type: 'default' } | { type: 'none' } | { type: 'custom', component: unknown, props?: Record<string, unknown> } | { type: 'external', render: (ctx: FindReplaceRenderContext) => ({ destroy?: () => void } | void) }} FindReplaceResolution
 */

/**
 * Configuration for the find/replace surface.
 * @typedef {Object} FindReplaceConfig
 * @property {string} [findPlaceholder] Override find placeholder text
 * @property {string} [findAriaLabel] Override find input aria-label
 * @property {string} [replacePlaceholder] Override replace placeholder text
 * @property {string} [replaceAriaLabel] Override replace input aria-label
 * @property {string} [noResultsLabel] Override "No results" text
 * @property {string} [previousMatchLabel] Override previous match button title
 * @property {string} [previousMatchAriaLabel] Override previous match aria-label
 * @property {string} [nextMatchLabel] Override next match button title
 * @property {string} [nextMatchAriaLabel] Override next match aria-label
 * @property {string} [closeLabel] Override close button title
 * @property {string} [closeAriaLabel] Override close button aria-label
 * @property {string} [replaceLabel] Override replace button text
 * @property {string} [replaceAllLabel] Override replace-all button text
 * @property {string} [toggleReplaceLabel] Override toggle replace button title
 * @property {string} [toggleReplaceAriaLabel] Override toggle replace aria-label
 * @property {string} [matchCaseLabel] Override match case toggle text
 * @property {string} [matchCaseAriaLabel] Override match case aria-label
 * @property {string} [ignoreDiacriticsLabel] Override ignore diacritics toggle text
 * @property {string} [ignoreDiacriticsAriaLabel] Override ignore diacritics aria-label
 * @property {boolean} [replaceEnabled] Whether replace is available (default: true)
 * @property {unknown} [component] Vue component to render as custom find/replace content. Mutually exclusive with `render`.
 * @property {Record<string, unknown>} [props] Extra props passed to the custom Vue component.
 * @property {(ctx: FindReplaceRenderContext) => ({ destroy?: () => void } | void)} [render] External (framework-agnostic) renderer. Mutually exclusive with `component`.
 * @property {(ctx: FindReplaceContext) => FindReplaceResolution | null | undefined} [resolver] Conditional resolver. Can coexist with `component`/`render`.
 */

/**
 * @typedef {Object} Modules
 * @property {Object | false} [comments] Comments module configuration (false to disable)
 * @property {(params: {
 *   permission: string,
 *   role?: string,
 *   isInternal?: boolean,
 *   comment?: Object | null,
 *   trackedChange?: Object | null,
 *   currentUser?: User | null,
 *   superdoc?: SuperDoc | null,
 * }) => boolean | undefined} [comments.permissionResolver] Custom permission resolver for comment actions
 * @property {Object} [comments.highlightColors] Comment highlight colors (internal/external and active overrides)
 * @property {string} [comments.highlightColors.internal] Base highlight color for internal comments
 * @property {string} [comments.highlightColors.external] Base highlight color for external comments
 * @property {string} [comments.highlightColors.activeInternal] Active highlight color override for internal comments
 * @property {string} [comments.highlightColors.activeExternal] Active highlight color override for external comments
 * @property {Object} [comments.highlightOpacity] Comment highlight opacity values (0-1)
 * @property {number} [comments.highlightOpacity.active] Opacity for active comment highlight
 * @property {number} [comments.highlightOpacity.inactive] Opacity for inactive comment highlight
 * @property {string} [comments.highlightHoverColor] Hover highlight color for comment marks
 * @property {Object} [comments.trackChangeHighlightColors] Track change highlight colors
 * @property {string} [comments.trackChangeHighlightColors.insertBorder] Border color for inserted text highlight
 * @property {string} [comments.trackChangeHighlightColors.insertBackground] Background color for inserted text highlight
 * @property {string} [comments.trackChangeHighlightColors.deleteBorder] Border color for deleted text highlight
 * @property {string} [comments.trackChangeHighlightColors.deleteBackground] Background color for deleted text highlight
 * @property {string} [comments.trackChangeHighlightColors.formatBorder] Border color for format change highlight
 * @property {Object} [comments.trackChangeActiveHighlightColors] Active track change highlight colors (defaults to trackChangeHighlightColors)
 * @property {string} [comments.trackChangeActiveHighlightColors.insertBorder] Active border color for inserted text highlight
 * @property {string} [comments.trackChangeActiveHighlightColors.insertBackground] Active background color for inserted text highlight
 * @property {string} [comments.trackChangeActiveHighlightColors.deleteBorder] Active border color for deleted text highlight
 * @property {string} [comments.trackChangeActiveHighlightColors.deleteBackground] Active background color for deleted text highlight
 * @property {string} [comments.trackChangeActiveHighlightColors.formatBorder] Active border color for format change highlight
 * @property {Object} [ai] AI module configuration
 * @property {string} [ai.apiKey] Harbour API key for AI features
 * @property {string} [ai.endpoint] Custom endpoint URL for AI services
 * @property {Object} [pdf] PDF module configuration
 * @property {Object} pdf.pdfLib Preloaded pdf.js library instance
 * @property {string} [pdf.workerSrc] PDF.js worker source URL (falls back to CDN when omitted)
 * @property {boolean} [pdf.setWorker] Whether to auto-configure pdf.js worker
 * @property {boolean} [pdf.textLayer] Enable text layer rendering (default: false)
 * @property {number} [pdf.outputScale] Canvas render scale (quality)
 * @property {CollaborationConfig} [collaboration] Collaboration module configuration
 * @property {Object} [toolbar] Toolbar module configuration
 * @property {Object} [links] Link click popover configuration
 * @property {LinkPopoverResolver} [links.popoverResolver] Custom resolver for the link click popover.
 * @property {Object} [contextMenu] Context menu module configuration
 * @property {Array} [contextMenu.customItems] Array of custom menu sections with items
 * @property {Function} [contextMenu.menuProvider] Function to customize menu items
 * @property {boolean} [contextMenu.includeDefaultItems] Whether to include default menu items
 * @property {Object} [slashMenu] @deprecated Use contextMenu instead
 * @property {SurfacesModuleConfig} [surfaces] Surface system configuration
 */

/**
 * @typedef {'editing' | 'viewing' | 'suggesting'} DocumentMode
 */

/**
 * @typedef {'docx' | 'pdf' | 'html'} ExportType
 */

/**
 * @typedef {'external' | 'clean'} CommentsType
 * - 'external': Include only external comments (default)
 * - 'clean': Export without any comments
 */

/**
 * @typedef {'print' | 'web'} ViewLayout
 * Document view layout values - mirrors OOXML ST_View (ECMA-376 §17.18.102)
 * - 'print': Print Layout View - displays document as it prints (default)
 * - 'web': Web Page View - content reflows to fit container (mobile/accessibility)
 */

/**
 * @typedef {Object} ViewOptions
 * Document view options for controlling how the document is displayed.
 * Mirrors OOXML document view settings.
 * @property {ViewLayout} [layout='print'] Document view layout (OOXML ST_View compatible)
 */

/**
 * @typedef {Object} ExportParams
 * @property {ExportType[]} [exportType=['docx']] - File formats to export
 * @property {CommentsType} [commentsType='external'] - How to handle comments
 * @property {string} [exportedName] - Custom filename (without extension)
 * @property {Blob[]} [additionalFiles] - Extra files to include in the export zip
 * @property {string[]} [additionalFileNames] - Filenames for the additional files
 * @property {boolean} [isFinalDoc=false] - Whether this is a final document export
 * @property {boolean} [triggerDownload=true] - Auto-download or return blob
 * @property {string} [fieldsHighlightColor] - Color for field highlights
 */

/**
 * @typedef {'body' | 'header' | 'footer'} EditorSurface
 * Surface where the edit originated.
 */

/**
 * @typedef {Object} EditorUpdateEvent
 * @property {Editor} editor The primary editor associated with the update. For header/footer edits, this is the main body editor.
 * @property {Editor} sourceEditor The editor instance that emitted the update. For body edits, this matches `editor`.
 * @property {EditorSurface} surface The surface where the edit originated.
 * @property {string | null} [headerId] Relationship ID for header/footer edits.
 * @property {string | null} [sectionType] Header/footer variant (`default`, `first`, `even`, `odd`) when available.
 */

/**
 * @typedef {Object} EditorTransactionEvent
 * @property {Editor} editor The primary editor associated with the transaction. For header/footer edits, this is the main body editor.
 * @property {Editor} sourceEditor The editor instance that emitted the transaction. For body edits, this matches `editor`.
 * @property {any} transaction The ProseMirror transaction or transaction-like payload emitted by the source editor.
 * @property {number} [duration] Time spent applying the transaction, in milliseconds.
 * @property {EditorSurface} surface The surface where the transaction originated.
 * @property {string | null} [headerId] Relationship ID for header/footer edits.
 * @property {string | null} [sectionType] Header/footer variant (`default`, `first`, `even`, `odd`) when available.
 */

/**
 * @typedef {Object} Config
 * @property {string} [superdocId] The ID of the SuperDoc
 * @property {string | HTMLElement} selector The selector or element to mount the SuperDoc into
 * @property {DocumentMode} [documentMode] The mode of the document (default: 'editing')
 * @property {'editor' | 'viewer' | 'suggester'} [role] The role of the user in this SuperDoc
 * @property {Object | string | File | Blob} [document] The document to load. If a string, it will be treated as a URL. If a File or Blob, it will be used directly.
 * @property {string} [password] Password for encrypted DOCX files. Forwarded during document load.
 * @property {Array<Document>} [documents] The documents to load -> Soon to be deprecated
 * @property {User} [user] The current user of this SuperDoc
 * @property {Array<User>} [users] All users of this SuperDoc (can be used for "@"-mentions)
 * @property {Array<string>} [colors] Colors to use for user awareness
 * @property {Modules} [modules] Modules to load
 * @property {(params: {
 *   permission: string,
 *   role?: string,
 *   isInternal?: boolean,
 *   comment?: Object | null,
 *   trackedChange?: Object | null,
 *   currentUser?: User | null,
 *   superdoc?: SuperDoc | null,
 * }) => boolean | undefined} [permissionResolver] Top-level override for permission checks
 * @property {string} [toolbar] Optional DOM element to render the toolbar in
 * @property {Array<string>} [toolbarGroups] Toolbar groups to show
 * @property {Object} [toolbarIcons] Icons to show in the toolbar
 * @property {Object} [toolbarTexts] Texts to override in the toolbar
 * @property {string} [uiDisplayFallbackFont='Arial, Helvetica, sans-serif'] The font-family to use for all SuperDoc UI surfaces
 *   (toolbar, comments UI, dropdowns, tooltips, etc.). This ensures consistent typography across the entire application
 *   and helps match your application's design system. The value should be a valid CSS font-family string.
 *   Example (system fonts):
 *     uiDisplayFallbackFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
 *   Example (custom font):
 *     uiDisplayFallbackFont: '"Inter", Arial, sans-serif'
 * @property {boolean} [isDev] Whether the SuperDoc is in development mode
 * @property {boolean} [disablePiniaDevtools=false] Disable Pinia/Vue devtools plugin setup for this SuperDoc instance (useful in non-Vue hosts)
 * @property {Object} [layoutEngineOptions] Layout engine overrides passed through to PresentationEditor (page size, margins, virtualization, zoom, debug label, etc.)
 * @property {'paginated' | 'semantic'} [layoutEngineOptions.flowMode='paginated'] Layout engine flow mode.
 *   - 'paginated': standard page-first layout (default)
 *   - 'semantic': continuous semantic flow without visible pagination boundaries
 * @property {Object} [layoutEngineOptions.semanticOptions] Internal-only semantic mode tuning options.
 *   This shape is intentionally not a stable public API in v1.
 * @property {Object} [layoutEngineOptions.trackedChanges] Optional override for paginated track-changes rendering (e.g., `{ mode: 'final' }` to force final view or `{ enabled: false }` to strip metadata entirely)
 * @property {(editor: Editor) => void} [onEditorBeforeCreate] Callback before an editor is created
 * @property {(editor: Editor) => void} [onEditorCreate] Callback after an editor is created
 * @property {(params: EditorTransactionEvent) => void} [onTransaction] Callback when a transaction is made
 * @property {() => void} [onEditorDestroy] Callback after an editor is destroyed
 * @property {(params: { error: object, editor: Editor, documentId: string, file: File }) => void} [onContentError] Callback when there is an error in the content
 * @property {(editor: { superdoc: SuperDoc }) => void} [onReady] Callback when the SuperDoc is ready
 * @property {(params: { type: string, data: object}) => void} [onCommentsUpdate] Callback when comments are updated
 * @property {(params: { context: SuperDoc, states: Array }) => void} [onAwarenessUpdate] Callback when awareness is updated
 * @property {(params: { isLocked: boolean, lockedBy: User }) => void} [onLocked] Callback when the SuperDoc is locked
 * @property {() => void} [onPdfDocumentReady] Callback when the PDF document is ready
 * @property {(isOpened: boolean) => void} [onSidebarToggle] Callback when the sidebar is toggled
 * @property {(params: { editor: Editor }) => void} [onCollaborationReady] Callback when collaboration is ready
 * @property {(params: EditorUpdateEvent) => void} [onEditorUpdate] Callback when document is updated
 * @property {(params: { error: Error, editor?: Editor | null, code?: string }) => void} [onException] Callback when an exception is thrown
 * @property {(params: { isRendered: boolean }) => void} [onCommentsListChange] Callback when the comments list is rendered
 * @property {(params: { totalPages: number, superdoc: SuperDoc }) => void} [onPaginationUpdate] Callback when pagination layout updates (fires after each layout pass with the current page count)
 * @property {(params: {})} [onListDefinitionsChange] Callback when the list definitions change
 * @property {string} [format] The format of the document (docx, pdf, html)
 * @property {Object[]} [editorExtensions] The extensions to load for the editor
 * @property {boolean} [isInternal] Whether the SuperDoc is internal
 * @property {string} [title] The title of the SuperDoc
 * @property {Object[]} [conversations] The conversations to load
 * @property {{ visible?: boolean }} [comments] Toggle comment visibility when `documentMode` is `viewing` (default: false)
 * @property {{ visible?: boolean }} [trackChanges] Toggle tracked-change visibility when `documentMode` is `viewing` (default: false)
 * @property {boolean} [isLocked] Whether the SuperDoc is locked
 * @property {function(File): Promise<string>} [handleImageUpload] The function to handle image uploads
 * @property {User} [lockedBy] The user who locked the SuperDoc
 * @property {boolean} [rulers] Whether to show the ruler in the editor
 * @property {boolean} [suppressDefaultDocxStyles] Whether to suppress default styles in docx mode
 * @property {Object} [jsonOverride] Provided JSON to override content with
 * @property {boolean} [disableContextMenu] Whether to disable slash / right-click custom context menu
 * @property {string} [html] HTML content to initialize the editor with
 * @property {string} [markdown] Markdown content to initialize the editor with
 * @property {((items: Array<{tagName: string, outerHTML: string, count: number}>) => void) | null} [onUnsupportedContent] Callback invoked with unsupported HTML elements dropped during import. When provided, console.warn is NOT emitted.
 * @property {boolean} [warnOnUnsupportedContent] When true and no onUnsupportedContent callback is provided, emits a console.warn with unsupported items
 * @property {boolean} [isDebug=false] Whether to enable debug mode
 * @property {ViewOptions} [viewOptions] Document view options (OOXML ST_View compatible)
 * @property {boolean} [contained] Enable contained mode for fixed-height container embedding.
 *   When true, SuperDoc propagates height through its DOM tree and adds internal scrolling,
 *   so multi-page documents scroll within the consumer's fixed-height container.
 *   Default behavior (false) lets the document expand to its natural height.
 * @property {string} [cspNonce] Content Security Policy nonce for dynamically injected styles
 * @property {string} [licenseKey] License key for organization identification
 * @property {{ enabled: boolean, endpoint?: string, metadata?: Record<string, unknown>, licenseKey?: string }} [telemetry] Telemetry configuration
 * @property {ProofingConfig} [proofing] Proofing / spellcheck configuration
 */

/**
 * @typedef {'idle' | 'checking' | 'disabled' | 'degraded'} ProofingStatus
 */

/**
 * @typedef {Object} ProofingError
 * @property {'provider-error' | 'validation-error' | 'timeout'} kind
 * @property {string} message
 * @property {string[]} [segmentIds]
 * @property {*} [cause]
 */

/**
 * @typedef {Object} ProofingConfig
 * @property {boolean} [enabled] Enable or disable proofing (default: false)
 * @property {import('@superdoc/super-editor').ProofingProvider | null} [provider] Provider instance
 * @property {string | null} [defaultLanguage] Fallback language for segments without a resolved language
 * @property {number} [debounceMs] Debounce delay after edits before rechecking (default: 500)
 * @property {number} [maxSuggestions] Maximum replacement suggestions per issue
 * @property {boolean} [visibleFirst] Prioritize checking visible pages first (default: true)
 * @property {boolean} [allowIgnoreWord] Show "Ignore" in context menu (default: true)
 * @property {string[]} [ignoredWords] Words to suppress from proofing results
 * @property {number} [timeoutMs] Provider call timeout in milliseconds (default: 10000)
 * @property {number} [maxConcurrentRequests] Max concurrent provider requests (default: 2)
 * @property {number} [maxSegmentsPerBatch] Max segments per provider call (default: 20)
 * @property {(error: ProofingError) => void} [onProofingError] Error callback for provider failures
 * @property {(status: ProofingStatus) => void} [onStatusChange] Status change callback
 */

export {};
