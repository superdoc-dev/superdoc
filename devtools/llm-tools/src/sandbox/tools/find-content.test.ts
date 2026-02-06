import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeFindContent, type FindContentParams } from './find-content.js';
import type { SandboxState } from '../state.js';

const makeState = (...texts: string[]): SandboxState => ({
  blocks: texts.map((text, i) => ({
    blockId: `p${i + 1}`,
    type: 'paragraph' as const,
    text,
  })),
});

describe('executeFindContent', () => {
  const state = makeState(
    'The service provider is here.',
    'No matches in this block.',
    'Another service provider reference.',
  );

  it('finds case-insensitive text matches', () => {
    const params: FindContentParams = {
      selector: { type: 'text', pattern: 'service provider', flags: 'i' },
    };
    const result = executeFindContent(state, params);
    assert.equal(result.total, 2);
    assert.equal(result.matches.length, 2);
    assert.equal(result.matches[0].address.blockId, 'p1');
    assert.equal(result.matches[1].address.blockId, 'p3');
  });

  it('returns empty when no blocks match', () => {
    const params: FindContentParams = {
      selector: { type: 'text', pattern: 'nonexistent phrase' },
    };
    const result = executeFindContent(state, params);
    assert.equal(result.total, 0);
    assert.equal(result.matches.length, 0);
  });

  it('respects limit parameter', () => {
    const params: FindContentParams = {
      selector: { type: 'text', pattern: 'service provider', flags: 'i' },
      limit: 1,
    };
    const result = executeFindContent(state, params);
    assert.equal(result.total, 2);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].address.blockId, 'p1');
  });

  it('respects offset parameter', () => {
    const params: FindContentParams = {
      selector: { type: 'text', pattern: 'service provider', flags: 'i' },
      offset: 1,
    };
    const result = executeFindContent(state, params);
    assert.equal(result.total, 2);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].address.blockId, 'p3');
  });

  it('respects offset + limit together', () => {
    const bigState = makeState('a match', 'a match', 'a match', 'a match');
    const params: FindContentParams = {
      selector: { type: 'text', pattern: 'a match' },
      offset: 1,
      limit: 2,
    };
    const result = executeFindContent(bigState, params);
    assert.equal(result.total, 4);
    assert.equal(result.matches.length, 2);
    assert.equal(result.matches[0].address.blockId, 'p2');
    assert.equal(result.matches[1].address.blockId, 'p3');
  });

  it('throws for non-text selector type', () => {
    const params = {
      selector: { type: 'xpath', pattern: '//p' },
    } as unknown as FindContentParams;
    assert.throws(() => executeFindContent(state, params), /only supports selector.type = "text"/);
  });

  it('handles invalid regex by escaping special chars', () => {
    // An unbalanced paren like "(USD" is invalid regex; buildRegex escapes and retries
    const specialState = makeState('price is $100 (USD');
    const params: FindContentParams = {
      selector: { type: 'text', pattern: '$100 (USD' },
    };
    const result = executeFindContent(specialState, params);
    assert.equal(result.total, 1);
  });

  it('handles global flag without infinite loops', () => {
    const params: FindContentParams = {
      selector: { type: 'text', pattern: 'service', flags: 'gi' },
    };
    const result = executeFindContent(state, params);
    assert.equal(result.total, 2);
  });

  it('returns empty for empty state', () => {
    const params: FindContentParams = {
      selector: { type: 'text', pattern: 'anything' },
    };
    const result = executeFindContent({ blocks: [] }, params);
    assert.equal(result.total, 0);
    assert.equal(result.matches.length, 0);
  });
});
