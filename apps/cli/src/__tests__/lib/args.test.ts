import { describe, expect, test } from 'bun:test';
import {
  ensureValidArgs,
  getBooleanOption,
  getNumberOption,
  getOptionalBooleanOption,
  getStringListOption,
  getStringOption,
  parseCommandArgs,
  parseCommaList,
  parseGlobalArgs,
  requireDocArg,
  resolveDocArg,
  type OptionSpec,
} from '../../lib/args';
import { CliError } from '../../lib/errors';

describe('parseGlobalArgs', () => {
  test('defaults to json output', () => {
    const { globals } = parseGlobalArgs(['doc', 'open']);
    expect(globals.output).toBe('json');
  });

  test('parses --json flag', () => {
    const { globals, rest } = parseGlobalArgs(['--json', 'doc', 'open']);
    expect(globals.output).toBe('json');
    expect(rest).toEqual(['doc', 'open']);
  });

  test('parses --pretty flag', () => {
    const { globals } = parseGlobalArgs(['--pretty']);
    expect(globals.output).toBe('pretty');
  });

  test('throws when both --json and --pretty are provided', () => {
    expect(() => parseGlobalArgs(['--json', '--pretty'])).toThrow(CliError);
  });

  test('parses --output=json', () => {
    const { globals } = parseGlobalArgs(['--output=json']);
    expect(globals.output).toBe('json');
  });

  test('parses --output pretty (space-separated)', () => {
    const { globals } = parseGlobalArgs(['--output', 'pretty']);
    expect(globals.output).toBe('pretty');
  });

  test('throws for invalid --output value', () => {
    expect(() => parseGlobalArgs(['--output=xml'])).toThrow(CliError);
  });

  test('throws when --output conflicts with --json', () => {
    expect(() => parseGlobalArgs(['--json', '--output=pretty'])).toThrow(CliError);
  });

  test('parses --session with space-separated value', () => {
    const { globals } = parseGlobalArgs(['--session', 'my-session']);
    expect(globals.sessionId).toBe('my-session');
  });

  test('parses --session=value', () => {
    const { globals } = parseGlobalArgs(['--session=my-session']);
    expect(globals.sessionId).toBe('my-session');
  });

  test('throws when --session has no value', () => {
    expect(() => parseGlobalArgs(['--session'])).toThrow(CliError);
  });

  test('parses --timeout-ms', () => {
    const { globals } = parseGlobalArgs(['--timeout-ms', '5000']);
    expect(globals.timeoutMs).toBe(5000);
  });

  test('throws for non-positive --timeout-ms', () => {
    expect(() => parseGlobalArgs(['--timeout-ms', '0'])).toThrow(CliError);
    expect(() => parseGlobalArgs(['--timeout-ms', '-1'])).toThrow(CliError);
  });

  test('parses --help / -h', () => {
    expect(parseGlobalArgs(['--help']).globals.help).toBe(true);
    expect(parseGlobalArgs(['-h']).globals.help).toBe(true);
  });

  test('stops at -- separator', () => {
    const { rest } = parseGlobalArgs(['--json', '--', '--pretty']);
    expect(rest).toEqual(['--', '--pretty']);
  });

  test('passes unknown tokens to rest', () => {
    const { rest } = parseGlobalArgs(['doc', 'open', 'file.docx']);
    expect(rest).toEqual(['doc', 'open', 'file.docx']);
  });
});

describe('parseCommandArgs', () => {
  const specs: OptionSpec[] = [
    { name: 'name', type: 'string' },
    { name: 'count', type: 'number' },
    { name: 'verbose', type: 'boolean' },
    { name: 'tag', type: 'string', multiple: true },
  ];

  test('parses string options', () => {
    const result = parseCommandArgs(['--name', 'alice'], specs);
    expect(result.options.name).toBe('alice');
  });

  test('parses string options with =', () => {
    const result = parseCommandArgs(['--name=bob'], specs);
    expect(result.options.name).toBe('bob');
  });

  test('parses number options', () => {
    const result = parseCommandArgs(['--count', '42'], specs);
    expect(result.options.count).toBe(42);
  });

  test('reports error for non-numeric number option', () => {
    const result = parseCommandArgs(['--count', 'abc'], specs);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('parses boolean flags', () => {
    const result = parseCommandArgs(['--verbose'], specs);
    expect(result.options.verbose).toBe(true);
  });

  test('parses explicit boolean true/false', () => {
    expect(parseCommandArgs(['--verbose', 'true'], specs).options.verbose).toBe(true);
    expect(parseCommandArgs(['--verbose', 'false'], specs).options.verbose).toBe(false);
    expect(parseCommandArgs(['--verbose=1'], specs).options.verbose).toBe(true);
    expect(parseCommandArgs(['--verbose=0'], specs).options.verbose).toBe(false);
  });

  test('reports error for invalid explicit boolean', () => {
    const result = parseCommandArgs(['--verbose=abc'], specs);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('collects positionals', () => {
    const result = parseCommandArgs(['pos1', 'pos2', '--name', 'x'], specs);
    expect(result.positionals).toEqual(['pos1', 'pos2']);
  });

  test('collects unknown flags', () => {
    const result = parseCommandArgs(['--unknown-flag'], specs);
    expect(result.unknown).toEqual(['--unknown-flag']);
  });

  test('handles multiple option', () => {
    const result = parseCommandArgs(['--tag', 'a', '--tag', 'b'], specs);
    expect(result.options.tag).toEqual(['a', 'b']);
  });

  test('reports error for duplicate non-multiple options', () => {
    const result = parseCommandArgs(['--name', 'a', '--name', 'b'], specs);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('stops at -- separator', () => {
    const result = parseCommandArgs(['--name', 'x', '--', '--verbose'], specs);
    expect(result.options.name).toBe('x');
    expect(result.positionals).toEqual(['--verbose']);
  });

  test('handles aliases', () => {
    const aliasedSpecs: OptionSpec[] = [{ name: 'output', type: 'string', aliases: ['o'] }];
    const result = parseCommandArgs(['--o', 'json'], aliasedSpecs);
    expect(result.options.output).toBe('json');
  });
});

describe('ensureValidArgs', () => {
  test('throws on unknown options', () => {
    expect(() => ensureValidArgs({ positionals: [], options: {}, unknown: ['--bad'], errors: [] })).toThrow(CliError);
  });

  test('throws on parse errors', () => {
    expect(() =>
      ensureValidArgs({ positionals: [], options: {}, unknown: [], errors: ['--count must be a number.'] }),
    ).toThrow(CliError);
  });

  test('passes with no errors', () => {
    expect(() => ensureValidArgs({ positionals: [], options: {}, unknown: [], errors: [] })).not.toThrow();
  });
});

describe('option getter helpers', () => {
  const parsed = {
    positionals: [],
    options: { name: 'alice', count: 42, verbose: true, tags: ['a', 'b'] },
    unknown: [],
    errors: [],
  };

  test('getStringOption returns string or undefined', () => {
    expect(getStringOption(parsed, 'name')).toBe('alice');
    expect(getStringOption(parsed, 'count')).toBeUndefined();
    expect(getStringOption(parsed, 'missing')).toBeUndefined();
  });

  test('getNumberOption returns number or undefined', () => {
    expect(getNumberOption(parsed, 'count')).toBe(42);
    expect(getNumberOption(parsed, 'name')).toBeUndefined();
  });

  test('getBooleanOption returns boolean', () => {
    expect(getBooleanOption(parsed, 'verbose')).toBe(true);
    expect(getBooleanOption(parsed, 'missing')).toBe(false);
  });

  test('getOptionalBooleanOption returns boolean or undefined', () => {
    expect(getOptionalBooleanOption(parsed, 'verbose')).toBe(true);
    expect(getOptionalBooleanOption(parsed, 'missing')).toBeUndefined();
  });

  test('getStringListOption returns string array', () => {
    expect(getStringListOption(parsed, 'tags')).toEqual(['a', 'b']);
    expect(getStringListOption(parsed, 'name')).toEqual(['alice']);
    expect(getStringListOption(parsed, 'missing')).toEqual([]);
  });
});

describe('resolveDocArg', () => {
  test('returns doc from --doc flag', () => {
    const parsed = { positionals: [], options: { doc: 'file.docx' }, unknown: [], errors: [] };
    const result = resolveDocArg(parsed, 'cmd');
    expect(result.doc).toBe('file.docx');
  });

  test('returns doc from first positional', () => {
    const parsed = { positionals: ['file.docx'], options: {}, unknown: [], errors: [] };
    const result = resolveDocArg(parsed, 'cmd');
    expect(result.doc).toBe('file.docx');
    expect(result.positionals).toEqual([]);
  });

  test('throws when flag and positional conflict', () => {
    const parsed = { positionals: ['other.docx'], options: { doc: 'file.docx' }, unknown: [], errors: [] };
    expect(() => resolveDocArg(parsed, 'cmd')).toThrow(CliError);
  });

  test('allows matching flag and positional', () => {
    const parsed = { positionals: ['file.docx'], options: { doc: 'file.docx' }, unknown: [], errors: [] };
    const result = resolveDocArg(parsed, 'cmd');
    expect(result.doc).toBe('file.docx');
  });

  test('returns undefined when no doc provided', () => {
    const parsed = { positionals: [], options: {}, unknown: [], errors: [] };
    const result = resolveDocArg(parsed, 'cmd');
    expect(result.doc).toBeUndefined();
  });
});

describe('requireDocArg', () => {
  test('throws when no doc', () => {
    const parsed = { positionals: [], options: {}, unknown: [], errors: [] };
    expect(() => requireDocArg(parsed, 'cmd')).toThrow(CliError);
  });

  test('returns doc when available', () => {
    const parsed = { positionals: ['file.docx'], options: {}, unknown: [], errors: [] };
    const result = requireDocArg(parsed, 'cmd');
    expect(result.doc).toBe('file.docx');
  });
});

describe('parseCommaList', () => {
  test('splits comma-separated values', () => {
    expect(parseCommaList('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  test('trims whitespace', () => {
    expect(parseCommaList('a , b , c')).toEqual(['a', 'b', 'c']);
  });

  test('filters empty segments', () => {
    expect(parseCommaList('a,,b,')).toEqual(['a', 'b']);
  });

  test('returns empty array for undefined', () => {
    expect(parseCommaList(undefined)).toEqual([]);
  });

  test('returns empty array for empty string', () => {
    expect(parseCommaList('')).toEqual([]);
  });
});
