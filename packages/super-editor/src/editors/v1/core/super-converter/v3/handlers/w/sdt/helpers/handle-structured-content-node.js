import { parseAnnotationMarks } from './handle-annotation-node';
import { parseStrictStOnOff } from '../../../utils.js';
import { BLOCK_FIELD_XML_NAMES } from '../../../sd/shared/block-field-xml-names.js';
import { isInlineNode } from '../../../helpers/is-inline-node.js';

const INLINE_CONTEXT_XML_NAMES = new Set(['w:p', 'w:r', 'w:hyperlink', 'w:smartTag']);

function hasDirectBlockSignal(sdtContent) {
  return Boolean(
    sdtContent?.elements?.some(
      (el) => el?.name === 'w:p' || el?.name === 'w:tbl' || BLOCK_FIELD_XML_NAMES.has(el?.name),
    ),
  );
}

function canEmitInlineStructuredContent(path = []) {
  return path.some((entry) => INLINE_CONTEXT_XML_NAMES.has(entry?.name) || entry?.name === 'w:sdtContent');
}

function hasTranslatedBlockContent(content = [], schema) {
  return content.some((node) => node?.type && !isInlineNode(node, schema));
}

function wrapInlineRunsAsParagraphs(content = [], schema) {
  const normalized = [];
  let pendingInline = [];

  const flushInline = () => {
    if (!pendingInline.length) return;
    normalized.push({
      type: 'paragraph',
      attrs: null,
      content: pendingInline,
      marks: [],
    });
    pendingInline = [];
  };

  for (const node of content) {
    if (!node) continue;

    if (isInlineNode(node, schema)) {
      pendingInline.push(node);
      continue;
    }

    flushInline();
    normalized.push(node);
  }

  flushInline();
  return normalized;
}

/**
 * Detect the semantic control type from sdtPr child elements.
 * Returns a canonical controlType string matching the ContentControlType enum.
 * @param {Object|null} sdtPr
 * @returns {string|null}
 */
function detectControlType(sdtPr) {
  // ECMA-376 §17.5.2.26: an sdtPr with no type child shall be of type richText.
  if (!sdtPr?.elements) return 'richText';
  const names = sdtPr.elements.map((el) => el.name);

  if (names.includes('w:text')) return 'text';
  if (names.includes('w:richText')) return 'richText';
  if (names.includes('w:date')) return 'date';
  if (names.includes('w14:checkbox') || names.includes('w:checkbox')) return 'checkbox';
  if (names.includes('w:comboBox')) return 'comboBox';
  if (names.includes('w:dropDownList')) return 'dropDownList';
  if (names.includes('w15:repeatingSection') || names.includes('w:repeatingSection')) return 'repeatingSection';
  if (names.includes('w15:repeatingSectionItem') || names.includes('w:repeatingSectionItem'))
    return 'repeatingSectionItem';
  if (names.includes('w:group')) return 'group';

  // Type-marker children that we don't (yet) model — equation, picture, citation,
  // bibliography, docPartList. Fall through so resolveControlType yields 'unknown'.
  const TYPE_CHILD_NAMES = new Set(['w:equation', 'w:picture', 'w:citation', 'w:bibliography', 'w:docPartList']);
  if (names.some((n) => TYPE_CHILD_NAMES.has(n))) return null;

  // No recognized type child and no unrecognized type child either — sdtPr has
  // only property children (alias/tag/id/lock/placeholder/...). Per the spec,
  // that's a richText SDT.
  return 'richText';
}

/**
 * Extract the appearance value from sdtPr.
 * @param {Object|null} sdtPr
 * @returns {string|null}
 */
function extractAppearance(sdtPr) {
  const el = sdtPr?.elements?.find((e) => e.name === 'w:appearance' || e.name === 'w15:appearance');
  const val = el?.attributes?.['w:val'] ?? el?.attributes?.['w15:val'];
  const valid = ['boundingBox', 'tags', 'hidden'];
  return valid.includes(val) ? val : null;
}

/**
 * Extract placeholder text from sdtPr.
 * @param {Object|null} sdtPr
 * @returns {string|null}
 */
function extractPlaceholder(sdtPr) {
  const el = sdtPr?.elements?.find((e) => e.name === 'w:placeholder');
  const docPart = el?.elements?.find((e) => e.name === 'w:docPart');
  return docPart?.attributes?.['w:val'] ?? null;
}

/**
 * Extract the `<w:temporary/>` toggle from sdtPr (ECMA-376 §17.5.2.43).
 *
 * Delegates to `parseStrictStOnOff` so token recognition matches the
 * project's shared ST_OnOff convention (`true`/`1`/`on` → true;
 * `false`/`0`/`off` → false). Returns `undefined` when the element is
 * absent or carries an invalid token, preserving the "absent vs explicit
 * false" distinction at the Document API surface.
 *
 * @param {Object|null} sdtPr
 * @returns {boolean|undefined}
 */
function extractTemporary(sdtPr) {
  const el = sdtPr?.elements?.find((e) => e.name === 'w:temporary');
  if (!el) return undefined;
  return parseStrictStOnOff(el.attributes?.['w:val'], 'temporary', 'w:temporary');
}

/**
 * @param {Object} params
 * @returns {Object|null}
 */
export function handleStructuredContentNode(params) {
  const { nodes, nodeListHandler } = params;

  if (nodes.length === 0 || nodes[0].name !== 'w:sdt') {
    return null;
  }

  const node = nodes[0];
  const sdtPr = node.elements.find((el) => el.name === 'w:sdtPr');
  const sdtContent = node.elements.find((el) => el.name === 'w:sdtContent');

  const id = sdtPr?.elements?.find((el) => el.name === 'w:id');
  const tag = sdtPr?.elements?.find((el) => el.name === 'w:tag');
  const alias = sdtPr?.elements?.find((el) => el.name === 'w:alias');

  // Lock mode
  const lockTag = sdtPr?.elements?.find((el) => el.name === 'w:lock');
  const lockValue = lockTag?.attributes?.['w:val'];
  const validModes = ['unlocked', 'sdtLocked', 'contentLocked', 'sdtContentLocked'];
  const lockMode = validModes.includes(lockValue) ? lockValue : 'unlocked';

  // Control type detection from sdtPr children
  const controlType = detectControlType(sdtPr);

  // Appearance, placeholder, and temporary toggle
  const appearance = extractAppearance(sdtPr);
  const placeholder = extractPlaceholder(sdtPr);
  const temporary = extractTemporary(sdtPr);

  if (!sdtContent) {
    return null;
  }

  const { marks } = parseAnnotationMarks(sdtContent);
  const translatedContent = nodeListHandler.handler({
    ...params,
    nodes: sdtContent.elements,
    path: [...(params.path || []), sdtContent],
  });

  const schema = params.editor?.schema;
  const content = Array.isArray(translatedContent) ? translatedContent : [];
  const isBlockNode =
    hasTranslatedBlockContent(content, schema) ||
    hasDirectBlockSignal(sdtContent) ||
    !canEmitInlineStructuredContent(params.path);
  const sdtContentType = isBlockNode ? 'structuredContentBlock' : 'structuredContent';
  const normalizedContent = isBlockNode ? wrapInlineRunsAsParagraphs(content, schema) : content;

  let result = {
    type: sdtContentType,
    content: normalizedContent,
    marks,
    attrs: {
      id: id?.attributes?.['w:val'] || null,
      tag: tag?.attributes?.['w:val'] || null,
      alias: alias?.attributes?.['w:val'] || null,
      lockMode,
      controlType,
      type: controlType,
      appearance,
      placeholder,
      // `temporary` is only set when the XML carries `<w:temporary/>`;
      // omitted attrs stay undefined so consumers can distinguish
      // "absent from source" from explicit false.
      ...(temporary !== undefined ? { temporary } : {}),
      sdtPr,
    },
  };

  return result;
}
