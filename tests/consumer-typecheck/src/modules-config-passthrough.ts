/**
 * Consumer typecheck: realistic Config with `modules.*` pass-through fields.
 *
 * The runtime spreads many consumer-provided module configs into downstream
 * stores (comments-store, SuperToolbar, etc.), so those `modules.X` shapes
 * are intentionally open: typed fields for IDE help on documented options,
 * plus an index-signature intersection to accept additional keys that the
 * runtime forwards. This fixture pins that contract so a future PR cannot
 * silently re-narrow them into closed object literals. Configs that forward
 * nothing (e.g. `contentControls`, with a single real option) are instead
 * intentionally exact; this fixture pins that shape too.
 *
 * Past regressions covered here:
 *   - SD-2869 review pass flagged `Modules.comments` rejecting
 *     `useInternalExternalComments` / `suppressInternalExternalComments`
 *     after a JSDoc → TS conversion narrowed the parent shape.
 *   - SD-2869 review pass flagged `Modules.toolbar` rejecting pass-through
 *     keys forwarded to SuperToolbar via `...moduleConfig`.
 *   - SD-2869 review pass flagged `onAwarenessUpdate.states` narrowed from
 *     JSDoc `Array` (= `any[]`) to `unknown[]`.
 */
import type { Config, AwarenessState } from 'superdoc';

// A realistic config with the documented fields plus the pass-through extras
// the runtime accepts. If any of these stops compiling under strict mode,
// existing consumer code regresses.
const config: Config = {
  selector: '#editor',

  modules: {
    comments: {
      // Documented fields.
      permissionResolver: ({
        permission,
        role,
        currentUser,
      }: {
        permission: string;
        role?: string;
        isInternal?: boolean;
        currentUser?: unknown;
      }) => {
        void permission;
        void role;
        void currentUser;
        return true;
      },
      highlightColors: {
        internal: '#ffeeaa',
        external: '#aaffee',
        activeInternal: '#ffcc88',
        activeExternal: '#88ffcc',
      },
      highlightOpacity: {
        active: 0.6,
        inactive: 0.3,
      },
      highlightHoverColor: '#ddddff',
      trackChangeHighlightColors: {
        insertBorder: '#0a0',
        insertBackground: '#dfd',
        deleteBorder: '#a00',
        deleteBackground: '#fdd',
        formatBorder: '#aa0',
      },
      // Pass-through extras the runtime reads (SuperDoc.js #initCollaboration
      // and comments-store).
      useInternalExternalComments: true,
      suppressInternalExternalComments: false,
    },

    // Documented field: built-in SDT chrome mode (SD-3159). A consumer must be
    // able to set the union value and get IDE help on it. Unlike the other
    // module configs in this fixture, contentControls is exact (no pass-through
    // index signature): it has a single real runtime option, so an unknown key
    // is a typo to catch, not a forwarded setting.
    contentControls: {
      chrome: 'none',
    },

    ai: {
      apiKey: 'test-key',
      endpoint: 'https://example.invalid/ai',
      // Pass-through.
      customExtraKey: 'forwarded-as-is',
    },

    pdf: {
      pdfLib: {} as object,
      workerSrc: 'https://example.invalid/pdf.worker.js',
      setWorker: true,
      textLayer: false,
      outputScale: 2,
      // Pass-through.
      forwardedFlag: true,
    },

    toolbar: {
      selector: '#toolbar',
      excludeItems: ['ruler'],
      groups: { left: ['undo', 'redo'], center: ['bold'], right: ['link'] },
      icons: { bold: '<svg/>' },
      texts: { bold: 'Bold' },
      hideButtons: true,
      responsiveToContainer: false,
      customButtons: [{ id: 'my-btn', label: 'Custom' }],
      // Pass-through to SuperToolbar via `...moduleConfig` spread.
      pagination: true,
      mode: 'edit',
    },

    links: {
      popoverResolver: () => ({ type: 'default' as const }),
      // Pass-through.
      extraSetting: 'ok',
    },

    contextMenu: {
      includeDefaultItems: true,
    },

    surfaces: {
      findReplace: true,
      passwordPrompt: { title: 'Encrypted' },
    },

    trackChanges: {
      mode: 'review',
      replacements: 'paired',
    },

    whiteboard: false, // disable sentinel — must compile
  },

  // Awareness handler reads concrete fields off each state. SD-2834
  // promoted `states` from `any[]` to a public `AwarenessState` type
  // (which extends `User`, since the runtime helper
  // `awarenessStatesToArray` spreads user fields at the top level via
  // `{ clientId, ...value.user, color }`). Consumers get IntelliSense
  // on the flattened fields (`name`, `email`, `clientId`, `color`)
  // without giving up the pass-through index signature for
  // application-specific keys.
  onAwarenessUpdate: ({ states }: { states: AwarenessState[] }) => {
    for (const state of states) {
      const userName = state.name;
      const userEmail = state.email;
      const clientId = state.clientId;
      const userColor = state.color;
      const customField = state['customField']; // index signature still works
      void userName;
      void userEmail;
      void clientId;
      void userColor;
      void customField;
    }
  },
};

void config;

// Whiteboard accepts the structured form too.
const enabledWhiteboard: Config = {
  selector: '#editor',
  modules: { whiteboard: { enabled: true } },
};
void enabledWhiteboard;

// CollaborationProvider interop: a value typed as the publicly-exported
// CollaborationProvider must be assignable to Config.modules.collaboration.provider
// (also typed against CollaborationProvider). Pre-SD-2880 these were two
// different shapes — super-editor's allowed `awareness: null`, core/types'
// did not — and a strict-mode consumer setting both at once got an error.
import type { CollaborationProvider } from 'superdoc';

const provider: CollaborationProvider = {
  awareness: null,
  on(event, handler) {
    void event;
    void handler;
  },
};

const collabConfig: Config = {
  selector: '#editor',
  modules: { collaboration: { provider } },
};
void collabConfig;
