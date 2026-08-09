/**
 * Consumer typecheck: the canonical `ui` option bags reject unknown keys.
 *
 * `ui.comments`, `ui.search`, and `ui.contentControls` were declared as
 * `boolean | Record<string, unknown>`, so a misspelled option compiled and
 * then did nothing: the runtime ignores the unknown key, the surface keeps its
 * default, and the symptom is "my configuration had no effect" with no
 * diagnostic anywhere (#1094).
 *
 * The valid cases matter as much as the rejected ones. A type narrow enough to
 * catch a typo is also narrow enough to reject a field the runtime honors, and
 * that failure is worse: it blocks a working configuration at compile time.
 * Each accepted field below is one the runtime reads.
 *
 * Which is why the three bags do not all close. `ui.search` and
 * `ui.contentControls` reach readers with fixed field sets, so an unknown key
 * there is always a mistake and both reject one. `ui.comments` is merged over
 * `modules.comments` and spread through the comments store, which takes
 * pass-through keys, so closing it would reject configurations that work
 * today.
 *
 * That leaves `ui.comments` unable to catch a plain typo, which is the part of
 * #1094 this cannot finish. What it does catch is the two failures that are
 * not guesses about intent: a wrong value for a named field, and the three
 * policy fields the profile strips. Accepting those would be the same defect
 * as an options bag nobody reads, so they are rejected by name.
 */
import type { CommentsConfig, ContentControlsConfig, Config, FindReplaceConfig } from 'superdoc';

// --- Accepted: every field the runtime actually reads ----------------------

// The shell merges this bag over `modules.comments` and reads both the
// responsive-layout fields and the highlight colors off the result, so all of
// them have to compile through the canonical spelling.
const _comments: Config = {
  selector: '#editor',
  ui: {
    comments: {
      displayMode: 'inline',
      compactMeasurementSelector: '#doc',
      compactBreakpointPx: 720,
      highlightHoverColor: '#eef',
      highlightColors: { internal: '#fee', activeExternal: '#eff' },
      highlightOpacity: { active: 0.4, inactive: 0.2 },
      trackChangeHighlightColors: { insertBorder: '#0a0' },
      trackChangeActiveHighlightColors: { deleteBackground: '#fdd' },
    },
  },
};

// The comments store spreads whatever it is given, so pass-through keys stay
// legal. This bag is open for that reason and cannot catch a typo; the two
// closed bags below can.
const _commentsPassthrough: Config = {
  selector: '#editor',
  ui: { comments: { useInternalExternalComments: true } },
};

// `ui.search` options reach `useFindReplace` as its config, so the surface's
// own type is the shape rather than a parallel one.
const _search: Config = {
  selector: '#editor',
  ui: { search: { findPlaceholder: 'Search', closeLabel: 'Dismiss' } },
};

// The whole `floating` bag is spread into the surface request and applied over
// the `modules.surfaces.floating` defaults, so every field in it is honored --
// including the two that were undeclared until this change and would otherwise
// have been rejected the moment `ui.search` stopped accepting any object.
const _searchFloating: Config = {
  selector: '#editor',
  ui: {
    search: {
      floating: {
        placement: 'bottom-center',
        maxWidth: 480,
        autoFocus: false,
        closeOnOutsidePointerDown: true,
      },
    },
  },
};

// `chrome` is the whole bag this surface has.
const _contentControls: Config = {
  selector: '#editor',
  ui: { contentControls: { chrome: 'none' } },
};

// The boolean sentinels stay valid: narrowing the object form must not cost
// the on/off spelling every surface accepts.
const _sentinels: Config = {
  selector: '#editor',
  ui: { comments: false, search: true, contentControls: false },
};

// --- Rejected: the typos that used to compile ------------------------------

const _typoSearch: Config = {
  selector: '#editor',
  // @ts-expect-error `totallyInvented` is not a find/replace option (#1094).
  ui: { search: { totallyInvented: true } },
};

const _typoChrome: Config = {
  selector: '#editor',
  // @ts-expect-error `chromee` is not a content-control option (#1094).
  ui: { contentControls: { chromee: 'none' } },
};

// A wrong value for a real key, which is the other half of the same mistake.
// This one is caught even in the open bag: the key is named, so its type
// applies even though unknown keys fall through to the index signature.
const _badDisplayMode: Config = {
  selector: '#editor',
  // @ts-expect-error 'sidebarr' is not one of the three display modes.
  ui: { comments: { displayMode: 'sidebarr' } },
};

// Policy is not presentation. `normalizeUiConfig` strips these three before
// anything reads them, so accepting them here would advertise a setting that
// is silently discarded — the same shape of bug as an option bag nobody reads.
// They are rejected even though the bag is otherwise open.
const _policyReadOnly: Config = {
  selector: '#editor',
  // @ts-expect-error `readOnly` is policy; set it on `interaction.comments`.
  ui: { comments: { readOnly: true } },
};

const _policyAllowResolve: Config = {
  selector: '#editor',
  // @ts-expect-error `allowResolve` is policy; set it on `interaction.comments`.
  ui: { comments: { allowResolve: false } },
};

const _policyResolver: Config = {
  selector: '#editor',
  // @ts-expect-error `permissionResolver` is collaboration wiring; it has no
  // `ui` spelling and is read off `modules.comments` or top-level `Config`.
  ui: { comments: { permissionResolver: () => true } },
};

// And the legacy block still takes all three, because that is where they have
// always lived. For `permissionResolver` it is not merely still accepted: it
// is one of only two spellings, since `pickResolver` takes the first of
// `modules.comments.permissionResolver` and top-level `Config` and
// `interaction.comments` carries only `readOnly` and `allowResolve`.
const _legacyPolicy: Config = {
  selector: '#editor',
  modules: { comments: { readOnly: true, allowResolve: false, permissionResolver: () => true } },
};

// The canonical home for the two fields that have one.
const _interactionPolicy: Config = {
  selector: '#editor',
  interaction: { comments: { readOnly: true, allowResolve: false } },
};

// The other resolver spelling, which `pickResolver` falls back to when the
// comments-scoped one is absent.
const _topLevelResolver: Config = {
  selector: '#editor',
  permissionResolver: () => true,
};

const _badChrome: Config = {
  selector: '#editor',
  // @ts-expect-error 'outline' is not a chrome style the painter accepts.
  ui: { contentControls: { chrome: 'outline' } },
};

// The interfaces are reachable by name, so an application can annotate the
// config it builds before handing it over.
const _namedComments: CommentsConfig = { displayMode: 'auto' };
const _namedChrome: ContentControlsConfig = { chrome: 'default' };
const _namedSearch: FindReplaceConfig = { findPlaceholder: 'Find' };

export {
  _comments,
  _commentsPassthrough,
  _search,
  _searchFloating,
  _contentControls,
  _sentinels,
  _typoSearch,
  _typoChrome,
  _badDisplayMode,
  _badChrome,
  _policyReadOnly,
  _policyAllowResolve,
  _policyResolver,
  _legacyPolicy,
  _interactionPolicy,
  _topLevelResolver,
  _namedComments,
  _namedChrome,
  _namedSearch,
};
