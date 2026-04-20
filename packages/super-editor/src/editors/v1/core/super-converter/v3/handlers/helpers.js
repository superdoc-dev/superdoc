import { processOutputMarks } from '@converter/exporter.js';
import { TrackFormatMarkName } from '@extensions/track-changes/constants.js';

const getMarkType = (mark) => mark?.type?.name ?? mark?.type ?? null;

const toRunPropertyElements = (marks = []) =>
  processOutputMarks(marks).filter((element) => element && typeof element === 'object' && element.name);

/**
 * Return the first trackFormat mark from a mark list.
 *
 * @param {Array} marks
 * @returns {Object|null}
 */
export const findTrackFormatMark = (marks = []) =>
  marks.find((mark) => getMarkType(mark) === TrackFormatMarkName) ?? null;

/**
 * Build a valid OOXML <w:rPrChange> node from a trackFormat mark.
 *
 * OOXML stores the "before" state under a nested <w:rPr> inside <w:rPrChange>.
 * The visible "after" state is already represented by the owning run's current
 * run properties, so only the "before" marks need to be serialized here.
 *
 * @param {Object|null|undefined} trackFormatMark
 * @returns {Object|undefined}
 */
export const createRunPropertiesChangeElement = (trackFormatMark) => {
  if (!trackFormatMark) return undefined;

  const beforeMarks = Array.isArray(trackFormatMark.attrs?.before) ? trackFormatMark.attrs.before : [];
  const previousRunProperties = {
    type: 'element',
    name: 'w:rPr',
    elements: toRunPropertyElements(beforeMarks),
  };

  return {
    type: 'element',
    name: 'w:rPrChange',
    attributes: {
      'w:id': trackFormatMark.attrs?.sourceId || trackFormatMark.attrs?.id,
      'w:author': trackFormatMark.attrs?.author,
      'w:authorEmail': trackFormatMark.attrs?.authorEmail,
      'w:date': trackFormatMark.attrs?.date,
    },
    elements: [previousRunProperties],
  };
};

/**
 * Append a track-format change node to an OOXML <w:rPr> element if one is not already present.
 *
 * @param {Object|null|undefined} runPropertiesNode
 * @param {Array} marks
 * @returns {Object|null|undefined}
 */
export const appendTrackFormatChangeToRunProperties = (runPropertiesNode, marks = []) => {
  if (!runPropertiesNode) return runPropertiesNode;

  const trackFormatMark = findTrackFormatMark(marks);
  if (!trackFormatMark) return runPropertiesNode;

  if (!Array.isArray(runPropertiesNode.elements)) {
    runPropertiesNode.elements = [];
  }

  const hasExistingChange = runPropertiesNode.elements.some((element) => element?.name === 'w:rPrChange');
  if (hasExistingChange) return runPropertiesNode;

  const changeElement = createRunPropertiesChangeElement(trackFormatMark);
  if (changeElement) {
    runPropertiesNode.elements.push(changeElement);
  }

  return runPropertiesNode;
};

/**
 * Backward-compatible alias kept while older tests and callers migrate.
 *
 * @param {Array} marks
 * @returns {Object|undefined}
 */
export const createTrackStyleMark = (marks) => createRunPropertiesChangeElement(findTrackFormatMark(marks));
