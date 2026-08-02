import { TrackDeleteMarkName, TrackInsertMarkName } from '@extensions/track-changes/constants.js';

const cloneMark = (mark) => {
  if (!mark) return mark;
  return {
    ...mark,
    attrs: mark.attrs ? { ...mark.attrs } : undefined,
  };
};

const cloneNode = (node) => {
  if (!node || typeof node !== 'object') return node;
  const cloned = { ...node };

  if (node.marks) cloned.marks = node.marks.map((mark) => cloneMark(mark));
  if (node.content) cloned.content = node.content.map((child) => cloneNode(child));
  if (node.elements) cloned.elements = node.elements.map((el) => cloneNode(el));
  if (node.attributes) cloned.attributes = { ...node.attributes };

  return cloned;
};

const cloneRuns = (runs = []) => runs.map((run) => cloneNode(run));

export const prepareRunTrackingContext = (node = {}) => {
  const marks = Array.isArray(node.marks) ? node.marks : [];
  const trackingMarks = marks.filter(
    (mark) => mark?.type === TrackInsertMarkName || mark?.type === TrackDeleteMarkName,
  );

  if (!trackingMarks.length) {
    return { runNode: node, trackingMarksByType: new Map() };
  }

  const trackingMarksByType = new Map();
  trackingMarks.forEach((mark) => {
    if (mark?.type) trackingMarksByType.set(mark.type, cloneMark(mark));
  });

  const preservedMarks = marks
    .filter((mark) => mark?.type !== TrackInsertMarkName && mark?.type !== TrackDeleteMarkName)
    .map((mark) => cloneMark(mark));

  const clonedContent = Array.isArray(node.content)
    ? node.content.map((child) => {
        const childClone = cloneNode(child);
        const childMarks = Array.isArray(childClone.marks) ? childClone.marks.slice() : [];
        trackingMarks.forEach((mark) => {
          childMarks.push(cloneMark(mark));
        });
        childClone.marks = childMarks;
        return childClone;
      })
    : [];

  return {
    runNode: {
      ...cloneNode(node),
      marks: preservedMarks,
      content: clonedContent,
    },
    trackingMarksByType,
  };
};

/**
 * Content child types whose decode() path is confirmed to consult
 * trackInsert/trackDelete marks on export (see no-break-hyphen-translator.js
 * and t-translator.js). Widening this set requires adding the matching
 * decode-side branch to that content type's own translator first — otherwise
 * export would silently drop the tracked-change metadata.
 */
export const TRACKABLE_RUN_CONTENT_TYPES = new Set(['text', 'noBreakHyphen']);

/**
 * Stamp a tracked-change mark (trackInsert/trackDelete) onto every trackable
 * content child of each encoded run, not just the first. A run imported from
 * `<w:ins>`/`<w:del>` may begin with an inline atom (e.g. `<w:noBreakHyphen/>`)
 * before its text — marking only content[0] when it happens to be text drops
 * tracking for that atom and for any content after it.
 *
 * @param {Array<{ content?: Array<Record<string, any>> }>} subElements
 * @param {string} markType
 * @param {Record<string, any>} attrs
 */
export const applyTrackedMarkToRunContent = (subElements = [], markType, attrs) => {
  subElements.forEach((subElement) => {
    subElement.marks = [];
    const content = Array.isArray(subElement?.content) ? subElement.content : [];
    content.forEach((child) => {
      if (!child || !TRACKABLE_RUN_CONTENT_TYPES.has(child.type)) return;
      if (child.marks === undefined) child.marks = [];
      child.marks.push({ type: markType, attrs });
    });
  });
};

const mapTrackingAttrs = (mark, attrMap) => {
  const source = mark?.attrs || {};
  const mapped = {};
  attrMap.forEach((targetKey, sourceKey) => {
    if (source[sourceKey] != null) mapped[targetKey] = source[sourceKey];
  });
  return mapped;
};

const renameTextElementsForDeletion = (node) => {
  if (!node || typeof node !== 'object') return;
  if (node.name === 'w:t') node.name = 'w:delText';
  if (Array.isArray(node.elements)) node.elements.forEach(renameTextElementsForDeletion);
};

export const ensureTrackedWrapper = (runs, trackingMarksByType = new Map(), options = {}) => {
  if (!Array.isArray(runs) || !runs.length) return runs;

  const { isFinalDoc = false } = options;

  const firstRun = runs[0];
  if (firstRun?.name === 'w:ins' || firstRun?.name === 'w:del') {
    return runs;
  }

  if (!trackingMarksByType.size) return runs;

  if (trackingMarksByType.has(TrackInsertMarkName)) {
    if (isFinalDoc) {
      return runs;
    }
    const mark = trackingMarksByType.get(TrackInsertMarkName);
    const clonedRuns = cloneRuns(runs);
    const wrapper = {
      name: 'w:ins',
      attributes: mapTrackingAttrs(
        mark,
        new Map([
          ['id', 'w:id'],
          ['author', 'w:author'],
          ['authorEmail', 'w:authorEmail'],
          ['date', 'w:date'],
        ]),
      ),
      elements: clonedRuns,
    };
    return [wrapper];
  }

  if (trackingMarksByType.has(TrackDeleteMarkName)) {
    if (isFinalDoc) {
      return [];
    }
    const mark = trackingMarksByType.get(TrackDeleteMarkName);
    const clonedRuns = cloneRuns(runs);
    clonedRuns.forEach(renameTextElementsForDeletion);
    const wrapper = {
      name: 'w:del',
      attributes: mapTrackingAttrs(mark, new Map([['id', 'w:id']])),
      elements: clonedRuns,
    };
    return [wrapper];
  }

  return runs;
};
