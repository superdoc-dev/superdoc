import { baseOrderedListDef } from '@core/helpers/baseListDefinitions.js';

const WORD_2012_NAMESPACE = 'http://schemas.microsoft.com/office/word/2012/wordml';

/**
 * Patch numbering definitions in a DOCX file to ensure proper numbering styles.
 * This function modifies the numbering.xml part of the DOCX to fix issues
 * where a numbering definition might target an undefined abstract numbering definition.
 * @param {Object} docx - The DOCX file object to be patched.
 */
export function patchNumberingDefinitions(docx) {
  const numberingXml = docx?.['word/numbering.xml'];
  if (!numberingXml) return;

  const numberingRoot = getNumberingRoot(numberingXml);
  if (!numberingRoot?.elements?.length) return;

  const numberingElements = numberingRoot.elements;

  const existingAbstractIds = new Set();
  for (const el of numberingElements) {
    if (el?.name !== 'w:abstractNum') continue;
    const abstractId = getAbstractIdFromAbstractNode(el);
    if (abstractId) existingAbstractIds.add(abstractId);
  }

  const missingAbstractIds = new Set();
  for (const el of numberingElements) {
    if (el?.name !== 'w:num') continue;
    const abstractId = getAbstractIdFromNum(el);
    if (!abstractId) continue;
    if (!existingAbstractIds.has(abstractId)) {
      missingAbstractIds.add(abstractId);
    }
  }

  if (!missingAbstractIds.size) return;

  // Ensure the w15 namespace is declared when we add the base ordered list definition,
  // which includes a w15:* attribute.
  numberingRoot.attributes = numberingRoot.attributes || {};
  if (!numberingRoot.attributes['xmlns:w15']) {
    numberingRoot.attributes['xmlns:w15'] = WORD_2012_NAMESPACE;
  }

  const firstNumIndex = numberingElements.findIndex((el) => el?.name === 'w:num');
  let insertIndex = firstNumIndex === -1 ? numberingElements.length : firstNumIndex;

  const sortedMissingIds = Array.from(missingAbstractIds).sort((a, b) => {
    const aNum = Number(a);
    const bNum = Number(b);
    const aIsNum = !Number.isNaN(aNum);
    const bIsNum = !Number.isNaN(bNum);
    if (aIsNum && bIsNum) return aNum - bNum;
    if (aIsNum) return -1;
    if (bIsNum) return 1;
    return a.localeCompare(b);
  });

  for (const abstractId of sortedMissingIds) {
    if (existingAbstractIds.has(abstractId)) continue;
    const newAbstract = deepClone(baseOrderedListDef);
    newAbstract.attributes = {
      ...(newAbstract.attributes || {}),
      'w:abstractNumId': String(abstractId),
    };
    numberingElements.splice(insertIndex, 0, newAbstract);
    insertIndex += 1;
    existingAbstractIds.add(abstractId);
  }
}

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const getNumberingRoot = (numberingXml) => {
  if (!numberingXml?.elements?.length) return null;
  return numberingXml.elements.find((el) => el?.name === 'w:numbering') || numberingXml.elements[0] || null;
};

const getAbstractIdFromNum = (numNode) => {
  const abstractRef = numNode?.elements?.find((child) => child?.name === 'w:abstractNumId');
  const abstractVal = abstractRef?.attributes?.['w:val'];
  return abstractVal == null ? null : String(abstractVal);
};

const getAbstractIdFromAbstractNode = (abstractNode) => {
  const raw = abstractNode?.attributes?.['w:abstractNumId'];
  return raw == null ? null : String(raw);
};
