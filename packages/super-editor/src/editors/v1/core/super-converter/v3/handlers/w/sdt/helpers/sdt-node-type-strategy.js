import { parseTagValueJSON } from './parse-tag-value-json';
import { handleAnnotationNode } from './handle-annotation-node';
import { handleDocPartObj } from './handle-doc-part-obj';
import { handleDocumentSectionNode } from './handle-document-section-node';
import { handleStructuredContentNode } from './handle-structured-content-node';

/**
 * There are multiple types of w:sdt nodes.
 * We need to route to the correct handler depending on certain properties.
 * Example: If tag has documentSection type, we handle it as a document section node.
 * If it has structuredContent type, we handle it as a structured content node.
 * @param {Object} node
 * @returns {Object}
 */
export function sdtNodeTypeStrategy(node) {
  const sdtContent = node.elements.find((el) => el.name === 'w:sdtContent');
  const sdtPr = node.elements.find((el) => el.name === 'w:sdtPr');
  const tag = sdtPr?.elements.find((el) => el.name === 'w:tag');
  const tagValue = tag?.attributes?.['w:val'];
  const docPartObj = sdtPr?.elements.find((el) => el.name === 'w:docPartObj');

  if (docPartObj) {
    return { type: 'docPartObj', handler: handleDocPartObj };
  }

  if (tagValue) {
    const shouldProcessAsJson = tagValue.startsWith('{') && tagValue.endsWith('}');

    if (shouldProcessAsJson) {
      const parsedTag = parseTagValueJSON(tagValue);

      if (parsedTag.type === 'documentSection') {
        return { type: 'documentSection', handler: handleDocumentSectionNode };
      }
      if (parsedTag.fieldId && parsedTag.fieldTypeShort) {
        return { type: 'fieldAnnotation', handler: handleAnnotationNode };
      }
    } else {
      // Legacy field annotation (backward compatibility).
      // tagValue is a fieldId in this case.
      const fieldTypeShort = sdtPr.elements.find((el) => el.name === 'w:fieldTypeShort');
      const fieldTypeShortValue = fieldTypeShort?.attributes['w:val'];
      if (tagValue && fieldTypeShortValue) {
        return { type: 'fieldAnnotation', handler: handleAnnotationNode };
      }
    }
  }

  if (sdtContent) {
    return { type: 'structuredContent', handler: handleStructuredContentNode };
  }

  return { type: 'unknown', handler: null };
}
