import { translator as wPTranslator } from '@converter/v3/handlers/w/p';
import { carbonCopy } from '../../../utilities/carbonCopy.js';
import { COMMENT_REF, COMMENTS_XML_DEFINITIONS } from '../../exporter-docx-defs.js';
import { generateRandom32BitHex } from '../../../helpers/generateDocxRandomId.js';

/**
 * Insert w15:paraId into the comments
 *
 * @param {Object} comment The comment to update
 * @returns {Object} The updated comment
 */
export const prepareCommentParaIds = (comment) => {
  const newComment = {
    ...comment,
    commentParaId: generateRandom32BitHex(),
  };
  return newComment;
};

/**
 * Generate the w:comment node for a comment
 * This is stored in comments.xml
 *
 * @param {Object} comment The comment to export
 * @param {string} commentId The index of the comment
 * @returns {Object} The w:comment node for the comment
 */
export const getCommentDefinition = (comment, commentId, allComments, editor) => {
  const translatedText = wPTranslator.decode({ editor, node: comment.commentJSON });
  const attributes = {
    'w:id': String(commentId),
    'w:author': comment.creatorName || comment.importedAuthor?.name,
    'w:email': comment.creatorEmail || comment.importedAuthor?.email,
    'w:date': toIsoNoFractional(comment.createdTime),
    'w:initials': getInitials(comment.creatorName),
    'w:done': comment.resolvedTime ? '1' : '0',
    'w15:paraId': comment.commentParaId,
    'custom:internalId': comment.commentId || comment.internalId,
    'custom:trackedChange': comment.trackedChange,
    'custom:trackedChangeText': comment.trackedChangeText || null,
    'custom:trackedChangeType': comment.trackedChangeType,
    'custom:trackedDeletedText': comment.deletedText || null,
  };

  // Add the w15:paraIdParent attribute if the comment has a parent
  // Note: If the parent is a tracked change (not a real Word comment), we don't set this attribute
  // because Word doesn't recognize tracked changes as comment parents
  if (comment?.parentCommentId) {
    const parentComment = allComments.find((c) => c.commentId === comment.parentCommentId);
    if (parentComment && !parentComment.trackedChange) {
      attributes['w15:paraIdParent'] = parentComment.commentParaId;
    }
  }

  return {
    type: 'element',
    name: 'w:comment',
    attributes,
    elements: [translatedText],
  };
};

/**
 * Get the initials of a name
 *
 * @param {string} name The name to get the initials of
 * @returns {string | null} The initials of the name
 */
export const getInitials = (name) => {
  if (!name) return null;

  const preparedText = name.replace('(imported)', '').trim();
  const initials = preparedText
    .split(' ')
    .map((word) => word[0])
    .join('');
  return initials;
};

/**
 * Convert a unix date to an ISO string without milliseconds
 *
 * @param {number} unixMillis The date to convert
 * @returns {string} The date as an ISO string without milliseconds
 */
export const toIsoNoFractional = (unixMillis) => {
  const date = new Date(unixMillis || Date.now());
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
};

/**
 * Updates or creates the `word/comments.xml` entry in a docx file structure.
 *
 * @param {Object[]} commentDefs - An array of comment definition objects.
 * @param {Object} convertedXml - The entire XML object representing the docx file structure.
 * @returns {Object} - The updated portion of the comments XML structure.
 */
export const updateCommentsXml = (commentDefs = [], commentsXml) => {
  const newCommentsXml = carbonCopy(commentsXml);

  // Re-build the comment definitions
  commentDefs.forEach((commentDef) => {
    // Ensure we always have a paragraph node and attributes container
    const paraNode = commentDef.elements[0];
    if (!paraNode.attributes) paraNode.attributes = {};

    // NOTE: Per ECMA-376, w:pPr should be first child of w:p
    const elements = paraNode.elements;
    elements.unshift(COMMENT_REF);

    const paraId = commentDef.attributes['w15:paraId'];
    paraNode.attributes['w14:paraId'] = paraId;

    commentDef.attributes = {
      'w:id': commentDef.attributes['w:id'],
      'w:author': commentDef.attributes['w:author'],
      'w:email': commentDef.attributes['w:email'],
      'w:date': commentDef.attributes['w:date'],
      'w:initials': commentDef.attributes['w:initials'],
      'custom:internalId': commentDef.attributes['custom:internalId'],
      'custom:trackedChange': commentDef.attributes['custom:trackedChange'],
      'custom:trackedChangeText': commentDef.attributes['custom:trackedChangeText'],
      'custom:trackedChangeType': commentDef.attributes['custom:trackedChangeType'],
      'custom:trackedDeletedText': commentDef.attributes['custom:trackedDeletedText'],
      'xmlns:custom': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    };
  });

  newCommentsXml.elements[0].elements = commentDefs;
  return newCommentsXml;
};

/**
 * Determine export strategy based on comment origins
 * @param {Array[Object]} comments The comments list
 * @returns {'word' | 'google-docs' | 'unknown'} The export strategy to use
 */
export const determineExportStrategy = (comments) => {
  if (!comments || comments.length === 0) {
    return 'word';
  }

  const origins = new Set(comments.map((c) => c.origin || 'word'));

  if (origins.size === 1) {
    const origin = origins.values().next().value;
    return origin === 'google-docs' ? 'google-docs' : 'word';
  }

  return 'word';
};

/**
 * This function updates the commentsExtended.xml structure with the comments list.
 *
 * @param {Array[Object]} comments The comments list
 * @param {Object} commentsExtendedXml The commentsExtended.xml structure as JSON
 * @param {'word' | 'google-docs' | 'unknown'} exportStrategy The export strategy to use
 * @returns {Object | null} The updated commentsExtended structure, or null if it shouldn't be generated
 */
export const updateCommentsExtendedXml = (comments = [], commentsExtendedXml, exportStrategy = 'word') => {
  // For Google Docs origin, check if original had commentsExtended.xml
  // If not, we skip generating it entirely (threading will be range-based in document.xml)
  // The importer only uses range-based threading when the file is missing, not when it's empty
  const shouldGenerateCommentsExtended =
    exportStrategy === 'word' || comments.some((c) => c.originalXmlStructure?.hasCommentsExtended);

  if (!shouldGenerateCommentsExtended && exportStrategy === 'google-docs') {
    // For Google Docs without original commentsExtended.xml, return null to skip file generation
    // Threading will be handled via range nesting in document.xml
    return null;
  }

  const xmlCopy = carbonCopy(commentsExtendedXml);

  const commentsEx = comments.map((comment) => {
    // Check both resolvedTime (runtime) and isDone (imported) for resolved status
    const isResolved = comment.resolvedTime || comment.isDone;
    const attributes = {
      'w15:paraId': comment.commentParaId,
      'w15:done': isResolved ? '1' : '0',
    };

    // For Word format, always use paraIdParent for threading
    // For Google Docs, use paraIdParent if original had commentsExtended.xml
    // Note: If the parent is a tracked change (not a real Word comment), we don't set this attribute
    // because Word doesn't recognize tracked changes as comment parents
    const parentId = comment.parentCommentId;
    if (parentId && (exportStrategy === 'word' || comment.originalXmlStructure?.hasCommentsExtended)) {
      const parentComment = comments.find((c) => c.commentId === parentId);
      if (parentComment && !parentComment.trackedChange) {
        attributes['w15:paraIdParent'] = parentComment.commentParaId;
      }
    }

    return {
      type: 'element',
      name: 'w15:commentEx',
      attributes,
    };
  });

  xmlCopy.elements[0].elements = commentsEx;
  return xmlCopy;
};

/**
 * Update commentsIds.xml and commentsExtensible.xml together since they have to
 * share the same durableId for each comment.
 *
 * @param {Array[Object]} comments The comments list
 * @param {Object} commentsIds The commentsIds.xml structure as JSON
 * @param {Object} extensible The commentsExtensible.xml structure as JSON
 * @returns {Object} The updated commentsIds and commentsExtensible structures
 */
export const updateCommentsIdsAndExtensible = (comments = [], commentsIds, extensible) => {
  const documentIdsUpdated = carbonCopy(commentsIds);
  const extensibleUpdated = carbonCopy(extensible);

  documentIdsUpdated.elements[0].elements = [];
  extensibleUpdated.elements[0].elements = [];
  comments.forEach((comment) => {
    const newDurableId = generateRandom32BitHex();
    const newCommentIdDef = {
      type: 'element',
      name: 'w16cid:commentId',
      attributes: {
        'w16cid:paraId': comment.commentParaId,
        'w16cid:durableId': newDurableId,
      },
    };
    documentIdsUpdated.elements[0].elements.push(newCommentIdDef);

    const newExtensible = {
      type: 'element',
      name: 'w16cex:commentExtensible',
      attributes: {
        'w16cex:durableId': newDurableId,
        'w16cex:dateUtc': toIsoNoFractional(comment.createdTime),
      },
    };
    extensibleUpdated.elements[0].elements.push(newExtensible);
  });

  return {
    documentIdsUpdated,
    extensibleUpdated,
  };
};

/**
 * Generate the ocument.xml.rels definition
 *
 * @returns {Object} The updated document rels XML structure
 */
export const updateDocumentRels = () => {
  return COMMENTS_XML_DEFINITIONS.DOCUMENT_RELS_XML_DEF;
};

/**
 * Generate initial comments XML structure with no content
 *
 * @param {Object} convertedXml The converted XML structure of the docx file
 * @returns {Object} The updated XML structure with the comments files
 */
export const generateConvertedXmlWithCommentFiles = (convertedXml) => {
  const newXml = carbonCopy(convertedXml);
  newXml['word/comments.xml'] = COMMENTS_XML_DEFINITIONS.COMMENTS_XML_DEF;
  newXml['word/commentsExtended.xml'] = COMMENTS_XML_DEFINITIONS.COMMENTS_EXTENDED_XML_DEF;
  newXml['word/commentsExtensible.xml'] = COMMENTS_XML_DEFINITIONS.COMMENTS_EXTENSIBLE_XML_DEF;
  newXml['word/commentsIds.xml'] = COMMENTS_XML_DEFINITIONS.COMMENTS_IDS_XML_DEF;
  newXml['[Content_Types].xml'] = COMMENTS_XML_DEFINITIONS.CONTENT_TYPES;
  return newXml;
};

/**
 * Get the comments files converted to XML
 *
 * @param {Object} converter The converter instance
 * @returns {Object} The comments files converted to XML
 */
export const getCommentsFilesConverted = (converter, convertedXml) => {
  const commentsXml = convertedXml['word/comments.xml'];
  const commentsExtendedXml = convertedXml['word/commentsExtended.xml'];
  const commentsIdsXml = convertedXml['word/commentsExtensible.xml'];
  const commentsExtensibleXml = convertedXml['word/commentsIds.xml'];
  const contentTypes = convertedXml['[Content_Types].xml'];

  return {
    ...convertedXml,
    'word/comments.xml': converter.schemaToXml(commentsXml.elements[0]),
    'word/commentsExtended.xml': converter.schemaToXml(commentsExtendedXml.elements[0]),
    'word/commentsIds.xml': converter.schemaToXml(commentsIdsXml.elements[0]),
    'word/commentsExtensible.xml': converter.schemaToXml(commentsExtensibleXml.elements[0]),
    '[Content_Types].xml': converter.schemaToXml(contentTypes.elements[0]),
  };
};

/**
 * Remove comments files from the converted XML
 *
 * @param {Object} convertedXml The converted XML structure of the docx file
 * @returns {Object} The updated XML structure with the comments files removed
 */
export const removeCommentsFilesFromConvertedXml = (convertedXml) => {
  const updatedXml = carbonCopy(convertedXml);

  delete updatedXml['word/comments.xml'];
  delete updatedXml['word/commentsExtended.xml'];
  delete updatedXml['word/commentsExtensible.xml'];
  delete updatedXml['word/commentsIds.xml'];

  return updatedXml;
};

/**
 * Generate a relationship for a comments file target
 *
 * @param {String} target The target of the relationship
 * @returns {Object} The generated relationship
 */
export const generateRelationship = (target) => {
  const relsDefault = COMMENTS_XML_DEFINITIONS.DOCUMENT_RELS_XML_DEF.elements[0].elements;
  const rel = relsDefault.find((rel) => rel.attributes.Target === target);
  return { ...rel };
};

/**
 * Generate comments files into convertedXml
 *
 * @param {Object} param0
 * @returns
 */
export const prepareCommentsXmlFilesForExport = ({ convertedXml, defs, commentsWithParaIds, exportType }) => {
  const relationships = [];

  if (exportType === 'clean') {
    const documentXml = removeCommentsFilesFromConvertedXml(convertedXml);
    return { documentXml, relationships };
  }

  const exportStrategy = determineExportStrategy(commentsWithParaIds);
  const updatedXml = generateConvertedXmlWithCommentFiles(convertedXml);

  updatedXml['word/comments.xml'] = updateCommentsXml(defs, updatedXml['word/comments.xml']);
  relationships.push(generateRelationship('comments.xml'));

  const commentsExtendedXml = updateCommentsExtendedXml(
    commentsWithParaIds,
    updatedXml['word/commentsExtended.xml'],
    exportStrategy,
  );

  // Only add the file and relationship if we're actually generating commentsExtended.xml
  // For Google Docs without original commentsExtended.xml, we skip it entirely to preserve range-based threading
  if (commentsExtendedXml !== null) {
    updatedXml['word/commentsExtended.xml'] = commentsExtendedXml;
    relationships.push(generateRelationship('commentsExtended.xml'));
  } else {
    // Remove the file from the XML structure so the importer uses range-based threading
    delete updatedXml['word/commentsExtended.xml'];
  }

  // Generate updates for documentIds.xml and commentsExtensible.xml here
  // We do them at the same time as we need them to generate and share durable IDs between them
  const { documentIdsUpdated, extensibleUpdated } = updateCommentsIdsAndExtensible(
    commentsWithParaIds,
    updatedXml['word/commentsIds.xml'],
    updatedXml['word/commentsExtensible.xml'],
  );
  updatedXml['word/commentsIds.xml'] = documentIdsUpdated;
  updatedXml['word/commentsExtensible.xml'] = extensibleUpdated;
  relationships.push(generateRelationship('commentsIds.xml'));
  relationships.push(generateRelationship('commentsExtensible.xml'));

  return {
    relationships,
    documentXml: updatedXml,
  };
};
