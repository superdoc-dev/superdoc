// @ts-check
import { NodeTranslator } from '@translator';
import { idAttrConfig } from './attributes/index.js';

/**
 * @type {import('@translator').XmlNodeName}
 * This will be either `commentRangeStart` or `commentRangeEnd` since we use the same translator for both.
 */
const XML_NODE_NAME = 'w:commentRange';
/**
 * @type {import('@translator').SuperDocNodeOrKeyName}
 * This will be either `commentRangeStart` or `commentRangeEnd` since we use the same translator for both.
 */
const SD_NODE_NAME = 'commentRange';

/**
 * Decode the commentRange(Start|End) node back into OOXML <w:commentRange(Start|End)>.
 * @param {import('@translator').SCDecoderConfig} params
 * @returns {import('@translator').SCDecoderResult}
 */
const decode = (params) => {
  const { node, comments, commentsExportType, exportedCommentDefs } = params;

  if (!node) return;
  if (!comments) return;
  if (exportedCommentDefs?.length === 0) return;
  if (commentsExportType === 'clean') return;

  const commentNodeId = node.attrs['w:id'];

  const originalComment = comments.find((comment) => {
    return comment.commentId == commentNodeId;
  });
  if (!originalComment) return;

  const parentCommentId = originalComment.parentCommentId;
  const parentComment = comments.find(
    ({ commentId, importedId }) => commentId === parentCommentId || importedId === parentCommentId,
  );
  const isInternal = parentComment?.isInternal || originalComment.isInternal;
  if (commentsExportType === 'external' && isInternal) return;

  if (node.type !== 'commentRangeStart' && node.type !== 'commentRangeEnd') {
    return;
  }
  const { type } = node;
  const commentIndex = comments.findIndex((comment) => comment.commentId === originalComment.commentId);
  let commentSchema = getCommentSchema(type, commentIndex);

  if (type === 'commentRangeEnd') {
    const commentReference = {
      name: 'w:r',
      elements: [{ name: 'w:commentReference', attributes: { 'w:id': String(commentIndex) } }],
    };
    commentSchema = [commentSchema, commentReference];
  }

  const usesRangeThreading =
    originalComment.threadingStyleOverride === 'range-based' ||
    originalComment.threadingMethod === 'range-based' ||
    originalComment.originalXmlStructure?.hasCommentsExtended === false;

  if (!usesRangeThreading) {
    return commentSchema;
  }

  const trackedMark = node.marks?.find((mark) => mark.type === 'trackInsert' || mark.type === 'trackDelete');
  if (trackedMark) {
    const wrapperName = trackedMark.type === 'trackDelete' ? 'w:del' : 'w:ins';
    const markAttrs = trackedMark.attrs || {};
    const date = markAttrs.date || new Date(Date.now()).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const wrapperAttributes = {
      ...(markAttrs.id ? { 'w:id': String(markAttrs.id) } : {}),
      ...(markAttrs.author ? { 'w:author': markAttrs.author } : {}),
      ...(markAttrs.authorEmail ? { 'w:authorEmail': markAttrs.authorEmail } : {}),
      'w:date': date,
    };

    return {
      name: wrapperName,
      attributes: wrapperAttributes,
      elements: Array.isArray(commentSchema) ? commentSchema : [commentSchema],
    };
  }

  if (!parentComment?.trackedChange) {
    return commentSchema;
  }

  const trackedChangeType = parentComment.trackedChangeType;
  const isReplace = trackedChangeType === 'both';
  const wrapperName =
    type === 'commentRangeStart'
      ? 'w:ins'
      : isReplace
        ? 'w:del'
        : trackedChangeType === 'trackDelete'
          ? 'w:del'
          : 'w:ins';

  const createdTime = parentComment.createdTime || Date.now();
  const date = new Date(createdTime).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const wrapperAttributes = {
    'w:id': String(parentComment.commentId),
    ...(parentComment.creatorName ? { 'w:author': parentComment.creatorName } : {}),
    ...(parentComment.creatorEmail ? { 'w:authorEmail': parentComment.creatorEmail } : {}),
    'w:date': date,
  };

  return {
    name: wrapperName,
    attributes: wrapperAttributes,
    elements: Array.isArray(commentSchema) ? commentSchema : [commentSchema],
  };
};

/**
 * Generate a w:commentRangeStart or w:commentRangeEnd node
 *
 * @param {'commentRangeStart' | 'commentRangeEnd'} type Must be 'commentRangeStart' or 'commentRangeEnd'
 * @param {number} commentIndex The comment index
 * @returns {Object} The comment node
 */
const getCommentSchema = (type, commentIndex) => {
  return {
    name: `w:${type}`,
    attributes: {
      'w:id': String(commentIndex),
    },
  };
};

const getConfig = (type) => {
  const sdName = `${SD_NODE_NAME}${type}`;
  const isStart = type === 'Start';
  return {
    xmlName: `${XML_NODE_NAME}${type}`,
    sdNodeOrKeyName: sdName,
    type: NodeTranslator.translatorTypes.NODE,
    encode: ({ nodes }) => {
      const node = nodes?.[0];
      if (!node) return undefined;
      const attrs = node.attributes ? { ...node.attributes } : {};
      return {
        type: isStart ? 'commentRangeStart' : 'commentRangeEnd',
        attrs,
      };
    },
    decode,
    attributes: [idAttrConfig],
  };
};

export const commentRangeStartTranslator = NodeTranslator.from(getConfig('Start'));
export const commentRangeEndTranslator = NodeTranslator.from(getConfig('End'));
