// @ts-check
import { NodeTranslator } from '@translator';
import { exportSchemaToJson, processOutputMarks } from '../../../../exporter.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'sd:rawField';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = 'rawField';

/**
 * Encode a `<sd:rawField>` element as a SuperDoc rawField node.
 *
 * The preprocessor emits `<sd:rawField>` with the canonical FieldInstance
 * payload on `attributes.fieldInstance` and the field's result content as
 * `elements`. Encode forwards the payload to the PM node attrs and
 * recursively processes the result content into inline PM children, so
 * formatted result runs (bold, color, font) survive end-to-end.
 *
 * @param {import('@translator').SCEncoderConfig} [params]
 * @returns {import('@translator').SCEncoderResult}
 */
const encode = (params) => {
  const { nodes = [], nodeListHandler } = params || {};
  const node = nodes[0];

  const processedContent = nodeListHandler.handler({
    ...params,
    nodes: node.elements || [],
  });

  return {
    type: SD_NODE_NAME,
    attrs: {
      fieldInstance: node.attributes?.fieldInstance ?? null,
      marksAsAttrs: node.marks || [],
    },
    content: processedContent,
  };
};

/**
 * Decode a rawField PM node back to OOXML.
 *
 * Two paths:
 *
 *   1. Passthrough — when the field has an unmodified import-time
 *      `source.originalXml` and none of the mutation flags are set, emit
 *      that subtree unchanged. This is the structural-fidelity path: an
 *      unknown field that survived an editing session unchanged round-trips
 *      with the same `fldChar` / `fldSimple` shape, the same instruction
 *      text, the same result fragments, and the same flags.
 *
 *   2. Rebuild — when the field was inserted, edited, relocated, or has
 *      no captured source XML, synthesize a fresh field envelope from the
 *      canonical payload. `representation` decides between `<w:fldSimple>`
 *      and a `<w:fldChar>` trio. The result content comes from the PM
 *      children (already-edited / formatted), preserving any in-session
 *      changes the user made.
 *
 * @param {import('@translator').SCDecoderConfig} params
 * @returns {import('@translator').SCDecoderResult[]}
 */
const decode = (params) => {
  const { node } = params;
  const fi = node.attrs?.fieldInstance ?? null;
  const outputMarks = processOutputMarks(node.attrs?.marksAsAttrs || []);
  const contentNodes = (node.content ?? []).flatMap((n) => exportSchemaToJson({ ...params, node: n }));

  if (fi && shouldPassthrough(fi)) {
    return passthroughOriginal(fi.source.originalXml);
  }

  return rebuildEnvelope(fi, contentNodes, outputMarks);
};

/**
 * Passthrough eligibility: the field came from import and nothing about it
 * has been touched since. See FieldInstance.mutation in the substrate
 * design for the per-flag semantics.
 *
 * @param {*} fi
 */
function shouldPassthrough(fi) {
  if (!fi || !fi.mutation || !fi.source) return false;
  if (!fi.mutation.imported) return false;
  if (fi.mutation.instructionEdited) return false;
  if (fi.mutation.resultEdited) return false;
  if (fi.mutation.flagsEdited) return false;
  if (fi.mutation.relocated) return false;
  if (fi.mutation.structureEdited) return false;
  return fi.source.originalXml != null;
}

/**
 * Emit the captured original-XML subtree verbatim. The capture is either
 * an array of runs forming the begin/instr/separate/result/end span (for
 * complex fields) or a single `<w:fldSimple>` element (for simple fields).
 *
 * @param {*} originalXml
 * @returns {import('@translator').SCDecoderResult[]}
 */
function passthroughOriginal(originalXml) {
  if (Array.isArray(originalXml)) return originalXml;
  if (originalXml) return [originalXml];
  return [];
}

/**
 * Rebuild the field envelope from canonical state. Used when the field has
 * been edited or has no captured source XML. Honors `representation`,
 * `rawInstruction`, `dirty`, `locked`, and the current PM children as the
 * result content.
 *
 * @param {*} fi
 * @param {Array<*>} contentNodes
 * @param {Array<*>} outputMarks
 * @returns {import('@translator').SCDecoderResult[]}
 */
function rebuildEnvelope(fi, contentNodes, outputMarks) {
  const rawInstruction = fi?.rawInstruction ?? '';
  const dirty = fi?.dirty ? '1' : null;
  const locked = fi?.locked ? '1' : null;
  const representation = fi?.representation ?? 'complex';

  if (representation === 'simple') {
    /** @type {Record<string, string>} */
    const attrs = { 'w:instr': rawInstruction };
    if (dirty) attrs['w:dirty'] = dirty;
    if (locked) attrs['w:fldLock'] = locked;
    return [
      {
        name: 'w:fldSimple',
        attributes: attrs,
        elements: contentNodes,
      },
    ];
  }

  /** @type {Record<string, string>} */
  const beginAttrs = { 'w:fldCharType': 'begin' };
  if (dirty) beginAttrs['w:dirty'] = dirty;
  if (locked) beginAttrs['w:fldLock'] = locked;

  return [
    {
      name: 'w:r',
      elements: [
        { name: 'w:rPr', elements: outputMarks },
        { name: 'w:fldChar', attributes: beginAttrs },
      ],
    },
    {
      name: 'w:r',
      elements: [
        { name: 'w:rPr', elements: outputMarks },
        {
          name: 'w:instrText',
          attributes: { 'xml:space': 'preserve' },
          elements: [{ type: 'text', text: rawInstruction }],
        },
      ],
    },
    {
      name: 'w:r',
      elements: [
        { name: 'w:rPr', elements: outputMarks },
        { name: 'w:fldChar', attributes: { 'w:fldCharType': 'separate' } },
      ],
    },
    ...contentNodes,
    {
      name: 'w:r',
      elements: [
        { name: 'w:rPr', elements: outputMarks },
        { name: 'w:fldChar', attributes: { 'w:fldCharType': 'end' } },
      ],
    },
  ];
}

/** @type {import('@translator').NodeTranslatorConfig} */
export const config = {
  xmlName: XML_NODE_NAME,
  sdNodeOrKeyName: SD_NODE_NAME,
  type: NodeTranslator.translatorTypes.NODE,
  encode,
  decode,
};

/** @type {import('@translator').NodeTranslator} */
export const translator = NodeTranslator.from(config);
