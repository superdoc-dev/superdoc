import { TextSelection } from 'prosemirror-state';
import { sanitizeHref, UrlValidationConstants } from '@superdoc/url-validation';
import {
  findRelationshipIdFromTarget,
  insertNewRelationship,
} from '@core/super-converter/docx-helpers/document-rels.js';
import { mergeRanges } from '../../utils/rangeUtils.js';

/**
 * Prepend `https://` to bare `www.` URLs so they pass protocol validation.
 *
 * This is user-intent normalization — `sanitizeHref` correctly rejects bare
 * `www.` as a security boundary, so we add the protocol before calling it.
 *
 * @param {string} text
 * @returns {string}
 */
export function maybeAddProtocol(text) {
  return /^www\./i.test(text) ? `https://${text}` : text;
}

/**
 * Detect whether a pasted plain-text string is a single URL.
 *
 * Rejects strings with internal whitespace (not a bare URL).
 * Handles `www.` inputs by prepending `https://`.
 *
 * @param {string} text        Raw clipboard text
 * @param {string[]} protocols Extra protocols from link extension config
 * @returns {{ href: string } | null}
 */
export function detectPasteUrl(text, protocols = []) {
  const trimmed = text?.trim();
  if (!trimmed) return null;

  // A bare URL has no internal whitespace
  if (/\s/.test(trimmed)) return null;

  const withProtocol = maybeAddProtocol(trimmed);
  const allowedProtocols = buildAllowedProtocols(protocols);
  const result = sanitizeHref(withProtocol, { allowedProtocols });

  return result ? { href: result.href } : null;
}

/**
 * Whether the editor context allows writing to `word/_rels/document.xml.rels`.
 *
 * Child editors and header/footer editors need part-local rels that the export
 * step creates — writing to the main rels from those contexts is wrong.
 *
 * @param {object} editor
 * @returns {boolean}
 */
export function canAllocateRels(editor) {
  return editor.options.mode === 'docx' && !editor.options.isChildEditor && !editor.options.isHeaderOrFooter;
}

/**
 * Handle a plain-text paste that was detected as a URL.
 *
 * - Collapsed selection: inserts URL as text and applies link + underline marks.
 * - Non-collapsed text selection: keeps selected text and applies link mark with URL as href.
 * - Non-text selections (NodeSelection, CellSelection): not handled — return false.
 *
 * @param {object} editor    SuperEditor instance
 * @param {object} view      ProseMirror EditorView
 * @param {string} plainText The pasted text
 * @param {{ href: string }} detected Result from `detectPasteUrl`
 * @returns {boolean} Whether the paste was handled
 */
export function handlePlainTextUrlPaste(editor, view, plainText, detected) {
  const { state } = view;
  const { selection } = state;

  // Only apply link-on-selection for text selections. NodeSelection,
  // CellSelection, etc. should fall through to default paste handling.
  if (!(selection instanceof TextSelection)) return false;

  const linkMarkType = editor.schema.marks.link;
  const underlineMarkType = editor.schema.marks.underline;

  if (!linkMarkType) return false;

  const rId = allocateRelationshipId(editor, detected.href);

  let tr = state.tr;
  let from = selection.from;
  let to = selection.to;

  const trimmedText = plainText.trim();

  if (selection.empty) {
    // Insert the URL as visible text
    tr = tr.insertText(trimmedText, from);
    to = from + trimmedText.length;
  }
  // Non-collapsed text selection: keep existing selected text, just apply marks below

  tr = tr.addMark(from, to, linkMarkType.create({ href: detected.href, rId }));

  if (underlineMarkType) {
    tr = tr.addMark(from, to, underlineMarkType.create());
  }

  view.dispatch(tr.scrollIntoView());
  return true;
}

/**
 * Extract changed ranges from a single transaction's step maps.
 *
 * Unlike `collectChangedRanges` (which takes `Transaction[]` for
 * `appendedTransaction` use), this works on a single in-progress transaction.
 *
 * @param {import('prosemirror-state').Transaction} tr
 * @returns {{ from: number, to: number }[]}
 */
function getChangedRangesFromTransaction(tr) {
  const maps = tr.mapping?.maps;
  if (!maps?.length) return [];

  const ranges = [];

  maps.forEach((map) => {
    map.forEach((oldStart, oldEnd, newStart, newEnd) => {
      ranges.push({ from: newStart, to: newEnd });
    });
  });

  return mergeRanges(ranges, tr.doc.content.size);
}

/**
 * Normalize every link mark within the changed range of a paste transaction.
 *
 * - Strips untrusted pasted rIds
 * - Validates and sanitizes hrefs (including `www.` → `https://www.`)
 * - Removes link marks with no valid href and no anchor
 * - Allocates fresh rIds when appropriate (main docx editor only)
 *
 * Resolves extra protocols from the link extension config automatically
 * when `protocols` is not provided.
 *
 * Mutates `tr` in place. Call before dispatching.
 *
 * @param {import('prosemirror-state').Transaction} tr
 * @param {object} editor    SuperEditor instance
 * @param {Array<string | { scheme: string }>} [protocols] Extra allowed protocols (auto-resolved from editor if omitted)
 */
export function normalizePastedLinks(tr, editor, protocols) {
  const changedRanges = getChangedRangesFromTransaction(tr);
  if (!changedRanges.length) return;

  const linkMarkType = editor.schema.marks.link;
  if (!linkMarkType) return;

  const resolvedProtocols = protocols ?? resolveLinkProtocols(editor);
  const allowedProtocols = buildAllowedProtocols(resolvedProtocols);

  for (const { from, to } of changedRanges) {
    normalizeLinkMarksInRange(tr, editor, linkMarkType, from, to, allowedProtocols);
  }
}

/**
 * Resolve extra protocols from the link extension configuration.
 *
 * @param {object} editor
 * @returns {Array<string | { scheme: string }>}
 */
export function resolveLinkProtocols(editor) {
  const linkExt = editor.extensionService?.extensions?.find((e) => e.name === 'link');
  return linkExt?.options?.protocols ?? [];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Walk a range and normalize each link mark found.
 *
 * @param {import('prosemirror-state').Transaction} tr
 * @param {object} editor
 * @param {object} linkMarkType
 * @param {number} from
 * @param {number} to
 * @param {string[]} allowedProtocols
 */
function normalizeLinkMarksInRange(tr, editor, linkMarkType, from, to, allowedProtocols) {
  /** @type {{ from: number, to: number, mark: object }[]} */
  const linkSpans = [];

  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isInline) return;

    const linkMark = node.marks.find((m) => m.type === linkMarkType);
    if (!linkMark) return;

    linkSpans.push({
      from: pos,
      to: pos + node.nodeSize,
      mark: linkMark,
    });
  });

  // Process in reverse so position shifts don't invalidate earlier spans
  for (let i = linkSpans.length - 1; i >= 0; i--) {
    normalizeOneLinkMark(tr, editor, linkMarkType, linkSpans[i], allowedProtocols);
  }
}

/**
 * Normalize a single link mark span.
 *
 * @param {import('prosemirror-state').Transaction} tr
 * @param {object} editor
 * @param {object} linkMarkType
 * @param {{ from: number, to: number, mark: object }} span
 * @param {string[]} allowedProtocols
 */
function normalizeOneLinkMark(tr, editor, linkMarkType, span, allowedProtocols) {
  const { from, to, mark } = span;
  const attrs = { ...mark.attrs };

  // Never trust pasted rIds — they reference a different document's rels
  attrs.rId = null;

  const rawHref = attrs.href;
  const hasInternalRef = Boolean(attrs.anchor) || Boolean(attrs.name);

  // Links with an internal reference (anchor or name) but no href need no
  // href processing — just reapply the mark to strip the pasted rId.
  if (!rawHref && hasInternalRef) {
    tr.removeMark(from, to, linkMarkType);
    tr.addMark(from, to, linkMarkType.create(attrs));
    return;
  }

  // No href, no anchor, no name → meaningless link, remove it
  if (!rawHref) {
    tr.removeMark(from, to, linkMarkType);
    return;
  }

  const withProtocol = maybeAddProtocol(rawHref);
  const sanitized = sanitizeHref(withProtocol, { allowedProtocols });

  if (!sanitized) {
    // Invalid href → remove the link mark, text is preserved
    tr.removeMark(from, to, linkMarkType);
    return;
  }

  attrs.href = sanitized.href;

  if (canAllocateRels(editor)) {
    attrs.rId = allocateRelationshipId(editor, sanitized.href);
  }

  // Replace the old mark with the cleaned one
  tr.removeMark(from, to, linkMarkType);
  tr.addMark(from, to, linkMarkType.create(attrs));
}

/**
 * Try to reuse an existing relationship or create a new one.
 *
 * @param {object} editor
 * @param {string} href
 * @returns {string | null}
 */
function allocateRelationshipId(editor, href) {
  if (!canAllocateRels(editor)) return null;

  try {
    const existing = findRelationshipIdFromTarget(href, editor);
    if (existing) return existing;
    return insertNewRelationship(href, 'hyperlink', editor);
  } catch {
    return null;
  }
}

/**
 * Merge default allowed protocols with extras from the link extension config.
 *
 * Normalizes entries the same way the link extension does: accepts strings
 * (any case) and `{ scheme: string }` objects, lowercases everything.
 *
 * @param {Array<string | { scheme: string }>} extras
 * @returns {string[]}
 */
function buildAllowedProtocols(extras = []) {
  const normalized = normalizeProtocols(extras);
  return Array.from(new Set([...UrlValidationConstants.DEFAULT_ALLOWED_PROTOCOLS, ...normalized]));
}

/**
 * Convert protocol config entries into a flat array of lowercase strings.
 *
 * Mirrors the normalization in `link.js` so paste handles the same protocol
 * formats that the link extension accepts.
 *
 * @param {Array<string | { scheme: string }>} protocols
 * @returns {string[]}
 */
function normalizeProtocols(protocols = []) {
  const result = [];
  for (const entry of protocols) {
    if (!entry) continue;
    if (typeof entry === 'string' && entry.trim()) {
      result.push(entry.trim().toLowerCase());
    } else if (typeof entry === 'object' && typeof entry.scheme === 'string' && entry.scheme.trim()) {
      result.push(entry.scheme.trim().toLowerCase());
    }
  }
  return result;
}
