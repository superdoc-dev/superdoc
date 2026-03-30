// @ts-nocheck

import { Extension } from '@core/Extension.js';
import { PositionTracker } from '@core/PositionTracker.js';
import { search, SearchQuery, setSearchState, getMatchHighlights } from './prosemirror-search-patched.js';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { Fragment, Slice } from 'prosemirror-model';
import { v4 as uuidv4 } from 'uuid';
import { SearchIndex } from './SearchIndex.js';

/**
 * Plugin key for accessing custom search highlight decorations
 */
export const customSearchHighlightsKey = new PluginKey('customSearchHighlights');

/**
 * Get the custom search highlight decorations from the current state.
 * @param {import('prosemirror-state').EditorState} state - The editor state
 * @returns {DecorationSet|null} The decoration set, or null if not available
 */
export const getCustomSearchDecorations = (state) => {
  const plugin = customSearchHighlightsKey.get(state);
  if (!plugin || !plugin.props.decorations) return null;
  return plugin.props.decorations(state);
};

const isRegExp = (value) => Object.prototype.toString.call(value) === '[object RegExp]';
const SEARCH_POSITION_TRACKER_TYPE = 'search-match';

/**
 * Convert raw SearchIndex matches into SearchMatch objects with document ranges
 * and optional position tracking.
 *
 * @param {Object} params
 * @param {SearchIndex} params.searchIndex - The search index to map offsets
 * @param {Array<{start: number, end: number, text: string}>} params.indexMatches - Raw index matches
 * @param {import('prosemirror-model').Node} params.doc - The document for text extraction
 * @param {Object} [params.positionTracker] - Optional position tracker for tracking ranges
 * @returns {SearchMatch[]}
 */
const mapIndexMatchesToDocMatches = ({ searchIndex, indexMatches, doc, positionTracker }) => {
  const matches = [];
  for (const indexMatch of indexMatches) {
    const ranges = searchIndex.offsetRangeToDocRanges(indexMatch.start, indexMatch.end);
    if (ranges.length === 0) continue;

    const matchTexts = ranges.map((r) => doc.textBetween(r.from, r.to));

    const match = {
      from: ranges[0].from,
      to: ranges[ranges.length - 1].to,
      text: matchTexts.join(''),
      id: uuidv4(),
      ranges,
      trackerIds: [],
    };

    if (positionTracker?.trackMany) {
      const trackedRanges = ranges.map((range, rangeIndex) => ({
        from: range.from,
        to: range.to,
        spec: { type: SEARCH_POSITION_TRACKER_TYPE, metadata: { rangeIndex } },
      }));
      const trackerIds = positionTracker.trackMany(trackedRanges);
      if (trackerIds.length > 0) {
        match.trackerIds = trackerIds;
        match.id = trackerIds[0];
      }
    }

    matches.push(match);
  }
  return matches;
};

const resolveMatchSelectionRange = (match, positionTracker) => {
  if (!match) return { from: undefined, to: undefined };

  if (positionTracker?.resolve && Array.isArray(match.trackerIds) && match.trackerIds.length > 0) {
    const resolved = positionTracker.resolve(match.trackerIds[0]);
    if (resolved) {
      return { from: resolved.from, to: resolved.to };
    }
  }

  if (match?.ranges && match.ranges.length > 0) {
    return { from: match.ranges[0].from, to: match.ranges[0].to };
  }

  if (positionTracker?.resolve && match?.id) {
    const resolved = positionTracker.resolve(match.id);
    if (resolved) {
      return { from: resolved.from, to: resolved.to };
    }
  }

  return { from: match.from, to: match.to };
};

const resolveInlineTextPosition = (doc, position, direction) => {
  const docSize = doc.content.size;
  if (!Number.isFinite(position) || position < 0 || position > docSize) {
    return position;
  }

  const step = direction === 'forward' ? 1 : -1;
  let current = position;
  let iterations = 0;

  while (iterations < 8) {
    iterations += 1;
    const resolved = doc.resolve(current);
    const boundaryNode = direction === 'forward' ? resolved.nodeAfter : resolved.nodeBefore;

    if (!boundaryNode) break;
    if (boundaryNode.isText) break;
    if (!boundaryNode.isInline || boundaryNode.isAtom || boundaryNode.content.size === 0) break;

    const next = current + step;
    if (next < 0 || next > docSize) break;
    current = next;

    const adjacent = doc.resolve(current);
    const checkNode = direction === 'forward' ? adjacent.nodeAfter : adjacent.nodeBefore;
    if (checkNode && checkNode.isText) break;
  }

  return current;
};

const resolveSearchRange = ({ doc, from, to, expectedText, highlights }) => {
  const docSize = doc.content.size;
  let resolvedFrom = Math.max(0, Math.min(from, docSize));
  let resolvedTo = Math.max(0, Math.min(to, docSize));

  if (highlights) {
    const windowStart = Math.max(0, resolvedFrom - 4);
    const windowEnd = Math.min(docSize, resolvedTo + 4);
    const candidates = highlights.find(windowStart, windowEnd);
    if (candidates.length > 0) {
      let chosen = candidates[0];
      if (expectedText) {
        const matching = candidates.filter(
          (decoration) => doc.textBetween(decoration.from, decoration.to) === expectedText,
        );
        if (matching.length > 0) {
          chosen = matching[0];
        }
      }
      resolvedFrom = chosen.from;
      resolvedTo = chosen.to;
    }
  }

  const normalizedFrom = resolveInlineTextPosition(doc, resolvedFrom, 'forward');
  const normalizedTo = resolveInlineTextPosition(doc, resolvedTo, 'backward');
  if (Number.isFinite(normalizedFrom) && Number.isFinite(normalizedTo) && normalizedFrom <= normalizedTo) {
    resolvedFrom = normalizedFrom;
    resolvedTo = normalizedTo;
  }

  return { from: resolvedFrom, to: resolvedTo };
};

const getPositionTracker = (editor) => {
  if (!editor) return null;
  if (editor.positionTracker) return editor.positionTracker;
  const storageTracker = editor.storage?.positionTracker?.tracker;
  if (storageTracker) {
    editor.positionTracker = storageTracker;
    return storageTracker;
  }
  const tracker = new PositionTracker(editor);
  if (editor.storage?.positionTracker) {
    editor.storage.positionTracker.tracker = tracker;
  }
  editor.positionTracker = tracker;
  return tracker;
};

/**
 * A document range
 * @typedef {Object} DocRange
 * @property {number} from - Start position in document
 * @property {number} to - End position in document
 */

/**
 * Search match object
 * @typedef {Object} SearchMatch
 * @property {string} text - Found text (combined from all ranges)
 * @property {number} from - From position (start of first range)
 * @property {number} to - To position (end of last range)
 * @property {string} id - ID of the search match (first tracker ID for multi-range)
 * @property {DocRange[]} [ranges] - Array of document ranges for cross-paragraph matches
 * @property {string[]} [trackerIds] - Array of position tracker IDs for each range
 */

/**
 * Configuration options for Search
 * @typedef {Object} SearchOptions
 * @category Options
 */

/**
 * Options for the search command
 * @typedef {Object} SearchCommandOptions
 * @property {boolean} [highlight=true] - Whether to apply CSS classes for visual highlighting of search matches.
 *   When true, matches are styled with 'ProseMirror-search-match' or 'ProseMirror-active-search-match' classes.
 *   When false, matches are tracked without visual styling, useful for programmatic search without UI changes.
 * @property {number} [maxMatches=1000] - Maximum number of matches to return.
 * @property {boolean} [caseSensitive=false] - Whether the search should be case-sensitive.
 */

/**
 * @module Search
 * @sidebarTitle Search
 * @snippetPath /snippets/extensions/search.mdx
 */
export const Search = Extension.create({
  // @ts-expect-error - Storage type mismatch will be fixed in TS migration
  addStorage() {
    return {
      /**
       * @private
       * @type {SearchMatch[]|null}
       */
      searchResults: [],
      /**
       * @private
       * @type {boolean}
       * Whether to apply CSS highlight classes to matches
       */
      highlightEnabled: true,
      /**
       * @private
       * @type {SearchIndex}
       * Lazily-built search index for cross-paragraph matching
       */
      searchIndex: new SearchIndex(),
      /**
       * @private
       * @type {number}
       * Index of the currently active match (-1 = none)
       */
      activeMatchIndex: -1,
      /**
       * @private
       * @type {string}
       * Current search query string
       */
      query: '',
      /**
       * @private
       * @type {boolean}
       * Whether the current search is case-sensitive
       */
      caseSensitive: false,
      /**
       * @private
       * @type {boolean}
       * Whether the current search ignores diacritics
       */
      ignoreDiacritics: false,
    };
  },

  addPmPlugins() {
    const editor = this.editor;
    const storage = this.storage;

    // Plugin to invalidate search index and refresh the live session when the document changes.
    // Without this, highlights and replace targets would reference stale positions after any edit.
    const searchIndexInvalidatorPlugin = new Plugin({
      key: new PluginKey('searchIndexInvalidator'),
      appendTransaction(transactions, oldState, newState) {
        const docChanged = transactions.some((tr) => tr.docChanged);
        if (!docChanged) return null;

        if (storage?.searchIndex) {
          storage.searchIndex.invalidate();
        }

        // If there is a live search session, refresh it so highlights and match
        // ranges stay in sync with the new document. We check storage.query (not
        // searchResults.length) so that a zero-result session can become non-zero
        // when the user edits the document to contain the search term.
        if (storage?.query) {
          // Rebuild the index against the new doc
          storage.searchIndex.ensureValid(newState.doc);

          const searchFn = storage.ignoreDiacritics
            ? (q, opts) => storage.searchIndex.searchIgnoringDiacritics(q, opts)
            : (q, opts) => storage.searchIndex.search(q, opts);

          const indexMatches = searchFn(storage.query, {
            caseSensitive: storage.caseSensitive,
          });

          const refreshed = mapIndexMatchesToDocMatches({
            searchIndex: storage.searchIndex,
            indexMatches,
            doc: newState.doc,
          });

          storage.searchResults = refreshed;

          // Reconcile activeMatchIndex with the new result set:
          // - no results → -1
          // - was -1 but now have results → promote to 0
          // - index past end → clamp to last
          if (refreshed.length === 0) {
            storage.activeMatchIndex = -1;
          } else if (storage.activeMatchIndex < 0) {
            storage.activeMatchIndex = 0;
          } else if (storage.activeMatchIndex >= refreshed.length) {
            storage.activeMatchIndex = refreshed.length - 1;
          }
        }

        return null;
      },
    });

    const searchHighlightWithIdPlugin = new Plugin({
      key: customSearchHighlightsKey,
      props: {
        decorations(state) {
          if (!editor) return null;

          const matches = storage?.searchResults;
          if (!matches?.length) return null;

          const highlightEnabled = storage?.highlightEnabled !== false;

          // Build decorations from all ranges in each match
          const decorations = [];
          const activeIdx = storage?.activeMatchIndex ?? -1;

          for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            const isActive = i === activeIdx;
            const cls = isActive ? 'ProseMirror-active-search-match' : 'ProseMirror-search-match';

            // Determine decoration attributes based on highlight setting
            const attrs = highlightEnabled
              ? { id: `search-match-${match.id}`, class: cls }
              : { id: `search-match-${match.id}` };

            if (match.ranges && match.ranges.length > 0) {
              // Multi-range match: create decoration for each range
              for (const range of match.ranges) {
                decorations.push(Decoration.inline(range.from, range.to, attrs));
              }
            } else {
              // Single range match (backward compatibility)
              decorations.push(Decoration.inline(match.from, match.to, attrs));
            }
          }

          return DecorationSet.create(state.doc, decorations);
        },
      },
    });

    return [search(), searchIndexInvalidatorPlugin, searchHighlightWithIdPlugin];
  },

  addCommands() {
    return {
      /**
       * Navigate to the first search match
       * @category Command
       * @example
       * editor.commands.goToFirstMatch()
       * @note Scrolls editor to the first match from previous search
       */
      goToFirstMatch:
        () =>
        /** @returns {boolean} */
        ({ state, editor, dispatch }) => {
          // First try our storage-based results
          const searchResults = this.storage?.searchResults;
          if (Array.isArray(searchResults) && searchResults.length > 0) {
            const firstMatch = searchResults[0];
            const positionTracker = getPositionTracker(editor);
            const { from, to } = resolveMatchSelectionRange(firstMatch, positionTracker);

            if (typeof from !== 'number' || typeof to !== 'number') {
              return false;
            }

            editor.view.focus();
            const tr = state.tr.setSelection(TextSelection.create(state.doc, from, to)).scrollIntoView();
            if (dispatch) dispatch(tr);

            const presentationEditor = editor.presentationEditor;
            if (presentationEditor && typeof presentationEditor.scrollToPosition === 'function') {
              const didScroll = presentationEditor.scrollToPosition(from, { block: 'center' });
              if (didScroll) return true;
            }

            try {
              const domPos = editor.view.domAtPos(from);
              if (domPos?.node?.scrollIntoView) {
                domPos.node.scrollIntoView(true);
              }
            } catch {
              // Ignore scroll errors in test environments
            }
            return true;
          }

          // Fallback to prosemirror-search highlights for backward compatibility
          const highlights = getMatchHighlights(state);
          if (!highlights) return false;

          const decorations = highlights.find();
          if (!decorations?.length) return false;

          const firstDeco = decorations[0];

          editor.view.focus();
          const tr = state.tr
            .setSelection(TextSelection.create(state.doc, firstDeco.from, firstDeco.to))
            .scrollIntoView();
          if (dispatch) dispatch(tr);

          const presentationEditor = editor.presentationEditor;
          if (presentationEditor && typeof presentationEditor.scrollToPosition === 'function') {
            const didScroll = presentationEditor.scrollToPosition(firstDeco.from, { block: 'center' });
            if (didScroll) return true;
          }

          try {
            const domPos = editor.view.domAtPos(firstDeco.from);
            if (domPos?.node?.scrollIntoView) {
              domPos.node.scrollIntoView(true);
            }
          } catch {
            // Ignore scroll errors in test environments
          }
          return true;
        },

      /**
       * Search for string matches in editor content
       * @category Command
       * @param {String|RegExp} patternInput - Search string or pattern
       * @param {SearchCommandOptions} [options={}] - Options to control search behavior
       * @example
       * // Basic search with highlighting (default)
       * const matches = editor.commands.search('test string')
       *
       * // Regex search
       * const regexMatches = editor.commands.search(/test/i)
       *
       * // Search without visual highlighting
       * const silentMatches = editor.commands.search('test', { highlight: false })
       *
       * // Cross-paragraph search (works by default for plain strings)
       * const crossParagraphMatches = editor.commands.search('end of paragraph start of next')
       * @note Returns array of SearchMatch objects with positions and IDs.
       *       Plain string searches are whitespace-flexible and match across paragraphs.
       *       Regex searches match exactly as specified.
       */
      search:
        (patternInput, options = {}) =>
        /** @returns {SearchMatch[]} */
        ({ state, dispatch, editor }) => {
          // Validate options parameter - must be an object if provided
          if (options != null && (typeof options !== 'object' || Array.isArray(options))) {
            throw new TypeError('Search options must be an object');
          }

          // Extract options
          const highlight = typeof options?.highlight === 'boolean' ? options.highlight : true;
          const maxMatches = typeof options?.maxMatches === 'number' ? options.maxMatches : 1000;

          // Determine if this is a regex search
          let isRegexSearch = false;
          let caseSensitive = false;
          let searchPattern = patternInput;

          if (isRegExp(patternInput)) {
            isRegexSearch = true;
            caseSensitive = !patternInput.flags.includes('i');
            searchPattern = patternInput;
          } else if (typeof patternInput === 'string' && /^\/(.+)\/([gimsuy]*)$/.test(patternInput)) {
            const [, body, flags] = patternInput.match(/^\/(.+)\/([gimsuy]*)$/);
            isRegexSearch = true;
            caseSensitive = !flags.includes('i');
            searchPattern = new RegExp(body, flags.includes('g') ? flags : flags + 'g');
          } else {
            searchPattern = String(patternInput);
            caseSensitive = typeof options?.caseSensitive === 'boolean' ? options.caseSensitive : false;
          }

          const positionTracker = getPositionTracker(editor);
          // Keep tracker set bounded to current search results only.
          positionTracker?.untrackByType?.(SEARCH_POSITION_TRACKER_TYPE);

          // Ensure search index is valid
          const searchIndex = this.storage.searchIndex;
          searchIndex.ensureValid(state.doc);

          // Search using the index
          const indexMatches = searchIndex.search(searchPattern, {
            caseSensitive,
            maxMatches,
          });

          // Map matches to document positions
          const resultMatches = mapIndexMatchesToDocMatches({
            searchIndex,
            indexMatches,
            doc: state.doc,
            positionTracker,
          });

          // Store results and highlight preference (no dispatches needed - decorations come from storage)
          this.storage.searchResults = resultMatches;
          this.storage.highlightEnabled = highlight;

          return resultMatches;
        },

      /**
       * Navigate to a specific search match
       * @category Command
       * @param {SearchMatch} match - Match object to navigate to
       * @example
       * const searchResults = editor.commands.search('test string')
       * editor.commands.goToSearchResult(searchResults[3])
       * @note Scrolls to match and selects it. For multi-range matches (cross-paragraph),
       *       selects the first range and scrolls to it.
       */
      goToSearchResult:
        (match) =>
        /** @returns {boolean} */
        ({ state, dispatch, editor }) => {
          const positionTracker = getPositionTracker(editor);
          const doc = state.doc;
          const highlights = getMatchHighlights(state);

          let { from, to } = resolveMatchSelectionRange(match, positionTracker);
          if (typeof from !== 'number' || typeof to !== 'number') return false;

          // Normalize the range to handle transparent inline nodes
          const normalized = resolveSearchRange({
            doc,
            from,
            to,
            expectedText: match?.text ?? null,
            highlights,
          });
          from = normalized.from;
          to = normalized.to;

          editor.view.focus();
          const tr = state.tr.setSelection(TextSelection.create(state.doc, from, to)).scrollIntoView();
          if (dispatch) dispatch(tr);

          const presentationEditor = editor.presentationEditor;
          // Try sync scroll first — returns true when the page is mounted and in body mode.
          const scrolled = presentationEditor?.scrollToPosition?.(from, { block: 'center' }) ?? false;

          if (!scrolled) {
            // Async version handles virtualized (un-mounted) pages; fire-and-forget
            // because it will scroll once the target page mounts.
            Promise.resolve(presentationEditor?.scrollToPositionAsync?.(from, { block: 'center' })).catch(() => {});

            // DOM fallback for non-presentation contexts or when presentation
            // scroll cannot run (e.g. header/footer mode, no layout).
            const { node } = editor.view.domAtPos(from);
            if (node?.scrollIntoView) {
              node.scrollIntoView({ block: 'center', inline: 'nearest' });
            }
          }

          return true;
        },

      /**
       * Start or update a search session with query and options.
       * Stores session state and sets activeMatchIndex to 0 if matches are found.
       * @category Command
       * @param {string} query - Search query string
       * @param {Object} [options={}] - Session options
       * @param {boolean} [options.caseSensitive=false] - Case-sensitive search
       * @param {boolean} [options.ignoreDiacritics=false] - Ignore diacritics when matching
       * @param {boolean} [options.highlight=true] - Apply visual highlighting
       * @returns {{ matches: SearchMatch[], activeMatchIndex: number }}
       */
      setSearchSession:
        (query, options = {}) =>
        ({ state, editor }) => {
          const caseSensitive = options.caseSensitive ?? false;
          const ignoreDiacritics = options.ignoreDiacritics ?? false;
          const highlight = options.highlight ?? true;

          // Store session state
          this.storage.query = query;
          this.storage.caseSensitive = caseSensitive;
          this.storage.ignoreDiacritics = ignoreDiacritics;

          // Clear existing position trackers
          const positionTracker = getPositionTracker(editor);
          positionTracker?.untrackByType?.(SEARCH_POSITION_TRACKER_TYPE);

          if (!query) {
            this.storage.searchResults = [];
            this.storage.activeMatchIndex = -1;
            this.storage.highlightEnabled = highlight;
            return { matches: [], activeMatchIndex: -1 };
          }

          // Build/validate search index
          const searchIndex = this.storage.searchIndex;
          searchIndex.ensureValid(state.doc);

          // Search with diacritic support
          const indexMatches = ignoreDiacritics
            ? searchIndex.searchIgnoringDiacritics(query, { caseSensitive })
            : searchIndex.search(query, { caseSensitive });

          // Map matches to document positions
          const resultMatches = mapIndexMatchesToDocMatches({
            searchIndex,
            indexMatches,
            doc: state.doc,
            positionTracker,
          });

          this.storage.searchResults = resultMatches;
          this.storage.highlightEnabled = highlight;
          this.storage.activeMatchIndex = resultMatches.length > 0 ? 0 : -1;

          return { matches: resultMatches, activeMatchIndex: this.storage.activeMatchIndex };
        },

      /**
       * Clear the current search session, removing all highlights and state.
       * @category Command
       */
      clearSearchSession:
        () =>
        ({ editor }) => {
          const positionTracker = getPositionTracker(editor);
          positionTracker?.untrackByType?.(SEARCH_POSITION_TRACKER_TYPE);

          this.storage.searchResults = [];
          this.storage.highlightEnabled = true;
          this.storage.activeMatchIndex = -1;
          this.storage.query = '';
          this.storage.caseSensitive = false;
          this.storage.ignoreDiacritics = false;

          return true;
        },

      /**
       * Navigate to the next search match (wraps around).
       * @category Command
       * @returns {{ activeMatchIndex: number, match: SearchMatch | null }}
       */
      nextSearchMatch:
        () =>
        ({ state, editor }) => {
          const matches = this.storage.searchResults;
          if (!matches || matches.length === 0) {
            return { activeMatchIndex: -1, match: null };
          }

          const nextIdx = (this.storage.activeMatchIndex + 1) % matches.length;
          this.storage.activeMatchIndex = nextIdx;
          const match = matches[nextIdx];

          // Scroll to the active match
          editor.commands.goToSearchResult(match);

          return { activeMatchIndex: nextIdx, match };
        },

      /**
       * Navigate to the previous search match (wraps around).
       * @category Command
       * @returns {{ activeMatchIndex: number, match: SearchMatch | null }}
       */
      previousSearchMatch:
        () =>
        ({ state, editor }) => {
          const matches = this.storage.searchResults;
          if (!matches || matches.length === 0) {
            return { activeMatchIndex: -1, match: null };
          }

          const prevIdx = (this.storage.activeMatchIndex - 1 + matches.length) % matches.length;
          this.storage.activeMatchIndex = prevIdx;
          const match = matches[prevIdx];

          // Scroll to the active match
          editor.commands.goToSearchResult(match);

          return { activeMatchIndex: prevIdx, match };
        },

      /**
       * Replace the currently active search match with the given text.
       * Re-runs the search afterwards to update matches and counts.
       * @category Command
       * @param {string} replacement - Replacement text
       * @returns {{ matches: SearchMatch[], activeMatchIndex: number }}
       */
      replaceSearchMatch:
        (replacement) =>
        ({ state, dispatch, editor, commands }) => {
          const matches = this.storage.searchResults;
          const activeIdx = this.storage.activeMatchIndex;

          if (!matches || activeIdx < 0 || activeIdx >= matches.length) {
            return { matches: matches || [], activeMatchIndex: activeIdx };
          }

          const match = matches[activeIdx];
          const from = match.ranges[0].from;
          const to = match.ranges[match.ranges.length - 1].to;

          const tr = state.tr;
          if (replacement) {
            tr.replace(from, to, new Slice(Fragment.from(state.schema.text(replacement)), 0, 0));
          } else {
            tr.replace(from, to, Slice.empty);
          }
          if (dispatch) dispatch(tr);

          // Sync chainable state getters to the mutated transaction before
          // nested commands read state.doc for the refreshed session.
          void state.tr;

          // Re-run search with same session options to refresh matches
          const result = commands.setSearchSession(this.storage.query, {
            caseSensitive: this.storage.caseSensitive,
            ignoreDiacritics: this.storage.ignoreDiacritics,
            highlight: this.storage.highlightEnabled,
          });

          // Clamp activeMatchIndex to new match count and scroll to the
          // newly active match so the editor selection follows the replacement,
          // matching the behavior of nextSearchMatch / previousSearchMatch.
          if (result.matches.length > 0) {
            const newIdx = Math.min(activeIdx, result.matches.length - 1);
            this.storage.activeMatchIndex = newIdx;
            result.activeMatchIndex = newIdx;

            const nextMatch = result.matches[newIdx];
            if (nextMatch) {
              commands.goToSearchResult(nextMatch);
            }
          }

          return result;
        },

      /**
       * Replace all search matches with the given text.
       * Applies all replacements in a single transaction (back-to-front).
       * @category Command
       * @param {string} replacement - Replacement text
       * @returns {{ replacedCount: number }}
       */
      replaceAllSearchMatches:
        (replacement) =>
        ({ state, dispatch, commands }) => {
          const matches = this.storage.searchResults;
          if (!matches || matches.length === 0) {
            return { replacedCount: 0 };
          }

          const { schema } = state;
          const tr = state.tr;
          const count = matches.length;

          // Apply replacements back-to-front to avoid position shifts
          for (let i = matches.length - 1; i >= 0; i--) {
            const match = matches[i];
            const from = match.ranges[0].from;
            const to = match.ranges[match.ranges.length - 1].to;

            if (replacement) {
              tr.replace(from, to, new Slice(Fragment.from(schema.text(replacement)), 0, 0));
            } else {
              tr.replace(from, to, Slice.empty);
            }
          }

          if (dispatch) dispatch(tr);

          // Clear session after replacing all
          commands.clearSearchSession();

          return { replacedCount: count };
        },
    };
  },
});
