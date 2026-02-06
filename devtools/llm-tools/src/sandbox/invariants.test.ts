import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateState } from './invariants.js';

describe('validateState', () => {
  it('returns no issues for valid state', () => {
    const issues = validateState({
      blocks: [
        { blockId: 'p1', type: 'paragraph', text: 'Hello' },
        { blockId: 'p2', type: 'heading', text: 'World' },
      ],
    });
    assert.equal(issues.length, 0);
  });

  it('detects missing blockId', () => {
    const issues = validateState({
      blocks: [{ blockId: '', type: 'paragraph', text: 'Hello' }],
    });
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /missing blockId/i);
  });

  it('detects duplicate blockIds', () => {
    const issues = validateState({
      blocks: [
        { blockId: 'p1', type: 'paragraph', text: 'First' },
        { blockId: 'p1', type: 'paragraph', text: 'Second' },
      ],
    });
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /duplicate/i);
  });

  it('returns no issues for empty blocks', () => {
    const issues = validateState({ blocks: [] });
    assert.equal(issues.length, 0);
  });
});
