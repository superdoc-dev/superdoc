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

/**
 * Normalize direct children plus same-level SDT wrappers into the child stream
 * a parent translator consumes.
 *
 * @param {any} parent
 * @param {{ childName: string, metadataKey: string, scope: string }} config
 * @returns {Array<{ node: any } & Record<string, any>>}
 */
export const normalizeSdtContentChildren = (parent, { childName, metadataKey, scope }) => {
  const out = [];
  const children = Array.isArray(parent?.elements) ? parent.elements : [];
  for (const child of children) {
    if (!child || typeof child.name !== 'string') continue;
    if (child.name === childName) {
      out.push({ node: child, [metadataKey]: null });
      continue;
    }
    if (child.name === 'w:sdt') {
      const { sdtPr, sdtEndPr, sdtContent } = getSdtEnvelopeParts(child);
      const innerChildren = sdtContent?.elements?.filter((el) => el?.name === childName) ?? [];
      if (innerChildren.length === 1 && sdtPr) {
        out.push({
          node: innerChildren[0],
          [metadataKey]: { scope, sdtPr, sdtEndPr },
        });
      } else {
        for (const innerChild of innerChildren) {
          out.push({ node: innerChild, [metadataKey]: null });
        }
      }
    }
  }
  return out;
};

/**
 * Re-wrap exported child elements that carry preserved SDT envelope metadata.
 *
 * @param {any[]} elements
 * @param {any[]} sourceChildren
 * @param {{ childName: string, metadataKey: string, scope: string }} config
 * @returns {any[]}
 */
export const wrapSdtContentChildren = (elements, sourceChildren, { childName, metadataKey, scope }) => {
  let sourceCursor = 0;
  for (let i = 0; i < elements.length; i += 1) {
    const exportedEl = elements[i];
    if (!exportedEl || exportedEl.name !== childName) continue;
    const sourceChild = sourceChildren?.[sourceCursor];
    sourceCursor += 1;
    const sdtMetadata = sourceChild?.attrs?.[metadataKey];
    if (!sdtMetadata || sdtMetadata.scope !== scope || !sdtMetadata.sdtPr) continue;
    const sdtChildren = [sdtMetadata.sdtPr];
    if (sdtMetadata.sdtEndPr) sdtChildren.push(sdtMetadata.sdtEndPr);
    sdtChildren.push({ name: 'w:sdtContent', elements: [exportedEl] });
    elements[i] = { name: 'w:sdt', elements: sdtChildren };
  }
  return elements;
};
