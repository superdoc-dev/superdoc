import { FOOTER_RELATIONSHIP_TYPE, HEADER_RELATIONSHIP_TYPE, HYPERLINK_RELATIONSHIP_TYPE } from './constants.js';

const REL_ID_NUMERIC_PATTERN = /rId|mi/g;

/**
 * Extracts the largest numeric suffix from the provided relationship IDs.
 *
 * @param {import('../types.js').XmlRelationshipElement[]} relationships
 * @returns {number} Highest numeric relationship identifier that already exists.
 */
export const getLargestRelationshipId = (relationships = []) => {
  const numericIds = relationships
    .map((rel) => Number(String(rel?.attributes?.Id ?? '').replace(REL_ID_NUMERIC_PATTERN, '')))
    .filter((value) => Number.isFinite(value));

  return numericIds.length ? Math.max(...numericIds) : 0;
};

/**
 * Merge new relationship elements with the existing relationship list.
 * Ensures IDs stay unique and avoids duplicating existing relationships.
 *
 * @param {import('../types.js').XmlRelationshipElement[]} existingRelationships
 * @param {import('../types.js').XmlRelationshipElement[]} newRelationships
 * @returns {import('../types.js').XmlRelationshipElement[]} merged relationships array
 */
export const mergeRelationshipElements = (existingRelationships = [], newRelationships = []) => {
  if (!newRelationships?.length) {
    return existingRelationships;
  }

  let largestId = getLargestRelationshipId(existingRelationships);
  const seenIds = new Set(existingRelationships.map((rel) => rel?.attributes?.Id).filter(Boolean));

  // Pre-scan provided numeric IDs in new relationships that don't already exist to make
  // auto-assignment order-independent. This mirrors Word's tendency to preserve caller-provided IDs
  // and allocate the next free numeric for generated ones.
  for (const rel of newRelationships) {
    const id = rel?.attributes?.Id;
    if (!id || seenIds.has(id)) continue;
    const numeric = Number(String(id).replace(REL_ID_NUMERIC_PATTERN, ''));
    if (Number.isFinite(numeric) && numeric > largestId) largestId = numeric;
  }
  const additions = [];

  newRelationships.forEach((rel) => {
    if (!rel?.attributes) return;

    const attributes = rel.attributes;
    const currentId = attributes.Id || '';
    const existingTarget = existingRelationships.find((el) => el.attributes.Target === attributes.Target);
    // Images added in collaboration mode may miss relations but have an ID.
    const isNewHyperlink = attributes.Type === HYPERLINK_RELATIONSHIP_TYPE && currentId.length > 6;
    const isNewHeadFoot =
      (attributes.Type === HEADER_RELATIONSHIP_TYPE || attributes.Type === FOOTER_RELATIONSHIP_TYPE) &&
      currentId.length > 6;
    const hasSeenId = currentId && seenIds.has(currentId);

    // If a relationship with the same Target already exists, skip adding a duplicate
    if (!isNewHyperlink && !isNewHeadFoot && existingTarget) return;

    // Ensure a unique Id. If the provided Id collides or is missing, assign a new one.
    if (!currentId || hasSeenId) {
      // Pick the next available numeric Id starting at current largestId (order independent)
      let candidate = Math.max(largestId, 1);
      while (seenIds.has(`rId${candidate}`)) {
        candidate += 1;
      }
      attributes.Id = `rId${candidate}`;
      largestId = candidate;
    } else {
      // When keeping the provided Id, if it's numeric (e.g., rId12) update largestId
      const numeric = Number(String(currentId).replace(REL_ID_NUMERIC_PATTERN, ''));
      if (Number.isFinite(numeric) && numeric > largestId) largestId = numeric;
    }

    seenIds.add(attributes.Id);

    additions.push(rel);
  });

  const result = additions.length ? [...existingRelationships, ...additions] : existingRelationships;

  return result;
};
