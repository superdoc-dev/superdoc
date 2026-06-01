const RUN_LEVEL_WRAPPERS = new Set(['w:hyperlink', 'w:ins', 'w:del', 'w:smartTag']);

/**
 * Convert SDT child elements into Word run elements.
 * @param {Array<Object>|Object} elements
 * @returns {Array<Object>}
 */
export function convertSdtContentToRuns(elements) {
  const normalized = Array.isArray(elements) ? elements : [elements];
  const runs = [];

  normalized.forEach((element) => {
    if (!element) return;

    if (element.name === 'w:sdtPr') {
      return;
    }

    if (element.name === 'w:r') {
      runs.push(element);
      return;
    }

    if (element.name === 'w:sdt') {
      // Recursively flatten nested SDTs into the surrounding run sequence, skipping property bags.
      const sdtContent = (element.elements || []).find((child) => child?.name === 'w:sdtContent');
      if (sdtContent?.elements) {
        runs.push(...convertSdtContentToRuns(sdtContent.elements));
      }
      return;
    }

    if (RUN_LEVEL_WRAPPERS.has(element.name)) {
      const children = element.elements || [];
      // w:smartTagPr is property metadata for w:smartTag, not run content.
      // Preserve it directly on the wrapper instead of feeding it into the
      // recursive flatten, which would mangle it into a fake w:r (SD-2647).
      const preserved = [];
      const rest = [];
      for (const child of children) {
        if (element.name === 'w:smartTag' && child?.name === 'w:smartTagPr') {
          preserved.push(child);
        } else {
          rest.push(child);
        }
      }
      const wrapperElements = [...preserved, ...convertSdtContentToRuns(rest)];
      if (wrapperElements.length) {
        runs.push({
          ...element,
          elements: wrapperElements,
        });
      }
      return;
    }

    if (element.name) {
      runs.push({
        name: 'w:r',
        type: 'element',
        elements: element.elements || [element],
      });
    }
  });

  return runs.filter((run) => Array.isArray(run.elements) && run.elements.length > 0);
}
