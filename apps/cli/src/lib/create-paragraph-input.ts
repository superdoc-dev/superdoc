import type { ParsedArgs } from './args';
import { getStringOption, resolveJsonInput } from './args';
import { CliError } from './errors';
import { isRecord } from './guards';
import { validateNodeAddress } from './validate';
import type { CreateParagraphInput } from './types';

type BlockTarget = Extract<NonNullable<CreateParagraphInput['at']>, { target: unknown }>['target'];

type FlatLocation =
  | { kind: 'documentStart' }
  | { kind: 'documentEnd' }
  | { kind: 'before'; target: BlockTarget }
  | { kind: 'after'; target: BlockTarget };

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new CliError('VALIDATION_ERROR', `${path} must be an object.`);
  }
  return value;
}

function expectOnlyKeys(obj: Record<string, unknown>, allowedKeys: readonly string[], path: string): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      throw new CliError('VALIDATION_ERROR', `${path}.${key} is not allowed.`);
    }
  }
}

function parseAtFlag(rawAt: string | undefined, commandName: string): FlatLocation | undefined {
  if (!rawAt) return undefined;

  if (rawAt === 'document-start') return { kind: 'documentStart' };
  if (rawAt === 'document-end') return { kind: 'documentEnd' };

  throw new CliError(
    'INVALID_ARGUMENT',
    `${commandName}: --at must be "document-start" or "document-end" when provided.`,
  );
}

function normalizeBlockTarget(value: unknown, path: string): BlockTarget {
  const target = validateNodeAddress(value, path);
  if (target.kind !== 'block') {
    throw new CliError('VALIDATION_ERROR', `${path}.kind must be "block".`);
  }
  if (isRecord(value) && value.story != null) {
    return {
      ...target,
      story: value.story as BlockTarget['story'],
    };
  }
  return target;
}

function normalizeLocation(value: unknown, path: string): NonNullable<CreateParagraphInput['at']> {
  const obj = expectRecord(value, path);
  const kind = obj.kind;

  if (kind === 'documentStart' || kind === 'documentEnd') {
    expectOnlyKeys(obj, ['kind'], path);
    return { kind };
  }

  if (kind === 'before' || kind === 'after') {
    if (obj.nodeId != null) {
      throw new CliError(
        'VALIDATION_ERROR',
        `${path}: bare "nodeId" shorthand is not supported. Use "target" with an explicit { kind: "block", nodeType, nodeId }.`,
      );
    }

    expectOnlyKeys(obj, ['kind', 'target'], path);
    if (obj.target == null) {
      throw new CliError('VALIDATION_ERROR', `${path} must include a "target" BlockNodeAddress.`);
    }

    return {
      kind,
      target: normalizeBlockTarget(obj.target, `${path}.target`),
    };
  }

  throw new CliError('VALIDATION_ERROR', `${path}.kind must be one of: documentStart, documentEnd, before, after.`);
}

function normalizeCreateParagraphInputValue(value: unknown, path = 'input'): CreateParagraphInput {
  const obj = expectRecord(value, path);
  const input: CreateParagraphInput = {};

  if (obj.in != null) {
    input.in = obj.in as CreateParagraphInput['in'];
  }

  if (obj.at != null) {
    input.at = normalizeLocation(obj.at, `${path}.at`);
  }

  if (obj.text != null) {
    if (typeof obj.text !== 'string') {
      throw new CliError('VALIDATION_ERROR', `${path}.text must be a string.`);
    }
    input.text = obj.text;
  }

  return input;
}

async function buildFlatInput(parsed: ParsedArgs, commandName: string): Promise<CreateParagraphInput> {
  const story = await resolveJsonInput(parsed, 'in');
  const text = getStringOption(parsed, 'text');
  const at = parseAtFlag(getStringOption(parsed, 'at'), commandName);
  const atJson = await resolveJsonInput(parsed, 'at');
  const beforePayload = await resolveJsonInput(parsed, 'before-address');
  const afterPayload = await resolveJsonInput(parsed, 'after-address');

  // Count how many location forms were provided
  const locationForms = [at, atJson, beforePayload, afterPayload].filter((v) => v != null);
  if (locationForms.length > 1) {
    throw new CliError(
      'INVALID_ARGUMENT',
      `${commandName}: use only one of --at, --at-json, --before-address-json, or --after-address-json.`,
    );
  }

  // Canonical --at-json path (preferred)
  if (atJson != null) {
    return {
      ...(story != null ? { in: story as CreateParagraphInput['in'] } : {}),
      ...normalizeCreateParagraphInputValue({ at: atJson, text }, 'input'),
    };
  }

  if (beforePayload != null) {
    return {
      ...(story != null ? { in: story as CreateParagraphInput['in'] } : {}),
      ...(text != null ? { text } : {}),
      at: {
        kind: 'before',
        target: normalizeBlockTarget(beforePayload, 'before-address'),
      },
    };
  }

  if (afterPayload != null) {
    return {
      ...(story != null ? { in: story as CreateParagraphInput['in'] } : {}),
      ...(text != null ? { text } : {}),
      at: {
        kind: 'after',
        target: normalizeBlockTarget(afterPayload, 'after-address'),
      },
    };
  }

  return {
    ...(story != null ? { in: story as CreateParagraphInput['in'] } : {}),
    ...(text != null ? { text } : {}),
    ...(at != null ? { at } : {}),
  };
}

export async function resolveCreateParagraphInput(
  parsed: ParsedArgs,
  commandName: string,
): Promise<CreateParagraphInput> {
  const inputJson = await resolveJsonInput(parsed, 'input');
  const inputProvided = inputJson !== undefined;
  const hasFlatFlags =
    getStringOption(parsed, 'text') != null ||
    getStringOption(parsed, 'in-json') != null ||
    getStringOption(parsed, 'at') != null ||
    getStringOption(parsed, 'at-json') != null ||
    getStringOption(parsed, 'at-file') != null ||
    getStringOption(parsed, 'before-address-json') != null ||
    getStringOption(parsed, 'before-address-file') != null ||
    getStringOption(parsed, 'after-address-json') != null ||
    getStringOption(parsed, 'after-address-file') != null;

  if (inputProvided && hasFlatFlags) {
    throw new CliError(
      'INVALID_ARGUMENT',
      `${commandName}: --input-json/--input-file cannot be combined with flat create flags.`,
    );
  }

  if (inputProvided) {
    return normalizeCreateParagraphInputValue(inputJson, 'input');
  }

  return buildFlatInput(parsed, commandName);
}
