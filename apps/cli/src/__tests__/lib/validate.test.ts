import { describe, expect, test } from 'bun:test';
import {
  validateNodeAddress,
  validateTextAddress,
  validateListItemAddress,
  validateCreateParagraphInput,
  validateQuery,
  validateNodeKind,
  isNodeType,
  isBlockNodeType,
} from '../../lib/validate';
import { CliError } from '../../lib/errors';

describe('validateTextAddress', () => {
  test('validates a valid text address', () => {
    const result = validateTextAddress({
      kind: 'text',
      blockId: 'abc',
      range: { start: 0, end: 5 },
    });
    expect(result).toEqual({
      kind: 'text',
      blockId: 'abc',
      range: { start: 0, end: 5 },
    });
  });

  test('rejects non-text kind', () => {
    expect(() => validateTextAddress({ kind: 'block', blockId: 'abc', range: { start: 0, end: 0 } })).toThrow(CliError);
  });

  test('rejects missing blockId', () => {
    expect(() => validateTextAddress({ kind: 'text', range: { start: 0, end: 0 } })).toThrow(CliError);
  });

  test('rejects negative range values', () => {
    expect(() => validateTextAddress({ kind: 'text', blockId: 'abc', range: { start: -1, end: 0 } })).toThrow(CliError);
  });

  test('rejects end < start', () => {
    expect(() => validateTextAddress({ kind: 'text', blockId: 'abc', range: { start: 5, end: 3 } })).toThrow(CliError);
  });

  test('rejects non-object input', () => {
    expect(() => validateTextAddress('not an object')).toThrow(CliError);
    expect(() => validateTextAddress(null)).toThrow(CliError);
  });
});

describe('validateNodeAddress', () => {
  test('validates a block address', () => {
    const result = validateNodeAddress({
      kind: 'block',
      nodeType: 'paragraph',
      nodeId: 'p1',
    });
    expect(result).toEqual({ kind: 'block', nodeType: 'paragraph', nodeId: 'p1' });
  });

  test('validates an inline address', () => {
    const result = validateNodeAddress({
      kind: 'inline',
      nodeType: 'image',
      anchor: {
        start: { blockId: 'b1', offset: 0 },
        end: { blockId: 'b1', offset: 5 },
      },
    });
    expect(result.kind).toBe('inline');
  });

  test('rejects unknown kind', () => {
    expect(() => validateNodeAddress({ kind: 'unknown', nodeType: 'paragraph', nodeId: 'p1' })).toThrow(CliError);
  });

  test('rejects non-block node type for block address', () => {
    expect(() => validateNodeAddress({ kind: 'block', nodeType: 'notAType', nodeId: 'p1' })).toThrow(CliError);
  });

  test('rejects inline anchor spanning multiple blocks', () => {
    expect(() =>
      validateNodeAddress({
        kind: 'inline',
        nodeType: 'image',
        anchor: {
          start: { blockId: 'b1', offset: 0 },
          end: { blockId: 'b2', offset: 5 },
        },
      }),
    ).toThrow(CliError);
  });
});

describe('validateListItemAddress', () => {
  test('validates a listItem address', () => {
    const result = validateListItemAddress({
      kind: 'block',
      nodeType: 'listItem',
      nodeId: 'li1',
    });
    expect(result.nodeType).toBe('listItem');
  });

  test('rejects non-listItem block address', () => {
    expect(() => validateListItemAddress({ kind: 'block', nodeType: 'paragraph', nodeId: 'p1' })).toThrow(CliError);
  });
});

describe('validateCreateParagraphInput', () => {
  test('validates empty input (defaults)', () => {
    const result = validateCreateParagraphInput({});
    expect(result).toEqual({});
  });

  test('validates input with text', () => {
    const result = validateCreateParagraphInput({ text: 'hello' });
    expect(result.text).toBe('hello');
  });

  test('validates at: documentEnd', () => {
    const result = validateCreateParagraphInput({ at: { kind: 'documentEnd' } });
    expect(result.at?.kind).toBe('documentEnd');
  });

  test('validates at: before with block target', () => {
    const result = validateCreateParagraphInput({
      at: {
        kind: 'before',
        target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
      },
    });
    expect(result.at?.kind).toBe('before');
  });

  test('rejects non-string text', () => {
    expect(() => validateCreateParagraphInput({ text: 42 })).toThrow(CliError);
  });

  test('rejects unknown at.kind', () => {
    expect(() => validateCreateParagraphInput({ at: { kind: 'middle' } })).toThrow(CliError);
  });
});

describe('validateQuery', () => {
  test('validates a text query', () => {
    const result = validateQuery({
      select: { type: 'text', pattern: 'hello', mode: 'contains' },
    });
    expect(result.select.type).toBe('text');
  });

  test('validates a node query', () => {
    const result = validateQuery({
      select: { type: 'node', nodeType: 'paragraph' },
    });
    expect(result.select.type).toBe('node');
  });

  test('validates shorthand node type selector', () => {
    const result = validateQuery({
      select: { type: 'paragraph' },
    });
    expect(result.select.type).toBe('node');
    expect((result.select as { nodeType?: string }).nodeType).toBe('paragraph');
  });

  test('validates with limit and offset', () => {
    const result = validateQuery({
      select: { type: 'paragraph' },
      limit: 10,
      offset: 5,
    });
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(5);
  });

  test('validates includeNodes', () => {
    const result = validateQuery({
      select: { type: 'node', nodeType: 'paragraph' },
      includeNodes: true,
    });
    expect(result.includeNodes).toBe(true);
  });

  test('rejects non-object input', () => {
    expect(() => validateQuery('not an object')).toThrow(CliError);
  });

  test('rejects unknown selector type', () => {
    expect(() => validateQuery({ select: { type: 'magic' } })).toThrow(CliError);
  });

  test('rejects invalid text query mode', () => {
    expect(() => validateQuery({ select: { type: 'text', pattern: 'hello', mode: 'fuzzy' } })).toThrow(CliError);
  });

  test('rejects removed include field', () => {
    expect(() =>
      validateQuery({
        select: { type: 'node', nodeType: 'paragraph' },
        include: ['nodes'],
      }),
    ).toThrow(CliError);
  });

  test('rejects non-boolean includeNodes', () => {
    expect(() =>
      validateQuery({
        select: { type: 'node', nodeType: 'paragraph' },
        includeNodes: 'true',
      }),
    ).toThrow(CliError);
  });
});

describe('validateNodeKind', () => {
  test('accepts "block"', () => {
    expect(validateNodeKind('block', 'test')).toBe('block');
  });

  test('accepts "inline"', () => {
    expect(validateNodeKind('inline', 'test')).toBe('inline');
  });

  test('rejects unknown kind', () => {
    expect(() => validateNodeKind('other', 'test')).toThrow(CliError);
  });
});

describe('isNodeType / isBlockNodeType', () => {
  test('isNodeType recognizes valid types', () => {
    expect(isNodeType('paragraph')).toBe(true);
    expect(isNodeType('table')).toBe(true);
  });

  test('isNodeType rejects invalid types', () => {
    expect(isNodeType('notAType')).toBe(false);
  });

  test('isBlockNodeType recognizes block types', () => {
    expect(isBlockNodeType('paragraph')).toBe(true);
    expect(isBlockNodeType('table')).toBe(true);
  });

  test('isBlockNodeType rejects non-block types', () => {
    expect(isBlockNodeType('notAType')).toBe(false);
  });
});
