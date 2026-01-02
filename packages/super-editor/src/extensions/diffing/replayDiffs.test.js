import { describe, it, expect } from 'vitest';

import { replayDiffs } from './replayDiffs';
import {
  replayDocDiffs,
  replayNonParagraphDiff,
  replayParagraphDiff,
  replayInlineDiff,
  applyAttrsDiff,
  marksFromDiff,
} from './replay';

/**
 * Verifies the replay entry points are exposed as functions.
 * @returns {void}
 */
const testReplayEntrypoints = () => {
  expect(typeof replayDiffs).toBe('function');
  expect(typeof replayDocDiffs).toBe('function');
  expect(typeof replayNonParagraphDiff).toBe('function');
  expect(typeof replayParagraphDiff).toBe('function');
  expect(typeof replayInlineDiff).toBe('function');
  expect(typeof applyAttrsDiff).toBe('function');
  expect(typeof marksFromDiff).toBe('function');
};
/**
 * Runs the replay scaffolding suite.
 * @returns {void}
 */
const runReplayScaffoldingSuite = () => {
  it('exposes replay entry points', testReplayEntrypoints);
};

describe('replay diff scaffolding', runReplayScaffoldingSuite);
