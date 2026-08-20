// Public-contract type definitions for the `superdoc` package.
//
// This module is the canonical home for the shapes consumers see when they
// import from `superdoc` (Config, Modules, the surface and prompt configs,
// etc.). vite-plugin-dts emits these declarations into the published `.d.ts`
// graph, and the consumer-typecheck matrix asserts each export resolves to a
// real interface — not `any` and not missing.
//
// SD-2869 converted this file from JSDoc typedefs to TypeScript so the
// declarations are self-checked by the compiler. Keep the public surface
// stable: each exported name and shape mirrors the previous JSDoc; new fields
// or behavioral changes belong in a follow-up ticket.

import type { Doc as YDoc } from 'yjs';
import type { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import type { Ref, ComputedRef } from 'vue';

import type {
  DocumentFontOption,
  FontAssetUrlResolver,
  FontFamilyOption,
  FontLoadSummary,
  FontResolutionRecord,
} from '@superdoc/font-system';

export type {
  DocumentFontOption,
  FontAssetUrlContext,
  FontAssetUrlResolver,
  FontFaceSlot,
  FontFamilyOption,
  FontLoadResult,
  FontLoadStatus,
  FontLoadSummary,
  FontResolutionReason,
  FontResolutionRecord,
  GlyphException,
  ResolvedFontEvidence,
  SubstitutePolicyAction,
  SubstituteVerdict,
} from '@superdoc/font-system';

import type { SuperDoc as SuperDocClass } from '../SuperDoc.js';
import type { SuperDocActiveEditorExtensions, SuperDocExtension } from '../extensions/index.js';

export type SuperDoc = SuperDocClass;

// Defined in its own leaf module so `superdoc/ui`'s self-contained types can
// share the definition without importing the `SuperDoc` class type from here.
import type { BrowserDocumentApi } from '../../public/browser-document-api.js';
export type { BrowserDocumentApi } from '../../public/browser-document-api.js';

import type { CustomCommandContext } from '../../public/ui/types.js';

/**
 * A row in a custom dropdown's option list, and the value handed back to the
 * `command` callback when one is chosen.
 *
 * `label` and `key` are what the toolbar reads: `handleSelect` uses `label` as
 * the command argument (unless `dropdownValueKey` names another member) and
 * `key` as the selection identity (`ButtonGroup.vue:167-169`).
 *
 * Both are optional here rather than required, because a `type: 'render'`
 * entry is a custom-rendered row that the selection path explicitly skips
 * (`ButtonGroup.vue:268`), so it carries neither. The index signature keeps
 * the rest of the row open.
 */
export interface ToolbarDropdownOption {
  /** Row text, and the default command argument when the row is chosen. */
  label?: string;
  /**
   * Stable row identity, used for selection state and handed to the command.
   *
   * Numbers included, because the built-in zoom dropdown uses them
   * (`key: 0.5`, `key: 1`) and the runtime passes the value through
   * unchanged. This is what a `command` callback reads as `context.option`,
   * so a string-only declaration here made a numeric key unusable at the far
   * end even once the config side accepted it.
   */
  key?: string | number;
  /** Attributes spread onto the rendered row. */
  props?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * The context a custom toolbar button's `command` callback receives.
 *
 * The runtime registers the callback as a custom command and invokes it with
 * the controller's {@link CustomCommandContext} plus three toolbar-specific
 * members (`built-in-toolbar.js:#prepareCustomButton`), so a consumer writing
 * `({ execute, option }) => ...` gets both halves typed.
 *
 * `item` is deliberately `unknown`. It is the live Vue reactive object
 * `useToolbarItem` returns — a bag of `ref`s whose shape is an implementation
 * detail. Typing it would publish that internal and freeze it; see #1098 for
 * the public toolbar-item contract that would replace it.
 */
export interface ToolbarCustomButtonContext extends CustomCommandContext {
  /** The live toolbar item handle. Internal shape; see #1098. */
  item: unknown;
  /**
   * The selected dropdown row, passed through verbatim, or `undefined` for a
   * plain button that has no selection.
   */
  option?: ToolbarDropdownOption;
  /** Argument threaded through the command payload. */
  argument?: unknown;
}

/**
 * What a custom toolbar entry does when activated.
 *
 * A function is registered as a custom command and invoked with
 * {@link ToolbarCustomButtonContext}; a string is read as a canonical V2
 * command id and routed through the shared controller. An unknown id is
 * accepted at compile time and then reported through the toolbar's
 * `exception` event as "Command not handled" -- so the string form stays
 * unnarrowed, but a typo is diagnosed at runtime rather than ignored.
 */
export type ToolbarCustomButtonCommand = string | ((context: ToolbarCustomButtonContext) => unknown);

/** Members every custom toolbar entry carries, whatever its type. */
interface ToolbarCustomEntryBase {
  /**
   * Unique item name, which also derives the registered command id and the
   * rendered `data-item` attribute.
   *
   * Uniqueness is enforced at construction rather than here: a name that
   * repeats, or that matches a built-in item, used to render a second control
   * under the same `data-item` with neither responding.
   */
  name: string;
  /** Which toolbar group the entry joins. Defaults to `center`. */
  group?: 'left' | 'center' | 'right' | (string & {});
  /** Hover text. */
  tooltip?: string;
  /** Render the entry as unavailable. Honored: a disabled entry does not run. */
  disabled?: boolean;
  /** Extra DOM hooks. Both are read straight onto the rendered control. */
  attributes?: {
    /**
     * Appended to the item's class list. Any value Vue's `class` binding
     * takes: a string, an array, a condition map, or a nesting of those.
     *
     * AIDEV-NOTE: unconstrained for the same reason as `dropdownStyles`, and
     * verified rather than assumed. This lands inside an array binding --
     * `ToolbarButton` renders `:class="['sd-toolbar-item',
     * attributes.className]"` -- so Vue resolves it, and `string` rejected
     * `['compact', { active: isActive }]`, the ordinary way to write a
     * conditional class. There is also nothing to import or mirror:
     * `@vue/shared` types the input as `normalizeClass(value: unknown)`, so
     * Vue does not name this shape either, and any union written here would
     * be narrower than what Vue accepts. A browser test asserts the array and
     * the condition map both resolve, including that a false branch is
     * dropped rather than stringified.
     */
    className?: unknown;
    /** Sets `aria-label`, which is otherwise absent on a custom entry. */
    ariaLabel?: string;
  };
  /** Render the control at reduced width. */
  isNarrow?: boolean;
  /** Render the control at increased width. */
  isWide?: boolean;
  /**
   * `active` and `activeIcon` are rejected by name because both are dead.
   * `useToolbarItem` hard-codes the initial active state to `false` and
   * discards the option, and nothing in the toolbar reads `activeIcon`. Set
   * the state from the command instead, which does work.
   */
  active?: never;
  activeIcon?: never;
  /**
   * Open on purpose. `useToolbarItem` accepts 37 fields and forwards them, and
   * closing this list around the ones I could enumerate rejected seven working
   * configurations in review -- `label`, `hasCaret`, `dropdownValueKey`, row
   * `icon`, `attributes`, `splitButton`, `argument` -- each of which renders or
   * is forwarded by code the enumeration missed.
   *
   * So the guarantees here are structural rather than exhaustive: which `type`
   * values render at all, that a button and a dropdown each have something
   * visible, that a dropdown has rows, and that the two dead fields above are
   * refused. A misspelled rare field still compiles, which is the same
   * trade-off `CommentsConfig` makes for the same reason -- the runtime passes
   * the whole bag through, so a closed type would be wrong more often than a
   * typo is.
   */
  [key: string]: unknown;
}

/**
 * A custom button.
 *
 * `icon` is required, which is stricter than the runtime check and deliberately
 * so. Construction accepts `icon` **or** `defaultLabel`, but only the icon
 * reaches the DOM: a button carrying `defaultLabel` alone builds, mounts, and
 * draws nothing, leaving an empty control in the toolbar. Requiring `icon`
 * keeps this type to shapes that produce something a user can see.
 *
 * `label` is not accepted at all. It is the *live* label a built-in item
 * rewrites as state changes, it does not satisfy the affordance check, and a
 * button carrying only `label` is rejected at construction.
 *
 * AIDEV-NOTE: `defaultLabel` renders nothing for a custom button. The check in
 * `use-toolbar-item.js` treats it as an affordance and `ToolbarButton.vue`
 * never draws it. Widening this type to accept `defaultLabel` alone requires
 * fixing that render first, or it re-admits invisible buttons (#1098).
 */
export interface ToolbarCustomButtonItem extends ToolbarCustomEntryBase {
  type: 'button';
  /** Inline SVG or markup. The only thing a custom button actually renders. */
  icon: string;
  /**
   * Static label kept for the affordance check and for parity with the legacy
   * spelling. It does not render today; pair it with `icon`, never alone.
   */
  defaultLabel?: string;
  /**
   * Visible text drawn beside the icon. Unlike `defaultLabel` this really is
   * rendered, but it does not satisfy the affordance check on its own, so it
   * accompanies `icon` rather than replacing it.
   */
  label?: string;
  /**
   * What the button does. Optional because omitting it renders a control that
   * does nothing rather than failing, which is legal today; an entry meant to
   * be actionable should always carry one.
   */
  command?: ToolbarCustomButtonCommand;
}

/**
 * One selectable row in a custom dropdown.
 *
 * Both members are required: `key` is what reaches the command through
 * {@link ToolbarCustomButtonContext.option}, and `label` is the only text the
 * row renders, so a row missing either draws blank or selects as `undefined`.
 */
interface ToolbarCustomDropdownOptionBase {
  /**
   * Drawn beside the row's label, or a function returning it.
   *
   * Not string-only: `OptionIcon` returns whatever this resolves to straight
   * from a render function, so a Vue VNode works as well as markup.
   *
   * `object` rather than `Record<string, unknown>`, which was the first
   * attempt and admitted only inferred object literals -- a value already
   * typed as Vue's `VNode` has no string index signature and so failed to
   * assign. `object` accepts both without importing Vue's types into the
   * public surface.
   */
  icon?: string | object | ((option: ToolbarCustomDropdownOption) => unknown);
  /** Render the row as unavailable. */
  disabled?: boolean;
  /** Added to the row's class list. */
  class?: unknown;
  /**
   * Spread onto the rendered row as attributes, and its `class` is merged
   * with the one above. Declared here as well as on `ToolbarDropdownOption`,
   * which it mirrors.
   */
  props?: Record<string, unknown>;
  /**
   * Open, like the `ToolbarDropdownOption` it mirrors, because
   * `dropdownValueKey` names a member to read dynamically: a row can carry
   * `{ label, key, value }` and send `value` to the command. Closing this
   * would make that shape uncompilable while it still works.
   */
  [key: string]: unknown;
}

/**
 * One row in a custom dropdown.
 *
 * A selectable row needs both `label` and `key`: `label` is the only text it
 * renders, and `key` is what reaches the command through
 * {@link ToolbarCustomButtonContext.option}.
 *
 * A `type: 'render'` row is the exception and is why this is a union rather
 * than one interface. `ToolbarDropdown` routes those to its `RenderOption`
 * branch and never reads `label` for them, so requiring it would reject rows
 * the runtime supports -- which the first version of this type did.
 */
export type ToolbarCustomDropdownOption =
  | (ToolbarCustomDropdownOptionBase & {
      /**
       * Application metadata. A row carrying `{ type: 'action', label, key }`
       * stays selectable and reaches the command verbatim, so this member is
       * open.
       *
       * AIDEV-NOTE: that openness means `{ type: 'render', label, key }` with
       * no renderer still matches this branch, so the render branch's
       * required `render` does not catch it (#1098). `Exclude<string,
       * 'render'>` does not help -- subtracting a literal from the wide
       * `string` type leaves `string` -- and neither does a branded
       * intersection, because a plain string literal remains assignable to
       * both. Closing this needs a literal union of the metadata values the
       * product supports, which is a contract decision rather than a
       * transcription. The runtime treats such a row as render-only and draws
       * a blank, inert row.
       */
      type?: string;
      /** Text rendered for the row. */
      label: string;
      /**
       * Value handed to the command when this row is chosen, and the row's
       * Vue key. Numbers are allowed because the built-in zoom dropdown uses
       * them (`key: 0.5`, `key: 1`), and `ButtonGroup` passes the value
       * through to `selectedValue` unchanged.
       */
      key: string | number;
    })
  | (ToolbarCustomDropdownOptionBase & {
      /** Rendered through `RenderOption` rather than as a selectable row. */
      type: 'render';
      /**
       * Required, because `RenderOption` returns `null` unless this is
       * callable. A render row is also excluded from selection, so one
       * without a renderer is a permanently blank row that cannot be clicked.
       */
      render: () => unknown;
      label?: string;
      key?: string | number;
    });

/**
 * A custom dropdown.
 *
 * `options` is required and must be non-empty: a dropdown with no rows, or an
 * empty array, renders no trigger at all, so the entry silently disappears
 * rather than drawing something inert.
 *
 * The trigger rule is looser than a button's -- `label` works here as well as
 * `icon` -- because the dropdown draws its own trigger rather than going
 * through the button affordance check.
 */
interface ToolbarCustomDropdownBase extends ToolbarCustomEntryBase {
  type: 'dropdown';
  /**
   * Static fallback trigger text. Present for parity with the legacy spelling
   * and does not render, which is why it does not satisfy the trigger
   * requirement below.
   */
  defaultLabel?: string;
  /**
   * The rows the dropdown offers. Empty is accepted, and is not a mistake on
   * its own: `#updateHighlightColors` assigns `nestedOptions` after the item
   * is built, so a dropdown can construct empty and fill in later. An empty
   * one renders no menu rather than breaking -- `ButtonGroup` guards the
   * branch on `nestedOptions.value.length`.
   *
   * AIDEV-NOTE: this was a nonempty tuple until #1188 review. The tuple did
   * reject `options: []`, and it also rejected every array TypeScript cannot
   * see the length of -- `rows.map(...)`, a `Row[]` variable, a function
   * return. Those are how dropdown rows are normally built; `lineHeight` in
   * `default-items.js` builds its own rows with `.map()`. The obvious escape,
   * `readonly T[] & { 0: T }`, rejects all four (measured, not assumed): an
   * array type carries no index-0 property for the intersection to satisfy.
   * So please do not reintroduce a tuple here -- and note there is no runtime
   * check to fall back on either, deliberately, because an empty dropdown is
   * a legitimate intermediate state.
   *
   * `readonly` so an `as const` array is accepted: the runtime only iterates
   * this and copies the elements into `nestedOptions`, never mutating the
   * consumer's array.
   */
  options: readonly ToolbarCustomDropdownOption[];
  /** Draw the dropdown caret beside the trigger. Rendered by `ToolbarButton`. */
  hasCaret?: boolean;
  /**
   * Which member of the selected row becomes the command's `argument`.
   *
   * Defaults to `label`, not `key`: `ButtonGroup.handleSelect` reads
   * `option[dropdownValueKey]` and falls back to `option.label` when this is
   * unset. So a dropdown whose display text differs from its value has to set
   * `'key'` explicitly, or the command receives the text a user sees rather
   * than the value it stands for. Any member name works, not just `key`: a row
   * carrying `{ label, key, value }` can send `value`. `context.option` always
   * carries the whole row either way.
   */
  dropdownValueKey?: string;
  /**
   * Inline styles for the dropdown's own element -- its trigger and wrapper --
   * forwarded unchanged to Vue's `:style` binding.
   *
   * Not the open panel: `ButtonGroup` styles that separately through
   * `menu-props`, which `customButtons` cannot reach. Widths set here size the
   * control in the toolbar, not the menu it opens.
   *
   * AIDEV-NOTE: deliberately unconstrained. Restating Vue's `StyleValue` here
   * was attempted three times and was wrong each time -- string-valued
   * objects rejected `{ padding: 0 }`, object-only rejected
   * `'min-width: 200px'`, and a hand-written union rejected a value already
   * typed as `CSSProperties`, whose index signature a structural restatement
   * does not match. The shape set is Vue's to define and moves with Vue, so
   * mirroring it by hand keeps rejecting working configuration. Importing
   * `StyleValue` would pull a Vue type into the public surface, which this
   * package avoids elsewhere.
   */
  dropdownStyles?: unknown;
  /**
   * `key` of the row to show as selected before the user picks one. Matches
   * the row `key` type, numbers included.
   */
  selectedValue?: string | number;
  /** Invoked with the chosen row on {@link ToolbarCustomButtonContext.option}. */
  command?: ToolbarCustomButtonCommand;
}

/**
 * A dropdown needs a trigger a user can see, and it has three ways to draw
 * one. `ToolbarButton` renders `icon` and `label` in its non-split branch and,
 * beside them, `.sd-dropdown-caret` on `v-if="hasCaret"` alone -- so a compact
 * caret-only dropdown is a real control, not an oversight. It renders with a
 * measurable width and opens its rows; only `defaultLabel` draws nothing.
 *
 * Splitting the variant is what makes at-least-one enforceable rather than
 * advisory. Pair a caret-only trigger with `attributes.ariaLabel`, since
 * there is no text for a screen reader to announce.
 */
export type ToolbarCustomDropdownItem =
  | (ToolbarCustomDropdownBase & { icon: string; label?: string; hasCaret?: boolean })
  | (ToolbarCustomDropdownBase & { label: string; icon?: string; hasCaret?: boolean })
  | (ToolbarCustomDropdownBase & { hasCaret: true; icon?: string; label?: string });

/** A visual divider. Renders on its own and has nothing to run. */
export interface ToolbarCustomSeparatorItem extends ToolbarCustomEntryBase {
  type: 'separator';
}

/**
 * A custom entry appended to the built-in toolbar's default item set.
 *
 * What this guarantees is structural, not exhaustive. Each variant fixes the
 * shape of the entry -- which `type` values render at all, that a button and a
 * dropdown each carry something visible, that a dropdown has rows -- while the
 * field list itself stays open, because `useToolbarItem` accepts 37 fields and
 * forwards them. Closing that list rejected eight working configurations
 * during review, and a rejected working config is a worse failure than the
 * autocomplete it buys.
 *
 * Two of the five `useToolbarItem` types are absent because they render
 * nothing: `options` constructs without throwing and `ButtonGroup` has no
 * branch for it, and `overflow` draws only from the separately-built overflow
 * list, which `customButtons` cannot populate.
 *
 * Two fields are refused by name on {@link ToolbarCustomEntryBase} for the
 * same reason: `active` is discarded (`useToolbarItem` hard-codes the initial
 * state to `false`) and `activeIcon` has no toolbar reader at all.
 *
 * Derived from a rendered-behavior survey rather than from the constructor
 * (#1098): construction succeeding proves only that nothing threw, which for
 * this surface was never the same question as whether a control appeared.
 */
export type ToolbarCustomButton = ToolbarCustomButtonItem | ToolbarCustomDropdownItem | ToolbarCustomSeparatorItem;

export type V2AuthoringSelectionCollapse = 'start' | 'end' | null;

export type V2AuthoringResult =
  | { ok: true; mode?: 'collapsed' | 'range'; [key: string]: unknown }
  | { ok: false; reason: string; detail?: string };

/**
 * Narrow v2 browser-authoring bridge for shell/proof setup code. This surface
 * does not expose v1 ProseMirror `view` / `state` / `commands`; it resolves
 * public Document API selection targets and asks the v2 host to apply them to
 * the live editable selection.
 */
export interface V2AuthoringFacade {
  setSelectionByText(input: {
    text: string;
    occurrence?: number;
    collapse?: V2AuthoringSelectionCollapse;
    focus?: boolean;
  }): Promise<V2AuthoringResult>;
  setSelectionTarget(input: {
    target: unknown;
    collapse?: V2AuthoringSelectionCollapse;
    focus?: boolean;
  }): Promise<V2AuthoringResult>;
  focusEditable(): unknown;
  readBlocks?(input?: Record<string, unknown>): unknown;
  replaceTextByText?(input: {
    findText: string;
    replacement: string;
    occurrence?: number;
    mode?: 'direct' | 'tracked';
  }): Promise<V2AuthoringResult>;
  replaceSelection?(input: {
    target: unknown;
    replacement?: string;
    mode?: 'direct' | 'tracked';
  }): Promise<V2AuthoringResult>;
  serializeSelectionToClipboard?(input?: { includeHtml?: boolean }): Promise<V2AuthoringResult>;
  pasteClipboardPayload?(input: {
    payload: unknown;
    target?: unknown;
    mode?: 'direct' | 'tracked';
    fallback?: unknown;
  }): Promise<V2AuthoringResult>;
  pastePlainText?(input: { text: string; target?: unknown; mode?: 'direct' | 'tracked' }): Promise<V2AuthoringResult>;
}

/**
 * The current user of this superdoc.
 *
 * Every field is optional on input. `SuperDoc.#init` normalizes a
 * missing or partial `user` by spreading `DEFAULT_USER` over consumer
 * input, so `name` and `email` always have a value at runtime even
 * when the consumer omits them.
 *
 * `User` does NOT carry the collab-awareness `color` field; that is on
 * the internal `AwarenessUser` (see below), assigned by SuperDoc's
 * `#assignUserColor()` after `#init`.
 */
export interface User {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  [key: string]: unknown;
}

/** V2-neutral active editor facade exposed by legacy shell methods. */
export interface EditorCommands {
  search?: (text: string | RegExp, options?: Record<string, unknown>) => SearchMatch[];
  goToSearchResult?: (match: SearchMatch) => unknown;
  [key: string]: unknown;
}

export interface Editor {
  editorVersion?: 2;
  options?: {
    documentId?: string;
    documentMode?: DocumentMode;
    [key: string]: unknown;
  };
  /**
   * The public, read-only-guarded browser Document API facade for the active
   * editor (`superdoc.activeEditor.doc`). It exposes the supported browser
   * Document API surface customers know (`doc.comments.*`,
   * `doc.trackChanges.*`, `doc.history.*`, `doc.selection.current`,
   * `doc.format.*`, `doc.query.*`, etc.), with read-only enforcement and
   * mutation finalization owned by the v2 host facade. In browser mode this
   * surface is async-capable and operations may return promises; SDK/headless
   * document automation stays synchronous on its own surface.
   */
  doc?: BrowserDocumentApi | null;
  authoring?: V2AuthoringFacade | null;
  /**
   * Command bag exposed by v1 editors (`null` on v2-shaped runtimes). Only the
   * commands the shell dispatches directly are typed; everything else stays
   * behind the index signature.
   */
  commands?: EditorCommands | null;
  state?: unknown;
  view?: unknown;
  exportDocx?: (options?: Record<string, unknown>) => Promise<Blob | File | null | undefined>;
  focus?: (options?: { preventScroll?: boolean; restoreSelection?: boolean }) => unknown;
  setOptions?: (options: Record<string, unknown>) => unknown;
  setDocumentMode?: (mode: DocumentMode) => unknown;
  setHighContrastMode?: (isHighContrast: boolean) => unknown;
  on?: (...args: unknown[]) => unknown;
  off?: (...args: unknown[]) => unknown;
  getHTML: (options?: Record<string, unknown>) => unknown;
  getDocumentId?: () => string | null | undefined;
  /**
   * Narrow v2 extension facet for command execution and diagnostics, backed by
   * the active document's extension manager. Present only when one or more
   * `extensions` are registered on the active document; `null`/absent
   * otherwise. Does not expose the raw private extension manager. See
   * {@link SuperDocActiveEditorExtensions}.
   */
  extensions?: SuperDocActiveEditorExtensions | null;
  [key: string]: unknown;
}

/**
 * Presentation-editor capability bag retained for shell compatibility. The
 * methods the shell dispatches to are typed; capabilities stay optional because
 * JS composables assemble this bag incrementally.
 */
export interface DocumentRendererRuntime {
  getLastFontsChangedPayload?: () => FontsChangedPayload | null;
  navigateTo?: (target: NavigableAddress) => unknown;
  scrollToElement?: (elementId: string) => unknown;
  setContextMenuDisabled?: (disabled: boolean) => unknown;
  setShowBookmarks?: (show: boolean) => unknown;
  setShowFormattingMarks?: (show: boolean) => unknown;
  setDocumentMode?: (mode: DocumentMode) => unknown;
  setTrackedChangesOverrides?: (preferences?: {
    mode?: 'review' | 'original' | 'final' | 'off';
    enabled?: boolean;
  }) => unknown;
  setViewingCommentOptions?: (options: Record<string, unknown>) => unknown;
  [key: string]: unknown;
}

export type StoryLocator = string | Record<string, unknown>;
export type BookmarkAddress = string | Record<string, unknown>;
export type BlockNavigationAddress = string | Record<string, unknown>;
export type CommentAddress = string | Record<string, unknown>;
export type TrackedChangeAddress = string | Record<string, unknown>;
export type NavigableAddress =
  | StoryLocator
  | BookmarkAddress
  | BlockNavigationAddress
  | CommentAddress
  | TrackedChangeAddress;

export interface CollaborationProvider {
  awareness?: unknown;
  document?: unknown;
  synced?: boolean;
  isSynced?: boolean;
  on?: (...args: unknown[]) => unknown;
  off?: (...args: unknown[]) => unknown;
  disconnect?: () => unknown;
  destroy?: () => unknown;
  [key: string]: unknown;
}

/**
 * Document-level v2 collaboration handoff.
 *
 * This is the public surface for SuperDoc v2's shipped real-time collaboration
 * model. v2 collaboration is always single-doc: one `Y.Doc`, one provider
 * session, and one awareness channel bound to one document/root identity. Set
 * it on a `Document` entry to make that document collaborative under the v2
 * runtime; SuperDoc forwards it into the v2 browser shell, which constructs the
 * single-doc provider internally. One `documentId` maps to exactly one
 * room/provider/root identity.
 *
 * SuperDoc v2 supports three first-class provider families through this field:
 * y-websocket, Hocuspocus, and Liveblocks. The provider is selected with
 * `providerType`; omitting it preserves the original y-websocket-only shape
 * (`{ documentId, serverUrl, params? }`) for backward compatibility.
 *
 * This is intentionally distinct from the legacy provider-agnostic
 * {@link CollaborationConfig} (`Config.modules.collaboration`): v2 owns its
 * provider internally and does **not** accept an external Yjs `provider`/`ydoc`
 * through this field. External `{ ydoc, provider }` remains a v1 /
 * provider-compat concern only and is rejected as a v2 content driver.
 */
export type V2CollaborationConfig =
  | V2YWebsocketCollaborationConfig
  | V2HocuspocusCollaborationConfig
  | V2LiveblocksCollaborationConfig;

/**
 * y-websocket single-doc provider config.
 *
 * `providerType` is optional: omitting it (the `{ documentId, serverUrl }`
 * shape) is the backward-compatible default and resolves to y-websocket.
 */
export interface V2YWebsocketCollaborationConfig {
  /** Provider family selector. Optional; defaults to `'y-websocket'`. */
  providerType?: 'y-websocket';
  /**
   * Stable shared document identity. Both actors that pass the same
   * `documentId` join the same room and converge on the same root Y.Doc.
   */
  documentId: string;
  /** WebSocket server URL for the single-doc y-websocket provider. */
  serverUrl?: string;
  /** Alias for {@link serverUrl}; `url` wins when both are present. */
  url?: string;
  /**
   * Optional connection query params forwarded to the provider (for example
   * an auth token). Values are strings.
   */
  params?: Record<string, string> | null;
  /** Explicit room operation. Defaults to `'join'`; `'create'` never joins an existing room. */
  roomMode?: 'join' | 'create';
}

/** Hocuspocus single-doc provider config. */
export interface V2HocuspocusCollaborationConfig {
  providerType: 'hocuspocus';
  /** Stable shared document identity (used as the v2 root/room identity). */
  documentId: string;
  /** Hocuspocus backend websocket URL. */
  serverUrl?: string;
  /** Alias for {@link serverUrl}; `url` wins when both are present. */
  url?: string;
  /** Optional connection params forwarded to the backend. */
  params?: Record<string, string> | null;
  /** Auth-message token forwarded to the Hocuspocus backend. */
  token?: string;
  /** Explicit room operation. Defaults to `'join'`; `'create'` never joins an existing room. */
  roomMode?: 'join' | 'create';
}

/**
 * Liveblocks single-doc provider config.
 *
 * Exactly one auth mode is supported: `publicApiKey` (anonymous) or
 * `authEndpoint` (server-side token issuance).
 */
export interface V2LiveblocksCollaborationConfig {
  providerType: 'liveblocks';
  /** Stable shared document/room identity. */
  documentId?: string;
  /** Alias for {@link documentId} (Liveblocks room naming). */
  roomId?: string;
  /** Liveblocks public API key (anonymous auth) — mutually exclusive with {@link authEndpoint}. */
  publicApiKey?: string;
  /**
   * Liveblocks auth endpoint URL (server-side token) — mutually exclusive with
   * {@link publicApiKey}. Browser-relative URLs resolve against the current
   * page; non-browser SDK/CLI callers must use an absolute HTTP(S) URL.
   */
  authEndpoint?: string;
  /** Explicit room operation. Defaults to `'join'`; `'create'` never joins an existing room. */
  roomMode?: 'join' | 'create';
}

export interface Comment {
  id?: string;
  commentId?: string;
  text?: string;
  resolved?: boolean;
  [key: string]: unknown;
}

export interface FontFaceConfig {
  source?: string;
  url?: string;
  weight?: string | number;
  style?: string;
  display?: string;
  [key: string]: unknown;
}

export interface FontFamilyConfig {
  family: string;
  faces?: FontFaceConfig[];
  [key: string]: unknown;
}

export type FontConfig = FontFamilyConfig;

/**
 * One row in the toolbar's font-family dropdown.
 *
 * Distinct from {@link FontFamilyConfig}, which describes a family to load and
 * measure. This describes a row to render.
 *
 * `label` and `key` are both required because the toolbar has no fallback for
 * either. `label` is the value applied to the selection
 * (`emitFontCommand(option.label)`) and what active-state matching compares
 * against (`fontOptions.find((i) => i.label === fontFamily)`); `key` is the
 * selection identity and the rendered list key. An entry missing either one
 * produces a blank row or an undefined command value rather than a
 * degraded-but-working option.
 */
export interface ToolbarFontOption {
  /**
   * Logical family name. Rendered as the row's text, written to the selection
   * when chosen, and compared against the current font for active state.
   */
  label: string;
  /** Stable option identity, used for selection state and the list key. */
  key: string;
  /**
   * Attributes spread onto the rendered row, which is the only channel that
   * reaches it: both renderers bind `option.props` and nothing else
   * (`ToolbarComboBox.vue:559`, `ToolbarDropdown.vue:420`).
   *
   * `props.style.fontFamily` is the preview stack the row is drawn in;
   * `normalizeFontOption` falls back to `label` then `key` when it is absent,
   * so a row always previews in something. Weight and any other per-row style
   * go here too — `props: { style: { fontWeight: 700 } }` renders, a top-level
   * `fontWeight` does not.
   */
  props?: {
    style?: { fontFamily?: string; [key: string]: unknown };
    [key: string]: unknown;
  };
}

export interface FontsConfig {
  bundled?: boolean | 'baseline' | 'full' | string[] | Record<string, unknown>;
  families?: FontFamilyConfig[];
  /**
   * Base URL the bundled substitute pack (and curated faces) are fetched from, e.g. `'/fonts/'`.
   * Canonical self-hosting field. When no pack is configured, SuperDoc fetches no bundled assets.
   */
  assetBaseUrl?: string;
  /**
   * Resolver for per-asset URLs (signed / versioned / CDN), called for each bundled face filename.
   * Takes precedence over {@link assetBaseUrl} when present.
   */
  resolveAssetUrl?: FontAssetUrlResolver;
  /** @deprecated Use {@link assetBaseUrl} (string) or {@link resolveAssetUrl} (function) instead. */
  assetUrl?: string | FontAssetUrlResolver;
  [key: string]: unknown;
}

export interface FontsResolvedPayload {
  report?: FontResolutionRecord[];
  missingFonts?: string[];
  documentFonts?: string[];
  documentFontOptions?: DocumentFontOption[];
  [key: string]: unknown;
}

export interface FontsChangedPayload extends FontsResolvedPayload {
  source?: string;
  loadSummary?: FontLoadSummary | null;
}

export interface ListDefinitionsPayload {
  [key: string]: unknown;
}

export type ProofingIssueKind = 'spelling' | 'grammar' | 'style';

export interface ProofingCapabilities {
  issueKinds: ProofingIssueKind[];
  supportsSuggestions?: boolean;
  supportsMultipleLanguages?: boolean;
  supportsBatching?: boolean;
  requiresNetwork?: boolean;
}

export interface ProofingSegmentMetadata {
  blockId?: string;
  pageIndex?: number;
  surface: 'body' | 'header' | 'footer' | 'table-cell' | 'other';
}

export interface ProofingSegment {
  id: string;
  text: string;
  language?: string | null;
  metadata: ProofingSegmentMetadata;
}

export interface ProofingCheckRequest {
  documentId?: string | null;
  defaultLanguage?: string | null;
  maxSuggestions?: number;
  segments: ProofingSegment[];
  signal?: AbortSignal;
}

export interface ProofingIssue {
  segmentId: string;
  /** Zero-based start offset into the segment text (UTF-16 code units). */
  start: number;
  /** Zero-based end offset into the segment text (UTF-16 code units, exclusive). */
  end: number;
  kind: ProofingIssueKind;
  message?: string;
  replacements?: string[];
  ruleId?: string;
  providerMeta?: Record<string, unknown>;
}

export interface ProofingCheckResult {
  issues: ProofingIssue[];
}

/**
 * Provider-agnostic proofing engine. SuperDoc owns segment extraction,
 * scheduling, and rendering; providers only inspect text and return ranges.
 */
export interface ProofingProvider {
  id: string;
  getCapabilities?: () => Promise<ProofingCapabilities> | ProofingCapabilities;
  check: (request: ProofingCheckRequest) => Promise<ProofingCheckResult>;
  dispose?: () => Promise<void> | void;
}

export interface SelectionInfo {
  [key: string]: unknown;
}

/**
 * Font surface on a SuperDoc instance (`superdoc.fonts`). The substitution- and load-aware
 * answer to "what fonts does this document use and did SuperDoc render them faithfully" -
 * pulled on demand and streamed via the `fonts-changed` event - plus a per-document write
 * surface: {@link map}/{@link unmap} override resolution, {@link add} registers custom faces,
 * {@link preload} loads them. All reflect the ACTIVE editor: reads return empty arrays when no
 * editor is active; writes throw. {@link getReport} and {@link getDocumentFonts} cover the
 * document's DECLARED fonts (font table + theme + defaults), not only fonts visible on screen.
 */
/** Public SuperDoc alias for the canonical font face config. */
export type SuperDocFontFace = FontFaceConfig;

/** Public SuperDoc alias for the canonical font family config. */
export type SuperDocFontFamily = FontFamilyConfig;

export interface SuperDocFontsApi {
  /** Per-font report: requested logical family -> physical render family, reason, load status, export family, missing. */
  getReport(): FontResolutionRecord[];
  /** Declared families with no faithful render font loaded (the substitution-aware truth). */
  getMissingFonts(): string[];
  /** The document's declared logical font families, deduped. */
  getDocumentFonts(): string[];
  /**
   * The document's own fonts as toolbar options: one per logical family the document renders, each with
   * a preview family. Document fonts only - compose with the defaults.
   */
  getDocumentFontOptions(): DocumentFontOption[];
  /**
   * The complete font-family picker list for the active document: the bundled offerings gated on its
   * font activation (baseline when no pack is configured, the curated rich set when it is, honoring
   * include/exclude) unioned with the document's own fonts, sorted alphabetically. Drives the built-in
   * toolbar font dropdown; ready to use, not just document fonts.
   */
  getFontFamilyOptions(): FontFamilyOption[];
  /**
   * Observe the font report: replays the current report immediately if one has already
   * resolved, then invokes `callback` on every future change. Use this rather than
   * `on('fonts-changed')` when you may subscribe after the report resolved. Note: right after
   * a document swap, if the new active editor has not produced a report yet, nothing is
   * delivered until it does (no stale prior-document report). Returns an unsubscribe function.
   */
  onReport(callback: (payload: FontsChangedPayload) => void): () => void;
  /**
   * Map logical families to physical render families for the ACTIVE document, overriding bundled
   * defaults: `map({ Georgia: 'Gelasio', Arial: 'Liberation Sans' })`. Applies all entries, then
   * re-measures and repaints once (a redundant map - a self-map, or a mapping identical to an
   * already-stored override - does neither); observe via {@link onReport} / `fonts-changed` (`source:
   * 'config-change'`). Mapping a family to its bundled clone (`map({ Calibri: 'Carlito' })`) is honored
   * as an explicit PIN - stored so it outranks a registered real face for that family - not treated as
   * a no-op. Each physical family must be loadable - a bundled substitute, or a face added via `add`.
   * Per document: other editors on the page are unaffected. Render-only - export keeps the logical
   * family name.
   * @throws Error if no editor is active (a write needs a document; this fails loudly, not silently).
   */
  map(mappings: Record<string, string>): void;
  /**
   * Remove runtime mappings for the ACTIVE document; each family reverts to its bundled default
   * (or its logical name). Accepts one family or several. Re-measures and repaints if anything
   * changed.
   * @throws Error if no editor is active.
   */
  unmap(families: string | string[]): void;
  /**
   * Register custom physical font faces (URL sources) for the ACTIVE document so they can be mapped
   * to and loaded - e.g.
   * `add({ family: 'Gelasio', faces: [{ source: '/fonts/Gelasio-Regular.woff2', weight: 400 }] })`.
   * Registering does NOT map; pair with {@link map}. Re-adding the same source for a face is
   * idempotent; a DIFFERENT source for the same family/weight/style throws. Reflows once if a
   * registered face is one the document already uses.
   * @throws Error if no editor is active, or if a conflicting source is registered.
   */
  add(families: SuperDocFontFamily | SuperDocFontFamily[]): void;
  /**
   * Proactively load the physical faces for the given LOGICAL families (resolved through the active
   * document's mappings) so they are ready before use, avoiding a late-load reflow. Awaits the
   * regular (400/normal) face via the registry.
   * @throws Error if no editor is active.
   */
  preload(families: string[]): Promise<void>;
}

/**
 * Internal post-`#init` shape of the active user. Extends the public
 * `User` with the collab-awareness `color` field assigned by
 * `SuperDoc.#assignUserColor()` and read by the presence system. Not
 * part of the consumer-facing surface; consumers continue to pass
 * `User` via `Config.user`, and SuperDoc widens to `AwarenessUser`
 * internally once it has computed the color.
 */
export interface AwarenessUser extends User {
  /**
   * Awareness color for collaborative cursors. Auto-assigned from the
   * configured palette (or a default palette) by `#assignUserColor`,
   * derived from a hash of the user's identity so the assignment is
   * stable across reloads.
   */
  color?: string;
}

/**
 * One entry in the `states` array delivered to
 * {@link Config.onAwarenessUpdate}. SuperDoc emits an entry per remote
 * client, derived from the underlying Yjs awareness states.
 *
 * The runtime helper `awarenessStatesToArray` spreads each remote user
 * onto the top of the entry (`{ clientId, ...value.user, color }`), so
 * `User` fields like `name`, `email`, `image` appear at the top level
 * (not nested under a `user` property). Consumers should read `state.id`,
 * `state.name`, and `state.email`, not `state.user.name`.
 *
 * Application-specific fields attached to the awareness state by the
 * provider surface through the `[key: string]: unknown` index
 * signature; consumers narrow before use.
 */
export interface AwarenessState extends User {
  /** Yjs client identifier for the remote peer. */
  clientId?: number;
  /**
   * Color assigned by SuperDoc's presence system. Spread onto the
   * awareness entry after the user fields, so it takes precedence
   * over any color the awareness user carried in (see
   * {@link AwarenessUser.color}). Used when the presence system
   * computes a stable palette assignment for the remote peer.
   */
  color?: string;
  /** Application-specific fields spread from the awareness provider. */
  [key: string]: unknown;
}

export interface Document {
  /** The ID of the document. */
  id?: string;
  /** The type of the document. */
  type: string;
  /** The initial data of the document (File, Blob, or null). */
  data?: globalThis.File | globalThis.Blob | null;
  /** The name of the document. */
  name?: string;
  /** The URL of the document. */
  url?: string;
  /** Whether the document is a new file. */
  isNewFile?: boolean;
  /** The Yjs document for collaboration. */
  ydoc?: YDoc;
  /**
   * The provider for collaboration. Widened from `HocuspocusProvider` to
   * `CollaborationProvider` to match the runtime, which stores whatever
   * provider the consumer passed via `Config.modules.collaboration.provider`
   * (HocuspocusProvider, LiveblocksYjsProvider, TiptapCollabProvider, etc.).
   * Consumers needing Hocuspocus-specific members must narrow before use.
   */
  provider?: CollaborationProvider;
  /**
   * Document-level v2 collaboration handoff. When present, the v2 runtime
   * makes this document collaborative through the shipped single-doc
   * y-websocket provider (one room / Y.Doc / awareness channel per
   * `documentId`). See {@link V2CollaborationConfig}. Ignored by the v1
   * editor, which uses `Config.modules.collaboration` instead.
   */
  v2Collaboration?: V2CollaborationConfig | null;
}

/**
 * Public snapshot shape returned by `SuperDoc#state`. Always reflects
 * the most recent values from the Pinia store; consumers must re-read
 * on change rather than caching.
 *
 * `documents` is typed as the public `Document[]` view. Internally the
 * runtime tracks `RuntimeDocument`, which adds runtime-only fields
 * (editor/renderer accessors, `restoreComments`, etc.) for
 * SuperDoc's own lifecycle plumbing. Those fields are not part of the
 * supported surface; consumers using `state.documents` should treat
 * each entry as `Document` and not rely on the richer runtime shape.
 */
export interface SuperDocState {
  /** Documents tracked by the instance, in consumer-provided order. */
  documents: Document[];
  /** Shared users (drives presence + "@"-mention surfaces). */
  users: User[];
}

/**
 * External collaboration provider interface. Accepts any Yjs-compatible
 * provider (HocuspocusProvider, LiveblocksYjsProvider, TiptapCollabProvider,
 * etc.). The v2 branch exposes a structural provider type so public
 * declarations do not depend on the v1 editor package.
 */

/**
 * Internal augmentation of `Document` for runtime-only fields that the
 * SuperDoc instance attaches to each document during initialization. The
 * public `Document` interface above is what consumers pass in via
 * `Config.documents`; this type adds the fields SuperDoc itself sets and
 * reads internally (per-document `role` propagation, the live editor and
 * renderer accessors that the surface manager and
 * mode-switch helpers walk).
 *
 * Internal use only: not part of any public typedef. Consumers cannot
 * import this through `superdoc` and should not pass any of these fields
 * into `Config.documents` from outside.
 */
export interface RuntimeDocument extends Document {
  /**
   * Per-document role. `useDocument()` reads `params.role` from the input
   * config and exposes it on the smart-doc object; once collaboration
   * setup runs, SuperDoc unconditionally writes `doc.role = config.role`,
   * silently replacing whatever was passed. SD-2872 removed this from
   * the public `Document` interface so consumers stop trying to use it
   * as a stable per-document override; it lives on `RuntimeDocument`
   * only so internal SuperDoc callsites can type the assignment.
   */
  role?: 'editor' | 'viewer' | 'suggester';
  /**
   * Returns the body Editor for this document, when the runtime has
   * created one. Set by the editor-create lifecycle.
   *
   * @deprecated Direct editor access will be removed in a future version.
   * Use the Document API (`editor.doc`) instead. This typedef carries the
   * deprecation marker forward from the source accessor in
   * `packages/superdoc/src/composables/use-document.js`.
   */
  getEditor?: () => Editor | null | undefined;
  /**
   * Returns the DocumentRendererRuntime for this document, when the runtime
   * has created one. Set by the editor-create lifecycle.
   *
   * @deprecated Direct editor access will be removed in a future version.
   * Use the Document API (`editor.doc`) instead.
   */
  getDocumentRuntime?: () => DocumentRendererRuntime | null | undefined;
  /**
   * Runtime-only flag mirrored from `Config.rulers` per document by the
   * Pinia store. SuperDoc writes this on each document during the
   * setShowRulers flow; not part of consumer-supplied `Document`.
   */
  rulers?: boolean;
  /**
   * Runtime-only method attached by the comments composable on each
   * document. Set after the comments store is ready; called during
   * mode switches. Not part of consumer-supplied `Document`.
   */
  restoreComments?: () => void;
  /**
   * Runtime-only method attached by the comments composable on each
   * document. Set after the comments store is ready; called during
   * DOCX export when comments should be stripped. Not part of
   * consumer-supplied `Document`.
   */
  removeComments?: () => void;
}

/** Collaboration module configuration. */
export interface CollaborationConfig {
  /** External Yjs document (provider-agnostic mode). */
  ydoc?: YDoc;
  /** External collaboration provider (provider-agnostic mode). */
  provider?: CollaborationProvider;
  /** Internal provider type (deprecated). */
  providerType?: 'hocuspocus' | 'superdoc';
  /** WebSocket URL for internal provider (deprecated). */
  url?: string;
  /** Authentication token for internal provider (deprecated). */
  token?: string;
  /** Additional params for internal provider (deprecated). */
  params?: object;
}

/**
 * Options for `upgradeToCollaboration()`.
 *
 * v2 promotes a local single-DOCX editor into the shipped single-doc
 * y-websocket room described by {@link V2CollaborationConfig}. Pass a
 * `v2Collaboration` target to promote into a supported v2 room.
 *
 * The legacy `ydoc` / `provider` fields remain accepted for source
 * compatibility with v1-shaped callers, but v2 does **not** drive document
 * content from an arbitrary external `{ ydoc, provider }` pair: a v2 upgrade
 * resolves to a supported v2 target through the shell's collaboration target
 * resolver, or fails closed with a named, redacted diagnostic. The legacy
 * fields are therefore optional and only honored when they resolve to a
 * supported v2 room.
 *
 * @see {@link V2CollaborationConfig}
 */
export interface UpgradeToCollaborationOptions {
  /**
   * Canonical supported v2 promotion target: the single-doc y-websocket room
   * ({ documentId, serverUrl, params? }) to create from the current document.
   * Promotion fails if the v2 room already exists.
   */
  v2Collaboration?: V2CollaborationConfig;
  /**
   * Legacy external Yjs document. Accepted for v1 source compatibility; not a
   * supported v2 content source on its own.
   */
  ydoc?: YDoc;
  /**
   * Legacy external collaboration provider. Accepted for v1 source
   * compatibility; not a supported v2 content source on its own.
   */
  provider?: CollaborationProvider;
}

/** Context passed to a link popover resolver when a link is clicked. */
export interface LinkPopoverContext {
  /** The editor instance. */
  editor: Editor;
  /** The href attribute of the clicked link. */
  href: string;
  /** The target attribute of the clicked link. */
  target: string | null;
  /** The rel attribute of the clicked link. */
  rel: string | null;
  /** The title/tooltip attribute of the clicked link. */
  tooltip: string | null;
  /** The clicked anchor DOM element. */
  element: HTMLAnchorElement;
  /** X coordinate of the click. */
  clientX: number;
  /** Y coordinate of the click. */
  clientY: number;
  /** Whether this is an anchor link (href starts with #). */
  isAnchorLink: boolean;
  /** Current document mode ('editing', 'viewing', 'suggesting'). */
  documentMode: DocumentMode;
  /** Computed popover position relative to editor surface. */
  position: { left: string; top: string };
  /** Close the popover programmatically. */
  closePopover: () => void;
}

/** Context passed to an external (framework-agnostic) popover renderer. */
export interface ExternalPopoverRenderContext {
  /** Empty DOM container positioned where the popover should appear. */
  container: HTMLElement;
  /** Call to close the popover and clean up. */
  closePopover: () => void;
  /** The editor instance. */
  editor: Editor;
  /** The href of the clicked link. */
  href: string;
}

/** Resolution returned by a link popover resolver. */
export type LinkPopoverResolution =
  | { type: 'default' }
  | { type: 'none' }
  | { type: 'custom'; component: unknown; props?: Record<string, unknown> }
  | {
      type: 'external';
      render: (ctx: ExternalPopoverRenderContext) => { destroy?: () => void } | void;
    };

/**
 * Resolver function for customizing the link click popover. Must be
 * synchronous; do not return a Promise. Return null/undefined to use the
 * default popover.
 */
export type LinkPopoverResolver = (ctx: LinkPopoverContext) => LinkPopoverResolution | null | undefined;

/**
 * Canonical presentation settings for the built-in comments UI.
 *
 * Presentation only, and deliberately not the whole of `modules.comments`.
 * That block also carries `readOnly` and `allowResolve`, which resolve through
 * `interaction.comments`, and `permissionResolver`, which is read off
 * `modules.comments` or the top-level `Config`. All three are stripped from
 * this bag: policy outlives the built-in UI, so an application drawing its own
 * comment surface still has to honor it. See the fields themselves, which are
 * rejected by name with the spelling that applies to each.
 *
 * Open on purpose, for the same reason `modules.comments` is: the runtime
 * merges this bag over that block and spreads the result through the comments
 * store, which accepts pass-through keys. Closing it would reject working
 * configurations, which is a worse failure than the missing autocomplete it
 * would buy. The named fields are the ones the shell reads.
 */
export type CommentsConfig = {
  /** How comments present themselves as the surface narrows. */
  displayMode?: 'auto' | 'sidebar' | 'inline';
  /** CSS selector for an explicit width measurement target in `auto` mode. */
  compactMeasurementSelector?: string;
  /** Fixed compact-mode breakpoint override, in pixels. */
  compactBreakpointPx?: number;
  /** Comment highlight colors (internal/external and active overrides). */
  highlightColors?: {
    /** Base highlight color for internal comments. */
    internal?: string;
    /** Base highlight color for external comments. */
    external?: string;
    /** Active highlight color override for internal comments. */
    activeInternal?: string;
    /** Active highlight color override for external comments. */
    activeExternal?: string;
  };
  /** Comment highlight opacity, active and inactive. */
  highlightOpacity?: {
    /** Opacity for the active comment highlight. */
    active?: number;
    /** Opacity for inactive comment highlights. */
    inactive?: number;
  };
  /** Highlight color used while hovering a comment. */
  highlightHoverColor?: string;
  /** Tracked-change highlight colors. */
  trackChangeHighlightColors?: TrackChangeHighlightColors;
  /** Active tracked-change highlight colors (defaults to the above). */
  trackChangeActiveHighlightColors?: TrackChangeHighlightColors;
  /**
   * Policy, not presentation. `normalizeUiConfig` strips all three from this
   * bag before anything reads it, so accepting them here would advertise a
   * setting that is silently discarded.
   *
   * `readOnly` and `allowResolve` belong on `interaction.comments`, where they
   * resolve and keep applying to an application drawing its own comment
   * surface.
   *
   * `permissionResolver` is collaboration wiring rather than policy, and has
   * no `ui` spelling at all. `pickResolver` takes the first of
   * `modules.comments.permissionResolver` and the top-level
   * `Config.permissionResolver`, in that order, so either works and the
   * comments-scoped one wins.
   */
  readOnly?: never;
  allowResolve?: never;
  permissionResolver?: never;
} & Record<string, unknown>;

/** Border and background colors for one tracked-change highlight state. */
export interface TrackChangeHighlightColors {
  /** Border color for inserted text. */
  insertBorder?: string;
  /** Background color for inserted text. */
  insertBackground?: string;
  /** Border color for deleted text. */
  deleteBorder?: string;
  /** Background color for deleted text. */
  deleteBackground?: string;
  /** Border color for a format change. */
  formatBorder?: string;
}

/**
 * Canonical configuration for the chrome drawn around content controls.
 *
 * `chrome` is the whole option bag this surface has. `'default'` and `'none'`
 * are the only values the painter and the v2 host accept; anything else is
 * coerced back to `'default'`.
 */
export interface ContentControlsConfig {
  /** Whether SuperDoc draws its own chrome around each content control. */
  chrome?: 'default' | 'none';
}

/**
 * Canonical configuration for the built-in link popover.
 *
 * `popoverResolver` supersedes `modules.links.popoverResolver`, which stays
 * supported for all of v2. Setting both keeps the canonical one; the legacy
 * spelling only applies when the canonical one is absent.
 */
export interface LinkPopoverConfig {
  /**
   * Called when a user clicks a link, to decide which popover to show.
   * Returning `null` or `undefined` falls back to the built-in popover.
   */
  popoverResolver?: LinkPopoverResolver;
}

// ---------------------------------------------------------------------------
// Context menu types
// ---------------------------------------------------------------------------

/** Context object passed to context menu callbacks (showWhen, render, action, menuProvider). */
export interface ContextMenuContext {
  /** The editor instance. */
  editor: Editor;
  /** Currently selected text (empty string if no selection). */
  selectedText: string;
  /** Whether there is an expanded selection. */
  hasSelection: boolean;
  /** ProseMirror start position of the selection. */
  selectionStart: number;
  /** ProseMirror end position of the selection. */
  selectionEnd: number;
  /** How the menu was opened. */
  trigger: 'click' | 'slash';
  /** Whether the cursor is inside a table. */
  isInTable: boolean;
  /** Whether the cursor is inside a list. */
  isInList: boolean;
  /** Whether the cursor is inside a document section. */
  isInSectionNode: boolean;
  /** Whether a table cell selection is active. */
  isCellSelection: boolean;
  /** Kind of table selection (row, column, etc.). */
  tableSelectionKind: string | null;
  /** ProseMirror node type name at the cursor. */
  currentNodeType: string | null;
  /** Names of marks active at the cursor. */
  activeMarks: string[];
  /** Whether the cursor is on a tracked change. */
  isTrackedChange: boolean;
  /** ID of the tracked change at the cursor. */
  trackedChangeId: string | null;
  /** Current document mode (editing, viewing, suggesting). */
  documentMode: string;
  /** Whether undo is available. */
  canUndo: boolean;
  /** Whether redo is available. */
  canRedo: boolean;
  /** Whether the editor is editable. */
  isEditable: boolean;
  /** Screen coordinates of the cursor. */
  cursorPosition: { x: number; y: number } | null;
}

/** A single item inside a context menu section. */
export interface ContextMenuItem {
  /** Unique identifier for the menu item. */
  id: string;
  /** Display text. */
  label: string;
  /** Icon identifier. */
  icon?: string;
  /** Custom Vue component to render this item. */
  component?: unknown;
  /**
   * Callback invoked when the item is clicked.
   *
   * @deprecated replaceWith=`onSelect` removeIn=v3.0 — V1 only. SuperDoc 2
   * cannot invoke this: its first argument is a ProseMirror `Editor` the v2
   * runtime does not have, and `ContextMenuContext` carries fields v2 does not
   * expose. Items using it render and then do nothing when clicked, and the
   * runtime warns once naming the replacement.
   */
  action?: (editor: Editor, context: ContextMenuContext) => void;
  /**
   * Application-owned click handler. Runs after the menu dismisses.
   *
   * This is the supported way to attach a product action such as "copy the
   * selection into our workflow"; the built-in `intent` union covers only what
   * SuperDoc itself performs.
   */
  onSelect?: (payload: ContextMenuSelectPayload) => void | Promise<void>;
  /** Predicate controlling visibility. */
  showWhen?: (context: ContextMenuContext) => boolean;
  /** Custom renderer returning an HTML element. */
  render?: (context: ContextMenuContext) => HTMLElement;
  /** Keyboard shortcut label displayed beside the item. */
  shortcut?: string;
}

/** The menu context a `ContextMenuItem.onSelect` handler receives. */
export interface ContextMenuSelectContext {
  /**
   * Text selected when the menu opened. Empty when the caret was collapsed, and
   * also empty when a worker-backed read had not settled by click time — await
   * `selectedTextSettled` when accuracy matters more than the gesture.
   */
  selectedText: string;
  /**
   * The settled selection text.
   *
   * The handler is invoked synchronously so it keeps the click's user
   * activation, which gesture-gated APIs such as `navigator.clipboard.write`,
   * `window.open`, and `showOpenFilePicker` require. Awaiting this resolves the
   * accurate text but spends that activation, so reach for it only when the
   * handler does not need a gesture. Resolves to `selectedText` when the read
   * had already settled or failed.
   */
  selectedTextSettled: Promise<string>;
  hasSelection: boolean;
  /** How the menu was opened. */
  trigger: 'click' | 'slash';
  isInTable: boolean;
  isInList: boolean;
  documentMode: 'editing' | 'suggesting' | 'viewing';
  isEditable: boolean;
}

/** Repaint coordination handed alongside the Document API surface. */
export interface ContextMenuSelectReadiness {
  /** Render epoch of the mounted surface, or null when not mounted. */
  getRenderEpoch(): number | null;
  /** Resolves once a mutation's scheduled repaint has settled. */
  whenPainted(input?: { txId?: string; afterEpoch?: number | null }): Promise<{ renderEpoch: number | null }>;
}

/**
 * What a `ContextMenuItem.onSelect` handler is given.
 *
 * `document` is the async Document API surface, and it is a result rather than
 * a handle: it reports `available: false` with a reason before the document is
 * ready, so a handler has to check before reaching for `doc`. It is not the
 * ProseMirror `Editor` the deprecated `action` callback took, which the v2
 * runtime does not have.
 */
export interface ContextMenuSelectPayload {
  document:
    | { available: true; doc: BrowserDocumentApi; readiness: ContextMenuSelectReadiness }
    | { available: false; reason: string };
  /** The context captured when the menu opened, not the live document state. */
  context: ContextMenuSelectContext | null;
}

/** A section (group) of items in the context menu. */
export interface ContextMenuSection {
  /** Unique identifier for the section. */
  id: string;
  /** Menu items in this section. */
  items: ContextMenuItem[];
}

/** Configuration for the context menu module. */
export interface ContextMenuConfig {
  /** Custom menu sections appended (or merged by id) to the default menu. */
  customItems?: ContextMenuSection[];
  /**
   * Advanced: transform the final section list before render. Return
   * null/undefined to keep the original sections.
   */
  menuProvider?: (
    context: ContextMenuContext,
    sections: ContextMenuSection[],
  ) => ContextMenuSection[] | null | undefined;
  /** Whether to include default menu items (default: true). */
  includeDefaultItems?: boolean;
}

// ---------------------------------------------------------------------------
// Surface system types
// ---------------------------------------------------------------------------

/** Surface presentation mode. */
export type SurfaceMode = 'dialog' | 'floating';

export type SurfaceFloatingPlacement =
  | 'top-right'
  | 'top-left'
  | 'bottom-right'
  | 'bottom-left'
  | 'top-center'
  | 'bottom-center';

/** Per-request floating-mode overrides. */
interface FloatingRequestOptions {
  /** Position preset (default: 'top-right'). Ignored when explicit insets are provided. */
  placement?: SurfaceFloatingPlacement;
  /** Exact top inset (overrides placement). */
  top?: string | number;
  /** Exact right inset (overrides placement). */
  right?: string | number;
  /** Exact bottom inset (overrides placement). */
  bottom?: string | number;
  /** Exact left inset (overrides placement). */
  left?: string | number;
  /** Surface width. */
  width?: string | number;
  /** Max width. */
  maxWidth?: string | number;
  /** Max height. */
  maxHeight?: string | number;
  /** Move focus into first focusable child on open (default: true). */
  autoFocus?: boolean;
  /** Close when pointer down outside the surface (default: false). */
  closeOnOutsidePointerDown?: boolean;
}

/** Intent-based surface request — resolved by the resolver or built-in registry. */
export interface IntentSurfaceRequest {
  /** Optional surface id (auto-generated if omitted). */
  id?: string;
  /** Opaque intent identifier used by the resolver. */
  kind: string;
  /** Presentation mode. */
  mode: SurfaceMode;
  /** Optional title rendered in the surface chrome. */
  title?: string;
  /**
   * Accessible name for the surface when no visible title is provided. Used as
   * aria-label fallback when neither title nor ariaLabelledBy is set.
   */
  ariaLabel?: string;
  /**
   * ID of the element that labels the surface. Takes precedence over
   * ariaLabel. Use this when the content component renders its own heading
   * that should serve as the accessible name.
   */
  ariaLabelledBy?: string;
  /**
   * Whether Escape closes the surface (default: true). Set at the request top
   * level — the runtime does not read `floating.closeOnEscape` on a per-request
   * basis.
   */
  closeOnEscape?: boolean;
  /** Whether backdrop click closes a dialog (default: true). */
  closeOnBackdrop?: boolean;
  /** Dialog-specific overrides. */
  dialog?: { maxWidth?: string | number };
  /** Floating-specific overrides. */
  floating?: FloatingRequestOptions;
  /** Arbitrary data for the resolver or content. */
  payload?: Record<string, unknown>;
}

/** Direct-render surface request — provides its own component or external renderer. */
export interface DirectSurfaceRequest {
  /** Optional surface id (auto-generated if omitted). */
  id?: string;
  /** Presentation mode. */
  mode: SurfaceMode;
  /** Optional title rendered in the surface chrome. */
  title?: string;
  /**
   * Accessible name for the surface when no visible title is provided. Used as
   * aria-label fallback when neither title nor ariaLabelledBy is set.
   */
  ariaLabel?: string;
  /**
   * ID of the element that labels the surface. Takes precedence over
   * ariaLabel. Use this when the content component renders its own heading
   * that should serve as the accessible name.
   */
  ariaLabelledBy?: string;
  /**
   * Whether Escape closes the surface (default: true). Set at the request top
   * level — the runtime does not read `floating.closeOnEscape` on a per-request
   * basis.
   */
  closeOnEscape?: boolean;
  /** Whether backdrop click closes a dialog (default: true). */
  closeOnBackdrop?: boolean;
  /** Dialog-specific overrides. */
  dialog?: { maxWidth?: string | number };
  /** Floating-specific overrides. */
  floating?: FloatingRequestOptions;
  /** Vue component to render as the surface content. */
  component?: unknown;
  /** Extra props passed to the Vue component. */
  props?: Record<string, unknown>;
  /** External (framework-agnostic) renderer function. */
  render?: (ctx: ExternalSurfaceRenderContext) => { destroy?: () => void } | void;
}

/** Combined surface request type (intent-based or direct-render). */
export type SurfaceRequest = IntentSurfaceRequest | DirectSurfaceRequest;

/** Resolution returned by a surface resolver. */
export type SurfaceResolution =
  | { type: 'none' }
  | { type: 'custom'; component: unknown; props?: Record<string, unknown> }
  | {
      type: 'external';
      render: (ctx: ExternalSurfaceRenderContext) => { destroy?: () => void } | void;
    };

/**
 * Resolver function for customizing surface rendering. Must be synchronous;
 * do not return a Promise. Return null/undefined to fall through to built-in
 * handling. Return `{ type: 'none' }` to explicitly suppress the surface.
 */
export type SurfaceResolver = (request: SurfaceRequest) => SurfaceResolution | null | undefined;

/**
 * Outcome of a surface lifecycle. The handle.result promise always resolves
 * with one of these — it never rejects for normal lifecycle events.
 */
export interface SurfaceOutcome<TResult = unknown> {
  status: 'submitted' | 'closed' | 'replaced' | 'destroyed';
  /** Present when status is 'submitted'. */
  data?: TResult;
  /** Present when status is 'closed'. */
  reason?: unknown;
  /** Present when status is 'replaced'. */
  replacedBy?: string;
}

/**
 * Handle returned by openSurface(). Callers use this to await the outcome or
 * close the surface programmatically.
 */
export interface SurfaceHandle<TResult = unknown> {
  /** Resolved surface id. */
  id: string;
  /** Presentation mode. */
  mode: SurfaceMode;
  /** Close this surface programmatically. */
  close: (reason?: unknown) => void;
  /** Resolves when the surface settles. */
  result: Promise<SurfaceOutcome<TResult>>;
}

/**
 * Props passed to a custom Vue component rendered inside a surface shell.
 * Reserved props (surfaceId, mode, request, resolve, close) always win over
 * caller-provided props to prevent accidental lifecycle override.
 */
export interface SurfaceComponentProps {
  /** The surface id. */
  surfaceId: string;
  /** Presentation mode. */
  mode: SurfaceMode;
  /** The original (normalized) request. */
  request: SurfaceRequest;
  /** Resolves the handle with `{ status: 'submitted', data }`. */
  resolve: (data?: unknown) => void;
  /** Resolves the handle with `{ status: 'closed', reason }`. */
  close: (reason?: unknown) => void;
}

/** Context passed to an external (framework-agnostic) surface renderer. */
export interface ExternalSurfaceRenderContext {
  /** Empty DOM container to render into. */
  container: HTMLElement;
  /** The surface id. */
  surfaceId: string;
  /** Presentation mode. */
  mode: SurfaceMode;
  /** The original (normalized) request. */
  request: SurfaceRequest;
  /** Resolves the handle with `{ status: 'submitted', data }`. */
  resolve: (data?: unknown) => void;
  /** Resolves the handle with `{ status: 'closed', reason }`. */
  close: (reason?: unknown) => void;
}

/** Module-level configuration for the surface system. */
export interface SurfacesModuleConfig {
  /**
   * Global surface resolver.
   *
   * `null` is the resolved "no resolver" value the normalizer produces after
   * rejecting a non-function; SurfaceManager guards with `typeof === 'function'`
   * either way.
   */
  resolver?: SurfaceResolver | null;
  /** Default dialog options. */
  dialog?: {
    /** Default escape behavior for dialogs (default: true). */
    closeOnEscape?: boolean;
    /** Default backdrop-click behavior for dialogs (default: true). */
    closeOnBackdrop?: boolean;
    /** Default dialog max-width. */
    maxWidth?: string | number;
  };
  /** Default floating options. */
  floating?: {
    /** Default placement preset (default: 'top-right'). */
    placement?: SurfaceFloatingPlacement;
    /** Default floating width. */
    width?: string | number;
    /** Default floating max-width. */
    maxWidth?: string | number;
    /** Default floating max-height. */
    maxHeight?: string | number;
    /** Default escape behavior for floating surfaces (default: true). */
    closeOnEscape?: boolean;
    /** Default outside-pointer behavior (default: false). */
    closeOnOutsidePointerDown?: boolean;
    /** Default auto-focus behavior (default: true). */
    autoFocus?: boolean;
  };
  /**
   * Built-in find/replace popover for editor-backed documents. Disabled by
   * default. Set to `true` to intercept Cmd+F / Ctrl+F inside SuperDoc and
   * open the built-in UI. When an object, allows text customization, custom
   * components, resolvers, and replace-disabling.
   */
  findReplace?: boolean | FindReplaceConfig;
  /**
   * Built-in password prompt dialog for encrypted DOCX files. Enabled by
   * default when omitted. Set to `false` to disable. When `true`, uses
   * default titles/labels. When an object, allows custom titles and labels.
   */
  passwordPrompt?: boolean | PasswordPromptConfig;
}

/** All customizable text strings for the password prompt, resolved with defaults. */
export interface ResolvedPasswordPromptTexts {
  /** Dialog title for first attempt. */
  title: string;
  /** Dialog title after wrong password. */
  invalidTitle: string;
  /** Explanatory text shown below the title. */
  description: string;
  /** Input placeholder text. */
  placeholder: string;
  /** Accessible label for the password input. */
  inputAriaLabel: string;
  /** Submit button text. */
  submitLabel: string;
  /** Cancel button text. */
  cancelLabel: string;
  /** Submit button text while decrypting. */
  busyLabel: string;
  /** Error message for wrong password. */
  invalidMessage: string;
  /** Error message for decryption timeout. */
  timeoutMessage: string;
  /** Error message for other failures. */
  genericErrorMessage: string;
}

/** Result of a password attempt via the `attemptPassword` function. */
export interface PasswordPromptAttemptResult {
  /** Whether the password was accepted. */
  success: boolean;
  /** Error code when success is false (e.g. 'DOCX_PASSWORD_INVALID', 'timeout'). */
  errorCode?: string;
}

/**
 * Handle object injected into custom password prompt UIs as the
 * `passwordPrompt` prop/context field. Provides document metadata, resolved
 * texts, and the retry function.
 */
export interface PasswordPromptHandle {
  /** The document ID requiring a password. */
  documentId: string;
  /** The current error code (e.g. 'DOCX_PASSWORD_REQUIRED', 'DOCX_PASSWORD_INVALID'). */
  errorCode: string;
  /** All text strings resolved with defaults. */
  texts: ResolvedPasswordPromptTexts;
  /**
   * Submit a password attempt. Returns the outcome; do not mutate document
   * state directly.
   */
  attemptPassword: (password: string) => Promise<PasswordPromptAttemptResult>;
}

/**
 * Read-only context passed to a password prompt resolver to decide how to
 * render. Does NOT include `attemptPassword` — the resolver decides, it does
 * not act.
 */
export interface PasswordPromptContext {
  /** The document ID requiring a password. */
  documentId: string;
  /** The current error code. */
  errorCode: string;
  /** Resolved text strings. */
  texts: ResolvedPasswordPromptTexts;
}

/** Context passed to an external (framework-agnostic) password prompt renderer. */
export interface PasswordPromptRenderContext {
  /** Empty DOM container to render into. */
  container: HTMLElement;
  /** The password prompt handle. */
  passwordPrompt: PasswordPromptHandle;
  /** Resolves the surface with `{ status: 'submitted', data }`. */
  resolve: (data?: unknown) => void;
  /** Resolves the surface with `{ status: 'closed', reason }`. */
  close: (reason?: unknown) => void;
  /** The surface id. */
  surfaceId: string;
  /** Presentation mode. */
  mode: SurfaceMode;
}

/** Resolution returned by a password prompt resolver. */
export type PasswordPromptResolution =
  | { type: 'default' }
  | { type: 'none' }
  | { type: 'custom'; component: unknown; props?: Record<string, unknown> }
  | {
      type: 'external';
      render: (ctx: PasswordPromptRenderContext) => { destroy?: () => void } | void;
    };

/** Configuration for the password prompt surface. */
export interface PasswordPromptConfig {
  /** Dialog title for first attempt (default: 'Password Required'). */
  title?: string;
  /** Dialog title after wrong password (default: 'Incorrect Password'). */
  invalidTitle?: string;
  /** Explanatory text (default: 'This document is password protected. Enter the password to open it.'). */
  description?: string;
  /** Input placeholder (default: 'Enter password'). */
  placeholder?: string;
  /** Accessible label for the input (default: 'Document password'). */
  inputAriaLabel?: string;
  /** Submit button text (default: 'Open'). */
  submitLabel?: string;
  /** Cancel button text (default: 'Cancel'). */
  cancelLabel?: string;
  /** Submit button text while decrypting (default: 'Decrypting…'). */
  busyLabel?: string;
  /** Error for wrong password (default: 'Incorrect password. Please try again.'). */
  invalidMessage?: string;
  /** Error for timeout (default: 'Timed out while decrypting. Please try again.'). */
  timeoutMessage?: string;
  /** Error for other failures (default: 'Unable to decrypt this document.'). */
  genericErrorMessage?: string;
  /** Vue component to render as custom password prompt content. Mutually exclusive with `render`. */
  component?: unknown;
  /** Extra props passed to the custom Vue component. Component-only; ignored for `render`. */
  props?: Record<string, unknown>;
  /** External (framework-agnostic) renderer. Mutually exclusive with `component`. */
  render?: (ctx: PasswordPromptRenderContext) => { destroy?: () => void } | void;
  /** Conditional resolver for per-document customization. Can coexist with `component`/`render`. */
  resolver?: (ctx: PasswordPromptContext) => PasswordPromptResolution | null | undefined;
}

// ---------------------------------------------------------------------------
// Find/replace surface types
// ---------------------------------------------------------------------------

/** All customizable text strings for the find/replace surface, resolved with defaults. */
export interface ResolvedFindReplaceTexts {
  /** Input placeholder for the find field. */
  findPlaceholder: string;
  /** Accessible label for the find input. */
  findAriaLabel: string;
  /** Input placeholder for the replace field. */
  replacePlaceholder: string;
  /** Accessible label for the replace input. */
  replaceAriaLabel: string;
  /** Text shown when there are no matches. */
  noResultsLabel: string;
  /** Button label / title for previous match. */
  previousMatchLabel: string;
  /** Accessible label for previous match button. */
  previousMatchAriaLabel: string;
  /** Button label / title for next match. */
  nextMatchLabel: string;
  /** Accessible label for next match button. */
  nextMatchAriaLabel: string;
  /** Button label / title for close. */
  closeLabel: string;
  /** Accessible label for close button. */
  closeAriaLabel: string;
  /** Replace button text. */
  replaceLabel: string;
  /** Replace-all button text. */
  replaceAllLabel: string;
  /** Toggle replace row label. */
  toggleReplaceLabel: string;
  /** Accessible label for toggle replace button. */
  toggleReplaceAriaLabel: string;
  /** Match case toggle text. */
  matchCaseLabel: string;
  /** Accessible label for match case toggle. */
  matchCaseAriaLabel: string;
  /** Ignore diacritics toggle text. */
  ignoreDiacriticsLabel: string;
  /** Accessible label for ignore diacritics toggle. */
  ignoreDiacriticsAriaLabel: string;
  /** Regex toggle text. */
  regexLabel: string;
  /** Accessible label for the regex toggle. */
  regexAriaLabel: string;
  /** Inline error shown when the regex pattern is invalid or unsafe. */
  invalidPatternLabel: string;
}

/**
 * A document position range, in ProseMirror coordinates.
 *
 * SD-2828: Surfaced on the public type contract so consumers can
 * destructure `SearchMatch.ranges` without falling back to `any`. Mirrors
 * the private `DocRange` typedef in the search extension; keep them in
 * sync. Pure data, no methods.
 */
export interface DocRange {
  /** Start position in the document. */
  from: number;
  /** End position in the document. */
  to: number;
}

/**
 * One match returned by `SuperDoc.search()` (and consumed by
 * `SuperDoc.goToSearchResult()`).
 *
 * SD-2828: Promoted from the private search-extension typedef to a
 * public contract so consumers get real types instead of `any` on the
 * search return value, and so `goToSearchResult` can declare the input
 * shape it expects rather than accepting an opaque `Object`. Match
 * instances are produced by the runtime; consumers should treat them as
 * read-only and pass them back unchanged.
 */
export interface SearchMatch {
  /** Combined match text across all ranges. */
  text: string;
  /** Start position of the first range. */
  from: number;
  /** End position of the last range. */
  to: number;
  /**
   * Stable match identifier. For single-range matches this is the
   * position-tracker id; for multi-range (cross-paragraph) matches it is
   * the first tracker id. Use as the dedupe / equality key when wiring a
   * custom navigator.
   */
  id: string;
  /**
   * Document ranges for the match. Present for multi-range matches
   * (cross-paragraph), and may also be populated for single-range
   * matches by the search runtime; consumers should not assume length 1.
   */
  ranges?: DocRange[];
  /** Position-tracker ids, one per range in `ranges`. */
  trackerIds?: string[];
}

/**
 * Handle object injected into find/replace UIs as the `findReplace`
 * prop/context field. Provides reactive search state and all action functions.
 */
export interface FindReplaceHandle {
  /** Current search query. */
  findQuery: Ref<string>;
  /** Current replacement text. */
  replaceText: Ref<string>;
  /** Case-sensitive toggle. */
  caseSensitive: Ref<boolean>;
  /** Ignore diacritics toggle. */
  ignoreDiacritics: Ref<boolean>;
  /** Whether replace row is expanded. */
  showReplace: Ref<boolean>;
  /** Total match count (read-only by convention). */
  matchCount: Ref<number>;
  /** Active match index, -1 when none (read-only by convention). */
  activeMatchIndex: Ref<number>;
  /** Formatted match label e.g. "3 of 12" or "No results". */
  matchLabel: ComputedRef<string>;
  /** Whether there are any matches. */
  hasMatches: ComputedRef<boolean>;
  /**
   * Whether the replace controls should be enabled right now: there are
   * matches, no replace is in flight, and the active session permits mutation
   * (V2 read-only/viewing mode disables replace; V1 stays enabled).
   */
  canReplace: ComputedRef<boolean>;
  /** Whether a replace mutation is currently in flight (re-entrancy guard). */
  replacePending: Ref<boolean>;
  /**
   * Runtime mutability of the active session (false in viewing/read-only
   * mode). Surfaces hide replace controls on this; `canReplace` additionally
   * requires matches and gates the actions.
   */
  replaceCanMutate: Ref<boolean>;
  /**
   * Whether the active driver supports the ignore-diacritics toggle. V1
   * supports it; the V2 Document API query path does not, so the toggle is
   * hidden rather than shipped as a no-op.
   */
  ignoreDiacriticsSupported: Ref<boolean>;
  /**
   * Whether the active driver supports regex search. The V2 (`ui.search`)
   * driver supports it; V1 hides the toggle.
   */
  regexSupported: Ref<boolean>;
  /** Whether the current query is treated as a regular expression. */
  regex: Ref<boolean>;
  /** Inline error label when the regex pattern is invalid/unsafe, else null. */
  searchError: Ref<string | null>;
  /** Whether replace actions are available (false for find-only mode). */
  replaceEnabled: boolean;
  /** All text strings resolved with defaults. */
  texts: ResolvedFindReplaceTexts;
  /** Navigate to the next match. */
  goNext: () => void;
  /** Navigate to the previous match. */
  goPrev: () => void;
  /** Replace the active match. */
  replaceCurrent: () => void;
  /** Replace all matches. */
  replaceAll: () => void;
  /** Register a function the composable calls to refocus the find input. */
  registerFocusFn: (fn: () => void) => void;
  /** Close the find/replace surface. */
  close: (reason?: unknown) => void;
}

/**
 * Read-only context passed to a find/replace resolver to decide how to
 * render. Does NOT include action functions — the resolver decides, it does
 * not act.
 */
export interface FindReplaceContext {
  /** Resolved text strings. */
  texts: ResolvedFindReplaceTexts;
  /** Whether replace is available. */
  replaceEnabled: boolean;
}

/**
 * Context passed to an external (framework-agnostic) find/replace renderer.
 * Vue refs are unwrapped as getter/setter properties for framework neutrality.
 */
export interface FindReplaceRenderContext {
  /** Empty DOM container to render into. */
  container: HTMLElement;
  /** The find/replace handle with getters/setters instead of Vue refs. */
  findReplace: object;
  /** Resolves the surface with `{ status: 'submitted', data }`. */
  resolve: (data?: unknown) => void;
  /** Resolves the surface with `{ status: 'closed', reason }`. */
  close: (reason?: unknown) => void;
  /** The surface id. */
  surfaceId: string;
  /** Presentation mode. */
  mode: SurfaceMode;
}

/** Resolution returned by a find/replace resolver. */
export type FindReplaceResolution =
  | { type: 'default' }
  | { type: 'none' }
  | { type: 'custom'; component: unknown; props?: Record<string, unknown> }
  | {
      type: 'external';
      render: (ctx: FindReplaceRenderContext) => { destroy?: () => void } | void;
    };

/** Configuration for the find/replace surface. */
export interface FindReplaceConfig {
  /** Override find placeholder text. */
  findPlaceholder?: string;
  /** Override find input aria-label. */
  findAriaLabel?: string;
  /** Override replace placeholder text. */
  replacePlaceholder?: string;
  /** Override replace input aria-label. */
  replaceAriaLabel?: string;
  /** Override "No results" text. */
  noResultsLabel?: string;
  /** Override previous match button title. */
  previousMatchLabel?: string;
  /** Override previous match aria-label. */
  previousMatchAriaLabel?: string;
  /** Override next match button title. */
  nextMatchLabel?: string;
  /** Override next match aria-label. */
  nextMatchAriaLabel?: string;
  /** Override close button title. */
  closeLabel?: string;
  /** Override close button aria-label. */
  closeAriaLabel?: string;
  /** Override replace button text. */
  replaceLabel?: string;
  /** Override replace-all button text. */
  replaceAllLabel?: string;
  /** Override toggle replace button title. */
  toggleReplaceLabel?: string;
  /** Override toggle replace aria-label. */
  toggleReplaceAriaLabel?: string;
  /** Override match case toggle text. */
  matchCaseLabel?: string;
  /** Override match case aria-label. */
  matchCaseAriaLabel?: string;
  /** Override ignore diacritics toggle text. */
  ignoreDiacriticsLabel?: string;
  /** Override ignore diacritics aria-label. */
  ignoreDiacriticsAriaLabel?: string;
  /** Override regex toggle text. */
  regexLabel?: string;
  /** Override regex toggle aria-label. */
  regexAriaLabel?: string;
  /** Override the inline invalid-pattern error text. */
  invalidPatternLabel?: string;
  /** Whether replace is available (default: true). */
  replaceEnabled?: boolean;
  /** When true, search includes text from pending tracked deletions. Defaults to false. */
  includeDeletedText?: boolean;
  /** Vue component to render as custom find/replace content. Mutually exclusive with `render`. */
  component?: unknown;
  /** Extra props passed to the custom Vue component. */
  props?: Record<string, unknown>;
  /** External (framework-agnostic) renderer. Mutually exclusive with `component`. */
  render?: (ctx: FindReplaceRenderContext) => { destroy?: () => void } | void;
  /** Conditional resolver. Can coexist with `component`/`render`. */
  resolver?: (ctx: FindReplaceContext) => FindReplaceResolution | null | undefined;
  /**
   * Where the floating find/replace bar is pinned, so it can be moved clear of
   * the document. `placement` is a corner/edge preset; explicit insets
   * (`top`/`right`/`bottom`/`left`, a px number or CSS length) override it.
   * Defaults to `{ placement: 'top-right' }`.
   */
  floating?: {
    placement?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
    top?: number | string;
    right?: number | string;
    bottom?: number | string;
    left?: number | string;
    width?: number | string;
    maxWidth?: number | string;
    maxHeight?: number | string;
    /**
     * Focus the find input when the surface opens. Defaults to `true`; set
     * `false` to leave focus wherever the user had it.
     *
     * Honored but undeclared until #1094: `useFindReplace` spreads this whole
     * bag into the surface request, and `SurfaceManager` applies it last, over
     * the `modules.surfaces.floating` defaults.
     */
    autoFocus?: boolean;
    /** Close the surface on a pointer press outside it. Defaults to `false`. */
    closeOnOutsidePointerDown?: boolean;
  };
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

/**
 * Payload passed to a permission resolver callback. SuperDoc invokes
 * the resolver when a consumer registers one via
 * `Config.permissionResolver` or `Modules.comments.permissionResolver`,
 * forwarding the in-flight check so the resolver can decide whether
 * to override the built-in policy.
 *
 * Returning `boolean` from the resolver overrides the default;
 * returning `undefined` (or any non-boolean) falls through to
 * `defaultDecision`, which the resolver receives so it can mirror or
 * branch off the built-in policy without re-deriving it.
 *
 * `comment` and `trackedChange` are typed as `object | null` because
 * consumer comment / tracked-change shapes vary; resolvers that read
 * fields on those payloads should narrow before use.
 *
 * Distinct from `CanPerformPermissionParams`, which is the input
 * shape consumers pass _to_ `SuperDoc#canPerformPermission`. That
 * input becomes part of this resolver payload after SuperDoc resolves
 * `currentUser`, `superdoc`, and `defaultDecision`.
 */
export interface PermissionResolverParams {
  /** The permission key being checked (e.g. `'comment.create'`). */
  permission: string;
  /**
   * The effective role (consumer-supplied or falling back to
   * `Config.role`). The key is always present on the payload; the
   * value is `undefined` when `Config.role` was never set.
   */
  role: string | undefined;
  /**
   * The effective internal/external flag (consumer-supplied or
   * `Config.isInternal`). The key is always present; the value is
   * `undefined` when `Config.isInternal` was never set.
   */
  isInternal: boolean | undefined;
  /**
   * What the built-in policy would return if the resolver does not
   * override. Resolvers can return this value to defer to the
   * default, or branch off it.
   */
  defaultDecision: boolean;
  /** The comment object being acted on, if any. Shape is consumer-defined. */
  comment: object | null;
  /** The tracked-change payload (as emitted by the editor) being acted on, if any. */
  trackedChange: object | null;
  /** The active user performing the action; resolved from `Config.user`. */
  currentUser: User | null;
  /** The SuperDoc instance the check ran against. */
  superdoc: SuperDoc | null;
}

/**
 * Input shape for `SuperDoc#canPerformPermission`. All fields are
 * optional; an empty payload short-circuits to `false`. `role` and
 * `isInternal` fall back to `Config.role` / `Config.isInternal` when
 * omitted. `comment` and `trackedChange` carry open index signatures
 * because the runtime forwards the full payload to the resolver
 * context, and consumer comment / tracked-change shapes vary; the
 * named fields below are the ones the method itself reads. Distinct
 * from `PermissionResolverParams`, which is the exported resolver
 * callback payload SuperDoc passes to configured permission resolvers
 * (with resolved `currentUser`, `superdoc`, and `defaultDecision`
 * context attached).
 */
export interface CanPerformPermissionParams {
  /** The permission key to check (e.g. `'comment.create'`). Required at runtime; omitting returns `false`. */
  permission?: string;
  /** Override `Config.role` for this check. */
  role?: string;
  /** Override `Config.isInternal` for this check. */
  isInternal?: boolean;
  /** The comment object being acted on, if any. */
  comment?: (object & Record<string, unknown>) | null;
  /** The tracked-change payload (as emitted by the editor) being acted on, if any. */
  trackedChange?: ({ id?: string; commentId?: string; comment?: unknown } & Record<string, unknown>) | null;
}

/** Modules registered with the SuperDoc instance. */
export interface Modules {
  /** Content controls module configuration. */
  contentControls?: {
    /** Built-in SDT chrome rendering mode. */
    chrome?: 'default' | 'none';
  };
  /**
   * Comments module configuration (false to disable). The named fields below
   * are typed for IDE help; the runtime spreads the entire object through the
   * comments store and accepts additional keys (`useInternalExternalComments`,
   * `suppressInternalExternalComments`, etc.), so the type intersects with an
   * open index signature to keep pass-through configs compiling.
   */
  comments?:
    | false
    | ({
        /** Custom permission resolver for comment actions. */
        permissionResolver?: (params: PermissionResolverParams) => boolean | undefined;
        /** Hide and reject every comment and tracked-change mutation affordance. */
        readOnly?: boolean;
        /** Show ordinary comment resolve/reopen actions when writable (default: true). */
        allowResolve?: boolean;
        /** Comment highlight colors (internal/external and active overrides). */
        highlightColors?: {
          /** Base highlight color for internal comments. */
          internal?: string;
          /** Base highlight color for external comments. */
          external?: string;
          /** Active highlight color override for internal comments. */
          activeInternal?: string;
          /** Active highlight color override for external comments. */
          activeExternal?: string;
        };
        /** Comment highlight opacity values (0-1). */
        highlightOpacity?: {
          /** Opacity for active comment highlight. */
          active?: number;
          /** Opacity for inactive comment highlight. */
          inactive?: number;
        };
        /** Hover highlight color for comment marks. */
        highlightHoverColor?: string;
        /** Track change highlight colors. */
        trackChangeHighlightColors?: {
          /** Border color for inserted text highlight. */
          insertBorder?: string;
          /** Background color for inserted text highlight. */
          insertBackground?: string;
          /** Border color for deleted text highlight. */
          deleteBorder?: string;
          /** Background color for deleted text highlight. */
          deleteBackground?: string;
          /** Border color for format change highlight. */
          formatBorder?: string;
        };
        /** Active track change highlight colors (defaults to trackChangeHighlightColors). */
        trackChangeActiveHighlightColors?: {
          /** Active border color for inserted text highlight. */
          insertBorder?: string;
          /** Active background color for inserted text highlight. */
          insertBackground?: string;
          /** Active border color for deleted text highlight. */
          deleteBorder?: string;
          /** Active background color for deleted text highlight. */
          deleteBackground?: string;
          /** Active border color for format change highlight. */
          formatBorder?: string;
        };
        /** Comments/track-changes UI display policy for responsive comment surfaces. */
        displayMode?: 'auto' | 'sidebar' | 'inline';
        /** CSS selector for an explicit width measurement target in auto mode. */
        compactMeasurementSelector?: string;
        /** Optional fixed compact-mode breakpoint override in pixels. */
        compactBreakpointPx?: number;
      } & Record<string, unknown>);
  /** AI module configuration. */
  ai?: {
    /** Harbour API key for AI features. */
    apiKey?: string;
    /** Custom endpoint URL for AI services. */
    endpoint?: string;
  } & Record<string, unknown>;
  /** PDF module configuration. */
  pdf?: {
    /** Preloaded pdf.js library instance. */
    pdfLib: object;
    /** PDF.js worker source URL (falls back to CDN when omitted). */
    workerSrc?: string;
    /** Whether to auto-configure pdf.js worker. */
    setWorker?: boolean;
    /** Enable text layer rendering (default: false). */
    textLayer?: boolean;
    /** Canvas render scale (quality). */
    outputScale?: number;
  } & Record<string, unknown>;
  /** Collaboration module configuration. */
  collaboration?: CollaborationConfig;
  /**
   * Toolbar module configuration. Pass `true` to configure the toolbar with
   * defaults (equivalent to an empty object).
   *
   * This field configures the toolbar's contents and behavior; it does not by
   * itself provide a place to render it. A toolbar is only rendered once a
   * mount target resolves, from either `selector` here or the top-level
   * `Config.toolbar`. Without one, SuperDoc still creates the
   * `superdoc.toolbar` handle (item lookup and command routing keep working)
   * but renders no toolbar UI.
   *
   * Fallbacks to the top-level aliases are per field: `selector` falls back to
   * `Config.toolbar`, `icons` to `Config.toolbarIcons`, and `texts` to
   * `Config.toolbarTexts`. `Config.toolbarGroups` supplies the group ordering,
   * not `groups`: the two are different settings. `groups` maps group ids to
   * item ids (composition) and has no top-level alias, so omitting it uses the
   * built-in composition. Supplying it also replaces the group ordering with
   * its own keys.
   */
  toolbar?:
    | boolean
    | ({
        /**
         * Selector for the DOM element to render the toolbar into: an id
         * selector (`#toolbar`), a class selector (`.toolbar`), or a bare
         * element id (`toolbar`). Must be a string, not an `HTMLElement`
         * reference — pass an element through the top-level `Config.toolbar`.
         * Falls back to `Config.toolbar` if omitted.
         */
        selector?: string;
        /** Toolbar item ids to hide from the default set. */
        excludeItems?: string[];
        /**
         * Object map of group id to item ids
         * (`{ left: [...], center: [...], right: [...] }`) that overrides the
         * default group composition. Default group ids are
         * `'left' | 'center' | 'right'`. To pass an ordered group-id array
         * (`['left', 'center', 'right']`) use the top-level `Config.toolbarGroups`
         * instead — the array form is not accepted here.
         */
        groups?: Record<string, string[]>;
        /** Icon overrides keyed by toolbar item id. Falls back to `Config.toolbarIcons`. */
        icons?: Record<string, unknown>;
        /** Text/label overrides keyed by toolbar item id. Falls back to `Config.toolbarTexts`. */
        texts?: Record<string, string>;
        /**
         * Custom font list rendered in the font-family dropdown.
         *
         * AIDEV-NOTE: legacy-public - accepts {@link FontFamilyConfig} entries
         * alongside dropdown rows. This spelling was typed `FontConfig[]`,
         * whose index signature let `{ family, label, key }` compile and work,
         * so narrowing it to rows alone would break installs mid-2.x.
         * Replaced by `ui.toolbar.fonts`, which takes rows only.
         * Earliest removal: v3.0 (#853).
         *
         * The runtime uses the list verbatim and reads `label` and `key` off
         * each entry, so a `family`-only entry renders a blank row either way.
         */
        fonts?: Array<FontConfig | ToolbarFontOption>;
        /** Hide buttons that overflow the available width (default: true). */
        hideButtons?: boolean;
        /** Recompute the visible toolbar item set on container resize (default: false). */
        responsiveToContainer?: boolean;
        /**
         * Custom toolbar buttons appended to the default item set.
         *
         * AIDEV-NOTE: legacy-public - stays an open record. This spelling was
         * typed `Array<Record<string, unknown>>`, so narrowing it now would
         * reject entries that compile and work today. Replaced by
         * `ui.toolbar.customButtons`. Earliest removal: v3.0 (#853).
         */
        customButtons?: Array<Record<string, unknown>>;
        /**
         * Show the formatting marks (pilcrow) button in the toolbar. Off by
         * default. Distinct from `layoutEngineOptions.showFormattingMarks`, which
         * controls whether the marks render in the document.
         */
        showFormattingMarksButton?: boolean;
        /**
         * Show the table of contents insert button in the toolbar. Off by default.
         */
        showTableOfContentsButton?: boolean;
      } & Record<string, unknown>);
  /** Link click popover configuration. */
  links?: {
    /** Custom resolver for the link click popover. */
    popoverResolver?: LinkPopoverResolver;
  } & Record<string, unknown>;
  /** Context menu module configuration. */
  contextMenu?: ContextMenuConfig;
  /** Deprecated. Use `contextMenu` instead. */
  slashMenu?: object;
  /** Surface system configuration. */
  surfaces?: SurfacesModuleConfig;
  /** Track changes module configuration. */
  trackChanges?: TrackChangesModuleConfig;
  /**
   * Whiteboard module configuration. Pass `false` to disable the module
   * entirely; pass an object to opt in (with `enabled: true`) or to keep it
   * registered but inert (`enabled: false`, the default when no field is set).
   */
  whiteboard?: false | { enabled?: boolean };
}

/**
 * Canonical configuration for the track-changes module. Supersedes the
 * top-level `config.trackChanges` and `config.layoutEngineOptions.trackedChanges`
 * keys, which remain supported as deprecated aliases.
 */
/**
 * Identity of a tracked-change author, passed to a per-author color
 * {@link TrackChangesAuthorColorsConfig.resolve | resolver}. Mirrors the
 * author metadata SuperDoc carries on each tracked change.
 */
export interface TrackChangeAuthor {
  /** Author display name (from the OOXML `w:author` attribute). */
  name?: string;
  /** Author email, when available. */
  email?: string;
  /** Author avatar image URL, when available. */
  image?: string;
}

/**
 * Per-author tracked-change color configuration. Lets hosts assign a color
 * per author without injecting CSS `!important` rules against
 * `[data-track-change-author]` or reaching into private editor internals.
 *
 * Resolution order per author: `overrides` by identity (email first, then
 * name; exact match) → `resolve(author)` → a deterministic fallback color
 * derived from the author identity. The fallback guarantees imported /
 * discovered authors the host did not configure ahead of time still receive
 * a stable, distinct color.
 */
export interface TrackChangesAuthorColorsConfig {
  /** When `false`, per-author colors are not applied. Defaults to enabled. */
  enabled?: boolean;
  /**
   * Color overrides keyed by author identity. Both `email` and `name` keys
   * are supported (email is checked first); matching is exact.
   */
  overrides?: Record<string, string>;
  /**
   * Resolver consulted after `overrides`. Return a CSS color string, or
   * `undefined` to fall through to the deterministic fallback.
   */
  resolve?: (author: TrackChangeAuthor) => string | undefined;
}

/**
 * Semantic tracked-change color categories configurable through
 * {@link TrackChangesSemanticColorsConfig}. These color review roles: inserted
 * text, deleted text, moved-from/-to text, table cell insertion/deletion, cell
 * merge, and cell split, not authors. The same author can therefore receive
 * different colors for different review roles, which the author-identity path
 * cannot express.
 *
 * Whole-table, table-row, and table-split changes are NOT part of this config
 * surface: their paint colors are themed via the
 * `--sd-tracked-changes-table-*` CSS variables instead.
 *
 * Declared locally (mirroring the {@link TrackChangeAuthor} pattern) so the
 * published `superdoc` type graph never depends on the private
 * `@superdoc/contracts` specifier. Mirrors the
 * `TrackedChangeConfigurableSemanticColorKey` union in `@superdoc/contracts`.
 */
export type TrackedChangeSemanticColorKey =
  | 'insertion'
  | 'deletion'
  | 'move'
  | 'move-from'
  | 'move-to'
  | 'table-cell-insertion'
  | 'table-cell-deletion'
  | 'cell-merge'
  | 'cell-split';

/**
 * Input passed to a semantic tracked-change color
 * {@link TrackChangesSemanticColorsConfig.resolve | resolver} for a single
 * review role. `key` is always present; the remaining fields describe the
 * change being colored when SuperDoc knows them.
 */
export interface TrackedChangeSemanticColorResolverInput {
  /** Semantic category being colored. */
  key: TrackedChangeSemanticColorKey;
  /** Author identity, when known. Semantic colors are not author-derived. */
  author?: TrackChangeAuthor;
  /** Raw tracked-change type, when known. */
  type?: string;
  /** Logical subtype, when known. */
  subtype?: string;
  /** Target kind (e.g. text/cell/row/table), when known. */
  targetKind?: string;
  /** Scope of the semantic paint anchor, when known. */
  semanticAnchorScope?: string;
}

/**
 * Semantic tracked-change color configuration. The second
 * tracked-change color axis alongside {@link TrackChangesAuthorColorsConfig}:
 * `authorColors` colors by author identity, `semanticColors` colors review
 * roles (inserted text, deleted text, moved text, table cell
 * insertion/deletion, cell merge, cell split).
 *
 * Supported semantic colors are active by default. Word-like defaults apply with
 * no configuration: insertion blue, deletion red, and moved text green.
 * Resolution order per key: `overrides` by semantic key, `overrides.move` for
 * `move-from` / `move-to`, then `resolve(input)`, then the built-in default for
 * that key. Set `enabled: false` to suppress semantic colors and fall back to
 * existing author/broad defaults.
 *
 * Whole-table, table-row, and table-split paint colors are themed through the
 * `--sd-tracked-changes-table-*` CSS variables, not this config.
 *
 * This is separate from `modules.comments.trackChangeHighlightColors`, the
 * older broad insert/delete/format CSS-variable surface.
 */
export interface TrackChangesSemanticColorsConfig {
  /** When `false`, semantic colors are not applied. Defaults to enabled. */
  enabled?: boolean;
  /**
   * Color overrides keyed by semantic category (`'insertion'`, `'deletion'`,
   * `'move'`, `'move-from'`, `'move-to'`, `'table-cell-insertion'`,
   * `'table-cell-deletion'`, `'cell-merge'`, `'cell-split'`). `move` applies
   * to both move sides unless a side-specific override exists.
   */
  overrides?: Partial<Record<TrackedChangeSemanticColorKey, string>>;
  /**
   * Resolver consulted after `overrides`. Return a CSS color string, or
   * `undefined` to fall through to the built-in default for the key.
   */
  resolve?: (input: TrackedChangeSemanticColorResolverInput) => string | undefined;
}

export interface TrackChangesModuleConfig {
  /** Whether tracked-change indicators are shown in viewing mode. */
  visible?: boolean;
  /**
   * Rendering mode for tracked changes (see `TrackedChangesMode` in
   * `@superdoc/contracts`).
   * - 'review': show insertions and deletions inline (default for editing/suggesting)
   * - 'original': show the document as it existed before tracked changes (default for viewing when `visible` is false)
   * - 'final': show the document with changes applied
   * - 'off': disable tracked-change rendering
   */
  mode?: 'review' | 'original' | 'final' | 'off';
  /** Whether the layout engine treats tracked changes as active. */
  enabled?: boolean;
  /**
   * How a tracked replacement (adjacent insertion + deletion created by typing
   * over selected text) surfaces in the UI and API.
   * - `'paired'` (default, Google Docs model): the two halves share one id
   *   and resolve together with a single accept/reject click.
   * - `'independent'` (Microsoft Word / ECMA-376 §17.13.5 model): each
   *   insertion and each deletion has its own id, is addressable on its own,
   *   and resolves independently.
   */
  replacements?: 'paired' | 'independent';
  /**
   * Per-author tracked-change colors. When configured, insert/delete/format
   * tracked-change highlights are tinted per author through the
   * `--sd-tracked-changes-*` CSS variable surface, and
   * `ui.trackChanges.getSnapshot()` exposes the resolved author colors.
   */
  authorColors?: TrackChangesAuthorColorsConfig;
  /**
   * Semantic (structural) tracked-change colors. Colors structural change
   * subtypes: moved text, table cell insertion/deletion, cell merge, and cell
   * split, independently of {@link authorColors}. Supported keys are active by
   * default; set `enabled: false` to fall back to existing author/broad
   * defaults. Separate from `modules.comments.trackChangeHighlightColors`.
   */
  semanticColors?: TrackChangesSemanticColorsConfig;
}

export type DocumentMode = 'editing' | 'viewing' | 'suggesting';

export type ExportType = 'docx' | 'pdf' | 'html';

/**
 * - 'external': Include only external comments (default)
 * - 'clean': Export without any comments
 */
export type CommentsType = 'external' | 'clean';

/**
 * Document view layout values — mirrors OOXML ST_View (ECMA-376 §17.18.102).
 * - 'print': Print Layout View — displays document as it prints (default)
 * - 'web': Web Page View — content reflows to fit container (mobile/accessibility)
 */
export type ViewLayout = 'print' | 'web';

/**
 * Document view options for controlling how the document is displayed.
 * Mirrors OOXML document view settings.
 */
export interface ViewOptions {
  /**
   * Document view layout (OOXML ST_View compatible). In the browser editor,
   * `'web'` selects the retained semantic DOM surface. Browser normal flow
   * rewraps content as the editor container changes width.
   */
  layout?: ViewLayout;
}

export interface ExportParams {
  /** File formats to export. */
  exportType?: ExportType[];
  /** How to handle comments. */
  commentsType?: CommentsType;
  /** Custom filename (without extension). */
  exportedName?: string;
  /** Extra files to include in the export zip. */
  additionalFiles?: globalThis.Blob[];
  /** Filenames for the additional files. */
  additionalFileNames?: string[];
  /** Whether this is a final document export. */
  isFinalDoc?: boolean;
  /** Auto-download or return blob. */
  triggerDownload?: boolean;
  /**
   * Color for field highlights. The runtime defaults to `null` when no
   * value is supplied (and forwards `null` through to the underlying
   * editor export, which accepts `string | null`); the typedef accepts
   * `null` explicitly so consumers can pass an explicit "no highlight"
   * value without a typecheck failure.
   */
  fieldsHighlightColor?: string | null;
  /**
   * Options for client-side PDF export (`exportType: ['pdf']`). The exporter
   * renders the editor's paginated DOM to a PDF with pdf-lib and needs
   * embeddable font bytes — supply `fontBaseUrl` (a directory of Sans/Serif/Mono
   * TTFs) or an explicit `fonts` map. See `core/export/pdf-export.ts`.
   */
  pdfOptions?: {
    fontBaseUrl?: string;
    fonts?: Record<string, ArrayBuffer>;
    /**
     * DOCX embedded fonts (family -> variant -> bytes). Normally filled in
     * automatically by `SuperDoc.export()`; pass explicitly to override.
     */
    embeddedFonts?: Record<string, Partial<Record<'regular' | 'bold' | 'italic' | 'bolditalic', Uint8Array>>>;
    onProgress?: (message: string) => void;
    /**
     * Rendering strategy. `'word'` (default) draws vector text at the browser's
     * measured coordinates — smallest files, crisp at any zoom. `'pixel'`
     * embeds each page as a raster painted by the browser's own engine —
     * pixel-identical to the editor (including RTL/Arabic shaping) with an
     * invisible selectable-text/link overlay, at larger file sizes.
     */
    mode?: 'word' | 'pixel';
  };
}

/** Surface where the edit originated. */
export type EditorSurface = 'body' | 'header' | 'footer';

export interface EditorUpdateEvent {
  /**
   * The primary editor associated with the update. For header/footer
   * edits, this is the main body editor. Optional because the runtime
   * payload builder falls back to `sourceEditor` and emits `undefined`
   * when neither is present (defensive in test/stub paths); consumers
   * should narrow before use.
   */
  editor?: Editor;
  /** The editor instance that emitted the update. For body edits, this matches `editor`. */
  sourceEditor?: Editor;
  /** The surface where the edit originated. */
  surface: EditorSurface;
  /**
   * Relationship ID for header/footer edits. Always present (the
   * runtime payload builder defaults to `null`); may be `null` for
   * body edits.
   */
  headerId: string | null;
  /**
   * Header/footer variant (`default`, `first`, `even`, `odd`) when
   * available. Always present (defaults to `null`); may be `null`.
   */
  sectionType: string | null;
}

/**
 * Payload emitted with the `ready` event and passed to `Config.onReady`.
 * Carries the live SuperDoc instance.
 */
export interface SuperDocReadyPayload {
  superdoc: SuperDoc;
}

/**
 * Payload emitted with the `editorCreate` / `editorBeforeCreate` /
 * `collaboration-ready` events and passed to the matching `Config.onX`
 * callbacks. The runtime always wraps the editor in this shape; bare
 * `Editor` references in earlier callback typings were incorrect.
 */
export interface SuperDocEditorPayload {
  editor: Editor;
}

/**
 * Payload emitted with `document-replaced`.
 *
 * `editor` is the editor whose replacement completed, not necessarily the one
 * active when the event is received: a replace is asynchronous, so the active
 * editor can move while it is in flight. A consumer must compare this against
 * the editor it is bound to and ignore anything else.
 *
 * Typed `unknown` rather than `Editor`: the active editor can be a v2 facade
 * that does not satisfy `Editor` (`getHTML` is required there and absent on the
 * facade), so annotating it as `Editor` would promise methods that are not
 * present. It is an identity token to compare, not an object to call.
 */
export interface SuperDocDocumentReplacedPayload {
  editor: unknown;
  /**
   * The host that rendered the replaced document.
   *
   * Carried because `editor` alone cannot be matched in the V2 browser path: a
   * successful replace emits its ready payload before `replaceFile()` resolves,
   * so the shell has already installed a NEW facade by the time this event
   * fires, and the captured facade is one the controller no longer holds. The
   * host survives that swap, so it is the identity that still lines up.
   */
  host: unknown;
}

/**
 * Payload emitted with the `locked` event and passed to
 * `Config.onLocked`. `lockedBy` is non-optional because the runtime
 * always includes the key (`lockSuperdoc` defaults `lockedBy` to
 * `null`); the value may be `User | null` because unlocking and
 * unattributed locks both pass `null`.
 */
export interface SuperDocLockedPayload {
  isLocked: boolean;
  lockedBy: User | null;
}

/**
 * Payload emitted with the `awareness-update` event and passed to
 * `Config.onAwarenessUpdate`. Field set differs from older inline
 * declarations: the runtime emits `superdoc` (not `context`) and
 * includes `added` / `removed` client-id arrays alongside `states`.
 */
export interface SuperDocAwarenessUpdatePayload {
  states: AwarenessState[];
  added: number[];
  removed: number[];
  superdoc: SuperDoc;
}

/**
 * Payload emitted with the `comments-update` event and passed to
 * `Config.onCommentsUpdate`. Field set differs from older inline
 * declarations: the runtime emits `comment?` and `changes?` (never a
 * `data` field).
 */
export interface SuperDocCommentsUpdatePayload {
  /** Update kind (e.g. `'created'`, `'updated'`, `'deleted'`); set by the comments store. */
  type: string;
  /** The comment object the update refers to, when applicable. */
  comment?: Comment;
  /** Per-field change set when the update is a mutation. */
  changes?: Array<{ key: string; commentId: string; fileId?: string | null }>;
  /**
   * The Document API selection snapshot captured at the moment a
   * `'pending'` comment was started, before the pending mark is
   * inserted (which clears the live DOM selection). Present only on the
   * `'pending'` event. When it has a `target`, forward it straight to
   * `ui.comments.createFromCapture(pendingSelection, { text })` to build
   * the comment from a custom composer without tracking the selection
   * yourself ahead of the floating-bubble click.
   *
   * `null` means the pending comment did not start from an addressable
   * SuperDoc editor text selection, or the active editor/selection API was
   * unavailable. PDF and other non-SuperDoc editor selections emit `null`.
   * Empty SuperDoc editor selections can still yield a `SelectionInfo` with
   * `target: null`.
   */
  pendingSelection?: SelectionInfo | null;
}

export interface EditorTransactionLike {
  readonly docChanged?: boolean;
  readonly doc?: {
    readonly content?: { readonly size?: number };
    nodesBetween?: (
      from: number,
      to: number,
      callback: (node: {
        readonly type?: { readonly name?: string };
        readonly attrs?: Record<string, unknown>;
        readonly marks?: ReadonlyArray<{
          readonly type?: { readonly name?: string };
          readonly attrs?: Record<string, unknown>;
        }>;
      }) => false | void | undefined,
    ) => void;
  };
  readonly mapping?: {
    readonly maps?: ReadonlyArray<{
      forEach(callback: (oldStart: number, oldEnd: number, newStart: number, newEnd: number) => void): void;
    }>;
    slice?(from: number): {
      map(position: number, assoc?: number): number;
    };
  };
  getMeta?(key: unknown): unknown;
}

export interface EditorTransactionEvent {
  /** The primary editor associated with the transaction. For header/footer edits, this is the main body editor. */
  editor: Editor;
  /** The editor instance that emitted the transaction. For body edits, this matches `editor`. */
  sourceEditor: Editor;
  /** The editor transaction emitted by the source editor. */
  transaction: EditorTransactionLike;
  /** Time spent applying the transaction, in milliseconds. */
  duration?: number;
  /** The surface where the transaction originated. */
  surface: EditorSurface;
  /** Relationship ID for header/footer edits. */
  headerId?: string | null;
  /** Header/footer variant (`default`, `first`, `even`, `odd`) when available. */
  sectionType?: string | null;
}

export interface SdtRef {
  id: string;
  tag?: string;
  alias?: string;
  controlType: string;
  scope: 'inline' | 'block';
}

export interface ContentControlActiveChangePayload {
  active: SdtRef | null;
  previous: SdtRef | null;
  /**
   * Active content-control stack for the new selection, innermost first
   * (matches `ui.contentControls` activeIds). `active` is `activePath[0]`.
   * Empty when the selection is not inside any control. Lets nested-aware
   * custom UI read the surrounding controls without combining with observe().
   */
  activePath: SdtRef[];
  source: 'keyboard' | 'pointer';
}

export interface ContentControlClickPayload {
  target: SdtRef;
  source: 'pointer';
}

export interface SuperDocLayoutEngineOptions {
  /**
   * Layout engine flow mode.
   * - 'paginated': standard page-first layout (default)
   * - 'semantic': continuous semantic flow without visible pagination boundaries
   */
  flowMode?: 'paginated' | 'semantic';
  /**
   * Deprecated. Use `modules.trackChanges` instead. Optional override for
   * paginated track-changes rendering (e.g., `{ mode: 'original' }` or
   * `{ enabled: false }`).
   */
  trackedChanges?: object;
  /**
   * Page virtualization options for paginated layout. Defaults to
   * `{ enabled: true, window: 5, overscan: 1 }` to render only the visible
   * window of pages plus a small overscan buffer.
   */
  virtualization?: {
    /** Whether virtualization is active (default: true). */
    enabled?: boolean;
    /** Number of pages kept rendered around the active page (default: 5). */
    window?: number;
    /** Extra pages rendered outside the active window for smoother scrolling (default: 1). */
    overscan?: number;
  };
  /**
   * Whether bookmark indicators are shown in the rendered layout. Toggleable
   * at runtime via `superdoc.setShowBookmarks()`.
   */
  showBookmarks?: boolean;
  /**
   * Whether nonprinting formatting marks are shown in the rendered layout.
   * Toggleable at runtime via `superdoc.setShowFormattingMarks()`.
   */
  showFormattingMarks?: boolean;
  /**
   * Whether the V2 mounted body paints progressively from an initial window.
   * Defaults to `true`.
   *
   * @experimental Diagnostic posture, not a supported product mode and not a
   * pipeline bypass: both settings route through the same canonical
   * render-pipeline engine. `true` (default) paints an initial window and
   * (the canonical initial-render and incremental engine
   * passes); `false` makes EVERY mounted repaint wait for complete source
   * coverage and materialize the full body before painting — not only the
   * first paint — via the exact-complete engine pass, which can be much
   * slower than progressive streaming on large documents. Failures fail
   * closed: the mount/repaint promise rejects with a named
   * `render.complete-before-first-paint-*` error and the host records a
   * render-readiness diagnostic. The render surface has no independent
   * first-paint timeout; callers and harnesses must provide their own.
   */
  /**
   * P6a: per-paint work-counter HUD (console table +
   * `data-v2-paint-hud-recent`) and the dark reuse-collapse tripwire for the
   * windowed paint owner (since P7, vertical-paginated flow's only paint
   * path — no flag needed).
   *
   * @experimental Dev/verification instrument.
   */
  paintHud?: boolean;
}

export interface ViewingVisibilityConfig {
  visible?: boolean;
}

export interface SuperDocTelemetryConfig {
  enabled: boolean;
  endpoint?: string;
  metadata?: Record<string, unknown>;
  licenseKey?: string;
}

/**
 * Exception payload raised by the SuperDoc store during document
 * initialization (empty entry, init failure, normalization error).
 * Always carries `stage: 'document-init'` and the offending document
 * config (`null`/`undefined` when the entry itself was empty).
 *
 * `error` is `unknown` because the catch path in `initializeDocuments`
 * forwards the raw caught value (`catch (e) { emitException({ error: e,
 * ... }) }`) and thrown values can be anything in JS. The other two
 * emit sites construct `new Error(...)`, but consumers must narrow
 * before reading `.message`.
 */
export interface SuperDocExceptionStorePayload {
  error: unknown;
  stage: 'document-init';
  document: Document | null | undefined;
}

/**
 * Exception payload raised when restoring SuperDoc state from a
 * persisted source fails. Carries the document the runtime tried to
 * restore.
 */
export interface SuperDocExceptionRestorePayload {
  error: unknown;
  document: Document;
}

/**
 * Exception payload raised by the underlying editor lifecycle (load,
 * encryption-prompt, command failures, etc.). `code` is set when the
 * editor maps the failure to a known kind (e.g. `'password-required'`).
 * `editor` is `Editor | null | undefined` because the password-prompt
 * re-emit path forwards `originalException?.editor ?? null`, so
 * consumers may receive `null` (not just `undefined`).
 */
export interface SuperDocExceptionEditorPayload {
  error: unknown;
  editor?: Editor | null;
  code?: string;
  documentId?: string | null;
}

/**
 * Exception payload raised by the built-in toolbar.
 *
 * Emitted for a command that failed and for a custom entry the toolbar could
 * not build, in which case `itemName` is the entry that was skipped and the
 * message names the field that would fix it. Reaches the host as well as the
 * toolbar, because entries are built inside the toolbar constructor and
 * nothing can have subscribed to the toolbar yet.
 */
export interface SuperDocExceptionToolbarPayload {
  error: Error;
  /** The value originally thrown, before it was normalized to an `Error`. */
  originalError: unknown;
  /** The toolbar item involved, or `null` when the entry had no usable name. */
  itemName: string | null;
  editor?: Editor | null;
}

/**
 * Union of all `exception` event payloads SuperDoc emits at runtime.
 * Consumers can narrow with `'stage' in payload` (store init),
 * `'code' in payload` (editor lifecycle), or `'itemName' in payload`
 * (built-in toolbar).
 *
 * The union exists today because four independent emit sites
 * (`initializeDocuments`, the restore path, the editor lifecycle, and the
 * built-in toolbar) pre-date a shared error contract. Normalizing them to a
 * single payload shape is a separate follow-up; consumers can narrow with
 * the `in` checks above in the meantime.
 */
export type SuperDocExceptionPayload =
  | SuperDocExceptionStorePayload
  | SuperDocExceptionRestorePayload
  | SuperDocExceptionEditorPayload
  | SuperDocExceptionToolbarPayload;

/**
 * Zoom mode. `manual` holds whatever value was last set; `fit-width`
 * continuously recomputes the zoom that fits the page width into the
 * available container width. Calling `setZoom()` switches to
 * `manual`; `setZoomMode('fit-width')` re-enters fitting.
 */
export type SuperDocZoomMode = 'manual' | 'fit-width';

/**
 * Measurement unit for rulers and measurement fields (Word's "measurement
 * units" preference). `in` = inches, `cm` = centimetres. Set the starting unit
 * with `Config.measurementUnit`; change it at runtime with `setMeasurementUnit()`.
 */
export type SuperDocMeasurementUnit = 'in' | 'cm';

/**
 * Payload emitted with the `measurement-unit-change` event. Fires when
 * `setMeasurementUnit()` changes the document-wide ruler/measurement unit.
 */
export interface SuperDocMeasurementUnitChangePayload {
  /** The measurement unit now in effect. */
  unit: SuperDocMeasurementUnit;
}

/**
 * Payload emitted with the `zoomChange` event and passed to
 * `Config.onZoomChange`. Fires for every zoom source: `setZoom()`,
 * the toolbar zoom control, and fit-width adjustments.
 */
export interface SuperDocZoomPayload {
  /** The zoom level as a percentage (e.g. 100, 150). */
  zoom: number;
  /** The zoom mode that produced this value. */
  mode: SuperDocZoomMode;
}

/**
 * Payload emitted with the `viewport-change` event and passed to
 * `Config.onViewportChange`. The event fires when the implied fit
 * changes: the rounded `fitZoom` or the rounded base page width.
 * Pixel-level `availableWidth` movement that cannot change any fit
 * decision does not emit; read `getViewportMetrics()` for the
 * always-latest measurements. These are pure measurements:
 * `zoom.fitWidth` policy options (`min`, `max`, `padding`) do not
 * affect them. For the common case, prefer `zoom.mode: 'fit-width'`,
 * which applies a clamped fit automatically.
 */
export interface SuperDocViewportChangePayload {
  /**
   * Width available to the document in pixels: the measured container
   * width minus the comments sidebar when it is visible.
   */
  availableWidth: number;
  /** Widest document page width in pixels at 100% zoom. */
  documentWidth: number;
  /** Zoom percentage that fits the document in the available width (unclamped, padding-free). Clamp before applying. */
  fitZoom: number;
}

/**
 * Latest viewport measurements, readable at any time via
 * `superdoc.getViewportMetrics()`. Same shape as the
 * `viewport-change` payload and refreshed on every measurement
 * (including pixel-level changes the deduped event skips); `null`
 * until the first measurement (editors still mounting).
 */
export type SuperDocViewportMetrics = SuperDocViewportChangePayload;

/**
 * Options for the `fit-width` zoom mode. `min`/`max` clamp the
 * applied zoom percentage; `padding` reserves horizontal space
 * inside the available width before computing the applied fit.
 * These shape the applied policy only, never the reported metrics.
 */
export interface SuperDocFitWidthOptions {
  /** Lower bound for the applied zoom percentage (default: 10). */
  min?: number;
  /**
   * Upper bound for the applied zoom percentage (default: 100, so
   * fitting never enlarges the document past its natural size; raise
   * it to let wide containers scale the page up).
   */
  max?: number;
  /** Horizontal padding in pixels reserved inside the available width before computing the fit (default: 0). */
  padding?: number;
}

/**
 * Snapshot of the current zoom state, readable via
 * `superdoc.getZoomState()`.
 */
export interface SuperDocZoomState {
  /** Current zoom mode. */
  mode: SuperDocZoomMode;
  /** Current zoom value as a percentage. */
  value: number;
  /** Latest computed fit zoom (unclamped), or `null` before the first viewport measurement. */
  fitZoom: number | null;
  /** Effective lower bound the fit policy applies (config or default). */
  min: number;
  /** Effective upper bound the fit policy applies (config or default). */
  max: number;
}

/**
 * Options for `Config.zoom`: the initial zoom level, the starting
 * mode, and the fit-width policy bounds. Runtime control stays on
 * the instance: `setZoom()` (switches to manual), `setZoomMode()`,
 * `getZoomState()`, `getViewportMetrics()`, and the `zoomChange` /
 * `viewport-change` events.
 */
export interface SuperDocZoomConfig {
  /**
   * Initial zoom level as a percentage (default: 100). Applied before
   * the first paint, so the document renders directly at this zoom
   * with no visible jump. In `fit-width` mode this is the paint zoom
   * until the first fit computes. Invalid values (non-finite or <= 0)
   * are ignored with a console warning.
   */
  initial?: number;
  /**
   * Starting zoom mode (default: `'manual'`). In `'fit-width'` the
   * document continuously re-fits to the available container width;
   * the fit is applied through the normal zoom pipeline, so
   * `zoomChange` fires for every adjustment.
   */
  mode?: SuperDocZoomMode;
  /** Bounds and padding for the `fit-width` policy. */
  fitWidth?: SuperDocFitWidthOptions;
}
/**
 * Per-surface built-in UI configuration. Every field is optional; an omitted
 * field keeps that surface's historical default rather than inheriting from
 * its siblings, so a partial config only changes what it names.
 *
 * `false` disables a surface, `true` enables it with defaults, and an options
 * object both enables and configures it.
 *
 * @see {@link Config.ui}
 */
export interface UIConfig {
  /**
   * Built-in toolbar. Enabled by default, but a toolbar only appears once
   * `container` resolves to an element — enabling it without one creates the
   * `superdoc.toolbar` handle and renders nothing.
   */
  toolbar?:
    | boolean
    | {
        /**
         * Where to render the toolbar: an element, an id selector
         * (`#toolbar`), a class selector (`.toolbar`), or a bare element id.
         * Other CSS selector syntax resolves to nothing.
         */
        container?: string | HTMLElement;
        /**
         * Which groups render, or what goes in them. The shape decides which
         * of the two it means, so both v1 spellings have somewhere to land.
         *
         * An array selects which groups render, e.g.
         * `['left', 'center', 'right']`. This is where `Config.toolbarGroups`
         * moves to. It is a membership list, not a sort order: the built-in
         * toolbar lays groups out left, center, right, and renders center
         * whether or not it is listed.
         *
         * An object is composition: a group id mapped to the item ids inside
         * it, e.g. `{ right: ['bold'] }`. This is where
         * `modules.toolbar.groups` moves to. Supplying both an ordering array
         * here and a legacy composition map keeps the composition and applies
         * the ordering as a filter.
         */
        groups?: string[] | Record<string, string[]>;
        /** Toolbar item ids to hide from the default set. */
        excludeItems?: string[];
        /** Icon overrides, merged over the built-in set. */
        icons?: Record<string, unknown>;
        /** Text overrides, merged over the built-in set. */
        texts?: Record<string, unknown>;
        /**
         * Hide buttons that overflow the available width (default: true).
         *
         * The runtime has always honored this through the toolbar options
         * pass-through; it was only missing from this type, so passing it here
         * failed excess-property checks while working at runtime.
         */
        hideButtons?: boolean;
        /** Size the toolbar to its container rather than the viewport. */
        responsiveToContainer?: boolean;
        /**
         * Custom font list rendered in the font-family dropdown. The runtime
         * uses this list verbatim, so entries are dropdown rows
         * ({@link ToolbarFontOption}), not families to load
         * ({@link FontFamilyConfig}). Register loadable families through
         * `fonts.families` instead.
         */
        fonts?: ToolbarFontOption[];
        /**
         * Custom toolbar entries appended to the default item set. See
         * `ToolbarCustomButton` for which shapes render.
         *
         * `readonly` so an `as const` array is accepted. Without it the array
         * built in a separate variable had no way through: widening turns each
         * `type` into `string`, `as const` is the documented answer to that,
         * and a mutable field then rejected the result. The toolbar only reads
         * this.
         */
        customButtons?: readonly ToolbarCustomButton[];
        /**
         * Show the formatting marks (pilcrow) button in the toolbar. Off by
         * default. Distinct from `layoutEngineOptions.showFormattingMarks`, which
         * controls whether the marks render in the document.
         */
        showFormattingMarksButton?: boolean;
        /** Show the table of contents insert button in the toolbar. Off by default. */
        showTableOfContentsButton?: boolean;
      };
  /** Built-in comments UI. Enabled by default. */
  comments?: boolean | CommentsConfig;
  /** Built-in right-click and slash context menu. Enabled by default. */
  contextMenu?: boolean | ContextMenuConfig;
  /**
   * Built-in loading overlay shown while a document opens. Enabled by default.
   * Set to `false` to show your own loading UI instead.
   *
   * This only decides whether SuperDoc draws the overlay. It does not change
   * how long a document takes to open, and it does not affect loading UI the
   * host renders (such as `renderLoading` in `@superdoc/react`).
   *
   * The built-in overlay also masks the document while it opens. Turning it
   * off hands that responsibility to your UI: keep yours up until `onReady`,
   * and around a replacement await `superdoc.replaceFile(...)`.
   */
  loading?: boolean;
  /**
   * Built-in find/replace surface. Disabled by default. Enabling it lets
   * SuperDoc intercept Cmd+F / Ctrl+F; `editor.ui.search` stays available to
   * custom UI either way.
   */
  search?: boolean | FindReplaceConfig;
  /**
   * Built-in popover shown when a link is clicked. It renders by default;
   * pass `false` (or `ui: false`) to suppress it. Supplying a
   * {@link LinkPopoverConfig.popoverResolver} replaces it with your own UI.
   */
  linkPopover?: boolean | LinkPopoverConfig;
  /** Built-in ruler. Disabled by default. */
  ruler?:
    | boolean
    | {
        /** Element or selector to render the ruler into. */
        container?: string | HTMLElement;
      };
  /** Built-in chrome drawn around content controls. Enabled by default. */
  contentControls?: boolean | ContentControlsConfig;
}

/**
 * What the user is permitted to do, as distinct from what SuperDoc draws.
 *
 * Policy outlives presentation: `ui: false` removes the built-in comment
 * dialog, but an application rendering its own still needs `readOnly`
 * enforced. Keeping the two apart means a custom UI does not have to hold a
 * `modules.comments` object alive purely to carry policy.
 */
export interface InteractionConfig {
  /** Comment and tracked-change interaction policy. */
  comments?: {
    /** Reject every comment and tracked-change mutation (default: false). */
    readOnly?: boolean;
    /** Offer resolve/reopen actions when writable (default: true). */
    allowResolve?: boolean;
  };
}

/**
 * Shared plumbing for dialogs and floating overlays, including surfaces the
 * application opens itself through `superdoc.openSurface()`.
 *
 * Unaffected by `ui: false`: turning off SuperDoc's own surfaces does not
 * disable the mechanism an application uses to render its own.
 */
export interface SurfacesConfig {
  /**
   * Resolver for intent-based surface requests.
   *
   * `null` explicitly clears a resolver inherited from the legacy
   * `modules.surfaces.resolver`, which omitting the key does not do.
   */
  resolver?: SurfaceResolver | null;
  /** Defaults applied to dialog surfaces. */
  dialog?: {
    /** Close on Escape (default: true). */
    closeOnEscape?: boolean;
    /** Close on backdrop click (default: true). */
    closeOnBackdrop?: boolean;
    /** Default max width. */
    maxWidth?: string | number;
  };
  /** Defaults applied to floating surfaces. */
  floating?: {
    /** Placement preset (default: 'top-right'). */
    placement?: SurfaceFloatingPlacement;
    /** Default width. */
    width?: string | number;
    /** Default max width. */
    maxWidth?: string | number;
    /** Default max height. */
    maxHeight?: string | number;
    /** Close on Escape (default: true). */
    closeOnEscape?: boolean;
    /** Close on outside pointer down (default: false). */
    closeOnOutsidePointerDown?: boolean;
    /** Focus the surface on open (default: true). */
    autoFocus?: boolean;
  };
}

/**
 * Browser worker asset URLs for deployments where application code and built
 * SuperDoc assets are served from different origins. Each URL must resolve to
 * a same-origin module worker served by the embedding application.
 */
interface V2WorkerUrlsConfig {
  /** Main document worker used by non-collaborative v2 documents. */
  document?: string | URL;
  /** Collaboration-capable document worker used by v2 collaboration rooms. */
  collaboration?: string | URL;
  /** Isolated review-index worker used for comments and tracked changes. */
  reviewIndex?: string | URL;
}

export interface Config {
  /** The ID of the SuperDoc. */
  superdocId?: string;
  /** The selector or element to mount the SuperDoc into. */
  selector: string | HTMLElement;
  /** The mode of the document (default: 'editing'). */
  documentMode?: DocumentMode;
  /**
   * When `documentMode` is `'viewing'`, allow the user to make text
   * selections even though editing is disabled. Defaults to `false`.
   * Forwarded to the underlying editor as `options.allowSelectionInViewMode`.
   */
  allowSelectionInViewMode?: boolean;
  /** The role of the user in this SuperDoc. */
  role?: 'editor' | 'viewer' | 'suggester';
  /**
   * The document to load. If a string, it will be treated as a URL. If a File
   * or Blob, it will be used directly. For a v2 collaboration room, pass a
   * structured document carrying `v2Collaboration`.
   *
   * Omitting this field and `documents` mounts a blank DOCX, so the Editor
   * opens a real document rather than an empty surface. The blank document is
   * a supported v2 source; it is seeded before mount and behaves like any
   * other opened DOCX, including export.
   *
   * Setting the v1 `modules.collaboration` field also suppresses that seeding,
   * but it is not a supported v2 path: the runtime fails closed with
   * `collaboration-v1-config-unsupported` and mounts only enough state to
   * report that error.
   */
  document?: object | string | globalThis.File | globalThis.Blob;
  /** Password for encrypted DOCX files. Forwarded during document load. */
  password?: string;
  /** The documents to load → soon to be deprecated. */
  documents?: Document[];
  /**
   * The current user of this SuperDoc. Typed as `AwarenessUser` (an
   * extension of `User` with the optional `color` field) so consumers
   * can pass an explicit awareness color and have the runtime honor it
   * as an override - `SuperDoc#assignUserColor()` skips its hash-based
   * assignment when `user.color` is already set.
   */
  user?: AwarenessUser;
  /** All users of this SuperDoc (can be used for "@"-mentions). */
  users?: User[];
  /** Colors to use for user awareness. */
  colors?: string[];
  /**
   * Which built-in interface SuperDoc renders.
   *
   * Omit it to keep SuperDoc's historical rendering: comments, the context
   * menu, and content-control chrome are on; search, the link popover, and
   * the ruler are opt-in; and the toolbar renders once it has somewhere to
   * mount. That profile is not symmetrical, and omitting this field
   * reproduces it exactly.
   *
   * Pass `false` when the application owns the interface. SuperDoc then
   * renders no controls, chrome, dialogs, or popovers, while the document,
   * the Document API, and `editor.ui` keep working — so a custom UI drives
   * the same commands the built-in one would have.
   *
   * Pass an object to choose per surface. An omitted key keeps that
   * surface's default rather than following its siblings, so
   * `{ comments: false }` disables comments and changes nothing else.
   *
   * @example
   * // Application owns the interface.
   * new SuperDoc({ selector: '#editor', document: file, ui: false });
   *
   * @example
   * // Built-in toolbar and search, no comments or context menu.
   * new SuperDoc({
   *   selector: '#editor',
   *   document: file,
   *   ui: {
   *     toolbar: { container: '#toolbar' },
   *     search: true,
   *     comments: false,
   *     contextMenu: false,
   *   },
   * });
   */
  ui?: false | UIConfig;
  /**
   * What the user is permitted to do. Independent of {@link Config.ui}: a
   * `readOnly` policy still applies when the application renders its own
   * comment UI.
   */
  interaction?: InteractionConfig;
  /**
   * Shared configuration for dialogs and floating overlays, including ones
   * opened through `superdoc.openSurface()`. Stays active under `ui: false`.
   */
  surfaces?: SurfacesConfig;
  /** Modules to load. */
  modules?: Modules;
  /** Top-level override for permission checks. */
  permissionResolver?: (params: PermissionResolverParams) => boolean | undefined;
  /**
   * Where to render the built-in toolbar. Either an `HTMLElement`, or a
   * selector string in one of the supported forms: an id selector (`#toolbar`),
   * a class selector (`.toolbar`), or a bare element id (`toolbar`). Other CSS
   * selector syntax is not supported — an attribute or descendant selector such
   * as `[data-toolbar]` resolves to nothing and leaves the toolbar unrendered.
   *
   * SuperDoc renders into the resolved element but does not manage its
   * placement, and never includes it in the `contained` layout calculation.
   * Where the application puts it therefore decides the space it needs: a
   * sibling of a 400px `contained` Editor adds its own height alongside it,
   * while a toolbar placed inside that host consumes part of the 400px and can
   * overflow it.
   *
   * Omitting this field (and `modules.toolbar.selector`) renders no toolbar.
   * `modules.toolbar: true` on its own does not render one either — it creates
   * the `superdoc.toolbar` handle without a mount target. See
   * {@link Modules.toolbar}.
   */
  toolbar?: string | HTMLElement;
  /** Toolbar groups to show. */
  toolbarGroups?: string[];
  /** Icons to show in the toolbar. */
  toolbarIcons?: object;
  /** Texts to override in the toolbar. */
  toolbarTexts?: object;
  /**
   * The font-family to use for all SuperDoc UI surfaces (toolbar, comments
   * UI, dropdowns, tooltips, etc.). This ensures consistent typography across
   * the entire application and helps match your application's design system.
   * The value should be a valid CSS font-family string.
   *
   * Example (system fonts):
   *   uiDisplayFallbackFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
   *
   * Example (custom font):
   *   uiDisplayFallbackFont: '"Inter", Arial, sans-serif'
   */
  uiDisplayFallbackFont?: string;
  /** Whether the SuperDoc is in development mode. */
  isDev?: boolean;
  /**
   * Disable Pinia/Vue devtools plugin setup for this SuperDoc instance
   * (useful in non-Vue hosts).
   */
  disablePiniaDevtools?: boolean;
  /**
   * Layout engine overrides passed through to DocumentRendererRuntime (page size,
   * margins, virtualization, zoom, debug label, etc.).
   */
  layoutEngineOptions?: SuperDocLayoutEngineOptions;
  /**
   * Advanced DocumentRendererRuntime feature toggles. `unifiedHistory` is enabled
   * by default; set it to `false` to force legacy active-surface undo
   * routing. `v2Host` enables the experimental mode-aware v2 DOCX shell path.
   */
  experimental?: {
    unifiedHistory?: boolean;
    v2Host?: boolean;
    /**
     * Temporary V2 web-surface rollout control. The value is snapshotted at
     * mount and changing it requires a remount. This is not a stable renderer API.
     */
    v2WebSurface?: 'dense-control' | 'retained-dom';
    /**
     * Derived-invalidation deferral for direct single-paragraph edits (v2
     * engine only). Field display text settles off the keystroke path under
     * the engine's settlement contract. DEFAULT TRUE — this is the engine's
     * standard behavior; set `false` only as an emergency kill switch.
     */
    deferDerivedInvalidations?: boolean;
  };
  /** Callback before an editor is created. Receives a wrapper carrying the editor. */
  onEditorBeforeCreate?: (params: SuperDocEditorPayload) => void;
  /** Callback after an editor is created. Receives a wrapper carrying the editor. */
  onEditorCreate?: (params: SuperDocEditorPayload) => void;
  /** Callback when the v2 document source reaches source-complete posture and diff.capture is safe to call. */
  onSourceComplete?: () => void;
  /** Callback when v2 source signals finish building (fires after onSourceComplete; diff.capture is synchronously safe). */
  onSourceSignalsComplete?: () => void;
  /** Callback when a transaction is made. */
  onTransaction?: (params: EditorTransactionEvent) => void;
  /** Callback after an editor is destroyed. */
  onEditorDestroy?: () => void;
  /**
   * Callback when an editor reports a content error (parse failure, doc
   * import error, etc.). `error` is widened to `unknown` because the
   * document editor side mostly normalizes to `Error` but some emitters
   * (e.g. `insertContentAt`) forward the original caught value. `file`
   * matches `Document.data` (`File | Blob | null | undefined`) since
   * the document can be loaded from any of those shapes. `documentId`
   * is guaranteed at runtime by `#initDocuments`.
   */
  onContentError?: (params: {
    error: unknown;
    editor: Editor;
    documentId: string;
    file: globalThis.File | globalThis.Blob | null | undefined;
  }) => void;
  /** Callback when the SuperDoc is ready. Receives a wrapper carrying the live SuperDoc instance. */
  onReady?: (params: SuperDocReadyPayload) => void;
  /** Callback when comments are updated. */
  onCommentsUpdate?: (params: SuperDocCommentsUpdatePayload) => void;
  /** Callback when active content control changes. */
  onContentControlActiveChange?: (params: ContentControlActiveChangePayload) => void;
  /** Callback when user clicks inside a content control. */
  onContentControlClick?: (params: ContentControlClickPayload) => void;
  /** Callback when awareness is updated. */
  onAwarenessUpdate?: (params: SuperDocAwarenessUpdatePayload) => void;
  /** Callback when the SuperDoc is locked or unlocked. */
  onLocked?: (params: SuperDocLockedPayload) => void;
  /** Callback when the PDF document is ready. */
  onPdfDocumentReady?: () => void;
  /** Callback when the sidebar is toggled. */
  onSidebarToggle?: (isOpened: boolean) => void;
  /** Callback when collaboration is ready. Receives a wrapper carrying the editor. */
  onCollaborationReady?: (params: SuperDocEditorPayload) => void;
  /** Callback when document is updated. */
  onEditorUpdate?: (params: EditorUpdateEvent) => void;
  /**
   * Callback when SuperDoc emits an `exception` event. The payload is a
   * union of three runtime shapes (store init, restore failure, editor
   * lifecycle). Narrow with `'stage' in params` (store init) or `'code'
   * in params` (editor) before reading shape-specific fields.
   */
  onException?: (params: SuperDocExceptionPayload) => void;
  /** Callback when the comments list is rendered. */
  onCommentsListChange?: (params: { isRendered: boolean }) => void;
  /**
   * Callback when pagination layout updates (fires after each layout pass
   * with the current page count).
   */
  onPaginationUpdate?: (params: { totalPages: number; superdoc: SuperDoc }) => void;
  /** Callback when the list definitions change. */
  onListDefinitionsChange?: (params: ListDefinitionsPayload) => void;
  /**
   * Callback when the zoom level changes. Fires for every zoom source:
   * `setZoom()`, the toolbar zoom control, and fit-width
   * adjustments.
   */
  onZoomChange?: (params: SuperDocZoomPayload) => void;
  /**
   * Callback when the implied fit changes (rounded fit zoom or base
   * page width); pixel-level width jitter does not fire it, and
   * `getViewportMetrics()` always reads latest. Registered before the
   * first emit.
   */
  onViewportChange?: (params: SuperDocViewportChangePayload) => void;
  /** The format of the document (docx, pdf, html). */
  format?: string;
  /**
   * Legacy v1 ProseMirror extensions. `editorExtensions` is a v1/ProseMirror
   * concept and is IGNORED by `superdoc@2`: these objects are never loaded into
   * the v2 runtime. Passing `editorExtensions` records a clear console
   * diagnostic at construction. For v2, use {@link Config.extensions} with
   * `defineSuperDocExtension`; the two are not interchangeable.
   */
  editorExtensions?: object[];
  /**
   * v2 SuperDoc extensions, created with `defineSuperDocExtension`. `superdoc@2`
   * IS the v2 editor, so these activate unconditionally — there is no
   * `editorVersion` / `editorIntegration` selector. Each extension owns
   * isolated storage, named events, commands, anchors, and render-only
   * decorations, and mutates the document exclusively through the guarded
   * Document API (`ctx.doc.*`). This is the v2 replacement for the
   * v1/ProseMirror `editorExtensions` path; the two are not interchangeable.
   * Extension arrays are mount-time config: changing the array reference
   * requires a remount to take effect.
   */
  extensions?: SuperDocExtension[];
  /** Whether the SuperDoc is internal. */
  isInternal?: boolean;
  /** The title of the SuperDoc. */
  title?: string;
  /** The conversations to load. */
  conversations?: object[];
  /** Toggle comment visibility when `documentMode` is `viewing` (default: false). */
  comments?: ViewingVisibilityConfig;
  /**
   * Deprecated. Use `modules.trackChanges.visible` instead. Toggle
   * tracked-change visibility when `documentMode` is `viewing` (default:
   * false).
   */
  trackChanges?: ViewingVisibilityConfig;
  /** Whether the SuperDoc is locked. */
  isLocked?: boolean;
  /** The function to handle image uploads. */
  handleImageUpload?: (file: globalThis.File) => Promise<string>;
  /** The user who locked the SuperDoc. */
  lockedBy?: User;
  /** Whether to show the ruler in the editor. */
  rulers?: boolean;
  /**
   * Element or selector the ruler mounts into. Omit to render it inline above
   * the editor.
   *
   * @deprecated replaceWith=`ui.ruler.container` removeIn=v3.0 — the runtime
   * still honors it, and the canonical value wins when both are set.
   */
  rulerContainer?: string | HTMLElement;
  /** Whether to suppress default styles in docx mode. */
  suppressDefaultDocxStyles?: boolean;
  /** Provided JSON to override content with. */
  jsonOverride?: object;
  /** Whether to disable slash / right-click custom context menu. */
  disableContextMenu?: boolean;
  /** HTML content to initialize the editor with. */
  html?: string;
  /** Markdown content to initialize the editor with. */
  markdown?: string;
  /**
   * Callback invoked with unsupported HTML elements dropped during import.
   * When provided, console.warn is NOT emitted.
   */
  onUnsupportedContent?: ((items: Array<{ tagName: string; outerHTML: string; count: number }>) => void) | null;
  /**
   * When true and no onUnsupportedContent callback is provided, emits a
   * console.warn with unsupported items.
   */
  warnOnUnsupportedContent?: boolean;
  /** Whether to enable debug mode. */
  isDebug?: boolean;
  /** Document view options (OOXML ST_View compatible). */
  viewOptions?: ViewOptions;
  /**
   * Enable contained mode for fixed-height container embedding.
   *
   * SuperDoc supports two layout modes, and the host element's height
   * requirement differs between them:
   *
   * - Natural (default, `false`): the Editor grows to the document's full
   *   height and the page scrolls. The host needs no height. Setting one does
   *   not constrain the document or enable internal scrolling, because
   *   SuperDoc leaves overflow visible in this mode, though application CSS
   *   on the host can still clip what is drawn.
   * - Contained (`true`): SuperDoc propagates `height: 100%` through its DOM
   *   tree and scrolls the document internally, so multi-page documents stay
   *   inside the host. This mode requires the host to have a definite height
   *   (for example `height: 400px`); without one there is nothing for the
   *   percentage heights to resolve against.
   *
   * A toolbar mounted through `Config.toolbar` or `modules.toolbar.selector` is
   * never part of this calculation. Placed as a sibling of the host, its height
   * adds to the host's: a 400px host with a 40px toolbar occupies 440px in
   * total. Placed inside the host, it consumes part of the 400px instead.
   */
  contained?: boolean;
  /** Content Security Policy nonce for dynamically injected styles. */
  cspNonce?: string;
  /** License key for organization identification. */
  licenseKey?: string;
  /** Telemetry configuration. */
  telemetry?: SuperDocTelemetryConfig;
  /** Proofing / spellcheck configuration. */
  proofing?: ProofingConfig;
  /**
   * Font system configuration. The reviewed fallback pack ships in the optional
   * `@superdoc-dev/fonts` package: pass `superdocFonts` (bundler) or the `SuperDocFonts`
   * global from its `superdoc-fonts.min.js` browser build (CDN). To self-host, set
   * `fonts.assetBaseUrl` (e.g. `/fonts/` or a CDN URL) or `fonts.resolveAssetUrl` for
   * signed/versioned hosting. SuperDoc core ships no fonts; with none configured the
   * toolbar shows the baseline and documents render with system fonts.
   */
  fonts?: FontsConfig;
  /**
   * Optional same-origin URLs for v2's browser worker assets. Configure these
   * when the application and SuperDoc bundle are served from different origins.
   * Omitted entries keep SuperDoc's bundled worker URLs.
   */
  workerUrls?: V2WorkerUrlsConfig;
  /**
   * Budget for the document worker to start up, in milliseconds
   * (default: 30000). Measured from worker spawn, so it covers script
   * download, parsing, evaluation, and the worker's first response to
   * SuperDoc. Raise it when a large worker chunk is served
   * over a slow connection or a cold dev-server cache; lower it to fail faster.
   * Worker load errors are reported immediately and do not wait for this
   * budget. Must be a finite positive number no greater than 2147483647, the
   * platform timer ceiling above which a delay would fire immediately.
   */
  workerStartupTimeoutMs?: number;
  /**
   * Compatibility toggle retained for existing configurations. V2 always
   * uses the OOXML kernel; `viewOptions.layout` selects the mounted renderer.
   */
  useLayoutEngine?: boolean;
  // V2 branch: `editorVersion`, `v2Integration`, and `v2` are intentionally NOT
  // customer config. `superdoc@2` always runs the DOCX Engine dependency and
  // exposes a read-only `instance.editorVersion === 2` as runtime evidence
  // only. There is no runtime selection and no v1 fallback, so the historical
  // runtime-selection config holes (`editorVersion?: 1 | 2`,
  // `v2Integration?: unknown`, `v2?: unknown`) are removed from the public type
  // surface. `#init` already ignores any such input at runtime.
  /**
   * Zoom behavior: the initial zoom level and optional fit-width
   * policy. See `SuperDocZoomConfig`.
   */
  zoom?: SuperDocZoomConfig;
  /**
   * Starting measurement unit for rulers and measurement fields (Word's
   * "measurement units" preference). Defaults to `'in'` (Word's en-US default).
   * Change it at runtime with `setMeasurementUnit()`. See `SuperDocMeasurementUnit`.
   */
  measurementUnit?: SuperDocMeasurementUnit;
  /**
   * Callback fired after the editor reports `fonts-resolved`. The payload
   * contains `documentFonts` and `unsupportedFonts` arrays so hosts can fall
   * back, warn, or block printing on unsupported faces.
   *
   * LEGACY/EARLY: this fires once before fonts load and is not substitution-aware
   * (`unsupportedFonts` over-reports families that render via a bundled substitute).
   * For the authoritative, load-settled picture use {@link onFontsChanged}.
   */
  onFontsResolved?: (payload: FontsResolvedPayload) => void;
  /**
   * Painter plan P7 §1 (@experimental): fires when the paginated page count
   * changes, at layout-end — before resolve or paint, so page counters and
   * minimaps can trust the number as soon as it is knowable. The payload's
   * `generation` identifies the announcing layout pass (informational; the
   * event is keyed on page-count changes, not generations). v2 vertical
   * pagination only; semantic "web layout" surfaces never fire it.
   */
  onPageCountKnown?: (payload: { pageCount: number; generation: number }) => void;
  /**
   * Callback fired with the authoritative substitution + load-aware font report: once
   * after the load-before-measure gate settles (`source: 'initial'`), again when a face
   * arrives after a timed-out first paint (`'late-load'`). Each payload carries the full
   * per-font `resolutions`, the genuinely `missingFonts`, and a `loadSummary`. Also
   * available to pull on demand via `superdoc.fonts.getReport()`.
   */
  onFontsChanged?: (payload: FontsChangedPayload) => void;
}

/**
 * Internal augmentation of `Config` for runtime-only fields and tightened
 * invariants that must not appear on the published consumer surface. The
 * `Config` interface above is the public contract; this type adds the
 * fields SuperDoc sets/reads internally so the implementation can be
 * type-checked without leaking the fields into customer IDE autocomplete.
 *
 * The four overrides below mark fields that `Config` exposes as optional
 * but `SuperDoc.#init` always normalizes to a populated shape. Internal
 * call sites cast `this.config` to this type so they can access these
 * invariants without per-site null guards.
 *
 * Use this from internal SuperDoc callsites that need the augmented
 * shape, e.g. `(this.config as InternalConfig).socket = ...`.
 */
export interface InternalConfig extends Config {
  /**
   * Internal v2 boot gate set when a consumer supplies the removed v1
   * `modules.collaboration` API. The shell surfaces this without ever
   * attaching the supplied Y.Doc/provider.
   */
  v2CollaborationPreflightFailure?: {
    readonly code: 'collaboration-v1-config-unsupported';
    readonly message: string;
  };
  /**
   * The shared websocket instance created by SuperDoc when
   * `modules.collaboration.providerType === 'hocuspocus'`. Set automatically;
   * not part of the public Config surface.
   */
  socket?: HocuspocusProviderWebsocket;
  /**
   * Normalized to `[]` by `#init` if the consumer passes nothing or
   * `undefined`. Narrowed to `RuntimeDocument[]` because once `#init`
   * runs, each entry has been augmented with the runtime-only fields
   * (`role`, editor/renderer accessors, etc.). Consumers
   * still pass `Document[]` via the public `Config` interface; this
   * override only describes the post-init shape internal callsites see.
   */
  documents: RuntimeDocument[];
  /** Normalized to `{}` by `#init` if the consumer passes nothing or `undefined`. */
  modules: Modules;
  /**
   * Spread of `DEFAULT_USER` over consumer input by `#init`; `name`
   * always present. Widened to `AwarenessUser` because `#assignUserColor`
   * runs synchronously during init and writes `color` into this object.
   */
  user: AwarenessUser;
  /** Normalized to `{}` by `#init` if the consumer passes nothing or `undefined`. */
  layoutEngineOptions: SuperDocLayoutEngineOptions;
}

/**
 * Internal augmentation of `SuperDocLayoutEngineOptions` for unstable tuning
 * fields. The public `SuperDocLayoutEngineOptions` interface above is the
 * customer-facing contract; this type adds fields the implementation may
 * read but that are intentionally not part of the v1 stable API.
 */
export interface InternalSuperDocLayoutEngineOptions extends SuperDocLayoutEngineOptions {
  /**
   * Internal-only semantic mode tuning options. Shape may change without
   * notice; not part of the public surface.
   */
  semanticOptions?: object;
}

export type ProofingStatus = 'idle' | 'checking' | 'disabled' | 'degraded';

export interface ProofingError {
  kind: 'provider-error' | 'validation-error' | 'timeout';
  message: string;
  segmentIds?: string[];
  /**
   * Underlying error (genuinely opaque: whatever the proofing provider
   * threw). Use `unknown` per Error-cause convention; consumers narrow
   * with `instanceof` or shape checks before reading fields.
   */
  cause?: unknown;
}

export interface ProofingConfig {
  /**
   * Enables proofing. A provider is also required before SuperDoc runs checks.
   * @defaultValue false
   */
  enabled?: boolean;
  /**
   * Checks the text segments SuperDoc supplies and returns spelling, grammar,
   * or style issues.
   * @defaultValue null
   */
  provider?: ProofingProvider | null;
  /**
   * Fallback language passed to the provider when a text segment has no
   * resolved language.
   * @defaultValue null
   */
  defaultLanguage?: string | null;
  /**
   * Delay in milliseconds between an edit and the next proofing check. Values
   * at or below 0 run without a delay.
   * @defaultValue 500
   */
  debounceMs?: number;
  /** Suggestion limit passed to the provider. The provider decides how to apply it. */
  maxSuggestions?: number;
  /** Prioritize checking visible pages first. */
  visibleFirst?: boolean;
  /**
   * Shows Ignore in the proofing context menu. Ignored words remain suppressed
   * for this editor session.
   * @defaultValue true
   */
  allowIgnoreWord?: boolean;
  /**
   * Words whose proofing issues SuperDoc suppresses. Matching is
   * case-insensitive after Unicode normalization.
   * @defaultValue []
   */
  ignoredWords?: string[];
  /**
   * Maximum provider call time in milliseconds. Non-positive or non-finite
   * values use the default.
   * @defaultValue 10000
   */
  timeoutMs?: number;
  /** Maximum concurrent provider requests. */
  maxConcurrentRequests?: number;
  /** Maximum segments per provider call. */
  maxSegmentsPerBatch?: number;
  /**
   * Runs when a provider check fails or times out.
   * @param error - The failure kind, message, affected segment IDs, and cause.
   */
  onProofingError?: (error: ProofingError) => void;
  /**
   * Runs when the proofing lifecycle status changes.
   * @param status - The current proofing status.
   */
  onStatusChange?: (status: ProofingStatus) => void;
}
