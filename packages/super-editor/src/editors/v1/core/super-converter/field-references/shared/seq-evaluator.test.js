import { describe, expect, it } from 'vitest';
import { SequenceFieldEvaluator } from './seq-evaluator.js';

describe('SequenceFieldEvaluator', () => {
  it('numbers each identifier independently in document order', () => {
    const evaluator = new SequenceFieldEvaluator();

    expect(evaluator.evaluateField({ identifier: 'Figure' })).toMatchObject({ value: 1, text: '1' });
    expect(evaluator.evaluateField({ identifier: 'Figure' })).toMatchObject({ value: 2, text: '2' });
    expect(evaluator.evaluateField({ identifier: 'Table' })).toMatchObject({ value: 1, text: '1' });
  });

  it('treats explicit next mode as the default', () => {
    const evaluator = new SequenceFieldEvaluator();

    expect(evaluator.evaluateField({ identifier: 'Figure', sequenceMode: 'next' })).toMatchObject({
      value: 1,
      text: '1',
    });
    expect(evaluator.evaluateField({ identifier: 'Figure' })).toMatchObject({ value: 2, text: '2' });
  });

  it('repeats the current value without incrementing', () => {
    const evaluator = new SequenceFieldEvaluator();

    evaluator.evaluateField({ identifier: 'Figure' });
    expect(evaluator.evaluateField({ identifier: 'Figure', sequenceMode: 'current' })).toMatchObject({
      value: 1,
      text: '1',
    });
    expect(evaluator.evaluateField({ identifier: 'Figure' })).toMatchObject({ value: 2, text: '2' });
  });

  it('uses cached text or empty text for current mode before any prior value', () => {
    const evaluator = new SequenceFieldEvaluator();

    expect(evaluator.evaluateField({ identifier: 'Figure', sequenceMode: 'current', cachedText: 'cached' })).toEqual({
      value: 0,
      text: 'cached',
      hidden: false,
    });
    expect(evaluator.evaluateField({ identifier: 'Table', sequenceMode: 'current' })).toEqual({
      value: 0,
      text: '',
      hidden: false,
    });
  });

  it('applies explicit restart and continues from that value', () => {
    const evaluator = new SequenceFieldEvaluator();

    expect(evaluator.evaluateField({ identifier: 'Figure', restartNumber: 10 })).toMatchObject({
      value: 10,
      text: '10',
    });
    expect(evaluator.evaluateField({ identifier: 'Figure' })).toMatchObject({ value: 11, text: '11' });
  });

  it('hides text while still updating the counter', () => {
    const evaluator = new SequenceFieldEvaluator();

    expect(evaluator.evaluateField({ identifier: 'Figure' })).toMatchObject({ value: 1, text: '1' });
    expect(evaluator.evaluateField({ identifier: 'Figure', hideResult: true })).toEqual({
      value: 2,
      text: '',
      hidden: true,
    });
    expect(evaluator.evaluateField({ identifier: 'Figure' })).toMatchObject({ value: 3, text: '3' });
  });

  it('does not hide text when a general format is present', () => {
    const evaluator = new SequenceFieldEvaluator();

    expect(
      evaluator.evaluateField({
        identifier: 'Figure',
        hideResult: true,
        hasGeneralFormat: true,
        pageNumberFieldFormat: { format: 'decimal' },
      }),
    ).toEqual({ value: 1, text: '1', hidden: false });
  });

  it('restarts on the first heading-level reset field and when that heading level changes', () => {
    const evaluator = new SequenceFieldEvaluator();

    evaluator.enterParagraph({ paragraphHeadingLevel: 1 });
    expect(evaluator.evaluateField({ identifier: 'Figure', restartLevel: 1 })).toMatchObject({ value: 1, text: '1' });
    expect(evaluator.evaluateField({ identifier: 'Figure', restartLevel: 1 })).toMatchObject({ value: 2, text: '2' });

    evaluator.enterParagraph({ paragraphHeadingLevel: 1 });
    expect(evaluator.evaluateField({ identifier: 'Figure', restartLevel: 1 })).toMatchObject({ value: 1, text: '1' });
  });

  it('restarts for level 2 only when the level 2 serial changes', () => {
    const evaluator = new SequenceFieldEvaluator();

    evaluator.enterParagraph({ paragraphHeadingLevel: 1 });
    expect(evaluator.evaluateField({ identifier: 'Figure', restartLevel: 2 })).toMatchObject({ value: 1, text: '1' });

    evaluator.enterParagraph({ paragraphHeadingLevel: 1 });
    expect(evaluator.evaluateField({ identifier: 'Figure', restartLevel: 2 })).toMatchObject({ value: 2, text: '2' });

    evaluator.enterParagraph({ paragraphHeadingLevel: 2 });
    expect(evaluator.evaluateField({ identifier: 'Figure', restartLevel: 2 })).toMatchObject({ value: 1, text: '1' });

    evaluator.enterParagraph({ paragraphHeadingLevel: 2 });
    expect(evaluator.evaluateField({ identifier: 'Figure', restartLevel: 2 })).toMatchObject({ value: 1, text: '1' });
  });

  it('treats a deleted deeper heading serial as 0 for heading-level resets', () => {
    const evaluator = new SequenceFieldEvaluator();

    evaluator.enterParagraph({ paragraphHeadingLevel: 1 });
    evaluator.enterParagraph({ paragraphHeadingLevel: 3 });
    expect(evaluator.evaluateField({ identifier: 'Figure', restartLevel: 3 })).toMatchObject({ value: 1, text: '1' });
    expect(evaluator.evaluateField({ identifier: 'Figure' })).toMatchObject({ value: 2, text: '2' });

    evaluator.enterParagraph({ paragraphHeadingLevel: 1 });
    expect(evaluator.evaluateField({ identifier: 'Figure', restartLevel: 3 })).toMatchObject({ value: 1, text: '1' });
  });

  it('lets explicit restart win over heading-level reset', () => {
    const evaluator = new SequenceFieldEvaluator();

    evaluator.enterParagraph({ paragraphHeadingLevel: 1 });
    expect(evaluator.evaluateField({ identifier: 'Figure', restartLevel: 1, restartNumber: 7 })).toMatchObject({
      value: 7,
      text: '7',
    });
    expect(evaluator.evaluateField({ identifier: 'Figure' })).toMatchObject({ value: 8, text: '8' });
  });

  it('repeats the current counter after explicit restart', () => {
    const evaluator = new SequenceFieldEvaluator();

    evaluator.evaluateField({ identifier: 'Figure', restartNumber: 7 });
    expect(evaluator.evaluateField({ identifier: 'Figure', sequenceMode: 'current' })).toMatchObject({
      value: 7,
      text: '7',
    });
  });

  it('formats values with general and numeric-picture formats', () => {
    const evaluator = new SequenceFieldEvaluator();

    expect(
      evaluator.evaluateField({ identifier: 'Roman', pageNumberFieldFormat: { format: 'lowerRoman' } }),
    ).toMatchObject({ value: 1, text: 'i' });
    expect(
      evaluator.evaluateField({ identifier: 'Alpha', pageNumberFieldFormat: { format: 'upperLetter' } }),
    ).toMatchObject({ value: 1, text: 'A' });
    expect(
      evaluator.evaluateField({ identifier: 'Dash', pageNumberFieldFormat: { format: 'numberInDash' } }),
    ).toMatchObject({ value: 1, text: '- 1 -' });
    expect(evaluator.evaluateField({ identifier: 'Picture', numericPictureFormat: { picture: '00' } })).toMatchObject({
      value: 1,
      text: '01',
    });
  });

  it('gives numeric-picture formatting priority over general formatting', () => {
    const evaluator = new SequenceFieldEvaluator();

    expect(
      evaluator.evaluateField({
        identifier: 'Figure',
        pageNumberFieldFormat: { format: 'lowerRoman' },
        numericPictureFormat: { picture: '00' },
      }),
    ).toMatchObject({ value: 1, text: '01' });
  });

  it('defaults unknown formats to decimal display instead of cached text', () => {
    const evaluator = new SequenceFieldEvaluator();

    expect(
      evaluator.evaluateField({
        identifier: 'Figure',
        format: 'OrdText',
        hasGeneralFormat: true,
        cachedText: 'cached',
      }),
    ).toMatchObject({ value: 1, text: '1' });
  });

  it('returns cached fallback for empty identifiers without mutating counters', () => {
    const evaluator = new SequenceFieldEvaluator();

    expect(evaluator.evaluateField({ identifier: '', cachedText: 'cached' })).toEqual({
      value: null,
      text: 'cached',
      hidden: false,
    });
    expect(evaluator.evaluateField({ identifier: 'Figure' })).toMatchObject({ value: 1, text: '1' });
  });

  it('handles field arguments conservatively without mutating counters', () => {
    const evaluator = new SequenceFieldEvaluator();

    expect(evaluator.evaluateField({ identifier: 'Figure', fieldArgument: 'bookmark', cachedText: 'cached' })).toEqual({
      value: null,
      text: 'cached',
      hidden: false,
    });
    expect(evaluator.evaluateField({ identifier: 'Figure' })).toMatchObject({ value: 1, text: '1' });
    expect(evaluator.evaluateField({ identifier: 'Figure', fieldArgument: 'bookmark' })).toEqual({
      value: 1,
      text: '1',
      hidden: false,
    });
    expect(evaluator.evaluateField({ identifier: 'Figure' })).toMatchObject({ value: 2, text: '2' });
  });

  it('can start from caller-provided initial counters', () => {
    const evaluator = new SequenceFieldEvaluator({ initialCounters: new Map([['Figure', 4]]) });

    expect(evaluator.evaluateField({ identifier: 'Figure', sequenceMode: 'current' })).toMatchObject({
      value: 4,
      text: '4',
    });
    expect(evaluator.evaluateField({ identifier: 'Figure' })).toMatchObject({ value: 5, text: '5' });
  });
});
