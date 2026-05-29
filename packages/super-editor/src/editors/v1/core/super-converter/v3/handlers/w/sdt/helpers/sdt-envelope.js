// @ts-check

/**
 * Extract the common OOXML structured document tag envelope pieces.
 *
 * @param {any} node
 * @returns {{ sdtPr: any, sdtEndPr: any, sdtContent: any }}
 */
export const getSdtEnvelopeParts = (node) => {
  const elements = Array.isArray(node?.elements) ? node.elements : [];
  return {
    sdtPr: elements.find((el) => el?.name === 'w:sdtPr') ?? null,
    sdtEndPr: elements.find((el) => el?.name === 'w:sdtEndPr') ?? null,
    sdtContent: elements.find((el) => el?.name === 'w:sdtContent') ?? null,
  };
};
