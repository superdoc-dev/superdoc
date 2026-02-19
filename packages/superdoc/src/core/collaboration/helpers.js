import { createProvider } from '../collaboration/collaboration';
import useComment from '../../components/CommentsLayer/use-comment';

import { addYComment, updateYComment, deleteYComment } from './collaboration-comments';

/**
 * Load comments from the ydoc into the comments store.
 *
 * @param {Object} superdoc The SuperDoc instance
 * @returns {boolean} True if comments were loaded into the store
 */
export const loadCommentsFromYdoc = (superdoc) => {
  if (!superdoc?.ydoc || !superdoc?.commentsStore) return false;
  const commentsArray = superdoc.ydoc.getArray('comments');
  const comments = commentsArray.toJSON();
  const seenCommentIdByKey = new Map();
  const filtered = [];
  comments.forEach((c) => {
    const key = c?.importedId ?? c?.commentId;
    if (!key) return;
    if (seenCommentIdByKey.has(key)) {
      const existingCommentId = seenCommentIdByKey.get(key);
      const currentCommentId = c?.commentId;

      if (existingCommentId && currentCommentId && existingCommentId !== currentCommentId) {
        console.warn(
          `[SuperDoc] Duplicate collaboration comment key "${key}" detected with conflicting commentId values. Keeping first entry and dropping duplicate.`,
          {
            key,
            keptCommentId: existingCommentId,
            droppedCommentId: currentCommentId,
          },
        );
      }
      return;
    }
    seenCommentIdByKey.set(key, c?.commentId);
    if (!c?.commentId) {
      filtered.push({ ...c, commentId: key });
      return;
    }
    filtered.push(c);
  });
  superdoc.commentsStore.commentsList = filtered.map((c) => useComment(c));
  if (superdoc.provider?.synced) {
    superdoc.commentsStore.hasSyncedCollaborationComments = true;
  }
  return true;
};

/**
 * Initialize sync for comments if the module is enabled
 *
 * @param {Object} superdoc The SuperDoc instance
 * @returns {void}
 */
export const initCollaborationComments = (superdoc) => {
  if (!superdoc.config.modules.comments || !superdoc.provider) return;
  if (superdoc._commentsCollabInitialized) {
    loadCommentsFromYdoc(superdoc);
    return;
  }
  superdoc._commentsCollabInitialized = true;

  // If we have comments and collaboration, wait for sync and then let the store know when its ready
  const commentsArray = superdoc.ydoc.getArray('comments');
  const updateCommentsStore = () => loadCommentsFromYdoc(superdoc);

  const onSuperDocYdocSynced = () => {
    if (!updateCommentsStore()) {
      setTimeout(updateCommentsStore, 0);
    }
    // Update the editor comment locations
    if (superdoc.commentsStore) {
      const parent = superdoc.commentsStore.commentsParentElement;
      const ids = superdoc.commentsStore.editorCommentIds;
      superdoc.commentsStore.handleEditorLocationsUpdate(parent, ids);
      superdoc.commentsStore.hasSyncedCollaborationComments = true;
    }

    superdoc.provider.off('synced', onSuperDocYdocSynced);
  };

  // Listen for the synced event
  superdoc.provider.on('synced', onSuperDocYdocSynced);

  // Load any existing comments immediately (in case provider synced before we subscribed)
  if (!updateCommentsStore()) {
    setTimeout(updateCommentsStore, 0);
  }

  // Observe changes to the comments map
  commentsArray.observe((event) => {
    if (!superdoc.commentsStore) return;
    // Ignore events if triggered by the current user
    const currentUser = superdoc.config.user;
    const origin = event?.transaction?.origin;
    const { user = {} } = origin || {};

    if (currentUser.name === user.name && currentUser.email === user.email) return;

    // Update conversations
    updateCommentsStore();
  });
};

/**
 * Initialize SuperDoc general Y.Doc for high level collaboration
 * Assigns superdoc.ydoc and superdoc.provider in place
 *
 * @param {Object} superdoc The SuperDoc instance
 * @returns {void}
 */
export const initSuperdocYdoc = (superdoc) => {
  const { isInternal } = superdoc.config;
  const baseName = `${superdoc.config.superdocId}-superdoc`;
  if (!superdoc.config.superdocId) return;

  const documentId = isInternal ? baseName : `${baseName}-external`;
  const superdocCollaborationOptions = {
    config: superdoc.config.modules.collaboration,
    user: superdoc.config.user,
    documentId,
    socket: superdoc.config.socket,
    superdocInstance: superdoc,
  };

  const { provider: superdocProvider, ydoc: superdocYdoc } = createProvider(superdocCollaborationOptions);

  return { ydoc: superdocYdoc, provider: superdocProvider };
};

/**
 * Process SuperDoc's documents to make them collaborative by
 * adding provider, ydoc, awareness handler, and socket to each document.
 *
 * @param {Object} superdoc The SuperDoc instance
 * @returns {Array[Object]} The processed documents
 */
export const makeDocumentsCollaborative = (superdoc) => {
  const processedDocuments = [];
  superdoc.config.documents.forEach((doc) => {
    superdoc.config.user.color = superdoc.colors[0];
    const options = {
      config: superdoc.config.modules.collaboration,
      user: superdoc.config.user,
      documentId: doc.id,
      socket: superdoc.config.socket,
      superdocInstance: superdoc,
    };

    const { provider, ydoc } = createProvider(options);
    doc.provider = provider;
    doc.socket = superdoc.config.socket;
    doc.ydoc = ydoc;
    doc.role = superdoc.config.role;
    processedDocuments.push(doc);
  });
  return processedDocuments;
};

/**
 * Sync local comments with ydoc and other clients if in collaboration mode and comments module is enabled
 *
 * @param {Object} superdoc
 * @param {Object} event
 * @returns {void}
 */
export const syncCommentsToClients = (superdoc, event) => {
  if (!superdoc.isCollaborative || !superdoc.config.modules.comments) return;

  const yArray = superdoc.ydoc.getArray('comments');
  const user = superdoc.config.user;

  switch (event.type) {
    case 'add':
      addYComment(yArray, superdoc.ydoc, event, user);
      break;
    case 'update':
      updateYComment(yArray, superdoc.ydoc, event, user);
      break;
    case 'resolved':
      updateYComment(yArray, superdoc.ydoc, event, user);
      break;
    case 'deleted':
      deleteYComment(yArray, superdoc.ydoc, event, user);
      break;
  }
};
