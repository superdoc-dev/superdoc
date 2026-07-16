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
  const footerStory = {
    kind: 'story' as const,
    storyType: 'headerFooterPart' as const,
    refId: 'rId100',
  };

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

  test('rejects combining --input-json with --in-json', async () => {
    await expect(
      resolveCreateParagraphInput(
        makeParsed({
          'input-json': JSON.stringify({ text: 'hello' }),
          'in-json': JSON.stringify(footerStory),
        }),
        'create paragraph',
      ),
    ).rejects.toThrow('--input-json/--input-file cannot be combined with flat create flags.');
  });

  test('parses --in-json into the create input story locator', async () => {
    const result = await resolveCreateParagraphInput(
      makeParsed({
        'in-json': JSON.stringify(footerStory),
        at: 'document-end',
        text: 'hello',
      }),
      'create paragraph',
    );

    expect(result).toEqual({
      in: footerStory,
      text: 'hello',
      at: { kind: 'documentEnd' },
    });
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

  test('preserves story locators from --at-json flat params', async () => {
    const result = await resolveCreateParagraphInput(
      makeParsed({
        'in-json': JSON.stringify(footerStory),
        'at-json': JSON.stringify({
          kind: 'after',
          target: {
            kind: 'block',
            nodeType: 'paragraph',
            nodeId: 'p1',
            story: footerStory,
          },
        }),
        text: 'hello',
      }),
      'create paragraph',
    );

    expect(result).toEqual({
      in: footerStory,
      text: 'hello',
      at: {
        kind: 'after',
        target: {
          kind: 'block',
          nodeType: 'paragraph',
          nodeId: 'p1',
          story: footerStory,
        },
      },
    });
  });

  test('preserves story locators from --input-json payloads', async () => {
    const result = await resolveCreateParagraphInput(
      makeParsed({
        'input-json': JSON.stringify({
          in: footerStory,
          at: {
            kind: 'before',
            target: {
              kind: 'block',
              nodeType: 'paragraph',
              nodeId: 'p1',
              story: footerStory,
            },
          },
          text: 'hello',
        }),
      }),
      'create paragraph',
    );

    expect(result).toEqual({
      in: footerStory,
      at: {
        kind: 'before',
        target: {
          kind: 'block',
          nodeType: 'paragraph',
          nodeId: 'p1',
          story: footerStory,
        },
      },
      text: 'hello',
    });
  });
});
