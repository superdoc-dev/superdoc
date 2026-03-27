/**
 * Authoritative room-seeding helper.
 *
 * Writes the full state of a local editor into a target Yjs document,
 * replacing any prior content. This is the single source of truth for
 * the "overwrite a room with local state" operation.
 *
 * Used by `SuperDoc.upgradeToCollaboration()` to seed a collaborative
 * room before the collaborative runtime mounts.
 */

import * as Y from 'yjs';
import { prosemirrorToYDoc } from 'y-prosemirror';
import type { Editor } from '../../core/Editor.js';
import { seedPartsFromEditor } from './part-sync/seed-parts.js';
import { META_MAP_KEY, MEDIA_MAP_KEY } from './part-sync/constants.js';

const FRAGMENT_NAME = 'supereditor';

/**
 * Authoritatively overwrite a Yjs document with the current editor state.
 *
 * This is a **replacement** operation, not a merge. All prior content in the
 * target ydoc (fragment, parts, media, metadata) is replaced with the
 * editor's current state.
 *
 * Steps:
 * 1. Replace the Yjs XML fragment with the current ProseMirror document
 * 2. Seed non-document parts with authoritative replacement
 * 3. Replace media files (prune stale, upsert current)
 * 4. Write document metadata (bodySectPr, fonts, bootstrap marker)
 * 5. Clear stale legacy content (meta.docx)
 */
export function seedEditorStateToYDoc(editor: Editor, targetYdoc: Y.Doc): void {
  replaceFragment(editor, targetYdoc);
  seedPartsFromEditor(editor, targetYdoc, { replaceExisting: true });
  replaceMedia(editor, targetYdoc);
  writeDocumentMetadata(editor, targetYdoc);
  clearLegacyContent(targetYdoc);
}

// ---------------------------------------------------------------------------
// Fragment
// ---------------------------------------------------------------------------

/**
 * Replace the Yjs XML fragment with the current PM document.
 *
 * Creates a temporary Y.Doc via `prosemirrorToYDoc`, encodes its full
 * state, then applies it to the target. The target fragment is cleared
 * first so the result is a clean replacement, not a CRDT merge.
 */
function replaceFragment(editor: Editor, targetYdoc: Y.Doc): void {
  const fragment = targetYdoc.getXmlFragment(FRAGMENT_NAME);

  if (fragment.length > 0) {
    targetYdoc.transact(() => {
      fragment.delete(0, fragment.length);
    });
  }

  const tempYdoc = prosemirrorToYDoc(editor.state.doc, FRAGMENT_NAME);
  try {
    Y.applyUpdate(targetYdoc, Y.encodeStateAsUpdate(tempYdoc));
  } finally {
    tempYdoc.destroy();
  }
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

/** Replace the media map — prune stale keys, upsert current files. */
function replaceMedia(editor: Editor, targetYdoc: Y.Doc): void {
  const mediaFiles = (editor.options as Record<string, unknown>).mediaFiles as Record<string, unknown> | undefined;
  const mediaMap = targetYdoc.getMap(MEDIA_MAP_KEY);

  targetYdoc.transact(() => {
    for (const key of [...mediaMap.keys()]) {
      if (!mediaFiles || !(key in mediaFiles)) {
        mediaMap.delete(key);
      }
    }

    if (mediaFiles) {
      for (const [key, value] of Object.entries(mediaFiles)) {
        mediaMap.set(key, value);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

/**
 * Write bodySectPr, fonts, and bootstrap marker to the meta map.
 *
 * Both bodySectPr and fonts are written unconditionally (even when null)
 * so that upgrading into a previously-seeded room replaces stale values
 * rather than leaving them behind.
 */
function writeDocumentMetadata(editor: Editor, targetYdoc: Y.Doc): void {
  const metaMap = targetYdoc.getMap(META_MAP_KEY);

  targetYdoc.transact(() => {
    const bodySectPr = editor.state?.doc?.attrs?.bodySectPr ?? null;
    metaMap.set('bodySectPr', bodySectPr ? JSON.parse(JSON.stringify(bodySectPr)) : null);

    const fonts = (editor.options as Record<string, unknown>).fonts ?? null;
    metaMap.set('fonts', fonts);

    metaMap.set('bootstrap', {
      version: 1,
      clientId: targetYdoc.clientID,
      seededAt: new Date().toISOString(),
      source: 'upgrade',
    });
  });
}

// ---------------------------------------------------------------------------
// Legacy cleanup
// ---------------------------------------------------------------------------

/** Remove stale legacy `meta.docx` blob if present. */
function clearLegacyContent(targetYdoc: Y.Doc): void {
  const metaMap = targetYdoc.getMap(META_MAP_KEY);
  if (metaMap.has('docx')) {
    metaMap.delete('docx');
  }
}
