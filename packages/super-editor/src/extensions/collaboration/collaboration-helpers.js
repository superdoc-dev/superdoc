/**
 * Files whose content is already synced via y-prosemirror XmlFragment.
 * When `excludeSyncedContent` is enabled, these are skipped in Y.Map storage
 * to avoid exceeding WebSocket message size limits.
 */
const CRDT_SYNCED_FILES = new Set(['word/document.xml']);

/**
 * Minimal placeholder for word/document.xml used when the file is excluded
 * from Y.Map storage (synced via XmlFragment instead). The converter needs
 * this file present to initialize its schema on joining clients.
 */
export const PLACEHOLDER_DOCUMENT_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"' +
  ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  '<w:body><w:p><w:r><w:t></w:t></w:r></w:p></w:body></w:document>';

/**
 * Returns true if a DOCX file should be synced to the Y.Map.
 * When `excludeSyncedContent` is enabled, files already synced via
 * y-prosemirror XmlFragment (e.g. word/document.xml) are excluded.
 *
 * @param {string} fileName
 * @param {boolean} excludeSyncedContent
 * @returns {boolean}
 */
export const shouldSyncFile = (fileName, excludeSyncedContent) => {
  if (excludeSyncedContent && CRDT_SYNCED_FILES.has(fileName)) return false;
  return true;
};

/**
 * Read existing docx file contents from Yjs.
 * Reads from the per-file Y.Map ('docxFiles') first, falling back to
 * the legacy monolithic array in metaMap ('docx').
 *
 * @param {Y.Doc} ydoc
 * @returns {Record<string, string>} Map of filename → XML content
 */
const readExistingDocxFiles = (ydoc) => {
  const existing = {};
  const docxFilesMap = ydoc.getMap('docxFiles');

  if (docxFilesMap.size > 0) {
    docxFilesMap.forEach((content, name) => {
      existing[name] = content;
    });
    return existing;
  }

  // Legacy fallback: monolithic array in metaMap
  const metaMap = ydoc.getMap('meta');
  const docxValue = metaMap.get('docx');
  if (!docxValue) return existing;

  let docx = [];
  if (Array.isArray(docxValue)) {
    docx = docxValue;
  } else if (docxValue && typeof docxValue.toArray === 'function') {
    docx = docxValue.toArray();
  } else if (docxValue && typeof docxValue[Symbol.iterator] === 'function') {
    docx = Array.from(docxValue);
  }

  docx.forEach((file) => {
    if (file?.name && file?.content) existing[file.name] = file.content;
  });
  return existing;
};

/**
 * Update the Ydoc document data with the latest Docx XML.
 *
 * Each DOCX file is stored as a separate entry in a Y.Map ('docxFiles')
 * so that each Yjs update message stays small. This avoids exceeding
 * WebSocket message size limits (e.g. Liveblocks' ~1 MB cap).
 *
 * @param {Editor} editor The editor instance
 * @returns {Promise<void>}
 */
export const updateYdocDocxData = async (editor, ydoc) => {
  try {
    ydoc = ydoc || editor?.options?.ydoc;
    if (!ydoc) return;
    if (!editor || editor.isDestroyed) return;

    const docxFilesMap = ydoc.getMap('docxFiles');
    const metaMap = ydoc.getMap('meta');
    const existingFiles = readExistingDocxFiles(ydoc);

    // Seed from editor content if nothing stored yet
    if (!Object.keys(existingFiles).length && Array.isArray(editor.options.content)) {
      editor.options.content.forEach((file) => {
        if (file?.name && file?.content) existingFiles[file.name] = file.content;
      });
    }

    const newXml = await editor.exportDocx({ getUpdatedDocs: true });
    if (!newXml || typeof newXml !== 'object') return;

    // Write each changed file as its own Y.Map entry (separate WS messages).
    const excludeSynced = !!editor.options.excludeSyncedContent;
    Object.keys(newXml).forEach((key) => {
      if (!shouldSyncFile(key, excludeSynced)) return;
      if (existingFiles[key] === newXml[key]) return;
      docxFilesMap.set(key, newXml[key]);
    });

    if (!metaMap.get('docxReady')) {
      metaMap.set('docxReady', true);
    }
  } catch (error) {
    console.warn('[collaboration] Failed to update Ydoc docx data', error);
  }
};

// Header/footer real-time sync
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
  if (!ydoc) return;

  const headerFooterMap = ydoc.getMap('headerFooterJson');
  const key = `${type}:${sectionId}`;

  // Skip if content unchanged
  const existing = headerFooterMap.get(key)?.content;
  if (existing && JSON.stringify(existing) === JSON.stringify(content)) {
    return;
  }

  ydoc.transact(() => headerFooterMap.set(key, { type, sectionId, content }), {
    event: 'header-footer-update',
    user: editor.options.user,
  });
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

  const { type, sectionId, content } = data;
  if (!type || !sectionId || !content) return;

  // Prevent ping-pong: replaceContent triggers blur/update which would push back to Yjs
  isApplyingRemoteChanges = true;

  try {
    // Update converter storage
    const storage = editor.converter[`${type}s`];
    if (storage) storage[sectionId] = content;

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
