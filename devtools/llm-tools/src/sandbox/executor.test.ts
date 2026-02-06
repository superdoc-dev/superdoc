import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeTool } from './executor.js';
import type { SandboxState } from './state.js';
import type { ToolSnapshot } from '../tools/snapshot.js';

const state: SandboxState = {
  blocks: [
    { blockId: 'p1', type: 'paragraph', text: 'Hello world' },
    { blockId: 'p2', type: 'paragraph', text: 'Goodbye world' },
  ],
};

const snapshot: ToolSnapshot = {
  tools: [{ name: 'find_content', description: 'Find content' }],
};

describe('executeTool', () => {
  it('executes find_content successfully', () => {
    const result = executeTool(
      state,
      'find_content',
      {
        selector: { type: 'text', pattern: 'world', flags: 'i' },
      },
      snapshot,
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      const data = result.result as { total: number; matches: unknown[] };
      assert.equal(data.total, 2);
    }
  });

  it('returns error for unknown tool', () => {
    const result = executeTool(state, 'unknown_tool' as 'find_content', {}, snapshot);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /not defined in snapshot/i);
    }
  });

  it('returns error for invalid state (duplicate blockIds)', () => {
    const badState: SandboxState = {
      blocks: [
        { blockId: 'p1', type: 'paragraph', text: 'A' },
        { blockId: 'p1', type: 'paragraph', text: 'B' },
      ],
    };
    const result = executeTool(
      badState,
      'find_content',
      {
        selector: { type: 'text', pattern: 'A' },
      },
      snapshot,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /duplicate/i);
    }
  });

  it('works without toolSnapshot', () => {
    const result = executeTool(state, 'find_content', {
      selector: { type: 'text', pattern: 'Hello' },
    });
    assert.equal(result.ok, true);
  });

  it('returns error if tool not in snapshot', () => {
    const emptySnapshot: ToolSnapshot = { tools: [] };
    const result = executeTool(
      state,
      'find_content',
      {
        selector: { type: 'text', pattern: 'Hello' },
      },
      emptySnapshot,
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /not defined in snapshot/i);
    }
  });
});
