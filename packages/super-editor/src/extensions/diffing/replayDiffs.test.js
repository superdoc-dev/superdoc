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

describe('replay diff scaffolding', () => {
  it('exposes replay entry points', () => {
    expect(typeof replayDiffs).toBe('function');
    expect(typeof replayDocDiffs).toBe('function');
    expect(typeof replayNonParagraphDiff).toBe('function');
    expect(typeof replayParagraphDiff).toBe('function');
    expect(typeof replayInlineDiff).toBe('function');
    expect(typeof applyAttrsDiff).toBe('function');
    expect(typeof marksFromDiff).toBe('function');
  });
});
