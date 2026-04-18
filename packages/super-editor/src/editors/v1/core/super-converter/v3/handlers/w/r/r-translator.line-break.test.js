import { describe, it, expect } from 'vitest';
import { defaultNodeListHandler } from '../../../../v2/importer/docxImporter.js';
import { translator } from './r-translator.js';

describe('w:r translator line break handling', () => {
  it('preserves <w:br> children before and between text nodes', () => {
    const runNode = {
      name: 'w:r',
      elements: [
        { name: 'w:t', elements: [{ type: 'text', text: 'One' }] },
        { name: 'w:br' },
        { name: 'w:t', elements: [{ type: 'text', text: 'test' }] },
        { name: 'w:br' },
        { name: 'w:t', elements: [{ type: 'text', text: 'after space' }] },
      ],
    };

    const handler = defaultNodeListHandler();
    const result = translator.encode({ nodes: [runNode], nodeListHandler: handler, docx: {} });
    const runs = Array.isArray(result) ? result : [result];

    expect(runs).toHaveLength(5);
    expect(runs[0]).toMatchObject({
      type: 'run',
      content: [{ type: 'text', text: 'One' }],
    });
    expect(runs[1]).toMatchObject({
      type: 'run',
      content: [{ type: 'lineBreak' }],
    });
    expect(runs[2]).toMatchObject({
      type: 'run',
      content: [{ type: 'text', text: 'test' }],
    });
    expect(runs[3]).toMatchObject({
      type: 'run',
      content: [{ type: 'lineBreak' }],
    });
    expect(runs[4]).toMatchObject({
      type: 'run',
      content: [{ type: 'text', text: 'after space' }],
    });
  });

  it('preserves leading <w:br> nodes in a run', () => {
    const runNode = {
      name: 'w:r',
      elements: [{ name: 'w:br' }, { name: 'w:t', elements: [{ type: 'text', text: 'starts with break' }] }],
    };

    const handler = defaultNodeListHandler();
    const result = translator.encode({ nodes: [runNode], nodeListHandler: handler, docx: {} });
    const runs = Array.isArray(result) ? result : [result];

    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({
      type: 'run',
      content: [{ type: 'lineBreak' }],
    });
    expect(runs[1]).toMatchObject({
      type: 'run',
      content: [{ type: 'text', text: 'starts with break' }],
    });
  });

  it('preserves runs that are only <w:br>', () => {
    const runNode = {
      name: 'w:r',
      elements: [{ name: 'w:br' }],
    };

    const handler = defaultNodeListHandler();
    const result = translator.encode({ nodes: [runNode], nodeListHandler: handler, docx: {} });
    const runs = Array.isArray(result) ? result : [result];

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      type: 'run',
      content: [{ type: 'lineBreak' }],
    });
  });
});
