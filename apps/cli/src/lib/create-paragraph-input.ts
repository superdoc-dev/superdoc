import type { ParsedArgs } from './args';
import { getStringOption, resolveJsonInput } from './args';
import { CliError } from './errors';
import { validateCreateParagraphInput, validateNodeAddress } from './validate';
import type { CreateParagraphInput } from './types';

type FlatLocation =
  | { kind: 'documentStart' }
  | { kind: 'documentEnd' }
  | { kind: 'before'; target: Extract<CreateParagraphInput['at'], { kind: 'before' }>['target'] }
  | { kind: 'after'; target: Extract<CreateParagraphInput['at'], { kind: 'after' }>['target'] };

function parseAtFlag(rawAt: string | undefined, commandName: string): FlatLocation | undefined {
  if (!rawAt) return undefined;

  if (rawAt === 'document-start') return { kind: 'documentStart' };
  if (rawAt === 'document-end') return { kind: 'documentEnd' };

  throw new CliError(
    'INVALID_ARGUMENT',
    `${commandName}: --at must be "document-start" or "document-end" when provided.`,
  );
}

function ensureBlockTarget(
  value: unknown,
  path: string,
): Extract<CreateParagraphInput['at'], { kind: 'before' }>['target'] {
  const target = validateNodeAddress(value, path);
  if (target.kind !== 'block') {
    throw new CliError('VALIDATION_ERROR', `${path}.kind must be "block".`);
  }
  return target;
}

async function buildFlatInput(parsed: ParsedArgs, commandName: string): Promise<CreateParagraphInput> {
  const text = getStringOption(parsed, 'text');
  const at = parseAtFlag(getStringOption(parsed, 'at'), commandName);
  const beforePayload = await resolveJsonInput(parsed, 'before-address');
  const afterPayload = await resolveJsonInput(parsed, 'after-address');

  if (beforePayload != null && afterPayload != null) {
    throw new CliError(
      'INVALID_ARGUMENT',
      `${commandName}: use only one of --before-address-json or --after-address-json.`,
    );
  }

  if (at && (beforePayload != null || afterPayload != null)) {
    throw new CliError(
      'INVALID_ARGUMENT',
      `${commandName}: --at cannot be combined with --before-address-json/--after-address-json.`,
    );
  }

  if (beforePayload != null) {
    return {
      text,
      at: {
        kind: 'before',
        target: ensureBlockTarget(beforePayload, 'before-address'),
      },
    };
  }

  if (afterPayload != null) {
    return {
      text,
      at: {
        kind: 'after',
        target: ensureBlockTarget(afterPayload, 'after-address'),
      },
    };
  }

  return {
    text,
    at,
  };
}

export async function resolveCreateParagraphInput(
  parsed: ParsedArgs,
  commandName: string,
): Promise<CreateParagraphInput> {
  const inputJson = await resolveJsonInput(parsed, 'input');
  const hasFlatFlags =
    getStringOption(parsed, 'text') != null ||
    getStringOption(parsed, 'at') != null ||
    getStringOption(parsed, 'before-address-json') != null ||
    getStringOption(parsed, 'before-address-file') != null ||
    getStringOption(parsed, 'after-address-json') != null ||
    getStringOption(parsed, 'after-address-file') != null;

  if (inputJson && hasFlatFlags) {
    throw new CliError(
      'INVALID_ARGUMENT',
      `${commandName}: --input-json/--input-file cannot be combined with flat create flags.`,
    );
  }

  if (inputJson) {
    return validateCreateParagraphInput(inputJson, 'input');
  }

  return buildFlatInput(parsed, commandName);
}
