import { formatIntegerWithNumericPicture, formatPageNumberFieldValue } from '@superdoc/contracts';
import { normalizeSeqIdentifier } from './seq-instruction.js';

/**
 * @typedef {{
 *   initialCounters?: Map<string, number>,
 * }} SeqEvaluatorOptions
 *
 * Note: no `storyKey` is needed. One evaluator instance is created per linear
 * pass over one story's ordered content, so per-story isolation is structural.
 *
 * @typedef {{
 *   identifier: string,
 *   instruction?: string,
 *   fieldArgument?: string,
 *   sequenceMode?: 'next' | 'current',
 *   hideResult?: boolean,
 *   restartNumber?: number | null,
 *   restartLevel?: number | null,
 *   format?: string,
 *   hasGeneralFormat?: boolean,
 *   pageNumberFieldFormat?: import('@superdoc/contracts').PageNumberFieldFormat | null,
 *   numericPictureFormat?: { picture: string } | null,
 *   cachedText?: string,
 * }} SeqFieldInput
 *
 * @typedef {{
 *   paragraphHeadingLevel?: number | null,
 * }} SeqFieldContext
 *
 * @typedef {{
 *   value: number | null,
 *   text: string,
 *   hidden: boolean,
 * }} SeqFieldEvaluation
 */

export class SequenceFieldEvaluator {
  /**
   * @param {SeqEvaluatorOptions} options
   */
  constructor(options = {}) {
    this.counters = new Map(options.initialCounters ?? []);
    this.headingSerialsByLevel = new Map();
    this.lastResetSerialByIdentifierLevel = new Map();
  }

  /**
   * @param {SeqFieldContext} context
   */
  enterParagraph(context = {}) {
    const level = context.paragraphHeadingLevel;
    if (!isValidHeadingLevel(level)) return;

    this.headingSerialsByLevel.set(level, (this.headingSerialsByLevel.get(level) ?? 0) + 1);
    for (let deeperLevel = level + 1; deeperLevel <= 9; deeperLevel += 1) {
      this.headingSerialsByLevel.delete(deeperLevel);
    }
  }

  /**
   * @param {SeqFieldInput} field
   * @returns {SeqFieldEvaluation}
   */
  evaluateField(field) {
    const identifier = normalizeSeqIdentifier(field?.identifier);
    const cachedText = typeof field?.cachedText === 'string' ? field.cachedText : '';

    if (!identifier) {
      return { value: null, text: cachedText, hidden: false };
    }

    if (hasFieldArgument(field)) {
      // A SEQ field argument references a bookmarked item elsewhere. Correct
      // behavior needs bookmark position resolution; until Phase 7 wires that
      // in, preserve cached text or conservatively repeat the current counter.
      // This short-circuit intentionally bypasses \h suppression for now.
      if (cachedText) return { value: null, text: cachedText, hidden: false };
      if (!this.counters.has(identifier)) return { value: null, text: '', hidden: false };

      const value = this.counters.get(identifier);
      return { value, text: formatSeqValue(value, field), hidden: false };
    }

    const restartLevel = normalizeRestartLevel(field?.restartLevel);
    if (restartLevel != null) {
      const key = `${identifier}|${restartLevel}`;
      const serial = this.headingSerialsByLevel.get(restartLevel) ?? 0;
      const previousSerial = this.lastResetSerialByIdentifierLevel.get(key);
      if (previousSerial === undefined || serial !== previousSerial) {
        // ECMA says \s "resets to the heading level"; Word interprets this as
        // restarting sequence numbering within each heading-N section.
        this.counters.set(identifier, 0);
        this.lastResetSerialByIdentifierLevel.set(key, serial);
      }
    }

    const restartNumber = normalizeRestartNumber(field?.restartNumber);
    let value;
    if (restartNumber != null) {
      this.counters.set(identifier, restartNumber);
      value = restartNumber;
    } else if (field?.sequenceMode === 'current') {
      if (!this.counters.has(identifier)) {
        return { value: 0, text: cachedText, hidden: false };
      }
      value = this.counters.get(identifier);
    } else {
      value = (this.counters.get(identifier) ?? 0) + 1;
      this.counters.set(identifier, value);
    }

    const hidden = Boolean(field?.hideResult && !field.hasGeneralFormat && !field.numericPictureFormat);
    return {
      value,
      text: hidden ? '' : formatSeqValue(value, field),
      hidden,
    };
  }
}

/**
 * @param {unknown} value
 */
function isValidHeadingLevel(value) {
  return Number.isInteger(value) && value >= 1 && value <= 9;
}

/**
 * @param {unknown} value
 */
function normalizeRestartLevel(value) {
  return isValidHeadingLevel(value) ? value : null;
}

/**
 * @param {unknown} value
 */
function normalizeRestartNumber(value) {
  return Number.isFinite(value) && Number.isInteger(value) ? Math.trunc(value) : null;
}

/**
 * @param {SeqFieldInput | undefined} field
 */
function hasFieldArgument(field) {
  return typeof field?.fieldArgument === 'string' && field.fieldArgument.trim().length > 0;
}

/**
 * @param {number} value
 * @param {SeqFieldInput | undefined} field
 */
function formatSeqValue(value, field) {
  const picture = field?.numericPictureFormat?.picture;
  if (picture) {
    return formatIntegerWithNumericPicture(value, picture);
  }
  if (field?.pageNumberFieldFormat) {
    return formatPageNumberFieldValue(value, field.pageNumberFieldFormat);
  }
  return String(value);
}
