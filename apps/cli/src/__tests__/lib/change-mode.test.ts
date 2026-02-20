import { describe, expect, test } from 'bun:test';
import { resolveChangeMode } from '../../lib/change-mode';
import { CliError } from '../../lib/errors';
import type { ParsedArgs } from '../../lib/args';

function makeParsed(options: Record<string, unknown> = {}): ParsedArgs {
  return { positionals: [], options, unknown: [], errors: [] };
}

describe('resolveChangeMode', () => {
  test('defaults to "direct"', () => {
    expect(resolveChangeMode(makeParsed(), 'cmd')).toBe('direct');
  });

  test('returns "tracked" when --tracked is set', () => {
    expect(resolveChangeMode(makeParsed({ tracked: true }), 'cmd')).toBe('tracked');
  });

  test('returns "direct" when --direct is set', () => {
    expect(resolveChangeMode(makeParsed({ direct: true }), 'cmd')).toBe('direct');
  });

  test('returns value from --change-mode', () => {
    expect(resolveChangeMode(makeParsed({ 'change-mode': 'tracked' }), 'cmd')).toBe('tracked');
    expect(resolveChangeMode(makeParsed({ 'change-mode': 'direct' }), 'cmd')).toBe('direct');
  });

  test('throws when both --tracked and --direct are set', () => {
    expect(() => resolveChangeMode(makeParsed({ tracked: true, direct: true }), 'cmd')).toThrow(CliError);
  });

  test('throws for invalid --change-mode value', () => {
    expect(() => resolveChangeMode(makeParsed({ 'change-mode': 'auto' }), 'cmd')).toThrow(CliError);
  });
});
