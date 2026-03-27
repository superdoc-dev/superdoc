import { carbonCopy } from '@core/utilities/carbonCopy.js';

/**
 * Merge drawing children while ensuring:
 * - wp:extent always comes from generated nodes
 * - originals are preferred at their recorded index for other names
 * - remaining generated nodes are appended
 *
 * @param {Object} params
 * @param {string[]} [params.order] - Original child order
 * @param {Object[]} [params.generated] - Generated children (extent, docPr, etc.)
 * @param {{index: number, xml: Object}[]} [params.original] - Original children keyed by index (excluding extent)
 * @returns {Object[]} merged children
 */
export function mergeDrawingChildren({ order, generated, original }) {
  const genQueues = groupByName(generated);
  const originalsByIndex = groupByIndex(original);
  const merged = mergeWithOrder(order, genQueues, originalsByIndex);

  // Originals may carry invalid IDs (e.g. id="0") that Word rejects.
  // Patch them using the valid ID from the generated wp:docPr.
  fixZeroDrawingIds(merged, generated);

  return merged;
}

function groupByIndex(entries = []) {
  const map = new Map();
  entries.forEach((entry) => {
    if (!entry) return;
    const { index, xml } = entry;
    if (typeof index === 'number' && xml && xml.name !== 'wp:extent') {
      map.set(index, carbonCopy(xml));
    }
  });
  return map;
}

function mergeWithOrder(order = [], genQueues, originalsByIndex) {
  const out = [];
  const namesInOrder = new Set(order);

  order.forEach((name, idx) => {
    if (name === 'wp:extent') {
      const queue = genQueues.get('wp:extent') || [];
      if (queue.length) {
        out.push(queue.shift());
        if (!queue.length) genQueues.delete('wp:extent');
      }
      return;
    }

    if (originalsByIndex.has(idx)) {
      out.push(originalsByIndex.get(idx));
      originalsByIndex.delete(idx);
      // Drop any generated with the same name to avoid duplicates
      if (genQueues.has(name)) {
        genQueues.delete(name);
      }
      return;
    }

    const queue = genQueues.get(name) || [];
    if (queue.length) {
      out.push(queue.shift());
      if (!queue.length) genQueues.delete(name);
    }
  });

  originalsByIndex.forEach((xml) => out.push(xml));
  genQueues.forEach((queue, name) => {
    if (namesInOrder.has(name)) return;
    queue.forEach((el) => out.push(el));
  });

  return out;
}

function groupByName(nodes = []) {
  const map = new Map();
  nodes.forEach((el) => {
    if (!el?.name) return;
    const list = map.get(el.name) || [];
    list.push(carbonCopy(el));
    map.set(el.name, list);
  });
  return map;
}

/**
 * Patch zero/missing IDs on wp:docPr and pic:cNvPr in merged output.
 * When the merge prefers an original element, it may carry an invalid id="0"
 * that Word rejects. We fix it using the valid ID from the generated wp:docPr.
 */
function fixZeroDrawingIds(merged, generated) {
  const genDocPr = generated?.find((el) => el?.name === 'wp:docPr');
  const validId = genDocPr?.attributes?.id;
  if (!validId || !(Number(validId) > 0)) return;

  const docPr = merged.find((el) => el?.name === 'wp:docPr');
  if (docPr?.attributes && !(Number(docPr.attributes.id) > 0)) {
    docPr.attributes.id = validId;
  }

  const graphic = merged.find((el) => el?.name === 'a:graphic');
  const graphicData = graphic?.elements?.find((el) => el?.name === 'a:graphicData');
  const pic = graphicData?.elements?.find((el) => el?.name === 'pic:pic');
  const nvPicPr = pic?.elements?.find((el) => el?.name === 'pic:nvPicPr');
  const cNvPr = nvPicPr?.elements?.find((el) => el?.name === 'pic:cNvPr');
  if (cNvPr?.attributes && !(Number(cNvPr.attributes.id) > 0)) {
    cNvPr.attributes.id = validId;
  }
}
