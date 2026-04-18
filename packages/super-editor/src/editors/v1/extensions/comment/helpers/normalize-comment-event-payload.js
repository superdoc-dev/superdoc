/**
 * Normalizes the comment event payload.
 * @param {Object} param0 - The parameters for normalizing the comment event payload.
 * @returns {Object} - The normalized comment event payload.
 */
export const normalizeCommentEventPayload = ({ conversation, editorOptions, fallbackCommentId, fallbackInternal }) => {
  const { user, documentId } = editorOptions || {};
  const normalized = {
    ...conversation,
    commentId: conversation?.commentId ?? fallbackCommentId,
    isInternal: conversation?.isInternal ?? fallbackInternal,
  };

  if (!normalized.commentText && normalized.text) {
    normalized.commentText = normalized.text;
    delete normalized.text;
  }

  if ('skipEmit' in normalized) delete normalized.skipEmit;

  if (!normalized.creatorName && user?.name) {
    normalized.creatorName = user.name;
  }

  if (!normalized.creatorEmail && user?.email) {
    normalized.creatorEmail = user.email;
  }

  if (!normalized.creatorImage && user?.image) {
    normalized.creatorImage = user.image;
  }

  if (!normalized.createdTime) {
    normalized.createdTime = Date.now();
  }

  if (!normalized.fileId && documentId) {
    normalized.fileId = documentId;
  }

  if (!normalized.documentId && documentId) {
    normalized.documentId = documentId;
  }

  return normalized;
};
