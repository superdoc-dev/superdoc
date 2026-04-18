// Adapted from prosemirror-search@1.1.0. We patch text extraction and index
// mapping to treat inline wrapper nodes (e.g. w:r "run" nodes) as transparent
// so regex queries match across them and return correct document positions.
import { PluginKey, Plugin, TextSelection } from 'prosemirror-state';
import { DecorationSet, Decoration } from 'prosemirror-view';
import { Fragment, Slice } from 'prosemirror-model';

class SearchQuery {
  /**
    Create a query object.
    */
  constructor(config) {
    this.search = config.search;
    this.caseSensitive = !!config.caseSensitive;
    this.literal = !!config.literal;
    this.regexp = !!config.regexp;
    this.replace = config.replace || '';
    this.valid = !!this.search && !(this.regexp && !validRegExp(this.search));
    this.wholeWord = !!config.wholeWord;
    this.filter = config.filter || null;
    this.impl = !this.valid ? nullQuery : this.regexp ? new RegExpQuery(this) : new StringQuery(this);
  }
  /**
    Compare this query to another query.
    */
  eq(other) {
    return (
      this.search == other.search &&
      this.replace == other.replace &&
      this.caseSensitive == other.caseSensitive &&
      this.regexp == other.regexp &&
      this.wholeWord == other.wholeWord
    );
  }
  /**
    Find the next occurrence of this query in the given range.
    */
  findNext(state, from = 0, to = state.doc.content.size) {
    for (;;) {
      if (from >= to) return null;
      let result = this.impl.findNext(state, from, to);
      if (!result || this.checkResult(state, result)) return result;
      from = result.from + 1;
    }
  }
  /**
    Find the previous occurrence of this query in the given range.
    Note that, if `to` is given, it should be _less_ than `from`.
    */
  findPrev(state, from = state.doc.content.size, to = 0) {
    for (;;) {
      if (from <= to) return null;
      let result = this.impl.findPrev(state, from, to);
      if (!result || this.checkResult(state, result)) return result;
      from = result.to - 1;
    }
  }
  /**
    @internal
    */
  checkResult(state, result) {
    return (
      (!this.wholeWord || (checkWordBoundary(state, result.from) && checkWordBoundary(state, result.to))) &&
      (!this.filter || this.filter(state, result))
    );
  }
  /**
    @internal
    */
  unquote(string) {
    return this.literal
      ? string
      : string.replace(/\\([nrt\\])/g, (_, ch) => (ch == 'n' ? '\n' : ch == 'r' ? '\r' : ch == 't' ? '\t' : '\\'));
  }
  /**
    Get the ranges that should be replaced for this result. This can
    return multiple ranges when `this.replace` contains
    `$1`/`$&`-style placeholders, in which case the preserved
    content is skipped by the replacements.
    
    Ranges are sorted by position, and `from`/`to` positions all
    refer to positions in `state.doc`. When applying these, you'll
    want to either apply them from back to front, or map these
    positions through your transaction's current mapping.
    */
  getReplacements(state, result) {
    let $from = state.doc.resolve(result.from);
    let marks = $from.marksAcross(state.doc.resolve(result.to));
    let ranges = [];
    let frag = Fragment.empty,
      pos = result.from,
      { match } = result;
    let groups = match ? getGroupIndices(match) : [[0, result.to - result.from]];
    let replParts = parseReplacement(this.unquote(this.replace));
    for (let part of replParts) {
      if (typeof part == 'string') {
        // Replacement text
        frag = frag.addToEnd(state.schema.text(part, marks));
      } else {
        const groupSpan = groups[part.group];
        if (!groupSpan) continue;
        let from = result.matchStart + groupSpan[0],
          to = result.matchStart + groupSpan[1];
        if (part.copy) {
          // Copied content
          frag = frag.append(state.doc.slice(from, to).content);
        } else {
          // Skipped content
          if (frag != Fragment.empty || from > pos) {
            ranges.push({ from: pos, to: from, insert: new Slice(frag, 0, 0) });
            frag = Fragment.empty;
          }
          pos = to;
        }
      }
    }
    if (frag != Fragment.empty || pos < result.to)
      ranges.push({ from: pos, to: result.to, insert: new Slice(frag, 0, 0) });
    return ranges;
  }
}
const nullQuery = new (class {
  findNext() {
    return null;
  }
  findPrev() {
    return null;
  }
})();
class StringQuery {
  constructor(query) {
    this.query = query;
    let string = query.unquote(query.search);
    if (!query.caseSensitive) string = string.toLowerCase();
    this.string = string;
  }
  findNext(state, from, to) {
    return scanTextblocks(state.doc, from, to, (node, start) => {
      let off = Math.max(from, start);
      let content = textContent(node).slice(off - start, Math.min(node.content.size, to - start));
      let index = (this.query.caseSensitive ? content : content.toLowerCase()).indexOf(this.string);
      if (index < 0) return null;
      const startOffset = off - start;
      const absoluteIndex = startOffset + index;
      const fromPos = mapIndexToDocPos(node, start, absoluteIndex);
      const toPos = mapIndexToDocPos(node, start, absoluteIndex + this.string.length);
      return { from: fromPos, to: toPos, match: null, matchStart: start };
    });
  }
  findPrev(state, from, to) {
    return scanTextblocks(state.doc, from, to, (node, start) => {
      let off = Math.max(start, to);
      let content = textContent(node).slice(off - start, Math.min(node.content.size, from - start));
      if (!this.query.caseSensitive) content = content.toLowerCase();
      let index = content.lastIndexOf(this.string);
      if (index < 0) return null;
      const startOffset = off - start;
      const absoluteIndex = startOffset + index;
      const fromPos = mapIndexToDocPos(node, start, absoluteIndex);
      const toPos = mapIndexToDocPos(node, start, absoluteIndex + this.string.length);
      return { from: fromPos, to: toPos, match: null, matchStart: start };
    });
  }
}
const baseFlags = 'g' + (/x/.unicode == null ? '' : 'u') + (/x/.hasIndices == null ? '' : 'd');
class RegExpQuery {
  constructor(query) {
    this.query = query;
    this.regexp = new RegExp(query.search, baseFlags + (query.caseSensitive ? '' : 'i'));
  }
  findNext(state, from, to) {
    return scanTextblocks(state.doc, from, to, (node, start) => {
      let content = textContent(node).slice(0, Math.min(node.content.size, to - start));
      this.regexp.lastIndex = from - start;
      let match = this.regexp.exec(content);
      if (!match) return null;
      const absoluteIndex = match.index;
      const fromPos = mapIndexToDocPos(node, start, absoluteIndex);
      const toPos = mapIndexToDocPos(node, start, absoluteIndex + match[0].length);
      return { from: fromPos, to: toPos, match, matchStart: start };
    });
  }
  findPrev(state, from, to) {
    return scanTextblocks(state.doc, from, to, (node, start) => {
      let content = textContent(node).slice(0, Math.min(node.content.size, from - start));
      let match;
      for (let off = 0; ; ) {
        this.regexp.lastIndex = off;
        let next = this.regexp.exec(content);
        if (!next) break;
        match = next;
        off = next.index + 1;
      }
      if (!match) return null;
      const absoluteIndex = match.index;
      const fromPos = mapIndexToDocPos(node, start, absoluteIndex);
      const toPos = mapIndexToDocPos(node, start, absoluteIndex + match[0].length);
      return { from: fromPos, to: toPos, match, matchStart: start };
    });
  }
}
function getGroupIndices(match) {
  if (match.indices) return match.indices;
  let result = [[0, match[0].length]];
  for (let i = 1, pos = 0; i < match.length; i++) {
    let found = match[i] ? match[0].indexOf(match[i], pos) : -1;
    result.push(found < 0 ? undefined : [found, (pos = found + match[i].length)]);
  }
  return result;
}
function parseReplacement(text) {
  let result = [],
    highestSeen = -1;
  function add(text) {
    let last = result.length - 1;
    if (last > -1 && typeof result[last] == 'string') result[last] += text;
    else result.push(text);
  }
  while (text.length) {
    let m = /\$([$&\d+])/.exec(text);
    if (!m) {
      add(text);
      return result;
    }
    if (m.index > 0) add(text.slice(0, m.index + (m[1] == '$' ? 1 : 0)));
    if (m[1] != '$') {
      let n = m[1] == '&' ? 0 : +m[1];
      if (highestSeen >= n) {
        result.push({ group: n, copy: true });
      } else {
        highestSeen = n || 1000;
        result.push({ group: n, copy: false });
      }
    }
    text = text.slice(m.index + m[0].length);
  }
  return result;
}
function validRegExp(source) {
  try {
    new RegExp(source, baseFlags);
    return true;
  } catch {
    return false;
  }
}
const TextContentCache = new WeakMap();
const transparentInlineNodes = new Set(['run', 'bookmarkStart']);
function textContent(node) {
  let cached = TextContentCache.get(node);
  if (cached) return cached;
  let content = '';
  for (let i = 0; i < node.childCount; i++) {
    let child = node.child(i);
    if (child.isText) content += child.text;
    else if (child.isLeaf) content += '\ufffc';
    else if (child.type && transparentInlineNodes.has(child.type.name)) content += textContent(child);
    else content += ' ' + textContent(child) + ' ';
  }
  TextContentCache.set(node, content);
  return content;
}
/**
 * Maps a text content index to a ProseMirror document position.
 * Handles transparent inline nodes (like 'run', 'bookmarkStart') that don't
 * contribute text boundaries, and block nodes that add space padding.
 *
 * @param {Node} node - The ProseMirror node to search within
 * @param {number} start - The document position where this node starts
 * @param {number} index - The index within the flattened text content (as returned by textContent())
 * @returns {number} The corresponding document position
 */
function mapIndexToDocPos(node, start, index) {
  if (index <= 0) return start;
  const fullTextLength = textContent(node).length;
  if (index >= fullTextLength) return start + node.content.size;
  return mapIndexWithinNode(node, start, index);
}
/**
 * Recursively maps a text content index to a document position by iterating through child nodes.
 * This function handles different node types:
 * - Text nodes: contribute their text length
 * - Leaf nodes: contribute 1 character (represented as '\ufffc' in textContent)
 * - Transparent inline nodes: contribute their inner text without boundary padding
 * - Block nodes: contribute ' ' + innerText + ' ' (2 extra characters for boundaries)
 *
 * @param {Node} node - The ProseMirror node to search within
 * @param {number} start - The document position where this node starts
 * @param {number} index - The remaining index to map (relative to this node's text content)
 * @returns {number} The corresponding document position
 */
function mapIndexWithinNode(node, start, index) {
  if (index <= 0) return start;
  let offset = start;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    const childStart = offset;
    if (child.isText) {
      const len = child.text.length;
      if (index <= len) return childStart + index;
      index -= len;
      offset += child.nodeSize;
      continue;
    }

    // Leaf nodes (e.g., images, hard breaks) contribute 1 character ('\ufffc') in textContent
    if (child.isLeaf) {
      // If index points within this leaf node's contribution (0 or 1), return the position
      // Math.min ensures we don't go past the node's size (defensive coding)
      if (index <= 1) return childStart + Math.min(index, 1);
      // Otherwise, skip past this leaf node
      index -= 1;
      offset += child.nodeSize;
      continue;
    }

    const isTransparentInline = child.inlineContent && child.type && transparentInlineNodes.has(child.type.name);
    const innerTextLength = textContent(child).length;

    // Transparent inline nodes (e.g., 'run', 'bookmarkStart') contribute only their inner text
    // without adding boundary spaces, making them invisible wrappers for search purposes
    if (isTransparentInline) {
      // If index is within this transparent node's content, recurse into it
      // childStart + 1 accounts for the node's opening position
      if (index <= innerTextLength) return mapIndexWithinNode(child, childStart + 1, index);
      // Otherwise, skip past this transparent node's contribution
      index -= innerTextLength;
      offset += child.nodeSize;
      continue;
    }

    // Block nodes contribute: ' ' (leading) + innerText + ' ' (trailing) = innerTextLength + 2
    const contribution = innerTextLength + 2;
    // Subtract 1 to account for the leading space that precedes the block node's content
    const relativeIndex = index - 1;

    // If index points to the leading space character, return position before the block node's content
    if (relativeIndex < 0) return childStart;

    // If index is within the block node's inner text, recurse into the child
    // childStart + 1 skips past the opening boundary of the block node
    if (relativeIndex <= innerTextLength) {
      return mapIndexWithinNode(child, childStart + 1, relativeIndex);
    }

    // If index points to the trailing space (right after the block's inner content)
    if (relativeIndex === innerTextLength + 1) return childStart + child.nodeSize;

    // Index is beyond this block node, subtract its full contribution and continue
    index -= contribution;
    offset += child.nodeSize;
  }
  return start + node.content.size;
}
function scanTextblocks(node, from, to, f, nodeStart = 0) {
  const isTransparentInline = node.inlineContent && node.type && transparentInlineNodes.has(node.type.name);
  if (node.inlineContent && !isTransparentInline) {
    return f(node, nodeStart);
  } else if (!node.isLeaf) {
    if (from > to) {
      for (let i = node.childCount - 1, pos = nodeStart + node.content.size; i >= 0 && pos > to; i--) {
        let child = node.child(i);
        pos -= child.nodeSize;
        if (pos < from) {
          let result = scanTextblocks(child, from, to, f, pos + 1);
          if (result != null) return result;
        }
      }
    } else {
      for (let i = 0, pos = nodeStart; i < node.childCount && pos < to; i++) {
        let child = node.child(i),
          start = pos;
        pos += child.nodeSize;
        if (pos > from) {
          let result = scanTextblocks(child, from, to, f, start + 1);
          if (result != null) return result;
        }
      }
    }
  }
  return null;
}
function checkWordBoundary(state, pos) {
  let $pos = state.doc.resolve(pos);
  let before = $pos.nodeBefore,
    after = $pos.nodeAfter;
  if (!before || !after || !before.isText || !after.isText) return true;
  return !/\p{L}$/u.test(before.text) || !/^\p{L}/u.test(after.text);
}

/**
 * Represents the state of the search plugin, including the active query,
 * search range, highlight setting, and decoration set for rendering matches.
 */
class SearchState {
  /**
   * Create a new SearchState instance.
   *
   * @param {SearchQuery} query - The search query to execute
   * @param {{from: number, to: number}|null} range - Optional range to restrict search to, or null for entire document
   * @param {boolean} highlight - Whether to apply CSS classes for visual highlighting of matches
   * @param {DecorationSet} deco - The decoration set containing match highlights
   */
  constructor(query, range, highlight, deco) {
    this.query = query;
    this.range = range;
    this.highlight = highlight;
    this.deco = deco;
  }
}

/**
 * Builds a decoration set for all search matches in the document or range.
 *
 * This function finds all occurrences of the search query and creates inline
 * decorations for each match. When highlighting is enabled, decorations include
 * CSS classes for visual styling. When disabled, decorations are created without
 * attributes (allowing match tracking without visual styling).
 *
 * @param {EditorState} state - The current ProseMirror editor state
 * @param {SearchQuery} query - The search query to find matches for
 * @param {{from: number, to: number}|null} range - Optional range to restrict search, or null for entire document
 * @param {boolean} [highlight=true] - Whether to apply CSS classes for visual highlighting
 * @returns {DecorationSet} A decoration set containing all match decorations
 */
function buildMatchDeco(state, query, range, highlight = true) {
  if (!query.valid) return DecorationSet.empty;
  let deco = [];
  let sel = state.selection;
  for (let pos = range ? range.from : 0, end = range ? range.to : state.doc.content.size; ; ) {
    let next = query.findNext(state, pos, end);
    if (!next) break;
    let cls =
      next.from == sel.from && next.to == sel.to ? 'ProseMirror-active-search-match' : 'ProseMirror-search-match';
    // When highlight is false, create decorations with empty attributes to track matches without visual styling
    const attrs = highlight ? { class: cls } : {};
    deco.push(Decoration.inline(next.from, next.to, attrs));
    pos = next.to;
  }
  return DecorationSet.create(state.doc, deco);
}
const searchKey = new PluginKey('search');
/**
Returns a plugin that stores a current search query and searched
range, and highlights matches of the query.
*/
function search(options = {}) {
  return new Plugin({
    key: searchKey,
    state: {
      init(_config, state) {
        let query = options.initialQuery || new SearchQuery({ search: '' });
        let range = options.initialRange || null;
        const highlight = options.initialHighlight ?? true;
        return new SearchState(query, range, highlight, buildMatchDeco(state, query, range, highlight));
      },
      apply(tr, search, _oldState, state) {
        let set = tr.getMeta(searchKey);
        if (set) {
          // Validate and normalize highlight value from transaction metadata
          const highlight = typeof set.highlight === 'boolean' ? set.highlight : true;
          return new SearchState(
            set.query,
            set.range,
            highlight,
            buildMatchDeco(state, set.query, set.range, highlight),
          );
        }
        if (tr.docChanged || tr.selectionSet) {
          let range = search.range;
          if (range) {
            let from = tr.mapping.map(range.from, 1);
            let to = tr.mapping.map(range.to, -1);
            range = from < to ? { from, to } : null;
          }
          // Validate and preserve highlight setting from existing state with nullish coalescing fallback
          const highlight = typeof search.highlight === 'boolean' ? search.highlight : true;
          search = new SearchState(
            search.query,
            range,
            highlight,
            buildMatchDeco(state, search.query, range, highlight),
          );
        }
        return search;
      },
    },
    props: {
      decorations: (state) => searchKey.getState(state).deco,
    },
  });
}
/**
Get the current active search query and searched range. Will
return `undefined` is the search plugin isn't active.
*/
function getSearchState(state) {
  return searchKey.getState(state);
}
/**
Access the decoration set holding the currently highlighted search
matches in the document.
*/
function getMatchHighlights(state) {
  let search = searchKey.getState(state);
  return search ? search.deco : DecorationSet.empty;
}

/**
 * Options for setSearchState function.
 * @typedef {Object} SetSearchStateOptions
 * @property {boolean} [highlight=true] - Whether to apply CSS classes for visual highlighting of search matches.
 *   When true, matches are decorated with 'ProseMirror-search-match' or 'ProseMirror-active-search-match' classes.
 *   When false, matches are tracked in decorations without visual styling classes.
 */

/**
 * Add metadata to a transaction that updates the active search query
 * and searched range, when dispatched.
 *
 * @param {Transaction} tr - The transaction to add metadata to
 * @param {SearchQuery} query - The search query to set
 * @param {{from: number, to: number}|null} [range=null] - Optional range to restrict search, or null for entire document
 * @param {SetSearchStateOptions} [options={}] - Additional options for search behavior
 * @returns {Transaction} The transaction with search metadata added
 * @throws {TypeError} If options is not null/undefined and not an object
 */
function setSearchState(tr, query, range = null, options = {}) {
  // Validate options parameter - must be an object if provided
  if (options != null && (typeof options !== 'object' || Array.isArray(options))) {
    throw new TypeError('setSearchState options must be an object');
  }

  // Extract and validate highlight option with nullish coalescing fallback
  const highlight = typeof options?.highlight === 'boolean' ? options.highlight : true;

  return tr.setMeta(searchKey, { query, range, highlight });
}
function nextMatch(search, state, wrap, curFrom, curTo) {
  let range = search.range || { from: 0, to: state.doc.content.size };
  let next = search.query.findNext(state, Math.max(curTo, range.from), range.to);
  if (!next && wrap) next = search.query.findNext(state, range.from, Math.min(curFrom, range.to));
  return next;
}
function prevMatch(search, state, wrap, curFrom, curTo) {
  let range = search.range || { from: 0, to: state.doc.content.size };
  let prev = search.query.findPrev(state, Math.min(curFrom, range.to), range.from);
  if (!prev && wrap) prev = search.query.findPrev(state, range.to, Math.max(curTo, range.from));
  return prev;
}
function findCommand(wrap, dir) {
  return (state, dispatch) => {
    let search = searchKey.getState(state);
    if (!search || !search.query.valid) return false;
    let { from, to } = state.selection;
    let next = dir > 0 ? nextMatch(search, state, wrap, from, to) : prevMatch(search, state, wrap, from, to);
    if (!next) return false;
    let selection = TextSelection.create(state.doc, next.from, next.to);
    if (dispatch) dispatch(state.tr.setSelection(selection).scrollIntoView());
    return true;
  };
}
/**
Find the next instance of the search query after the current
selection and move the selection to it.
*/
const findNext = findCommand(true, 1);
/**
Find the next instance of the search query and move the selection
to it. Don't wrap around at the end of document or search range.
*/
const findNextNoWrap = findCommand(false, 1);
/**
Find the previous instance of the search query and move the
selection to it.
*/
const findPrev = findCommand(true, -1);
/**
Find the previous instance of the search query and move the
selection to it. Don't wrap at the start of the document or search
range.
*/
const findPrevNoWrap = findCommand(false, -1);
function replaceCommand(wrap, moveForward) {
  return (state, dispatch) => {
    let search = searchKey.getState(state);
    if (!search || !search.query.valid) return false;
    let { from } = state.selection;
    let next = nextMatch(search, state, wrap, from, from);
    if (!next) return false;
    if (!dispatch) return true;
    if (state.selection.from == next.from && state.selection.to == next.to) {
      let tr = state.tr,
        replacements = search.query.getReplacements(state, next);
      for (let i = replacements.length - 1; i >= 0; i--) {
        let { from, to, insert } = replacements[i];
        tr.replace(from, to, insert);
      }
      let after = moveForward && nextMatch(search, state, wrap, next.from, next.to);
      if (after)
        tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(after.from, 1), tr.mapping.map(after.to, -1)));
      else tr.setSelection(TextSelection.create(tr.doc, next.from, tr.mapping.map(next.to, 1)));
      dispatch(tr.scrollIntoView());
    } else if (!moveForward) {
      return false;
    } else {
      dispatch(state.tr.setSelection(TextSelection.create(state.doc, next.from, next.to)).scrollIntoView());
    }
    return true;
  };
}
/**
Replace the currently selected instance of the search query, and
move to the next one. Or select the next match, if none is already
selected.
*/
const replaceNext = replaceCommand(true, true);
/**
Replace the next instance of the search query. Don't wrap around
at the end of the document.
*/
const replaceNextNoWrap = replaceCommand(false, true);
/**
Replace the currently selected instance of the search query, if
any, and keep it selected.
*/
const replaceCurrent = replaceCommand(false, false);
/**
Replace all instances of the search query.
*/
const replaceAll = (state, dispatch) => {
  let search = searchKey.getState(state);
  if (!search) return false;
  let matches = [],
    range = search.range || { from: 0, to: state.doc.content.size };
  for (let pos = range.from; ; ) {
    let next = search.query.findNext(state, pos, range.to);
    if (!next) break;
    matches.push(next);
    pos = next.to;
  }
  if (dispatch) {
    let tr = state.tr;
    for (let i = matches.length - 1; i >= 0; i--) {
      let match = matches[i];
      let replacements = search.query.getReplacements(state, match);
      for (let j = replacements.length - 1; j >= 0; j--) {
        let { from, to, insert } = replacements[j];
        tr.replace(from, to, insert);
      }
    }
    dispatch(tr);
  }
  return true;
};

export {
  SearchQuery,
  findNext,
  findNextNoWrap,
  findPrev,
  findPrevNoWrap,
  getMatchHighlights,
  getSearchState,
  replaceAll,
  replaceCurrent,
  replaceNext,
  replaceNextNoWrap,
  search,
  setSearchState,
};
export const __searchTextContent = textContent;
