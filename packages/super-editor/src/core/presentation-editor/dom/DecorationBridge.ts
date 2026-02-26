import { DecorationSet } from 'prosemirror-view';
import type { EditorState, Plugin, PluginKey } from 'prosemirror-state';
import type { Node as ProseMirrorNode } from 'prosemirror-model';

import { TrackChangesBasePluginKey } from '@extensions/track-changes/plugins/index.js';
import { CommentsPluginKey } from '@extensions/comment/comments-plugin.js';
import { customSearchHighlightsKey } from '@extensions/search/search.js';
import { AiPluginKey } from '@extensions/ai/ai-plugin.js';
import { CustomSelectionPluginKey } from '@extensions/custom-selection/custom-selection.js';
import { LinkedStylesPluginKey } from '@extensions/linked-styles/plugin.js';
import { NodeResizerKey } from '@extensions/noderesizer/noderesizer.js';

import type { DomPositionIndex, DomPositionIndexEntry } from './DomPositionIndex.js';

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
  const charOffsetFrom = matches.reduce((best, idx) => {
    if (hintFrom == null) return matches[0];
    const pos = charOffsetToPosition(doc, idx, TEXT_RANGE_BLOCK_SEP, TEXT_RANGE_LEAF_SEP);
    const bestPos = charOffsetToPosition(doc, best, TEXT_RANGE_BLOCK_SEP, TEXT_RANGE_LEAF_SEP);
    return Math.abs(pos - hintFrom) < Math.abs(bestPos - hintFrom) ? idx : best;
  }, matches[0]);
  const from = charOffsetToPosition(doc, charOffsetFrom, TEXT_RANGE_BLOCK_SEP, TEXT_RANGE_LEAF_SEP);
  const to = charOffsetToPosition(doc, charOffsetFrom + text.length, TEXT_RANGE_BLOCK_SEP, TEXT_RANGE_LEAF_SEP);
  return from < to ? { from, to } : null;
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
      const pluginRanges: Array<{
        from: number;
        to: number;
        classes: string[];
        style: string | null;
        dataAttrs: Record<string, string>;
        text: string | null;
      }> = [];
      const decorationSet = this.#getDecorationSet(plugin, state);

      if (decorationSet !== DecorationSet.empty) {
        const decorations = decorationSet.find(0, docSize);
        for (const decoration of decorations) {
          if (!this.#isInlineDecoration(decoration)) continue;

          const attrs = this.#extractSafeAttrs(decoration);
          // Only include decorations that have visual styling (classes or inline style)
          if (attrs.classes.length === 0 && attrs.styleEntries.length === 0) continue;

          const dataAttrs: Record<string, string> = {};
          for (const [key, value] of attrs.dataEntries) dataAttrs[key] = value;

          const rangeText = state.doc.textBetween(
            decoration.from,
            decoration.to,
            TEXT_RANGE_BLOCK_SEP,
            TEXT_RANGE_LEAF_SEP,
          );
          pluginRanges.push({
            from: decoration.from,
            to: decoration.to,
            classes: attrs.classes,
            style:
              attrs.styleEntries.length > 0
                ? attrs.styleEntries.map(([prop, val]) => `${prop}: ${val}`).join('; ')
                : null,
            dataAttrs,
            text: rangeText,
          });
        }
      }

      // Fallback: If plugin has no ranges but previously had valid ranges,
      // resolve by text so we highlight the same span (same text), not necessarily the same positions.
      // Skip restore when sync() was called with restoreEmptyDecorations: false (e.g. clearFocus).
      const previousPluginRanges = this.#previousRanges.get(plugin);
      const mayRestoreEmpty =
        !this.#skipRestoreEmptyOnNextCollect && previousPluginRanges && previousPluginRanges.length > 0;
      if (pluginRanges.length === 0 && mayRestoreEmpty) {
        for (const prevRange of previousPluginRanges) {
          let from = prevRange.from;
          let to = prevRange.to;
          if (prevRange.text) {
            const resolved = findRangeByText(state.doc, prevRange.text, prevRange.from);
            if (resolved) {
              from = resolved.from;
              to = resolved.to;
            }
          }
          if (from >= 0 && from < to && to <= docSize) {
            pluginRanges.push({
              from,
              to,
              classes: prevRange.classes,
              style: prevRange.style,
              dataAttrs: prevRange.dataAttrs,
              text: prevRange.text,
            });
          }
        }
      }

      // Store current ranges for next comparison. When we restored from previous,
      // keep that as the new previous so we don't clear on the next call.
      this.#previousRanges.set(plugin, pluginRanges.length > 0 ? [...pluginRanges] : []);

      // Add to final output
      ranges.push(...pluginRanges);
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
    this.#hadEligiblePlugins = false;
    this.#skipRestoreEmptyOnNextCollect = false;
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
      const decorationSet = this.#getDecorationSet(plugin, state);
      this.#prevDecorationSets.set(plugin, decorationSet);

      let pluginHasCurrentRanges = false;
      if (decorationSet !== DecorationSet.empty) {
        const decorations = decorationSet.find(0, docSize);
        for (const decoration of decorations) {
          if (!this.#isInlineDecoration(decoration)) continue;

          const attrs = this.#extractSafeAttrs(decoration);
          if (attrs.classes.length === 0 && attrs.dataEntries.length === 0 && attrs.styleEntries.length === 0) continue;

          // Collapsed or invalid range yields no entries; mapping can produce from === to
          if (decoration.from >= decoration.to) continue;

          pluginHasCurrentRanges = true;

          const entries = domIndex.findEntriesInRange(decoration.from, decoration.to);
          for (const entry of entries) {
            const d = this.#getOrCreateDesired(desired, entry.el);
            for (const cls of attrs.classes) d.classes.add(cls);
            for (const [key, value] of attrs.dataEntries) d.dataAttrs.set(key, value);
            for (const [prop, value] of attrs.styleEntries) d.styleProps.set(prop, value);
          }
        }
      }

      // Fallback: only when the plugin produced no valid current ranges (e.g. mapping cleared them).
      // Do not restore when the plugin has current ranges but they are offscreen (not in domIndex);
      // otherwise we would reapply previous ranges to wrong elements and cause highlight drift.
      if (pluginHasCurrentRanges) continue;
      if (!restoreEmptyDecorations) {
        this.#previousRanges.set(plugin, []);
        continue;
      }
      const previousPluginRanges = this.#previousRanges.get(plugin);
      if (previousPluginRanges?.length) {
        for (const prev of previousPluginRanges) {
          let from = prev.from;
          let to = prev.to;
          if (prev.text) {
            const resolved = findRangeByText(state.doc, prev.text, prev.from);
            if (resolved) {
              from = resolved.from;
              to = resolved.to;
            }
          }
          if (from < 0 || to <= from || to > docSize) continue;
          const entries = domIndex.findEntriesInRange(from, to);
          for (const entry of entries) {
            const d = this.#getOrCreateDesired(desired, entry.el);
            for (const cls of prev.classes) d.classes.add(cls);
            for (const [key, value] of Object.entries(prev.dataAttrs)) d.dataAttrs.set(key, value);
            if (prev.style) {
              for (const [prop, value] of DecorationBridge.#parseStyleString(prev.style)) {
                d.styleProps.set(prop, value);
              }
            }
          }
        }
      }
    }

    return desired;
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
