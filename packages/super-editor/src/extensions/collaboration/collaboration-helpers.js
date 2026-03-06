// In-flight deduplication: if an export is already running for this (editor, ydoc)
// pair, subsequent calls return the same promise instead of spawning a parallel export.
// Keyed as editor → WeakMap<ydoc, promise> so that calls targeting different ydoc
// instances (e.g. generateCollaborationData's temp ydoc vs editor.options.ydoc) each
// get their own export run.
const inFlightUpdates = new WeakMap();

/**
 * Update the Ydoc document data with the latest Docx XML.
 *
 * Deduplicates concurrent calls for the same (editor, ydoc) pair — if an
 * export is already in progress for that exact target, the existing promise is
 * returned instead of starting a second expensive exportDocx() call.
 *
 * @param {Editor} editor The editor instance
 * @param {import('yjs').Doc} [ydoc] Target ydoc (defaults to editor.options.ydoc)
 * @returns {Promise<void>}
 */
export const updateYdocDocxData = (editor, ydoc) => {
  ydoc = ydoc || editor?.options?.ydoc;
  if (!ydoc || ydoc.isDestroyed) return Promise.resolve();
  if (!editor || editor.isDestroyed) return Promise.resolve();

  let ydocMap = inFlightUpdates.get(editor);
  if (!ydocMap) {
    ydocMap = new WeakMap();
    inFlightUpdates.set(editor, ydocMap);
  }

  const existing = ydocMap.get(ydoc);
  if (existing) {
    return existing;
  }

  const promise = _doUpdateYdocDocxData(editor, ydoc).finally(() => {
    const map = inFlightUpdates.get(editor);
    if (map && map.get(ydoc) === promise) {
      map.delete(ydoc);
    }
  });

  ydocMap.set(ydoc, promise);
  return promise;
};

const _doUpdateYdocDocxData = async (editor, ydoc) => {
  try {
    const metaMap = ydoc.getMap('meta');
    const docxValue = metaMap.get('docx');

    let docx = [];
    if (Array.isArray(docxValue)) {
      docx = [...docxValue];
    } else if (docxValue && typeof docxValue.toArray === 'function') {
      docx = docxValue.toArray();
    } else if (docxValue && typeof docxValue[Symbol.iterator] === 'function') {
      docx = Array.from(docxValue);
    }

    if (!docx.length && Array.isArray(editor.options.content)) {
      docx = [...editor.options.content];
    }

    const newXml = await editor.exportDocx({ getUpdatedDocs: true });
    if (!newXml || typeof newXml !== 'object') return;

    let hasChanges = false;

    Object.keys(newXml).forEach((key) => {
      const fileIndex = docx.findIndex((item) => item.name === key);
      const existingContent = fileIndex > -1 ? docx[fileIndex].content : null;
      const newContent = newXml[key];

      // Skip if content hasn't changed
      if (existingContent === newContent) {
        return;
      }

      hasChanges = true;
      if (fileIndex > -1) {
        docx.splice(fileIndex, 1);
      }

      // A null value means the file was deleted during export (e.g. comment
      // parts removed).  Only add entries with real content — pushing
      // { content: null } would crash parseXmlToJson on next hydration.
      if (newContent != null) {
        docx.push({
          name: key,
          content: newContent,
        });
      }
    });

    // Only transact if there were actual changes OR this is initial setup.
    // Re-check ydoc/editor after the async export — they may have been
    // destroyed while exportDocx was running.
    if ((hasChanges || !docxValue) && !ydoc.isDestroyed && !editor.isDestroyed) {
      ydoc.transact(
        () => {
          metaMap.set('docx', docx);
        },
        { event: 'docx-update', user: editor.options.user },
      );
    }
  } catch (error) {
    console.warn('[collaboration] Failed to update Ydoc docx data', error);
  }
};

// ---------------------------------------------------------------------------
// Converter metadata real-time sync
// ---------------------------------------------------------------------------
//
// Generic mechanism to sync converter metadata (numbering, styles, and any
// future type) via a SINGLE Y.js map ('converterMeta'). Each metadata type
// is a key in the map. One observer, one flag, one event.
//
// To add a new metadata type:
//   1. Add a key constant to CONVERTER_META_KEYS
//   2. Add apply logic in applyRemoteConverterMetadata
//   3. Add a push trigger in collaboration.js (editor event → pushConverterMetadata)
//   4. Add getLocal logic in pushConverterMetadata
// ---------------------------------------------------------------------------

export const CONVERTER_META_KEYS = /** @type {const} */ (['numbering', 'styles', 'headerFooterIds']);

let isApplyingRemoteConverterMeta = false;

/**
 * Check if we're currently applying remote converter metadata.
 * Used to prevent push-back (ping-pong) when a remote change
 * triggers local events.
 */
export const isApplyingRemoteConverterMetadata = () => isApplyingRemoteConverterMeta;

/**
 * Push a specific converter metadata key to the shared Y.js map.
 *
 * @param {Editor} editor The editor instance
 * @param {typeof CONVERTER_META_KEYS[number]} key Which metadata to push
 */
export const pushConverterMetadata = (editor, key) => {
  if (isApplyingRemoteConverterMeta) return;

  const ydoc = editor?.options?.ydoc;
  if (!ydoc || ydoc.isDestroyed) return;
  if (!editor?.converter) return;

  const map = ydoc.getMap('converterMeta');
  let data;

  if (key === 'numbering') {
    data = {
      numbering: editor.converter.numbering,
      translatedNumbering: editor.converter.translatedNumbering,
    };
  } else if (key === 'styles') {
    data = {
      translatedLinkedStyles: editor.converter.translatedLinkedStyles,
    };
  } else if (key === 'headerFooterIds') {
    data = {
      headerIds: editor.converter.headerIds,
      footerIds: editor.converter.footerIds,
    };
  } else {
    return;
  }

  // Skip if unchanged — avoids redundant Y.js transacts (especially for
  // headerFooterIds which is triggered on every header keystroke but
  // almost never actually changes).
  const existing = map.get(key);
  if (existing && JSON.stringify(existing) === JSON.stringify(data)) {
    return;
  }

  ydoc.transact(() => map.set(key, data), {
    event: `converter-meta-${key}-update`,
    user: editor.options.user,
  });
};

/**
 * Push ALL converter metadata keys. Called once during initializeMetaMap
 * so joining clients receive the full state.
 *
 * @param {Editor} editor
 */
export const pushAllConverterMetadata = (editor) => {
  for (const key of CONVERTER_META_KEYS) {
    pushConverterMetadata(editor, key);
  }
};

/**
 * Apply remote converter metadata to the local editor.
 *
 * @param {Editor} editor
 * @param {string} key Which metadata was updated
 * @param {object} data The remote payload
 */
export const applyRemoteConverterMetadata = (editor, key, data) => {
  if (!editor || editor.isDestroyed || !editor.converter) return;
  if (!data) return;

  isApplyingRemoteConverterMeta = true;

  try {
    if (key === 'numbering') {
      if (data.numbering) editor.converter.numbering = data.numbering;
      if (data.translatedNumbering) editor.converter.translatedNumbering = data.translatedNumbering;
    } else if (key === 'styles') {
      if (data.translatedLinkedStyles) editor.converter.translatedLinkedStyles = data.translatedLinkedStyles;
    } else if (key === 'headerFooterIds') {
      if (data.headerIds) editor.converter.headerIds = data.headerIds;
      if (data.footerIds) editor.converter.footerIds = data.footerIds;
    }

    editor.emit('remoteConverterMetaChanged', { key, data });
  } finally {
    setTimeout(() => {
      isApplyingRemoteConverterMeta = false;
    }, 0);
  }
};

// ---------------------------------------------------------------------------
// Header/footer real-time sync
// ---------------------------------------------------------------------------
// Current approach: last-writer-wins with full JSON replacement.
// Future: CRDT-based sync (like y-prosemirror) for character-level merging.
let isApplyingRemoteChanges = false;

/**
 * Check if we're currently applying remote header/footer changes.
 * Used by other modules to skip pushing changes back to Yjs.
 */
export const isApplyingRemoteHeaderFooterChanges = () => isApplyingRemoteChanges;

/**
 * Push header/footer JSON content to Yjs for real-time sync.
 *
 * @param {Editor} editor The main editor instance
 * @param {string} type 'header' or 'footer'
 * @param {string} sectionId The rId of the header/footer
 * @param {object} content The ProseMirror JSON content
 */
export const pushHeaderFooterToYjs = (editor, type, sectionId, content) => {
  if (isApplyingRemoteChanges) return;

  const ydoc = editor?.options?.ydoc;
  if (!ydoc || ydoc.isDestroyed) return;

  const headerFooterMap = ydoc.getMap('headerFooterJson');
  const key = `${type}:${sectionId}`;

  // Skip if content unchanged
  const existing = headerFooterMap.get(key)?.content;
  if (existing && JSON.stringify(existing) === JSON.stringify(content)) {
    return;
  }

  // Include headerIds/footerIds in the same transaction so the receiver
  // gets both the content and the section-type mapping atomically.
  // Without this, the two Y.js maps (headerFooterJson + converterMeta)
  // can arrive in separate network messages, causing the receiver to have
  // content but no headerIds — the layout pipeline can't resolve which
  // header to render.
  const headerIds = editor.converter?.headerIds;
  const footerIds = editor.converter?.footerIds;

  ydoc.transact(
    () => {
      headerFooterMap.set(key, { type, sectionId, content, headerIds, footerIds });
    },
    {
      event: 'header-footer-update',
      user: editor.options.user,
    },
  );
};

/**
 * Push all headers and footers from the converter to the headerFooterJson
 * Y.js map. Called once during initializeMetaMap so joining clients receive
 * header/footer content immediately (not just after the 30s DOCX sync).
 *
 * Also pushes headerIds/footerIds so the receiving client knows which
 * headers/footers map to which section types (default, first, even, odd).
 *
 * @param {Editor} editor
 */
export const pushAllHeaderFooterToYjs = (editor) => {
  if (!editor?.converter) return;
  const { headers, footers } = editor.converter;
  if (headers) {
    for (const [sectionId, content] of Object.entries(headers)) {
      if (content) pushHeaderFooterToYjs(editor, 'header', sectionId, content);
    }
  }
  if (footers) {
    for (const [sectionId, content] of Object.entries(footers)) {
      if (content) pushHeaderFooterToYjs(editor, 'footer', sectionId, content);
    }
  }
};

/**
 * Apply remote header/footer changes to the local editor.
 *
 * @param {Editor} editor The main editor instance
 * @param {string} key The key in format 'type:sectionId'
 * @param {object} data The header/footer data { type, sectionId, content }
 */
export const applyRemoteHeaderFooterChanges = (editor, key, data) => {
  if (!editor || editor.isDestroyed || !editor.converter) return;

  const { type, sectionId, content, headerIds, footerIds } = data;
  if (!type || !sectionId || !content) return;

  // Prevent ping-pong: replaceContent triggers blur/update which would push back to Yjs
  isApplyingRemoteChanges = true;

  try {
    // Update converter storage
    const storage = editor.converter[`${type}s`];
    if (storage) storage[sectionId] = content;

    // Apply headerIds/footerIds atomically with the content so the layout
    // pipeline can resolve which header/footer to render immediately.
    if (headerIds) editor.converter.headerIds = headerIds;
    if (footerIds) editor.converter.footerIds = footerIds;

    // Mark as modified so exports include header/footer references
    editor.converter.headerFooterModified = true;

    // Update active editors
    const editors = editor.converter[`${type}Editors`];
    editors?.forEach((item) => {
      if (item.id === sectionId && item.editor) {
        item.editor.replaceContent(content);
      }
    });

    // Trigger PresentationEditor re-render
    editor.emit('remoteHeaderFooterChanged', { type, sectionId, content });
  } finally {
    // Allow synchronous handlers to complete before clearing flag
    setTimeout(() => {
      isApplyingRemoteChanges = false;
    }, 0);
  }
};
