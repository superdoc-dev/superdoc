// @ts-nocheck

import { Extension } from '@core/Extension.js';
import { PositionTracker } from '@core/PositionTracker.js';
import { search, SearchQuery, setSearchState, getMatchHighlights } from './prosemirror-search-patched.js';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
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
    };
  },

  addPmPlugins() {
    const editor = this.editor;
    const storage = this.storage;

    // Plugin to invalidate search index when document changes
    const searchIndexInvalidatorPlugin = new Plugin({
      key: new PluginKey('searchIndexInvalidator'),
      appendTransaction(transactions, oldState, newState) {
        const docChanged = transactions.some((tr) => tr.docChanged);
        if (docChanged && storage?.searchIndex) {
          storage.searchIndex.invalidate();
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
          for (const match of matches) {
            // Determine decoration attributes based on highlight setting
            const attrs = highlightEnabled
              ? { id: `search-match-${match.id}`, class: 'ProseMirror-search-match' }
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
            const from = firstMatch.ranges?.[0]?.from ?? firstMatch.from;
            const to = firstMatch.ranges?.[0]?.to ?? firstMatch.to;

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

          // Ensure search index is valid
          const searchIndex = this.storage.searchIndex;
          searchIndex.ensureValid(state.doc);

          // Search using the index
          const indexMatches = searchIndex.search(searchPattern, {
            caseSensitive,
            maxMatches,
          });

          // Map matches to document positions
          const resultMatches = [];
          for (const indexMatch of indexMatches) {
            const ranges = searchIndex.offsetRangeToDocRanges(indexMatch.start, indexMatch.end);
            if (ranges.length === 0) continue;

            // Get text for each range and combine
            const matchTexts = ranges.map((r) => state.doc.textBetween(r.from, r.to));
            const combinedText = matchTexts.join('');

            const match = {
              from: ranges[0].from,
              to: ranges[ranges.length - 1].to,
              text: combinedText,
              id: uuidv4(),
              ranges: ranges,
              trackerIds: [],
            };

            resultMatches.push(match);
          }

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

          let from, to;

          // Handle multi-range matches (cross-paragraph)
          if (match?.ranges && match.ranges.length > 0 && match?.trackerIds && match.trackerIds.length > 0) {
            // Resolve the first tracked range for selection
            if (positionTracker?.resolve && match.trackerIds[0]) {
              const resolved = positionTracker.resolve(match.trackerIds[0]);
              if (resolved) {
                from = resolved.from;
                to = resolved.to;
              }
            }

            // Fallback to stored range if tracking failed
            if (from === undefined) {
              from = match.ranges[0].from;
              to = match.ranges[0].to;
            }
          } else {
            // Single range match (backward compatibility)
            from = match.from;
            to = match.to;

            if (positionTracker?.resolve && match?.id) {
              const resolved = positionTracker.resolve(match.id);
              if (resolved) {
                from = resolved.from;
                to = resolved.to;
              }
            }
          }

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
          if (presentationEditor && typeof presentationEditor.scrollToPosition === 'function') {
            const didScroll = presentationEditor.scrollToPosition(from, { block: 'center' });
            if (didScroll) return true;
          }

          const { node } = editor.view.domAtPos(from);
          if (node?.scrollIntoView) {
            node.scrollIntoView({ block: 'center', inline: 'nearest' });
          }

          return true;
        },
    };
  },
});
