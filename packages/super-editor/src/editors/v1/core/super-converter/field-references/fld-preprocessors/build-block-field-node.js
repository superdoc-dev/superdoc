import { normalizeFieldContentToParagraphs } from './normalize-field-content.js';

/**
 * Build a block-level field node (`sd:bibliography`, `sd:index`,
 * `sd:tableOfAuthorities`) from the runs a complex field collected between its
 * `separate` and `end` fldChars.
 *
 * These three fields share one shape: an `sd:*` element carrying the raw
 * instruction (plus its token fragments, when the instruction was split across
 * runs) whose children are the field's generated paragraphs. The result is
 * normalized so loose inline runs are wrapped into paragraphs, satisfying the
 * `paragraph+` PM schema (see normalize-field-content / SD-3005).
 *
 * @param {string} xmlName The `sd:*` element name to emit.
 * @param {import('../../v2/types/index.js').OpenXmlNode[]} nodesToCombine The collected result nodes.
 * @param {string} instrText The field instruction text.
 * @param {Array<{type: string, text?: string}> | null} [instructionTokens] Raw instruction-run fragments.
 * @returns {import('../../v2/types/index.js').OpenXmlNode[]}
 */
export function buildBlockFieldNode(xmlName, nodesToCombine, instrText, instructionTokens = null) {
  return [
    {
      name: xmlName,
      type: 'element',
      attributes: {
        instruction: instrText,
        ...(instructionTokens ? { instructionTokens } : {}),
      },
      elements: normalizeFieldContentToParagraphs(nodesToCombine),
    },
  ];
}
