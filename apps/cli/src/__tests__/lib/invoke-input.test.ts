import { describe, expect, test } from 'bun:test';
import { extractInvokeInput } from '../../lib/invoke-input';
import { CliError } from '../../lib/errors';

describe('extractInvokeInput', () => {
  test('converts replace flat range flags into a single-block SelectionTarget', () => {
    const input = extractInvokeInput('replace', {
      doc: 'fixture.docx',
      blockId: 'p1',
      start: 2,
      end: 5,
      text: 'Updated',
    }) as Record<string, unknown>;

    expect(input).toEqual({
      text: 'Updated',
      target: {
        kind: 'selection',
        start: { kind: 'text', blockId: 'p1', offset: 2 },
        end: { kind: 'text', blockId: 'p1', offset: 5 },
      },
    });
  });

  test('upgrades legacy TextAddress target-json input for format.apply', () => {
    const input = extractInvokeInput('format.apply', {
      target: {
        kind: 'text',
        blockId: 'p1',
        range: { start: 0, end: 4 },
      },
      inline: { bold: true },
    }) as Record<string, unknown>;

    expect(input).toEqual({
      target: {
        kind: 'selection',
        start: { kind: 'text', blockId: 'p1', offset: 0 },
        end: { kind: 'text', blockId: 'p1', offset: 4 },
      },
      inline: { bold: true },
    });
  });

  test('preserves text-address targets for comments.create', () => {
    const input = extractInvokeInput('comments.create', {
      blockId: 'p1',
      start: 1,
      end: 3,
      text: 'Review this',
    }) as Record<string, unknown>;

    expect(input).toEqual({
      text: 'Review this',
      target: {
        kind: 'text',
        blockId: 'p1',
        range: { start: 1, end: 3 },
      },
    });
  });

  test('rejects collapsed legacy text ranges for format operations', () => {
    expect(() =>
      extractInvokeInput('format.bold', {
        target: {
          kind: 'text',
          blockId: 'p1',
          range: { start: 2, end: 2 },
        },
      }),
    ).toThrow(CliError);
  });
});
