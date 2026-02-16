/**
 * Files whose content is already synced via y-prosemirror XmlFragment.
 * These are automatically skipped in Y.Map storage during collaboration
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
 * Files already synced via y-prosemirror XmlFragment (e.g. word/document.xml)
 * are automatically excluded during collaboration.
 *
 * @param {string} fileName
 * @returns {boolean}
 */
export const shouldSyncFile = (fileName) => {
  if (CRDT_SYNCED_FILES.has(fileName)) return false;
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

    // When the file owner uploads/replaces a file, write ALL files from the
    // new content to docxFilesMap synchronously (before any await). This is
    // critical because:
    // 1. replaceFile does NOT await this function — only synchronous code runs
    //    before Y.encodeStateAsUpdate captures the state
    // 2. exportDocx({ getUpdatedDocs: true }) only returns editor-changed files,
    //    NOT static XML like headers, footers, rels, themes, etc.
    // 3. The old seeding logic only triggered when docxFilesMap was empty, but
    //    after replaceFile the blank doc's files already populate it
    if (editor.options.isNewFile && Array.isArray(editor.options.content)) {
      const documentXml = editor.options.content.find((f) => f.name === 'word/document.xml')?.content;
      const sectPrXml = extractBodySectPr(documentXml);
      if (sectPrXml && sectPrXml !== metaMap.get('bodySectPr')) {
        metaMap.set('bodySectPr', sectPrXml);
      }

      // Write every file from the new content to docxFilesMap
      editor.options.content.forEach((file) => {
        if (file?.name && file?.content && shouldSyncFile(file.name)) {
          docxFilesMap.set(file.name, file.content);
        }
      });
    }

    const isNewFormat = docxFilesMap.size > 0;
    const existingFiles = readExistingDocxFiles(ydoc);

    // Seed from editor content if nothing stored yet (first load, no replaceFile)
    if (!Object.keys(existingFiles).length && Array.isArray(editor.options.content)) {
      editor.options.content.forEach((file) => {
        if (file?.name && file?.content) existingFiles[file.name] = file.content;
      });
    }

    // Migrate legacy format: copy ALL files to per-file Y.Map before updating.
    // Without this, static assets (themes, fontTable, docProps) would be lost
    // because exportDocx({ getUpdatedDocs: true }) only returns changed files.
    if (!isNewFormat && Object.keys(existingFiles).length > 0) {
      Object.entries(existingFiles).forEach(([name, content]) => {
        if (shouldSyncFile(name)) {
          docxFilesMap.set(name, content);
        }
      });
      // Delete the legacy monolithic array to free up space in the Y.Doc.
      if (metaMap.has('docx')) {
        metaMap.delete('docx');
      }
    }

    const newXml = await editor.exportDocx({ getUpdatedDocs: true });
    if (!newXml || typeof newXml !== 'object') return;

    // Write each changed file as its own Y.Map entry (separate WS messages).
    Object.keys(newXml).forEach((key) => {
      if (!shouldSyncFile(key)) return;
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

/**
 * Extract the body-level <w:sectPr> element from a document.xml string.
 * This contains header/footer references, page size, margins, and other
 * section properties needed by joining collaboration clients.
 *
 * @param {string} documentXml The raw XML content of word/document.xml
 * @returns {string|null} The raw <w:sectPr>...</w:sectPr> substring, or null
 */
export const extractBodySectPr = (documentXml) => {
  if (!documentXml) return null;
  const lastIdx = documentXml.lastIndexOf('<w:sectPr');
  if (lastIdx === -1) return null;
  const endIdx = documentXml.indexOf('</w:sectPr>', lastIdx);
  if (endIdx === -1) return null;
  return documentXml.substring(lastIdx, endIdx + '</w:sectPr>'.length);
};

/**
 * Build a placeholder document.xml that includes the real body sectPr.
 * Used by joining clients so the converter can resolve header/footer
 * variant mappings, page size, margins, etc. from the section properties.
 *
 * @param {string|null} bodySectPr The raw <w:sectPr> XML string
 * @returns {string} A minimal document.xml with the section properties included
 */
export const buildDocumentXmlPlaceholder = (bodySectPr) => {
  if (!bodySectPr) return PLACEHOLDER_DOCUMENT_XML;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"' +
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<w:body><w:p><w:r><w:t></w:t></w:r></w:p>' +
    bodySectPr +
    '</w:body></w:document>'
  );
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
