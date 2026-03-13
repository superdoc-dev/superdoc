import { describe, it, expect, vi } from 'vitest';
import { TableOfContentsEntry } from './table-of-contents-entry.js';

describe('TableOfContentsEntry commands', () => {
  it('updateTableOfContentsEntryAt clears stale instructionTokens', () => {
    const commands = TableOfContentsEntry.config.addCommands();
    const setNodeMarkup = vi.fn();
    const dispatch = vi.fn();
    const node = {
      type: { name: 'tableOfContentsEntry' },
      attrs: {
        instruction: 'TC "Old" \\l "1"',
        instructionTokens: [{ type: 'text', text: 'TC "Old" \\l "1"' }],
        marksAsAttrs: [{ type: 'bold', attrs: {} }],
      },
    };

    const result = commands.updateTableOfContentsEntryAt({ pos: 5, instruction: 'TC "New" \\l "2"' })({
      tr: { setNodeMarkup },
      dispatch,
      state: { doc: { nodeAt: vi.fn().mockReturnValue(node) } },
    });

    expect(result).toBe(true);
    expect(setNodeMarkup).toHaveBeenCalledWith(5, undefined, {
      ...node.attrs,
      instruction: 'TC "New" \\l "2"',
      instructionTokens: null,
    });
  });
});
