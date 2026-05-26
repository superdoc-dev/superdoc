/**
 * Marks Module
 *
 * Centralized exports for ProseMirror mark processing, including:
 * - Link/hyperlink utilities
 * - Mark application to text runs
 * - Tracked changes support
 */

// Links
export {
  VALID_LINK_TARGETS,
  toTrimmedString,
  toOptionalBoolean,
  migrateLegacyLink,
  buildFlowRunLink,
} from './links.js';

// Mark application and tracked changes
export {
  TRACK_INSERT_MARK,
  TRACK_DELETE_MARK,
  TRACK_FORMAT_MARK,
  normalizeRunMarkList,
  pickTrackedChangeKind,
  buildTrackedChangeMetaFromMark,
  selectTrackedChangeMeta,
  trackedChangesCompatible,
  collectTrackedChangeFromMarks,
  collectTrackedChangesFromMarks,
  normalizeUnderlineStyle,
  applyTextStyleMark,
  applyMarksToRun,
} from './application.js';
