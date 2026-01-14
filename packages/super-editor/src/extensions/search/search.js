// @ts-nocheck

import { Extension } from '@core/Extension.js';
import { PositionTracker } from '@core/PositionTracker.js';
import { search, SearchQuery, setSearchState, getMatchHighlights } from './prosemirror-search-patched.js';
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { v4 as uuidv4 } from 'uuid';

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
 * Search match object
 * @typedef {Object} SearchMatch
 * @property {string} text - Found text
 * @property {number} from - From position
 * @property {number} to - To position
 * @property {string} id - ID of the search match
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
    };
  },

  addPmPlugins() {
    const editor = this.editor;
    const storage = this.storage;

    const searchHighlightWithIdPlugin = new Plugin({
      key: new PluginKey('customSearchHighlights'),
      props: {
        decorations(state) {
          if (!editor) return null;

          const matches = storage?.searchResults;
          if (!matches?.length) return null;

          const decorations = matches.map((match) =>
            Decoration.inline(match.from, match.to, {
              id: `search-match-${match.id}`,
            }),
          );

          return DecorationSet.create(state.doc, decorations);
        },
      },
    });

    return [search(), searchHighlightWithIdPlugin];
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
          const highlights = getMatchHighlights(state);
          if (!highlights) return false;

          // Fix: DecorationSet uses .find(), not .children
          const decorations = highlights.find();
          if (!decorations?.length) return false;

          const firstMatch = decorations[0];

          editor.view.focus();
          const tr = state.tr
            .setSelection(TextSelection.create(state.doc, firstMatch.from, firstMatch.to))
            .scrollIntoView();
          if (dispatch) dispatch(tr);

          const presentationEditor = editor.presentationEditor;
          if (presentationEditor && typeof presentationEditor.scrollToPosition === 'function') {
            const didScroll = presentationEditor.scrollToPosition(firstMatch.from, { block: 'center' });
            if (didScroll) return true;
          }

          const domPos = editor.view.domAtPos(firstMatch.from);
          domPos?.node?.scrollIntoView(true);
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
       * @note Returns array of SearchMatch objects with positions and IDs
       */
      search:
        (patternInput, options = {}) =>
        /** @returns {SearchMatch[]} */
        ({ state, dispatch, editor }) => {
          // Validate options parameter - must be an object if provided
          if (options != null && (typeof options !== 'object' || Array.isArray(options))) {
            throw new TypeError('Search options must be an object');
          }

          // Extract and validate highlight option with nullish coalescing fallback
          const highlight = typeof options?.highlight === 'boolean' ? options.highlight : true;
          let pattern;
          let caseSensitive = false;
          let regexp = false;
          const wholeWord = false;

          if (isRegExp(patternInput)) {
            const regexPattern = /** @type {RegExp} */ (patternInput);
            regexp = true;
            pattern = regexPattern.source;
            caseSensitive = !regexPattern.flags.includes('i');
          } else if (typeof patternInput === 'string' && /^\/(.+)\/([gimsuy]*)$/.test(patternInput)) {
            const [, body, flags] = patternInput.match(/^\/(.+)\/([gimsuy]*)$/);
            regexp = true;
            pattern = body;
            caseSensitive = !flags.includes('i');
          } else {
            pattern = String(patternInput);
          }

          const query = new SearchQuery({
            search: pattern,
            caseSensitive,
            regexp,
            wholeWord,
          });
          const tr = setSearchState(state.tr, query, null, { highlight });
          dispatch(tr);

          const newState = state.apply(tr);

          const decoSet = getMatchHighlights(newState);
          const matches = decoSet ? decoSet.find() : [];

          const resultMatches = matches.map((d) => ({
            from: d.from,
            to: d.to,
            text: newState.doc.textBetween(d.from, d.to),
            id: uuidv4(),
          }));

          const positionTracker = getPositionTracker(editor);

          if (positionTracker?.untrackByType) {
            positionTracker.untrackByType('search');
          }

          if (positionTracker?.trackMany && resultMatches.length > 0) {
            const trackedIds = positionTracker.trackMany(
              resultMatches.map((match) => ({
                from: match.from,
                to: match.to,
                spec: {
                  type: 'search',
                  metadata: { text: match.text },
                  inclusiveStart: false,
                  inclusiveEnd: false,
                },
              })),
            );

            trackedIds.forEach((id, index) => {
              if (id) {
                resultMatches[index].id = id;
              }
            });
          }

          this.storage.searchResults = resultMatches;

          return resultMatches;
        },

      /**
       * Navigate to a specific search match
       * @category Command
       * @param {SearchMatch} match - Match object to navigate to
       * @example
       * const searchResults = editor.commands.search('test string')
       * editor.commands.goToSearchResult(searchResults[3])
       * @note Scrolls to match and selects it
       */
      goToSearchResult:
        (match) =>
        /** @returns {boolean} */
        ({ state, dispatch, editor }) => {
          const positionTracker = getPositionTracker(editor);
          let { from, to } = match;

          if (positionTracker?.resolve && match?.id) {
            const resolved = positionTracker.resolve(match.id);
            if (resolved) {
              from = resolved.from;
              to = resolved.to;
            }
          }

          const doc = state.doc;
          const highlights = getMatchHighlights(state);
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
