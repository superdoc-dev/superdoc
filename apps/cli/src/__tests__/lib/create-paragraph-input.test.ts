import { describe, expect, test } from 'bun:test';
import type { ParsedArgs } from '../../lib/args';
import { resolveCreateParagraphInput } from '../../lib/create-paragraph-input';
import { CliError } from '../../lib/errors';

function makeParsed(options: Record<string, unknown>): ParsedArgs {
  return {
    positionals: [],
    options,
    unknown: [],
    errors: [],
  };
}

describe('resolveCreateParagraphInput', () => {
  test('treats falsy --input-json payload as provided and validates it', async () => {
    await expect(
      resolveCreateParagraphInput(makeParsed({ 'input-json': 'false' }), 'create paragraph'),
    ).rejects.toThrow(CliError);
  });

  test('rejects combining null --input-json with flat flags', async () => {
    await expect(
      resolveCreateParagraphInput(makeParsed({ 'input-json': 'null', text: 'hello' }), 'create paragraph'),
    ).rejects.toThrow('--input-json/--input-file cannot be combined with flat create flags.');
  });

  test('parses --before-address-json into a before target location', async () => {
    const result = await resolveCreateParagraphInput(
      makeParsed({
        text: 'hello',
        'before-address-json': JSON.stringify({ kind: 'block', nodeType: 'paragraph', nodeId: 'p1' }),
      }),
      'create paragraph',
    );

    expect(result).toEqual({
      text: 'hello',
      at: {
        kind: 'before',
        target: { kind: 'block', nodeType: 'paragraph', nodeId: 'p1' },
      },
    });
  });
});
