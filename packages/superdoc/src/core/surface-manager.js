import { shallowRef } from 'vue';

/** @typedef {import('./types').SurfaceMode} SurfaceMode */
/** @typedef {import('./types').SurfaceRequest} SurfaceRequest */
/** @typedef {import('./types').SurfaceResolution} SurfaceResolution */
/** @typedef {import('./types').SurfaceHandle} SurfaceHandle */
/** @typedef {import('./types').SurfaceOutcome} SurfaceOutcome */
/** @typedef {import('./types').SurfacesModuleConfig} SurfacesModuleConfig */
/** @typedef {import('./types').ExternalSurfaceRenderContext} ExternalSurfaceRenderContext */

/**
 * @typedef {Object} ActiveSurface
 * @property {string} id
 * @property {SurfaceMode} mode
 * @property {SurfaceRequest} request
 * @property {unknown} [component] Resolved Vue component
 * @property {Record<string, unknown>} [props] Extra props for the Vue component
 * @property {((ctx: ExternalSurfaceRenderContext) => ({ destroy?: () => void } | void))} [render] External renderer
 * @property {(data?: unknown) => void} resolve Content-facing: settle with 'submitted'
 * @property {(reason?: unknown) => void} close Content-facing: settle with 'closed' and clear slot
* @property {(outcome: SurfaceOutcome) => boolean} settle Settle the handle promise (internal)
 * @property {boolean} settled Whether the handle has already been settled
 */

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_MODES = /** @type {const} */ (['dialog', 'floating']);

const VALID_PLACEMENTS = /** @type {const} */ ([
  'top-right',
  'top-left',
  'bottom-right',
  'bottom-left',
  'top-center',
  'bottom-center',
]);

/**
 * Validate a surface request and throw synchronously on API misuse.
 * @param {SurfaceRequest} request
 */
function validateRequest(request) {
  if (!request || typeof request !== 'object') {
    throw new Error('SurfaceManager: request must be a non-null object.');
  }

  if (!VALID_MODES.includes(request.mode)) {
    throw new Error(`SurfaceManager: mode must be "dialog" or "floating", got "${request.mode}".`);
  }

  const hasKind = 'kind' in request && request.kind != null;
  const hasComponent = 'component' in request && request.component != null;
  const hasRender = 'render' in request && typeof request.render === 'function';

  if (hasComponent && hasRender) {
    throw new Error('SurfaceManager: request cannot provide both "component" and "render". Use one or the other.');
  }

  if (!hasKind && !hasComponent && !hasRender) {
    throw new Error(
      'SurfaceManager: request must provide "kind" (intent-based) or "component"/"render" (direct-render).',
    );
  }

  // Validate floating.placement if provided
  if (request.mode === 'floating' && request.floating?.placement != null) {
    if (!VALID_PLACEMENTS.includes(request.floating.placement)) {
      throw new Error(
        `SurfaceManager: floating.placement must be one of ${VALID_PLACEMENTS.join(', ')}, got "${request.floating.placement}".`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// SurfaceManager
// ---------------------------------------------------------------------------

/**
 * SurfaceManager — a plain JavaScript class that owns surface lifecycle state.
 *
 * NOT a Pinia store. Lives on the SuperDoc instance and survives runtime
 * restarts (collaboration upgrades). Vue components observe the reactive
 * refs (`activeDialog`, `activeFloating`) via provide/inject.
 */
export class SurfaceManager {
  /** @type {import('vue').ShallowRef<ActiveSurface | null>} */
  activeDialog = shallowRef(null);

  /** @type {import('vue').ShallowRef<ActiveSurface | null>} */
  activeFloating = shallowRef(null);

  /** @type {boolean} */
  #destroyed = false;

  /** @type {number} */
  #nextId = 1;

  /** @type {() => SurfacesModuleConfig | undefined} */
  #getModuleConfig;

  /**
   * @param {{ getModuleConfig: () => SurfacesModuleConfig | undefined }} options
   */
  constructor({ getModuleConfig }) {
    this.#getModuleConfig = getModuleConfig;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Open a surface. Returns a handle with a result promise that always resolves.
   *
   * Throws synchronously on API misuse (bad request shape, unresolvable intent).
   * Normal lifecycle events (close, replace, destroy) resolve through the handle.
   *
   * @template [TResult=unknown]
   * @param {SurfaceRequest} rawRequest
   * @returns {SurfaceHandle<TResult>}
   */
  open(rawRequest) {
    // After destroy, return an immediately-settled "destroyed" handle
    if (this.#destroyed) {
      return this.#createDestroyedHandle(rawRequest);
    }

    validateRequest(rawRequest);

    const request = this.#normalizeRequest(rawRequest);
    const { component, props, render } = this.#resolveRendering(request);

    /** @type {(outcome: SurfaceOutcome<TResult>) => boolean} */
    let settle;
    let settled = false;

    /** @type {Promise<SurfaceOutcome<TResult>>} */
    const result = new Promise((resolve) => {
      settle = (outcome) => {
        if (settled) return false; // first settle wins
        settled = true;
        resolve(outcome);
        return true;
      };
    });

    /** @type {ActiveSurface} */
    let surface;

    // Content-facing callbacks only clear the slot when they settle their own surface.
    const resolveContent = (data) => {
      if (!settle({ status: 'submitted', data })) return;
      this.#clearSlot(surface);
    };
    const closeContent = (reason) => {
      if (!settle({ status: 'closed', reason })) return;
      this.#clearSlot(surface);
    };

    surface = {
      id: request.id,
      mode: request.mode,
      request,
      component,
      props,
      render,
      resolve: resolveContent,
      close: closeContent,
      settle: (outcome) => settle(outcome),
      get settled() {
        return settled;
      },
    };

    // Replace existing surface in the same slot
    const slot = request.mode === 'dialog' ? 'activeDialog' : 'activeFloating';
    const previous = this[slot].value;
    if (previous && !previous.settled) {
      previous.settle({ status: 'replaced', replacedBy: request.id });
    }
    this[slot].value = surface;

    /** @type {SurfaceHandle<TResult>} */
    const handle = {
      id: request.id,
      mode: request.mode,
      close: (reason) => this.#closeSurface(surface, reason),
      result,
    };

    return handle;
  }

  /**
   * Close a surface by id, or the topmost surface if no id is given.
   * @param {string} [id]
   * @param {unknown} [reason]
   */
  close(id, reason) {
    if (id != null) {
      const surface = this.#findById(id);
      if (surface) this.#closeSurface(surface, reason);
      return;
    }

    // No id → close topmost: dialog first, then floating
    const dialog = this.activeDialog.value;
    if (dialog && !dialog.settled) {
      this.#closeSurface(dialog, reason);
      return;
    }
    const floating = this.activeFloating.value;
    if (floating && !floating.settled) {
      this.#closeSurface(floating, reason);
    }
  }

  /**
   * Settle all active surfaces with the given outcome.
   * Used by SuperDoc during runtime restart and destroy.
   * @param {SurfaceOutcome} outcome
   */
  settleAll(outcome) {
    for (const slot of [this.activeDialog, this.activeFloating]) {
      const surface = slot.value;
      if (surface && !surface.settled) {
        surface.settle(outcome);
      }
      slot.value = null;
    }
  }

  /**
   * Permanently shut down the manager. All active surfaces are settled with
   * { status: 'destroyed' }. Future open() calls return destroyed handles.
   */
  destroy() {
    this.#destroyed = true;
    this.settleAll({ status: 'destroyed' });
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /**
   * Close a specific surface and clear it from its slot.
   * @param {ActiveSurface} surface
   * @param {unknown} [reason]
   */
  #closeSurface(surface, reason) {
    if (surface.settled) return;
    surface.settle({ status: 'closed', reason });
    this.#clearSlot(surface);
  }

  /**
   * Clear a surface from its slot if it is still the active occupant.
   * @param {ActiveSurface} surface
   */
  #clearSlot(surface) {
    const slot = surface.mode === 'dialog' ? this.activeDialog : this.activeFloating;
    if (slot.value === surface) {
      slot.value = null;
    }
  }

  /**
   * Find an active surface by id across both slots.
   * @param {string} id
   * @returns {ActiveSurface | null}
   */
  #findById(id) {
    if (this.activeDialog.value?.id === id) return this.activeDialog.value;
    if (this.activeFloating.value?.id === id) return this.activeFloating.value;
    return null;
  }

  /**
   * Normalize a raw request: generate id, merge ALL mode-level defaults.
   *
   * After normalization the request is the single source of truth for every
   * config value. Shell components must not re-derive defaults from moduleConfig.
   *
   * @param {SurfaceRequest} raw
   * @returns {SurfaceRequest}
   */
  #normalizeRequest(raw) {
    const id = raw.id ?? `surface-${this.#nextId++}`;
    const moduleConfig = this.#getModuleConfig() ?? {};
    const modeDefaults = raw.mode === 'dialog' ? moduleConfig.dialog : moduleConfig.floating;

    // Merge mode-specific sub-objects
    const normalizedDialog = raw.mode === 'dialog' ? { maxWidth: modeDefaults?.maxWidth, ...raw.dialog } : raw.dialog;

    const normalizedFloating =
      raw.mode === 'floating'
        ? {
            placement: modeDefaults?.placement ?? 'top-right',
            width: modeDefaults?.width,
            maxWidth: modeDefaults?.maxWidth,
            maxHeight: modeDefaults?.maxHeight,
            autoFocus: modeDefaults?.autoFocus ?? true,
            closeOnOutsidePointerDown: modeDefaults?.closeOnOutsidePointerDown ?? false,
            ...raw.floating,
          }
        : raw.floating;

    return {
      ...raw,
      id,
      closeOnEscape: raw.closeOnEscape ?? modeDefaults?.closeOnEscape ?? true,
      closeOnBackdrop: raw.mode === 'dialog' ? (raw.closeOnBackdrop ?? modeDefaults?.closeOnBackdrop ?? true) : false,
      dialog: normalizedDialog,
      floating: normalizedFloating,
    };
  }

  /**
   * Walk the resolution chain: request-local → resolver → (future built-in registry).
   * Returns the resolved component/render info or throws on unresolvable intent.
   * @param {SurfaceRequest} request
   * @returns {{ component?: unknown, props?: Record<string, unknown>, render?: Function }}
   */
  #resolveRendering(request) {
    // Direct-render: request already carries component or render
    if ('component' in request && request.component != null) {
      return { component: request.component, props: request.props };
    }
    if ('render' in request && typeof request.render === 'function') {
      return { render: request.render };
    }

    // Intent-based: walk the resolver chain
    const moduleConfig = this.#getModuleConfig();
    const resolver = moduleConfig?.resolver;

    if (typeof resolver === 'function') {
      const resolution = resolver(request);

      // null/undefined means "no opinion" — fall through
      if (resolution != null) {
        if (resolution.type === 'none') {
          throw new Error(`SurfaceManager: resolver explicitly suppressed surface for kind "${request.kind}".`);
        }
        if (resolution.type === 'custom') {
          return { component: resolution.component, props: resolution.props };
        }
        if (resolution.type === 'external') {
          return { render: resolution.render };
        }
      }
    }

    // No built-in registry yet — fail fast
    throw new Error(
      `SurfaceManager: no renderer resolved for kind "${request.kind}". ` +
        'Provide a resolver via modules.surfaces.resolver, or use a direct-render request.',
    );
  }

  /**
   * Create a handle that resolves immediately with { status: 'destroyed' }.
   * @template [TResult=unknown]
   * @param {SurfaceRequest} rawRequest
   * @returns {SurfaceHandle<TResult>}
   */
  #createDestroyedHandle(rawRequest) {
    const id = rawRequest?.id ?? `surface-${this.#nextId++}`;
    const mode = rawRequest?.mode ?? 'dialog';
    return {
      id,
      mode,
      close: () => {},
      result: Promise.resolve(/** @type {SurfaceOutcome<TResult>} */ ({ status: 'destroyed' })),
    };
  }
}
