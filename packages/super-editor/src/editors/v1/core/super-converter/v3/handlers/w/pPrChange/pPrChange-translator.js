import { NodeTranslator } from '@translator';
import { carbonCopy } from '@core/utilities/carbonCopy.js';
import { createNestedPropertiesTranslator, createAttributeHandler } from '@converter/v3/handlers/utils.js';
import { basePropertyTranslators } from '../pPr/pPr-base-translators.js';

/**
 * OOXML `w:id` on `w:pPrChange` must be a decimal integer (CT_TrackChange).
 * Imported pPrChanges already carry a decimal id; API-created ones use a
 * `uuidv4`, which Word repairs/drops. Resolve a Word-safe decimal that stays
 * unique across the whole document.
 *
 * Preferred path: the converter's Word revision-id allocator (the same
 * doc-wide reservation the ins/del/row exporters use) — guarantees uniqueness
 * across ALL tracked changes, so two pPrChanges (or a pPrChange and an ins/del)
 * can never collide. An imported decimal is passed as `sourceId` so the
 * allocator reserves and preserves it.
 *
 * Fallback (no allocator installed, e.g. isolated unit tests): a stable FNV-1a
 * hash of the UUID in a high decimal range. Collision-prone in theory, but only
 * reached when the allocator is absent.
 *
 * @param {import('@translator').SCDecoderConfig} params
 * @param {{ id?: unknown }} change
 * @returns {string}
 */
function resolvePprChangeWordId(params, change) {
  const idStr = String(change?.id ?? '');
  const allocator =
    /** @type {{ converter?: { wordIdAllocator?: { allocate: (o: object) => string | number } | null }, currentPartPath?: string }} */ (
      params
    )?.converter?.wordIdAllocator;
  if (allocator) {
    const partPath = /** @type {{ currentPartPath?: string }} */ (params)?.currentPartPath || 'word/document.xml';
    // Imported ids are decimal → reserve/keep them; UUIDs mint a fresh unique id.
    const sourceId = /^\d+$/.test(idStr) ? idStr : undefined;
    return String(allocator.allocate({ partPath, sourceId, logicalId: idStr }));
  }
  return toDecimalWordId(change?.id);
}

/**
 * FNV-1a → `1,000,000..1,000,999,999` (below 2^31). Fallback only; see
 * resolvePprChangeWordId. Imported decimals are kept as-is.
 *
 * @param {unknown} id
 * @returns {string}
 */
function toDecimalWordId(id) {
  const str = String(id);
  if (/^\d+$/.test(str)) return str;
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return String(1_000_000 + ((hash >>> 0) % 1_000_000_000));
}

const pPrTranslator = NodeTranslator.from(
  createNestedPropertiesTranslator('w:pPr', 'paragraphProperties', basePropertyTranslators),
);

const ATTRIBUTE_HANDLERS = [
  createAttributeHandler('w:id'),
  createAttributeHandler('w:author'),
  createAttributeHandler('w:date'),
];

function getSectPr(pPrNode) {
  const sectPr = pPrNode?.elements?.find((el) => el.name === 'w:sectPr');
  return sectPr ? carbonCopy(sectPr) : undefined;
}

/**
 * The NodeTranslator instance for the w:pPrChange element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from({
  xmlName: 'w:pPrChange',
  sdNodeOrKeyName: 'change',
  type: NodeTranslator.translatorTypes.NODE,
  attributes: ATTRIBUTE_HANDLERS,
  encode: (params, encodedAttrs = {}) => {
    const changeNode = params.nodes[0];
    const pPrNode = changeNode?.elements?.find((el) => el.name === 'w:pPr');

    let paragraphProperties = pPrNode ? (pPrTranslator.encode({ ...params, nodes: [pPrNode] }) ?? {}) : undefined;
    const sectPr = getSectPr(pPrNode);
    if (sectPr) {
      paragraphProperties = {
        ...(paragraphProperties || {}),
        sectPr,
      };
    }

    const result = {
      ...encodedAttrs,
      ...(paragraphProperties ? { paragraphProperties } : {}),
    };

    return Object.keys(result).length ? result : undefined;
  },
  decode: function (params) {
    const change = params.node?.attrs?.change;
    if (!change || typeof change !== 'object') return undefined;

    const decodedAttrs = this.decodeAttributes({
      node: { ...params.node, attrs: change },
    });
    // Ensure `w:id` is a Word-safe, doc-unique decimal (change.id is a uuidv4
    // for API-created pPrChanges); prefers the revision-id allocator.
    if (decodedAttrs['w:id'] != null) {
      decodedAttrs['w:id'] = resolvePprChangeWordId(params, change);
    }
    const hasParagraphProperties = Object.prototype.hasOwnProperty.call(change, 'paragraphProperties');
    const paragraphProperties = hasParagraphProperties ? change.paragraphProperties : undefined;

    let pPrNode =
      paragraphProperties && typeof paragraphProperties === 'object'
        ? pPrTranslator.decode({
            ...params,
            node: { ...params.node, attrs: { paragraphProperties } },
          })
        : undefined;

    const sectPr = paragraphProperties?.sectPr ? carbonCopy(paragraphProperties.sectPr) : undefined;
    if (sectPr) {
      if (!pPrNode) {
        pPrNode = {
          name: 'w:pPr',
          type: 'element',
          attributes: {},
          elements: [],
        };
      }
      pPrNode.elements = [...(pPrNode.elements || []), sectPr];
    }

    if (!pPrNode && hasParagraphProperties) {
      pPrNode = {
        name: 'w:pPr',
        type: 'element',
        attributes: {},
        elements: [],
      };
    }

    if (!pPrNode && !Object.keys(decodedAttrs).length) return undefined;

    return {
      name: 'w:pPrChange',
      type: 'element',
      attributes: decodedAttrs,
      elements: pPrNode ? [pPrNode] : [],
    };
  },
});
