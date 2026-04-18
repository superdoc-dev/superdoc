import { describe, expect, it, vi } from 'vitest';

vi.mock('@core/Node.js', () => ({
  Node: {
    create: (config) => ({ config }),
  },
}));

vi.mock('@core/Attribute.js', () => ({
  Attribute: {
    mergeAttributes: (...args) => Object.assign({}, ...args),
  },
}));

import { TableOfContents } from './table-of-contents.js';

function createCommandContext() {
  const tocNode = { type: 'tableOfContents-node' };
  const paragraphNode = { type: 'paragraph-node' };
  const textNode = { type: 'text-node' };

  const schema = {
    nodes: {
      tableOfContents: {
        create: vi.fn(() => tocNode),
      },
      paragraph: {
        create: vi.fn(() => paragraphNode),
      },
    },
    text: vi.fn(() => textNode),
  };

  const addCommands = TableOfContents.config.addCommands;
  const commands = addCommands.call({ editor: { schema } });

  return { commands, schema, tocNode };
}

describe('tableOfContents extension commands', () => {
  it('insertTableOfContentsAt returns false when tr.insert throws RangeError', () => {
    const { commands, schema } = createCommandContext();
    const insert = vi.fn(() => {
      throw new RangeError('Position 2 out of range');
    });
    const tr = { insert };
    const dispatch = vi.fn();
    const state = { schema };

    const run = commands.insertTableOfContentsAt({ pos: 2 });
    let result;

    expect(() => {
      result = run({ tr, dispatch, state });
    }).not.toThrow();
    expect(result).toBe(false);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('insertTableOfContentsAt re-throws non-RangeError exceptions', () => {
    const { commands, schema } = createCommandContext();
    const insert = vi.fn(() => {
      throw new TypeError('cannot read property of undefined');
    });
    const tr = { insert };
    const dispatch = vi.fn();
    const state = { schema };

    const run = commands.insertTableOfContentsAt({ pos: 2 });

    expect(() => {
      run({ tr, dispatch, state });
    }).toThrow(TypeError);
  });

  it('insertTableOfContentsAt inserts when the transaction accepts the position', () => {
    const { commands, schema, tocNode } = createCommandContext();
    const insert = vi.fn();
    const tr = { insert };
    const dispatch = vi.fn();
    const state = { schema };

    const run = commands.insertTableOfContentsAt({ pos: 3, instruction: 'TOC \\o "1-3"', sdBlockId: 'toc-1' });
    const result = run({ tr, dispatch, state });

    expect(result).toBe(true);
    expect(insert).toHaveBeenCalledWith(3, tocNode);
  });
});
