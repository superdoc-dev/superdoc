import { readFile } from 'node:fs/promises';
import { CliError } from './errors';
import { validateSessionId } from './session';
import type { GlobalOptions, OutputMode } from './types';

export type OptionType = 'string' | 'number' | 'boolean';

export interface OptionSpec {
  name: string;
  type: OptionType;
  aliases?: string[];
  multiple?: boolean;
}

export interface ParsedArgs {
  positionals: string[];
  options: Record<string, unknown>;
  unknown: string[];
  errors: string[];
}

function parseGlobalOutput(outputValue: string | undefined, jsonFlag: boolean, prettyFlag: boolean): OutputMode {
  if (jsonFlag && prettyFlag) {
    throw new CliError('INVALID_ARGUMENT', 'Use only one of --json or --pretty.');
  }

  if (outputValue) {
    if (outputValue !== 'json' && outputValue !== 'pretty') {
      throw new CliError('INVALID_ARGUMENT', '--output must be either "json" or "pretty".');
    }
    if (jsonFlag && outputValue !== 'json') {
      throw new CliError('INVALID_ARGUMENT', 'Conflicting output flags: --output and --json.');
    }
    if (prettyFlag && outputValue !== 'pretty') {
      throw new CliError('INVALID_ARGUMENT', 'Conflicting output flags: --output and --pretty.');
    }
    return outputValue;
  }

  if (prettyFlag) return 'pretty';
  return 'json';
}

export function parseGlobalArgs(argv: string[]): { globals: GlobalOptions; rest: string[] } {
  let outputValue: string | undefined;
  let jsonFlag = false;
  let prettyFlag = false;
  let timeoutMs: number | undefined;
  let sessionId: string | undefined;
  let help = false;
  const rest: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--') {
      rest.push(...argv.slice(index));
      break;
    }

    if (token === '--json') {
      jsonFlag = true;
      continue;
    }

    if (token === '--pretty') {
      prettyFlag = true;
      continue;
    }

    if (token === '--help' || token === '-h') {
      help = true;
      continue;
    }

    if (token === '--session') {
      const next = argv[index + 1];
      if (!next) {
        throw new CliError('MISSING_REQUIRED', '--session requires a value.');
      }
      sessionId = validateSessionId(next);
      index += 1;
      continue;
    }

    if (token.startsWith('--session=')) {
      sessionId = validateSessionId(token.slice('--session='.length));
      continue;
    }

    if (token === '--output') {
      const next = argv[index + 1];
      if (!next) {
        throw new CliError('MISSING_REQUIRED', '--output requires a value.');
      }
      outputValue = next;
      index += 1;
      continue;
    }

    if (token.startsWith('--output=')) {
      outputValue = token.slice('--output='.length);
      continue;
    }

    if (token === '--timeout-ms') {
      const next = argv[index + 1];
      if (!next) {
        throw new CliError('MISSING_REQUIRED', '--timeout-ms requires a value.');
      }
      const parsed = Number(next);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new CliError('INVALID_ARGUMENT', '--timeout-ms must be a positive number.');
      }
      timeoutMs = parsed;
      index += 1;
      continue;
    }

    if (token.startsWith('--timeout-ms=')) {
      const parsed = Number(token.slice('--timeout-ms='.length));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new CliError('INVALID_ARGUMENT', '--timeout-ms must be a positive number.');
      }
      timeoutMs = parsed;
      continue;
    }

    rest.push(token);
  }

  const output = parseGlobalOutput(outputValue, jsonFlag, prettyFlag);

  return {
    globals: {
      output,
      timeoutMs,
      sessionId,
      help,
    },
    rest,
  };
}

function normalizeBooleanValue(value: string): boolean | undefined {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
}

export function parseCommandArgs(tokens: string[], specs: OptionSpec[]): ParsedArgs {
  const positionals: string[] = [];
  const options: Record<string, unknown> = {};
  const unknown: string[] = [];
  const errors: string[] = [];

  const byName = new Map<string, OptionSpec>();
  for (const spec of specs) {
    byName.set(spec.name, spec);
    for (const alias of spec.aliases ?? []) {
      byName.set(alias, spec);
    }
  }

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    if (token === '--') {
      positionals.push(...tokens.slice(i + 1));
      break;
    }

    if (!token.startsWith('--')) {
      positionals.push(token);
      i += 1;
      continue;
    }

    const eqIndex = token.indexOf('=');
    const rawName = eqIndex >= 0 ? token.slice(2, eqIndex) : token.slice(2);
    const inlineValue = eqIndex >= 0 ? token.slice(eqIndex + 1) : undefined;

    const spec = byName.get(rawName);
    if (!spec) {
      unknown.push(`--${rawName}`);
      i += 1;
      continue;
    }

    let parsedValue: unknown;

    if (spec.type === 'boolean') {
      if (inlineValue == null) {
        const nextToken = tokens[i + 1];
        const normalizedNext = typeof nextToken === 'string' ? normalizeBooleanValue(nextToken) : undefined;
        if (normalizedNext != null) {
          parsedValue = normalizedNext;
          i += 2;
        } else {
          parsedValue = true;
          i += 1;
        }
      } else {
        const normalized = normalizeBooleanValue(inlineValue);
        if (normalized == null) {
          errors.push(`--${rawName} must be true/false when provided with an explicit value.`);
          i += 1;
          continue;
        }
        parsedValue = normalized;
        i += 1;
      }
    } else {
      const valueToken = inlineValue ?? tokens[i + 1];
      if (valueToken == null) {
        errors.push(`--${rawName} requires a value.`);
        i += 1;
        continue;
      }

      if (spec.type === 'number') {
        const n = Number(valueToken);
        if (!Number.isFinite(n)) {
          errors.push(`--${rawName} must be a number.`);
          i += inlineValue == null ? 2 : 1;
          continue;
        }
        parsedValue = n;
      } else {
        parsedValue = valueToken;
      }

      i += inlineValue == null ? 2 : 1;
    }

    const existing = options[spec.name];
    if (spec.multiple) {
      if (existing == null) {
        options[spec.name] = [parsedValue];
      } else if (Array.isArray(existing)) {
        existing.push(parsedValue);
      } else {
        options[spec.name] = [existing, parsedValue];
      }
      continue;
    }

    if (existing != null) {
      errors.push(`--${spec.name} was provided more than once.`);
      continue;
    }

    options[spec.name] = parsedValue;
  }

  return {
    positionals,
    options,
    unknown,
    errors,
  };
}

export function ensureValidArgs(parsed: ParsedArgs): void {
  if (parsed.unknown.length > 0) {
    throw new CliError('INVALID_ARGUMENT', `Unknown option(s): ${parsed.unknown.join(', ')}`);
  }

  if (parsed.errors.length > 0) {
    throw new CliError('INVALID_ARGUMENT', parsed.errors[0], {
      errors: parsed.errors,
    });
  }
}

export function getStringOption(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.options[name];
  return typeof value === 'string' ? value : undefined;
}

export function getNumberOption(parsed: ParsedArgs, name: string): number | undefined {
  const value = parsed.options[name];
  return typeof value === 'number' ? value : undefined;
}

export function getBooleanOption(parsed: ParsedArgs, name: string): boolean {
  const value = parsed.options[name];
  return value === true;
}

export function getOptionalBooleanOption(parsed: ParsedArgs, name: string): boolean | undefined {
  const value = parsed.options[name];
  return typeof value === 'boolean' ? value : undefined;
}

export function getStringListOption(parsed: ParsedArgs, name: string): string[] {
  const value = parsed.options[name];
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export function resolveDocArg(parsed: ParsedArgs, commandName: string): { doc?: string; positionals: string[] } {
  const docFromFlag = getStringOption(parsed, 'doc');
  const firstPositional = parsed.positionals[0];

  if (docFromFlag && firstPositional) {
    if (docFromFlag !== firstPositional) {
      throw new CliError(
        'INVALID_ARGUMENT',
        `${commandName}: positional <doc> and --doc must match when both are provided.`,
      );
    }
    return { doc: docFromFlag, positionals: parsed.positionals.slice(1) };
  }

  if (docFromFlag) {
    return { doc: docFromFlag, positionals: parsed.positionals };
  }

  if (firstPositional) {
    return { doc: firstPositional, positionals: parsed.positionals.slice(1) };
  }

  return { doc: undefined, positionals: parsed.positionals };
}

export function requireDocArg(parsed: ParsedArgs, commandName: string): { doc: string; positionals: string[] } {
  const resolved = resolveDocArg(parsed, commandName);
  if (resolved.doc) {
    return {
      doc: resolved.doc,
      positionals: resolved.positionals,
    };
  }

  throw new CliError('MISSING_REQUIRED', `${commandName}: missing required <doc> argument.`);
}

export function expectNoPositionals(parsed: ParsedArgs, positionals: string[], commandName: string): void {
  if (positionals.length === 0) return;
  throw new CliError('INVALID_ARGUMENT', `${commandName}: unexpected positional argument(s): ${positionals.join(' ')}`);
}

export function requireStringOption(parsed: ParsedArgs, name: string, commandName: string): string {
  const value = getStringOption(parsed, name);
  if (value) return value;
  throw new CliError('MISSING_REQUIRED', `${commandName}: missing required --${name}.`);
}

export function requireBooleanOption(parsed: ParsedArgs, name: string, commandName: string): boolean {
  const value = getOptionalBooleanOption(parsed, name);
  if (typeof value === 'boolean') return value;
  throw new CliError('MISSING_REQUIRED', `${commandName}: missing required --${name}.`);
}

export async function resolveJsonInput(parsed: ParsedArgs, baseName: string): Promise<unknown | undefined> {
  const jsonFlag = getStringOption(parsed, `${baseName}-json`);
  const fileFlag = getStringOption(parsed, `${baseName}-file`);

  if (jsonFlag && fileFlag) {
    throw new CliError(
      'INVALID_ARGUMENT',
      `Use only one of --${baseName}-json or --${baseName}-file for the ${baseName} payload.`,
    );
  }

  if (jsonFlag) {
    try {
      return JSON.parse(jsonFlag) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new CliError('JSON_PARSE_ERROR', `Invalid --${baseName}-json payload.`, {
        message,
      });
    }
  }

  if (fileFlag) {
    let raw: string;
    try {
      raw = await readFile(fileFlag, 'utf8');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new CliError('FILE_READ_ERROR', `Could not read --${baseName}-file: ${fileFlag}`, {
        message,
      });
    }

    try {
      return JSON.parse(raw) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new CliError('JSON_PARSE_ERROR', `Invalid JSON in --${baseName}-file: ${fileFlag}`, {
        message,
      });
    }
  }

  return undefined;
}

export function parseCommaList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
