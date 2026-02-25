/**
 * Update the Ydoc document data with the latest Docx XML.
 *
 * @param {Editor} editor The editor instance
 * @returns {Promise<void>}
 */
export const updateYdocDocxData = async (editor, ydoc) => {
  try {
    ydoc = ydoc || editor?.options?.ydoc;
    if (!ydoc || ydoc.isDestroyed) return;
    if (!editor || editor.isDestroyed) return;

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
  if (!ydoc || ydoc.isDestroyed) return;

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
