import { describe, expect, test } from 'bun:test';
import type { ParsedArgs } from '../../lib/args';
import { resolveFindQuery } from '../../lib/find-query';
import { CliError } from '../../lib/errors';

function makeParsed(options: Record<string, unknown>): ParsedArgs {
  return {
    positionals: [],
    options,
    unknown: [],
    errors: [],
  };
}

describe('resolveFindQuery', () => {
  test('wraps --select-json in a Query object', async () => {
    const query = await resolveFindQuery(
      makeParsed({
        'select-json': JSON.stringify({ type: 'text', pattern: 'hello' }),
      }),
    );

    expect(query).toEqual({
      select: { type: 'text', pattern: 'hello' },
    });
  });

  test('rejects combining falsy --query-json payload with flat selector flags', async () => {
    await expect(resolveFindQuery(makeParsed({ 'query-json': 'false', type: 'text' }))).rejects.toThrow(
      '--query-json, --select-json, or flat selector flags',
    );
  });

  test('treats null --select-json as provided and validates the payload shape', async () => {
    await expect(resolveFindQuery(makeParsed({ 'select-json': 'null' }))).rejects.toThrow(CliError);
  });
});
