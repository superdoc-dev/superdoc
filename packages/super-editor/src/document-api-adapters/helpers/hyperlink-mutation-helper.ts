/**
 * Dedicated hyperlink mark mutation helper for document-api.
 *
 * Builds raw ProseMirror transactions — does NOT reuse the editor's
 * setLink/unsetLink commands, which have UI-specific side effects
 * (auto-underline, selection expansion, display text fallback).
 */

import type { Editor } from '../../core/Editor.js';
import type { MarkType, Mark } from 'prosemirror-model';
import { findOrCreateRelationship } from '../../core/parts/adapters/relationships-mutation.js';
import { sanitizeHref } from '@superdoc/url-validation';
import { applyDirectMutationMeta } from './transaction-meta.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HyperlinkMarkAttrs {
  href?: string | null;
  anchor?: string | null;
  docLocation?: string | null;
  tooltip?: string | null;
  target?: string | null;
  rel?: string | null;
  rId?: string | null;
}

export interface HyperlinkWriteSpec {
  href?: string;
  anchor?: string;
  docLocation?: string;
  tooltip?: string;
  target?: string;
  rel?: string;
}

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

function getLinkMarkType(editor: Editor): MarkType {
  const markType = editor.schema.marks.link;
  if (!markType) {
    throw new Error('Link mark type is not defined in the editor schema.');
  }
  return markType;
}

function dispatchTransaction(editor: Editor, tr: import('prosemirror-state').Transaction): void {
  editor.dispatch(tr);
}

function dispatchIfChanged(editor: Editor, tr: import('prosemirror-state').Transaction): boolean {
  if (!tr.docChanged) return false;
  dispatchTransaction(editor, tr);
  return true;
}

/**
 * Creates an rId for an href in DOCX mode, returns null otherwise.
 */
function createRelationshipId(editor: Editor, href: string): string | null {
  if (editor.options.mode !== 'docx') return null;
  return findOrCreateRelationship(editor, 'hyperlink-mutation-helper:createRelationshipId', {
    target: href,
    type: 'hyperlink',
  });
}

/**
 * Validates and sanitizes an href string.
 * Returns the sanitized href or throws if the protocol is blocked.
 */
export function sanitizeHrefOrThrow(href: string): string {
  const result = sanitizeHref(href);
  if (!result) {
    throw Object.assign(new Error(`Blocked or invalid href: "${href}"`), { code: 'INVALID_INPUT' });
  }
  return result.href;
}

/**
 * Builds PM mark attrs from a hyperlink write spec.
 * Handles rId creation and anchor-to-href synthesis.
 */
export function buildMarkAttrs(editor: Editor, spec: HyperlinkWriteSpec): HyperlinkMarkAttrs {
  const attrs: HyperlinkMarkAttrs = {};

  if (spec.href) {
    attrs.href = sanitizeHrefOrThrow(spec.href);
    attrs.rId = createRelationshipId(editor, attrs.href);
  }

  if (spec.anchor) {
    attrs.anchor = spec.anchor;
    // Synthesize href for editor rendering compatibility when anchor-only
    if (!spec.href) {
      attrs.href = `#${spec.anchor}`;
    }
  }

  if (spec.docLocation) attrs.docLocation = spec.docLocation;
  if (spec.tooltip) attrs.tooltip = spec.tooltip;
  if (spec.target) attrs.target = spec.target;
  if (spec.rel) attrs.rel = spec.rel;

  return attrs;
}

// ---------------------------------------------------------------------------
// Wrap: apply link mark to existing text range
// ---------------------------------------------------------------------------

export function wrapWithLink(editor: Editor, from: number, to: number, spec: HyperlinkWriteSpec): boolean {
  const linkMarkType = getLinkMarkType(editor);
  const attrs = buildMarkAttrs(editor, spec);
  const tr = editor.state.tr;
  tr.addMark(from, to, linkMarkType.create(attrs));
  applyDirectMutationMeta(tr);
  dispatchTransaction(editor, tr);
  return true;
}

// ---------------------------------------------------------------------------
// Insert: insert text with link mark
// ---------------------------------------------------------------------------

export function insertLinkedText(editor: Editor, pos: number, text: string, spec: HyperlinkWriteSpec): boolean {
  const linkMarkType = getLinkMarkType(editor);
  const attrs = buildMarkAttrs(editor, spec);
  const tr = editor.state.tr;
  const mark = linkMarkType.create(attrs);
  tr.insertText(text, pos);
  // Apply link mark over the inserted text range
  tr.addMark(pos, pos + text.length, mark);
  applyDirectMutationMeta(tr);
  dispatchTransaction(editor, tr);
  return true;
}

// ---------------------------------------------------------------------------
// Patch: update mark attrs on existing link
// ---------------------------------------------------------------------------

export interface PatchLinkAttrs {
  href?: string | null;
  anchor?: string | null;
  docLocation?: string | null;
  tooltip?: string | null;
  target?: string | null;
  rel?: string | null;
}

export function patchLinkMark(
  editor: Editor,
  from: number,
  to: number,
  existingMark: Mark,
  patch: PatchLinkAttrs,
): boolean {
  const linkMarkType = getLinkMarkType(editor);
  const oldAttrs = existingMark.attrs as Record<string, unknown>;

  // Merge patch onto existing attrs
  const merged: Record<string, unknown> = { ...oldAttrs };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue; // omitted = no change
    if (value === null) {
      merged[key] = null; // explicit clear
    } else {
      merged[key] = value;
    }
  }

  // Handle href sanitization for new href values
  if (typeof patch.href === 'string') {
    merged.href = sanitizeHrefOrThrow(patch.href);
    merged.rId = createRelationshipId(editor, merged.href as string);
  }

  // Handle anchor-only: synthesize href when href was explicitly cleared
  if (patch.href === null && typeof merged.anchor === 'string') {
    merged.href = `#${merged.anchor}`;
    merged.rId = null;
  }

  // Re-synthesize href when anchor changes and existing href is synthetic (#-prefixed).
  // Without this, changing anchor from "old" to "new" would leave href as "#old".
  if (typeof patch.anchor === 'string' && patch.href === undefined) {
    const currentHref = merged.href;
    if (typeof currentHref === 'string' && currentHref.startsWith('#')) {
      merged.href = `#${patch.anchor}`;
    }
  }

  // Handle anchor-to-href transition: clear anchor if href is set and anchor is cleared
  if (patch.anchor === null && typeof merged.href === 'string' && !merged.href.startsWith('#')) {
    merged.anchor = null;
  }

  const tr = editor.state.tr;
  tr.removeMark(from, to, existingMark);
  tr.addMark(from, to, linkMarkType.create(merged));
  applyDirectMutationMeta(tr);
  return dispatchIfChanged(editor, tr);
}

// ---------------------------------------------------------------------------
// Remove: unwrap (preserve text) or delete text
// ---------------------------------------------------------------------------

export function unwrapLink(editor: Editor, from: number, to: number): boolean {
  const linkMarkType = getLinkMarkType(editor);
  const tr = editor.state.tr;
  tr.removeMark(from, to, linkMarkType);
  applyDirectMutationMeta(tr);
  return dispatchIfChanged(editor, tr);
}

export function deleteLinkedText(editor: Editor, from: number, to: number): boolean {
  const tr = editor.state.tr;
  tr.delete(from, to);
  applyDirectMutationMeta(tr);
  dispatchTransaction(editor, tr);
  return true;
}
