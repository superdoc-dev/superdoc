import { describe, it, expect } from 'vitest';

import { applyAttrsDiff } from './replay-attrs.js';

/**
 * Verifies added and modified paths are applied.
 * @returns {void}
 */
const testApplyAttrsDiffAddsAndModifies = () => {
  const result = applyAttrsDiff({
    attrs: { foo: 'bar', nested: { keep: true } },
    diff: {
      added: { 'nested.newKey': 'new' },
      deleted: {},
      modified: {
        foo: { from: 'bar', to: 'baz' },
      },
    },
  });

  expect(result.foo).toBe('baz');
  expect(result.nested).toEqual({ keep: true, newKey: 'new' });
};

/**
 * Verifies deleted paths are removed.
 * @returns {void}
 */
const testApplyAttrsDiffDeletes = () => {
  const result = applyAttrsDiff({
    attrs: { foo: 'bar', nested: { remove: 'yes', keep: 'ok' } },
    diff: {
      added: {},
      deleted: { 'nested.remove': 'yes' },
      modified: {},
    },
  });

  expect(result.nested).toEqual({ keep: 'ok' });
};

/**
 * Runs the applyAttrsDiff suite.
 * @returns {void}
 */
const runApplyAttrsDiffSuite = () => {
  it('applies added and modified attributes', testApplyAttrsDiffAddsAndModifies);
  it('removes deleted attributes', testApplyAttrsDiffDeletes);
};

describe('applyAttrsDiff', runApplyAttrsDiffSuite);
