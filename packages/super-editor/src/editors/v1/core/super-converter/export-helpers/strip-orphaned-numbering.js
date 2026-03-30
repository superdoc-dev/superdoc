/**
 * Collect all w:numId values referenced in exported document parts.
 * Walks all word/* XML entries except word/numbering.xml itself.
 *
 * @param {Record<string, any>} convertedXml - The full set of exported XML-JSON objects
 * @returns {Set<number>} Set of numId values referenced in the document
 */
export function collectReferencedNumIds(convertedXml) {
  const numIds = new Set();

  function walkElements(elements) {
    if (!Array.isArray(elements)) return;
    for (const el of elements) {
      if (!el || typeof el !== 'object') continue;
      if (el.name === 'w:numId' && el.attributes?.['w:val'] != null) {
        numIds.add(Number(el.attributes['w:val']));
      }
      if (el.elements) walkElements(el.elements);
    }
  }

  for (const [path, xml] of Object.entries(convertedXml)) {
    if (path.startsWith('word/') && path !== 'word/numbering.xml' && xml?.elements) {
      walkElements(xml.elements);
    }
  }

  return numIds;
}

/**
 * Extract the w:abstractNumId value from a w:num XML-JSON element.
 *
 * @param {object} numDef - A w:num XML-JSON element from numbering.definitions
 * @returns {number | undefined} The abstractNumId, or undefined if not found
 */
function getAbstractNumIdFromDef(numDef) {
  const abstractEl = numDef.elements?.find((el) => el.name === 'w:abstractNumId');
  if (abstractEl?.attributes?.['w:val'] != null) {
    return Number(abstractEl.attributes['w:val']);
  }
  return undefined;
}

/**
 * Filter numbering definitions to remove orphaned entries not referenced by
 * any paragraph in the exported document. Returns new arrays (does not mutate).
 *
 * @param {{ abstracts: Record<number, any>, definitions: Record<number, any> }} numbering
 *   The converter's numbering data (abstracts keyed by abstractNumId, definitions keyed by numId)
 * @param {Set<number>} referencedNumIds
 *   The set of numId values actually referenced in the exported document
 * @returns {{ liveAbstracts: any[], liveDefinitions: any[] }}
 *   Filtered arrays ready to be written to word/numbering.xml
 */
export function filterOrphanedNumberingDefinitions(numbering, referencedNumIds) {
  // Keep only w:num entries whose numId is still referenced
  const liveDefinitions = Object.values(numbering.definitions).filter((def) =>
    referencedNumIds.has(Number(def.attributes?.['w:numId'])),
  );

  // Derive the set of abstractNumIds referenced by surviving w:num entries
  const referencedAbstractIds = new Set();
  for (const def of liveDefinitions) {
    const abstractId = getAbstractNumIdFromDef(def);
    if (abstractId != null) {
      referencedAbstractIds.add(abstractId);
    }
  }

  // Keep only w:abstractNum entries still referenced by a surviving w:num
  const liveAbstracts = Object.values(numbering.abstracts).filter((abs) =>
    referencedAbstractIds.has(Number(abs.attributes?.['w:abstractNumId'])),
  );

  return { liveAbstracts, liveDefinitions };
}
