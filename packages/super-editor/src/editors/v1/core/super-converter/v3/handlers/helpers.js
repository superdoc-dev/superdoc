import { processOutputMarks } from '@converter/exporter.js';
import { TrackFormatMarkName } from '@extensions/track-changes/constants.js';

export const ParagraphSplitSnapshotType = 'paragraphSplit';

const getMarkType = (mark) => mark?.type?.name ?? mark?.type ?? null;
const getSnapshotType = (snapshot) => snapshot?.type?.name ?? snapshot?.type ?? null;
const isDecimalString = (value) => typeof value === 'string' && /^\d+$/.test(value);

const toRunPropertyElements = (marks = []) =>
  processOutputMarks(marks).filter((element) => element && typeof element === 'object' && element.name);

const hashStringToDecimalId = (value) => {
  const source = String(value || '0');
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }
  return String(hash || 1);
};

const getTrackFormatChangeWordId = (trackFormatMark, options = {}) => {
  const allocator = options?.wordIdAllocator || null;
  const partPath = options?.partPath || 'word/document.xml';
  const sourceId = trackFormatMark.attrs?.sourceId == null ? '' : String(trackFormatMark.attrs.sourceId);
  const logicalId = trackFormatMark.attrs?.id == null ? '' : String(trackFormatMark.attrs.id);

  if (allocator) return allocator.allocate({ partPath, sourceId, logicalId });
  if (isDecimalString(sourceId)) return sourceId;
  if (isDecimalString(logicalId)) return logicalId;
  return hashStringToDecimalId(sourceId || logicalId);
};

const getTrackChangeAuthor = (trackFormatMark) => {
  const author = trackFormatMark.attrs?.author;
  return author == null ? '' : String(author);
};

/**
 * Return the first trackFormat mark from a mark list.
 *
 * @param {Array} marks
 * @returns {Object|null}
 */
export const findTrackFormatMark = (marks = []) =>
  marks.find((mark) => getMarkType(mark) === TrackFormatMarkName) ?? null;

export const findSnapshotByType = (snapshots = [], type) =>
  Array.isArray(snapshots) ? (snapshots.find((snapshot) => getSnapshotType(snapshot) === type) ?? null) : null;

export const findParagraphSplitSnapshot = (trackFormatMark) => {
  if (!trackFormatMark) return null;
  return (
    findSnapshotByType(trackFormatMark.attrs?.before, ParagraphSplitSnapshotType) ||
    findSnapshotByType(trackFormatMark.attrs?.after, ParagraphSplitSnapshotType)
  );
};

export const isParagraphSplitTrackFormatMark = (mark) =>
  getMarkType(mark) === TrackFormatMarkName && Boolean(findParagraphSplitSnapshot(mark));

export const createParagraphSplitInsertionElement = (trackFormatMark, options = {}) => {
  const paragraphSplit = findParagraphSplitSnapshot(trackFormatMark);
  if (!paragraphSplit) return undefined;

  return {
    type: 'element',
    name: 'w:ins',
    attributes: {
      'w:id': getTrackFormatChangeWordId(trackFormatMark, options),
      'w:author': getTrackChangeAuthor(trackFormatMark),
      'w:date': trackFormatMark.attrs?.date,
    },
  };
};

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
export const createRunPropertiesChangeElement = (trackFormatMark, options = {}) => {
  if (!trackFormatMark) return undefined;

  const beforeMarks = Array.isArray(trackFormatMark.attrs?.before) ? trackFormatMark.attrs.before : [];
  const previousRunProperties = {
    type: 'element',
    name: 'w:rPr',
    elements: toRunPropertyElements(beforeMarks),
  };

  // Prefer the export allocator for Word-native revision ids. Legacy callers
  // without an allocator still need decimal OOXML ids, so they use a decimal
  // source/logical id when available and a deterministic decimal fallback
  // otherwise.
  const wordId = getTrackFormatChangeWordId(trackFormatMark, options);

  // w:authorEmail is not part of the OOXML CT_TrackChange attribute set, so it is
  // intentionally omitted from <w:rPrChange>. The author email remains available on
  // the internal trackFormat mark attrs for editor-side use; it is just not serialized.
  return {
    type: 'element',
    name: 'w:rPrChange',
    attributes: {
      'w:id': wordId,
      'w:author': getTrackChangeAuthor(trackFormatMark),
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
export const appendTrackFormatChangeToRunProperties = (runPropertiesNode, marks = [], options = {}) => {
  if (!runPropertiesNode) return runPropertiesNode;

  const trackFormatMark = findTrackFormatMark(marks);
  if (!trackFormatMark) return runPropertiesNode;

  if (!Array.isArray(runPropertiesNode.elements)) {
    runPropertiesNode.elements = [];
  }

  const hasExistingChange = runPropertiesNode.elements.some((element) => element?.name === 'w:rPrChange');
  if (hasExistingChange) return runPropertiesNode;

  const changeElement = createRunPropertiesChangeElement(trackFormatMark, options);
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
