import { DecorationSet } from 'prosemirror-view';
import type { EditorState, Plugin, PluginKey, Transaction } from 'prosemirror-state';
import type { Node as ProseMirrorNode } from 'prosemirror-model';

import { TrackChangesBasePluginKey } from '@extensions/track-changes/plugins/index.js';
import { CommentsPluginKey } from '@extensions/comment/comments-plugin.js';
import { customSearchHighlightsKey } from '@extensions/search/search.js';
import { AiPluginKey } from '@extensions/ai/ai-plugin.js';
import { CustomSelectionPluginKey } from '@extensions/custom-selection/custom-selection.js';
import { LinkedStylesPluginKey } from '@extensions/linked-styles/plugin.js';
import { NodeResizerKey } from '@extensions/noderesizer/noderesizer.js';

import type { DomPositionIndex } from './DomPositionIndex.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Tracks what the bridge has applied to a single DOM element.
 * Used for diffing on the next sync pass so stale state is removed cleanly.
 *
 * Prior-value maps record what existed on the element BEFORE the bridge touched
 * it. On removal, the bridge restores these values instead of blindly deleting,
 * so painter-owned properties are never clobbered.
 */
interface AppliedState {
  classes: Set<string>;
  dataAttrs: Map<string, string>;
  /** Individual CSS properties applied by the bridge (property name → value). */
  styleProps: Map<string, string>;

  /** Classes that existed on the element before the bridge added them. */
  priorClasses: Set<string>;
  /** Data-attr values that existed before the bridge set them (null = attr did not exist). */
  priorDataAttrs: Map<string, string | null>;
  /** Style property values before the bridge set them (empty string = prop did not exist). */
  priorStyleProps: Map<string, string>;
}

/**
 * Desired decoration payload for a single DOM element, accumulated across all
 * eligible plugins before being committed to the DOM.
 */
interface DesiredState {
  classes: Set<string>;
  dataAttrs: Map<string, string>;
  /** Individual CSS properties desired by decorations (property name → value). */
  styleProps: Map<string, string>;
}

// ---------------------------------------------------------------------------
// Internal plugin exclusion
// ---------------------------------------------------------------------------

/**
 * Exported plugin keys whose decorations are rendered by the painter or other
 * internal systems. Matched by reference identity (`plugin.spec.key === ref`).
 */
const EXCLUDED_PLUGIN_KEY_REF_LIST: PluginKey[] = [
  TrackChangesBasePluginKey,
  CommentsPluginKey,
  customSearchHighlightsKey,
  AiPluginKey,
  CustomSelectionPluginKey,
  LinkedStylesPluginKey,
  NodeResizerKey,
];

const EXCLUDED_PLUGIN_KEY_REFS: ReadonlySet<PluginKey> = new Set([...EXCLUDED_PLUGIN_KEY_REF_LIST]);

/**
 * String prefixes for internal plugins whose keys are NOT exported.
 * ProseMirror sets `plugin.key` to `'<name>$<counter>'`, so we match the
 * prefix before the `$` separator.
 *
 * | Prefix            | Source file                                    | Why excluded                  |
 * |-------------------|------------------------------------------------|-------------------------------|
 * | placeholder       | extensions/placeholder/placeholder.js          | Editor chrome (empty-state)   |
 * | tabPlugin         | extensions/tab/tab.js                          | Layout-level tab sizing       |
 * | dropcapPlugin     | extensions/paragraph/dropcapPlugin.js          | Layout-level margin adjust    |
 * | ImagePosition     | extensions/image/imageHelpers/imagePositionPlugin.js | Layout-level image positioning |
 * | ImageRegistration | extensions/image/imageHelpers/imageRegistrationPlugin.js | Upload placeholder chrome |
 * | search            | extensions/search/prosemirror-search-patched.js | Painter handles search highlights |
 * | yjs-cursor        | y-prosemirror collaboration cursor plugin       | Remote cursor UI layer          |
 */
const EXCLUDED_PLUGIN_KEY_PREFIXES: readonly string[] = [
  'placeholder',
  'tabPlugin',
  'dropcapPlugin',
  'ImagePosition',
  'ImageRegistration',
  'search',
  'yjs-cursor',
];

/** Block and leaf separators used when storing/finding text (must match doc.textBetween usage). */
const TEXT_RANGE_BLOCK_SEP = '\n';
const TEXT_RANGE_LEAF_SEP = '\n';

/** Stored previous decoration range; optional `text` is used to resolve the same span after doc changes. */
interface PreviousRange {
  from: number;
  to: number;
  classes: string[];
  style: string | null;
  dataAttrs: Record<string, string>;
  /** Text at this range when stored; used to find the same span when positions change. */
  text?: string;
}

/** Transaction mapping shape needed by the bridge for range remapping. */
type PositionMapping = { map: (pos: number, assoc?: number) => number };

/**
 * Maps a character offset in the document's text (with block/leaf separators) to a document position.
 * Uses binary search so that doc.textBetween(0, result, blockSep, leafSep).length === charOffset.
 */
function charOffsetToPosition(doc: ProseMirrorNode, charOffset: number, blockSep: string, leafSep: string): number {
  const docSize = doc.content.size;
  if (charOffset <= 0) return 0;
  const fullLength = doc.textBetween(0, docSize, blockSep, leafSep).length;
  if (charOffset >= fullLength) return docSize;
  let low = 0;
  let high = docSize;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const len = doc.textBetween(0, mid, blockSep, leafSep).length;
    if (len < charOffset) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

/**
 * Finds a range in the document that contains the given text (same block/leaf separators as storage).
 * If multiple matches exist, returns the one whose start is closest to hintFrom.
 */
function findRangeByText(doc: ProseMirrorNode, text: string, hintFrom?: number): { from: number; to: number } | null {
  if (!text) return null;
  const docSize = doc.content.size;
  const full = doc.textBetween(0, docSize, TEXT_RANGE_BLOCK_SEP, TEXT_RANGE_LEAF_SEP);
  const matches: number[] = [];
  let i = 0;
  for (;;) {
    const idx = full.indexOf(text, i);
    if (idx === -1) break;
    matches.push(idx);
    i = idx + 1;
  }
  if (matches.length === 0) return null;

  const toPos = (charOffset: number) =>
    charOffsetToPosition(doc, charOffset, TEXT_RANGE_BLOCK_SEP, TEXT_RANGE_LEAF_SEP);
  const initial = matches[0];
  let charOffsetFrom: number;
  if (hintFrom == null) {
    charOffsetFrom = initial;
  } else {
    const closest = matches.reduce(
      (acc, idx) => {
        const pos = toPos(idx);
        const isCloser = Math.abs(pos - hintFrom) < Math.abs(acc.bestPos - hintFrom);
        return isCloser ? { best: idx, bestPos: pos } : acc;
      },
      { best: initial, bestPos: toPos(initial) },
    );
    charOffsetFrom = closest.best;
  }
  const from = toPos(charOffsetFrom);
  const to = toPos(charOffsetFrom + text.length);
  return from < to ? { from, to } : null;
}

/**
 * Resolves a previous range by its stored text and returns a valid range.
 * Returns null when:
 * - text lookup fails
 * - resolved coordinates are invalid/out of bounds
 *
 * Same-position (no movement) is allowed so that mark-only changes (e.g. applying
 * bold inside a highlighted span) still get the range restored when the plugin
 * temporarily reports empty. Explicit clear is handled via restoreEmptyDecorations: false.
 */
function resolveMovedRangeFromPrevious(
  doc: ProseMirrorNode,
  docSize: number,
  prev: PreviousRange,
): { from: number; to: number } | null {
  if (!prev.text) return null;
  const resolved = findRangeByText(doc, prev.text, prev.from);
  if (!resolved) return null;
  if (resolved.from < 0 || resolved.to <= resolved.from || resolved.to > docSize) return null;
  return resolved;
}

/**
 * Resolves each previous range by text and returns the list of ranges with updated from/to.
 * Shared by collectDecorationRanges and #collectDesiredState so restore logic lives in one place.
 */
function restoreRangesFromPrevious(
  doc: ProseMirrorNode,
  docSize: number,
  previousRanges: PreviousRange[],
): PreviousRange[] {
  const out: PreviousRange[] = [];
  for (const prev of previousRanges) {
    const resolved = resolveMovedRangeFromPrevious(doc, docSize, prev);
    if (!resolved) continue;
    out.push({ ...prev, from: resolved.from, to: resolved.to });
  }
  return out;
}

/** Returns the union span of a list of ranges (min from, max to). */
function rangeUnion(ranges: Array<{ from: number; to: number }>): { from: number; to: number } | null {
  if (ranges.length === 0) return null;
  let from = ranges[0].from;
  let to = ranges[0].to;
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].from < from) from = ranges[i].from;
    if (ranges[i].to > to) to = ranges[i].to;
  }
  return { from, to };
}

/**
 * When the plugin returns partial ranges (e.g. after applying a mark, mapping can collapse
 * decoration ranges), prefer the full span restored by text so the highlight does not
 * partially vanish. Returns restored ranges when they form a proper superset of current.
 *
 * Why the range shrinks (mapping, not on purpose):
 * - On a doc-changing transaction (e.g. applying bold), the plugin has no meta, so it
 *   does pluginState.map(tr.mapping, tr.doc). The mapping is produced by the document
 *   change; calculateInlineRunPropertiesPlugin also appends a transaction that splits
 *   runs when inline properties differ, so the combined mapping can shift/collapse
 *   positions. DecorationSet.map() then yields a smaller or split set — a side effect
 *   of mapping, not an intentional narrowing (which would come from a meta-only
 *   transaction like setFocus with a smaller range).
 */
function preferFullRestoredWhenPartial(
  current: PreviousRange[],
  previousRanges: PreviousRange[] | undefined,
  doc: ProseMirrorNode,
  docSize: number,
): PreviousRange[] {
  if (current.length === 0 || !previousRanges?.length) return current;
  const restored = restoreRangesFromPrevious(doc, docSize, previousRanges);
  if (restored.length === 0) return current;

  const currentSpan = rangeUnion(current);
  const restoredSpan = rangeUnion(restored);
  if (!currentSpan || !restoredSpan) return current;
  // Prefer restored only when it strictly contains current (plugin returned partial).
  const contained =
    currentSpan.from >= restoredSpan.from &&
    currentSpan.to <= restoredSpan.to &&
    restoredSpan.to - restoredSpan.from > currentSpan.to - currentSpan.from;
  return contained ? restored : current;
}

// ---------------------------------------------------------------------------
// DecorationBridge
// ---------------------------------------------------------------------------

/**
 * Bridges ProseMirror plugin decorations onto DomPainter-rendered elements.
 *
 * The layout engine renders into its own DOM tree, so PM decorations (which
 * target the hidden contenteditable) are invisible to the user. This bridge
 * reads inline decoration `class` and `data-*` attributes from eligible
 * external plugins and mirrors them onto the painted elements, with a full
 * add/update/remove reconciliation lifecycle.
 *
 * ## Ownership boundary
 * The bridge tracks exactly which classes and data-attributes it has applied
 * via a WeakMap keyed by DOM element. It never touches classes or attributes
 * owned by the painter or other systems.
 *
 * ## Merge semantics
 * - **Classes**: union of all classes from all overlapping decorations.
 * - **`data-*` attributes**: later plugin in `state.plugins` order wins for
 *   the same key on the same element.
 * - **`style`**: parsed into individual CSS properties and applied via
 *   `el.style.setProperty()` so painter-owned properties are never clobbered.
 *   Later plugin wins per CSS property name.
 */
export class DecorationBridge {
  /** Tracks bridge-owned state per painted DOM element. */
  #applied = new WeakMap<HTMLElement, AppliedState>();

  /** Cached list of plugins eligible for bridging. */
  #eligiblePlugins: Plugin[] = [];

  /** Identity snapshot of `state.plugins` when `#eligiblePlugins` was last built. */
  #pluginListSnapshot: readonly Plugin[] = [];

  /** Last-seen DecorationSet per plugin, for cheap identity-based skip. */
  #prevDecorationSets = new Map<Plugin, DecorationSet>();

  /** True if the last sync had at least one eligible plugin. Used to detect the → 0 transition. */
  #hadEligiblePlugins = false;

  /**
   * Previous decoration ranges per plugin, used for fallback when plugins
   * incorrectly clear decorations due to bad transaction mappings.
   *
   * SuperDoc's `calculateInlineRunPropertiesPlugin` splits runs when marks are
   * applied, producing transaction mappings that cause `DecorationSet.map()` to
   * collapse or invalidate decoration ranges. This cache allows the bridge to
   * restore the previous range when the plugin incorrectly clears it but the
   * original positions are still valid in the document.
   */
  #previousRanges = new Map<Plugin, PreviousRange[]>();

  /**
   * When true, the next collectDecorationRanges() must not restore from
   * previous ranges (e.g. after clearFocus). Set by sync(..., { restoreEmptyDecorations: false }),
   * consumed and cleared by collectDecorationRanges(). Ensures layout (which calls
   * collectDecorationRanges before sync) respects an explicit clear.
   */
  #skipRestoreEmptyOnNextCollect = false;

  /**
   * Tracks whether the most recently observed transaction was doc-changing.
   * Used to distinguish "mapping-induced partial ranges" (doc changes) from
   * intentional range changes (meta-only, e.g. setFocus).
   */
  #lastTransactionWasDocChange = false;

  /** Monotonic token incremented per doc-changing transaction. */
  #lastDocChangeToken = 0;

  /** Mapping per doc-change token (supports composing multiple transactions before rerender). */
  #docChangeMappingsByToken = new Map<number, PositionMapping>();

  /**
   * Per-plugin token indicating which doc-change token `#previousRanges` currently
   * corresponds to.
   */
  #previousRangesTokenByPlugin = new Map<Plugin, number>();

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Runs a full reconciliation pass: reads decoration state from eligible PM
   * plugins, maps them to painted DOM via the position index, and diffs
   * against previously applied state.
   *
   * @param options.restoreEmptyDecorations - When false, do not restore from
   *   previous ranges when a plugin returns empty (e.g. clearFocus); clears
   *   previousRanges so highlight is removed from DOM.
   * @returns `true` if any DOM mutations were made, `false` if skipped.
   */
  sync(state: EditorState, domIndex: DomPositionIndex, options?: { restoreEmptyDecorations?: boolean }): boolean {
    this.#refreshEligiblePlugins(state);

    const docSize = state.doc.content.size;
    const restoreEmpty = options?.restoreEmptyDecorations !== false;
    if (!restoreEmpty) this.#skipRestoreEmptyOnNextCollect = true;
    const desired =
      this.#eligiblePlugins.length > 0
        ? this.#collectDesiredState(state, domIndex, docSize, restoreEmpty)
        : new Map<HTMLElement, DesiredState>();

    this.#hadEligiblePlugins = this.#eligiblePlugins.length > 0;
    return this.#reconcile(desired, domIndex, docSize);
  }

  /**
   * Records transaction context for stale-range remapping. Call this from the
   * editor transaction handler so bridge sync/collect can remap unchanged
   * decoration sets when plugins don't update their ranges on doc changes.
   */
  recordTransaction(transaction?: Transaction): void {
    this.#lastTransactionWasDocChange = Boolean(transaction?.docChanged);
    if (!transaction?.docChanged) return;
    this.#lastDocChangeToken += 1;
    this.#docChangeMappingsByToken.set(this.#lastDocChangeToken, transaction.mapping as unknown as PositionMapping);
  }

  /**
   * Checks whether any eligible plugin's DecorationSet has changed since the
   * last sync. Use this as a cheap gate before calling `sync()`.
   *
   * @returns `true` if at least one DecorationSet reference changed.
   */
  hasChanges(state: EditorState): boolean {
    this.#refreshEligiblePlugins(state);

    // Transition from some plugins → zero: stale bridge state needs cleanup.
    if (this.#eligiblePlugins.length === 0) {
      return this.#hadEligiblePlugins;
    }

    for (const plugin of this.#eligiblePlugins) {
      const currentSet = this.#getDecorationSet(plugin, state);
      if (currentSet !== this.#prevDecorationSets.get(plugin)) return true;
    }
    return false;
  }

  /**
   * Collects all decoration ranges from eligible plugins for overlay rendering.
   * Returns an array of {from, to, classes, style} objects representing each
   * inline decoration that should be visually rendered.
   *
   * This is used by PresentationEditor to render character-accurate highlight
   * overlays using selectionToRects, bypassing the element-level granularity
   * limitation of the DOM-based sync approach.
   *
   * **Fallback behavior**: When a plugin returns empty/collapsed decoration ranges
   * but previously had valid ranges, and the previous positions are still within
   * document bounds, this method restores the previous ranges. This handles cases
   * where `calculateInlineRunPropertiesPlugin` splits runs (when applying marks)
   * and produces transaction mappings that incorrectly invalidate decorations.
   */
  collectDecorationRanges(state: EditorState): Array<{
    from: number;
    to: number;
    classes: string[];
    style: string | null;
    dataAttrs: Record<string, string>;
  }> {
    this.#refreshEligiblePlugins(state);

    const ranges: Array<{
      from: number;
      to: number;
      classes: string[];
      style: string | null;
      dataAttrs: Record<string, string>;
    }> = [];
    const docSize = state.doc.content.size;

    for (const plugin of this.#eligiblePlugins) {
      const { ranges: pluginRanges, decorationSet } = this.#collectPluginRanges(plugin, state, docSize);

      const previousPluginRanges = this.#previousRanges.get(plugin);
      const mayRestoreEmpty =
        !this.#skipRestoreEmptyOnNextCollect && previousPluginRanges && previousPluginRanges.length > 0;

      const { effectiveRanges, rangesToStore } = this.#resolveEffectiveRanges(
        pluginRanges,
        previousPluginRanges,
        state.doc,
        docSize,
        mayRestoreEmpty,
        this.#lastTransactionWasDocChange,
      );

      this.#setPreviousRanges(plugin, rangesToStore.length > 0 ? [...rangesToStore] : []);
      this.#prevDecorationSets.set(plugin, decorationSet);
      ranges.push(...effectiveRanges);
    }

    this.#clearSkipRestoreFlagIfSet();
    return ranges;
  }

  /** Called at end of collectDecorationRanges so the "skip restore" flag is cleared once per call. */
  #clearSkipRestoreFlagIfSet(): void {
    if (this.#skipRestoreEmptyOnNextCollect) this.#skipRestoreEmptyOnNextCollect = false;
  }

  /**
   * Removes all bridge-owned classes and data-attributes from the DOM.
   * Called during teardown.
   */
  destroy(): void {
    this.#eligiblePlugins = [];
    this.#pluginListSnapshot = [];
    this.#prevDecorationSets.clear();
    this.#previousRanges.clear();
    this.#previousRangesTokenByPlugin.clear();
    this.#hadEligiblePlugins = false;
    this.#skipRestoreEmptyOnNextCollect = false;
    this.#lastTransactionWasDocChange = false;
    this.#lastDocChangeToken = 0;
    this.#docChangeMappingsByToken.clear();
    // WeakMap entries are garbage collected with their elements.
  }

  // -------------------------------------------------------------------------
  // Plugin filtering
  // -------------------------------------------------------------------------

  /**
   * Rebuilds the eligible plugin list when the plugin array has changed.
   * Uses a two-tier strategy:
   * 1. Exclude by exported PluginKey reference (7 known internal keys).
   * 2. Exclude by plugin.key string prefix (5 unexported internal keys).
   */
  #refreshEligiblePlugins(state: EditorState): void {
    if (state.plugins === this.#pluginListSnapshot) return;

    this.#pluginListSnapshot = state.plugins;
    this.#eligiblePlugins = state.plugins.filter((plugin) => {
      if (!plugin.props.decorations) return false;
      if (this.#isExcludedByKeyRef(plugin)) return false;
      if (this.#isExcludedByKeyPrefix(plugin)) return false;
      return true;
    });

    // Prune stale entries from the identity map.
    const eligibleSet = new Set(this.#eligiblePlugins);
    for (const key of this.#prevDecorationSets.keys()) {
      if (!eligibleSet.has(key)) this.#prevDecorationSets.delete(key);
    }
    for (const key of this.#previousRanges.keys()) {
      if (!eligibleSet.has(key)) this.#previousRanges.delete(key);
    }
    for (const key of this.#previousRangesTokenByPlugin.keys()) {
      if (!eligibleSet.has(key)) this.#previousRangesTokenByPlugin.delete(key);
    }
    this.#pruneDocChangeMappings();
  }

  /** Checks if a plugin's key matches one of the exported internal PluginKey references. */
  #isExcludedByKeyRef(plugin: Plugin): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const specKey = (plugin as any).spec?.key;
    return specKey != null && EXCLUDED_PLUGIN_KEY_REFS.has(specKey);
  }

  /** Checks if a plugin's key string starts with a known internal prefix. */
  #isExcludedByKeyPrefix(plugin: Plugin): boolean {
    // ProseMirror formats plugin.key as '<name>$<counter>'.
    const keyString: string = (plugin as unknown as Record<string, string>).key ?? '';
    return EXCLUDED_PLUGIN_KEY_PREFIXES.some((prefix) => keyString === prefix || keyString.startsWith(`${prefix}$`));
  }

  // -------------------------------------------------------------------------
  // Decoration collection
  // -------------------------------------------------------------------------

  /**
   * Reads inline decorations from all eligible plugins and accumulates
   * desired class/data-attr state per painted DOM element.
   *
   * Returns a Map of DOM element → desired state. Elements that are in the
   * position index but have no decorations are NOT included (they'll be
   * handled as removals in reconcile).
   */
  #collectDesiredState(
    state: EditorState,
    domIndex: DomPositionIndex,
    docSize: number,
    restoreEmptyDecorations: boolean,
  ): Map<HTMLElement, DesiredState> {
    const desired = new Map<HTMLElement, DesiredState>();

    for (const plugin of this.#eligiblePlugins) {
      const { ranges: pluginRanges, decorationSet } = this.#collectPluginRanges(plugin, state, docSize);

      const previousPluginRanges = this.#previousRanges.get(plugin);
      const { effectiveRanges, rangesToStore } = this.#resolveEffectiveRanges(
        pluginRanges,
        previousPluginRanges,
        state.doc,
        docSize,
        restoreEmptyDecorations,
        this.#lastTransactionWasDocChange,
      );

      if (pluginRanges.length > 0 || effectiveRanges.length > 0) {
        this.#applyRangesToDesired(desired, domIndex, effectiveRanges);
        this.#setPreviousRanges(plugin, rangesToStore.length > 0 ? [...rangesToStore] : []);
        this.#prevDecorationSets.set(plugin, decorationSet);
        continue;
      }
      if (!restoreEmptyDecorations) {
        this.#setPreviousRanges(plugin, []);
        this.#prevDecorationSets.set(plugin, decorationSet);
        continue;
      }
      this.#setPreviousRanges(plugin, []);
      this.#prevDecorationSets.set(plugin, decorationSet);
    }

    return desired;
  }

  /** Applies cached PreviousRange entries to the desired-state map via the DOM position index. */
  #applyRangesToDesired(
    desired: Map<HTMLElement, DesiredState>,
    domIndex: DomPositionIndex,
    ranges: PreviousRange[],
  ): void {
    for (const range of ranges) {
      const entries = domIndex.findEntriesInRange(range.from, range.to);
      for (const entry of entries) {
        const d = this.#getOrCreateDesired(desired, entry.el);
        for (const cls of range.classes) d.classes.add(cls);
        for (const [key, value] of Object.entries(range.dataAttrs)) d.dataAttrs.set(key, value);
        if (range.style) {
          for (const [prop, value] of DecorationBridge.#parseStyleString(range.style)) {
            d.styleProps.set(prop, value);
          }
        }
      }
    }
  }

  /**
   * Collects current decoration ranges for one plugin: either remapped from previous
   * (when DecorationSet reference unchanged) or decoded from the plugin's DecorationSet.
   * Shared by collectDecorationRanges and #collectDesiredState.
   */
  #collectPluginRanges(
    plugin: Plugin,
    state: EditorState,
    docSize: number,
  ): { ranges: PreviousRange[]; decorationSet: DecorationSet } {
    const decorationSet = this.#getDecorationSet(plugin, state);
    const prevDecorationSet = this.#prevDecorationSets.get(plugin);
    const remapped = this.#remapUnchangedPluginRangesIfNeeded(
      plugin,
      decorationSet,
      prevDecorationSet,
      state.doc,
      docSize,
    );
    if (remapped) {
      return { ranges: remapped, decorationSet };
    }

    const ranges: PreviousRange[] = [];
    if (decorationSet !== DecorationSet.empty) {
      const decorations = decorationSet.find(0, docSize);
      for (const decoration of decorations) {
        if (!this.#isInlineDecoration(decoration)) continue;

        const attrs = this.#extractSafeAttrs(decoration);
        if (attrs.classes.length === 0 && attrs.dataEntries.length === 0 && attrs.styleEntries.length === 0) continue;
        if (decoration.from >= decoration.to) continue;

        const dataAttrs: Record<string, string> = {};
        for (const [key, value] of attrs.dataEntries) dataAttrs[key] = value;

        const style =
          attrs.styleEntries.length > 0 ? attrs.styleEntries.map(([prop, val]) => `${prop}: ${val}`).join('; ') : null;
        const rangeText =
          typeof state.doc.textBetween === 'function'
            ? state.doc.textBetween(decoration.from, decoration.to, TEXT_RANGE_BLOCK_SEP, TEXT_RANGE_LEAF_SEP)
            : undefined;

        ranges.push({
          from: decoration.from,
          to: decoration.to,
          classes: attrs.classes,
          style,
          dataAttrs,
          ...(rangeText ? { text: rangeText } : {}),
        });
      }
    }
    return { ranges, decorationSet };
  }

  /**
   * Resolves effective ranges (restore empty + prefer full when partial) and what to store
   * as previous. Shared by collectDecorationRanges and #collectDesiredState.
   */
  #resolveEffectiveRanges(
    pluginRanges: PreviousRange[],
    previousPluginRanges: PreviousRange[] | undefined,
    doc: ProseMirrorNode,
    docSize: number,
    restoreEmpty: boolean,
    lastTransactionWasDocChange: boolean,
  ): { effectiveRanges: PreviousRange[]; rangesToStore: PreviousRange[] } {
    let current = pluginRanges;
    if (current.length === 0 && restoreEmpty && previousPluginRanges?.length) {
      current = restoreRangesFromPrevious(doc, docSize, previousPluginRanges);
    }

    const effectiveRanges =
      lastTransactionWasDocChange && restoreEmpty && previousPluginRanges?.length
        ? preferFullRestoredWhenPartial(current, previousPluginRanges, doc, docSize)
        : current;

    const storeExpandedOnDocChange = lastTransactionWasDocChange && effectiveRanges !== current;
    const rangesToStore =
      pluginRanges.length > 0 ? (storeExpandedOnDocChange ? effectiveRanges : pluginRanges) : effectiveRanges;

    return { effectiveRanges, rangesToStore };
  }

  /** Stores previous ranges and tags them with the current doc-change token. */
  #setPreviousRanges(plugin: Plugin, ranges: PreviousRange[]): void {
    this.#previousRanges.set(plugin, ranges);
    this.#previousRangesTokenByPlugin.set(plugin, this.#lastDocChangeToken);
    this.#pruneDocChangeMappings();
  }

  /**
   * Returns transaction mappings between `fromToken` (exclusive) and current
   * `#lastDocChangeToken` (inclusive). Empty when no complete chain exists.
   */
  #getMappingsSinceToken(fromToken: number): PositionMapping[] {
    if (fromToken >= this.#lastDocChangeToken) return [];

    const mappings: PositionMapping[] = [];
    for (let token = fromToken + 1; token <= this.#lastDocChangeToken; token += 1) {
      const mapping = this.#docChangeMappingsByToken.get(token);
      if (!mapping) return [];
      mappings.push(mapping);
    }
    return mappings;
  }

  /** Maps a position through a sequence of transaction mappings. */
  #mapThroughMappings(pos: number, assoc: -1 | 1, mappings: PositionMapping[]): number {
    let mapped = pos;
    for (const mapping of mappings) mapped = mapping.map(mapped, assoc);
    return mapped;
  }

  /**
   * Prunes old mapping history that is no longer needed by any tracked plugin.
   * Keeps only mappings newer than the minimum plugin token.
   */
  #pruneDocChangeMappings(): void {
    if (this.#docChangeMappingsByToken.size === 0) return;

    let minTrackedToken = this.#lastDocChangeToken;
    for (const token of this.#previousRangesTokenByPlugin.values()) {
      if (token < minTrackedToken) minTrackedToken = token;
    }

    for (const token of this.#docChangeMappingsByToken.keys()) {
      if (token <= minTrackedToken) this.#docChangeMappingsByToken.delete(token);
    }
  }

  /**
   * When a plugin returns the exact same DecorationSet reference after a doc change,
   * remap cached previous ranges with transaction mapping. This supports external
   * plugins that return static DecorationSet instances instead of mapping ranges.
   * Callers are responsible for setting #previousRanges (via #resolveEffectiveRanges
   * and #setPreviousRanges); this method only returns the remapped ranges.
   */
  #remapUnchangedPluginRangesIfNeeded(
    plugin: Plugin,
    currentSet: DecorationSet,
    previousSet: DecorationSet | undefined,
    doc: ProseMirrorNode,
    docSize: number,
  ): PreviousRange[] | null {
    if (!previousSet || previousSet !== currentSet) return null;

    const previousRanges = this.#previousRanges.get(plugin);
    if (!previousRanges?.length) return null;
    const rangesToken = this.#previousRangesTokenByPlugin.get(plugin) ?? -1;

    // Ranges are already current for this doc-change token.
    if (rangesToken === this.#lastDocChangeToken) return previousRanges;
    const mappings = this.#getMappingsSinceToken(rangesToken);
    if (mappings.length === 0) return null;

    const remapped: PreviousRange[] = [];
    for (const prev of previousRanges) {
      // Prefer text-based relocation first (handles run-splitting mappings from mark ops).
      if (prev.text) {
        const resolved = findRangeByText(doc, prev.text, prev.from);
        if (resolved && resolved.from >= 0 && resolved.to > resolved.from && resolved.to <= docSize) {
          remapped.push({
            from: resolved.from,
            to: resolved.to,
            classes: prev.classes,
            style: prev.style,
            dataAttrs: prev.dataAttrs,
            text: prev.text,
          });
          continue;
        }
      }

      const from = this.#mapThroughMappings(prev.from, -1, mappings);
      const to = this.#mapThroughMappings(prev.to, 1, mappings);
      if (from < 0 || to <= from || to > docSize) continue;
      remapped.push({
        from,
        to,
        classes: prev.classes,
        style: prev.style,
        dataAttrs: prev.dataAttrs,
        // Keep the original anchor text so subsequent transactions can continue
        // mapping even when replacement text temporarily matches a short prefix.
        text: prev.text,
      });
    }

    if (remapped.length === 0) return null;
    return remapped;
  }

  /** Safely retrieves the DecorationSet from a plugin, returning empty on failure. */
  #getDecorationSet(plugin: Plugin, state: EditorState): DecorationSet {
    try {
      const result = plugin.props.decorations?.call(plugin, state);
      return result instanceof DecorationSet ? result : DecorationSet.empty;
    } catch {
      return DecorationSet.empty;
    }
  }

  /** Checks if a decoration is an inline decoration (not widget or node). */
  #isInlineDecoration(decoration: { from: number; to: number }): boolean {
    // @ts-expect-error - ProseMirror's internal `inline` flag is not typed.
    return decoration.inline === true;
  }

  /**
   * Extracts bridge-safe attributes from a decoration:
   * - `class` is split into individual class names.
   * - `data-*` attributes are preserved.
   * - `style` is parsed into individual CSS properties (property-level, not raw string).
   * - All other attributes (id, onclick, href, etc.) are ignored for security.
   */
  #extractSafeAttrs(decoration: { from: number; to: number }): {
    classes: string[];
    dataEntries: [string, string][];
    styleEntries: [string, string][];
  } {
    // @ts-expect-error - ProseMirror's `type.attrs` is not in the public types.
    const raw: Record<string, unknown> = decoration.type?.attrs ?? {};

    const classes = typeof raw.class === 'string' ? raw.class.split(/\s+/).filter((c: string) => c.length > 0) : [];

    const dataEntries: [string, string][] = [];
    for (const [key, value] of Object.entries(raw)) {
      if (key === 'class' || key === 'style') continue;
      if (!key.startsWith('data-')) continue;
      if (typeof value !== 'string') continue;
      dataEntries.push([key, value]);
    }

    const styleEntries: [string, string][] =
      typeof raw.style === 'string' ? DecorationBridge.#parseStyleString(raw.style) : [];

    return { classes, dataEntries, styleEntries };
  }

  /**
   * Parses a CSS style string into individual [property, value] pairs.
   * Uses a temporary element so the browser handles shorthand expansion,
   * vendor prefixes, and validation.
   */
  static #parseStyleString(cssText: string): [string, string][] {
    if (!cssText.trim()) return [];

    const temp = document.createElement('span');
    temp.style.cssText = cssText;

    const entries: [string, string][] = [];
    for (let i = 0; i < temp.style.length; i++) {
      const prop = temp.style.item(i);
      const value = temp.style.getPropertyValue(prop);
      if (prop && value) entries.push([prop, value]);
    }
    return entries;
  }

  /** Gets or creates the desired state for an element. */
  #getOrCreateDesired(map: Map<HTMLElement, DesiredState>, el: HTMLElement): DesiredState {
    let state = map.get(el);
    if (!state) {
      state = { classes: new Set(), dataAttrs: new Map(), styleProps: new Map() };
      map.set(el, state);
    }
    return state;
  }

  // -------------------------------------------------------------------------
  // Reconciliation
  // -------------------------------------------------------------------------

  /**
   * Diffs desired state against previously applied state and updates the DOM.
   *
   * Three cases per element:
   * 1. **New element** (in desired, not in applied): apply all desired state.
   * 2. **Updated element** (in both): add new, remove stale.
   * 3. **Removed element** (in applied, not in desired): remove all bridge state.
   *
   * Case 3 is handled by scanning the position index for elements that have
   * applied state but no desired state.
   */
  #reconcile(desired: Map<HTMLElement, DesiredState>, domIndex: DomPositionIndex, docSize: number): boolean {
    let mutated = false;

    // Apply or update: iterate elements that should have decorations.
    for (const [el, desiredState] of desired) {
      const applied = this.#applied.get(el);

      if (!applied) {
        // Case 1: fresh element, no prior state.
        this.#applyFresh(el, desiredState);
        mutated = true;
      } else {
        // Case 2: element has prior state — diff and update.
        if (this.#applyDiff(el, applied, desiredState)) mutated = true;
      }
    }

    // Case 3: remove stale state from elements no longer covered.
    // We scan all indexed elements and check for orphaned applied state.
    const allEntries = docSize > 0 ? domIndex.findEntriesInRange(0, docSize) : [];
    for (const entry of allEntries) {
      if (desired.has(entry.el)) continue;

      const applied = this.#applied.get(entry.el);
      if (!applied) continue;

      this.#removeAll(entry.el, applied);
      mutated = true;
    }

    return mutated;
  }

  /**
   * Applies decoration state to a fresh element (no prior bridge state).
   */
  #applyFresh(el: HTMLElement, desired: DesiredState): void {
    const tracked: AppliedState = {
      classes: new Set(),
      dataAttrs: new Map(),
      styleProps: new Map(),
      priorClasses: new Set(),
      priorDataAttrs: new Map(),
      priorStyleProps: new Map(),
    };

    for (const cls of desired.classes) {
      if (el.classList.contains(cls)) tracked.priorClasses.add(cls);
      el.classList.add(cls);
      tracked.classes.add(cls);
    }
    for (const [key, value] of desired.dataAttrs) {
      const prior = el.getAttribute(key);
      if (prior !== null) tracked.priorDataAttrs.set(key, prior);
      el.setAttribute(key, value);
      tracked.dataAttrs.set(key, value);
    }
    for (const [prop, value] of desired.styleProps) {
      const prior = el.style.getPropertyValue(prop);
      if (prior) tracked.priorStyleProps.set(prop, prior);
      el.style.setProperty(prop, value);
      tracked.styleProps.set(prop, value);
    }

    this.#applied.set(el, tracked);
  }

  /**
   * Diffs desired vs applied state and makes minimal DOM updates.
   * @returns `true` if any DOM mutations were made.
   */
  #applyDiff(el: HTMLElement, applied: AppliedState, desired: DesiredState): boolean {
    let mutated = false;

    // Classes: add new, remove stale (restoring painter-owned on removal).
    for (const cls of desired.classes) {
      if (!applied.classes.has(cls)) {
        if (el.classList.contains(cls)) applied.priorClasses.add(cls);
        el.classList.add(cls);
        applied.classes.add(cls);
        mutated = true;
      }
    }
    for (const cls of applied.classes) {
      if (!desired.classes.has(cls)) {
        if (!applied.priorClasses.has(cls)) {
          el.classList.remove(cls);
        }
        applied.priorClasses.delete(cls);
        applied.classes.delete(cls);
        mutated = true;
      }
    }

    // Data attributes: add/update new, remove stale (restoring prior values).
    for (const [key, value] of desired.dataAttrs) {
      if (applied.dataAttrs.get(key) !== value) {
        if (!applied.dataAttrs.has(key)) {
          const prior = el.getAttribute(key);
          if (prior !== null) applied.priorDataAttrs.set(key, prior);
        }
        el.setAttribute(key, value);
        applied.dataAttrs.set(key, value);
        mutated = true;
      }
    }
    for (const key of applied.dataAttrs.keys()) {
      if (!desired.dataAttrs.has(key)) {
        const prior = applied.priorDataAttrs.get(key);
        if (prior != null) {
          el.setAttribute(key, prior);
        } else {
          el.removeAttribute(key);
        }
        applied.priorDataAttrs.delete(key);
        applied.dataAttrs.delete(key);
        mutated = true;
      }
    }

    // Style properties: add/update new, remove stale (restoring prior values).
    for (const [prop, value] of desired.styleProps) {
      if (applied.styleProps.get(prop) !== value) {
        if (!applied.styleProps.has(prop)) {
          const prior = el.style.getPropertyValue(prop);
          if (prior) applied.priorStyleProps.set(prop, prior);
        }
        el.style.setProperty(prop, value);
        applied.styleProps.set(prop, value);
        mutated = true;
      }
    }
    for (const prop of applied.styleProps.keys()) {
      if (!desired.styleProps.has(prop)) {
        const prior = applied.priorStyleProps.get(prop);
        if (prior) {
          el.style.setProperty(prop, prior);
        } else {
          el.style.removeProperty(prop);
        }
        applied.priorStyleProps.delete(prop);
        applied.styleProps.delete(prop);
        mutated = true;
      }
    }

    // If all bridge state was removed, clean up the WeakMap entry.
    if (applied.classes.size === 0 && applied.dataAttrs.size === 0 && applied.styleProps.size === 0) {
      this.#applied.delete(el);
    }

    return mutated;
  }

  /**
   * Removes all bridge-owned state from an element.
   */
  #removeAll(el: HTMLElement, applied: AppliedState): void {
    for (const cls of applied.classes) {
      if (!applied.priorClasses.has(cls)) {
        el.classList.remove(cls);
      }
    }
    for (const key of applied.dataAttrs.keys()) {
      const prior = applied.priorDataAttrs.get(key);
      if (prior != null) {
        el.setAttribute(key, prior);
      } else {
        el.removeAttribute(key);
      }
    }
    for (const prop of applied.styleProps.keys()) {
      const prior = applied.priorStyleProps.get(prop);
      if (prior) {
        el.style.setProperty(prop, prior);
      } else {
        el.style.removeProperty(prop);
      }
    }
    this.#applied.delete(el);
  }
}
