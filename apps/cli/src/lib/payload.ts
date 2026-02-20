import type {
  CreateParagraphInput,
  ListInsertInput,
  ListItemAddress,
  ListsListQuery,
  ListSetTypeInput,
  ListTargetInput,
  NodeAddress,
  TextAddress,
} from './types';
import { CliError } from './errors';
import { resolveJsonInput, type ParsedArgs } from './args';
import {
  validateCreateParagraphInput,
  validateListInsertInput,
  validateListsListQuery,
  validateListItemAddress,
  validateListSetTypeInput,
  validateListTargetInput,
  validateNodeAddress,
  validateTextAddress,
} from './validate';

export async function resolveTextAddressPayload(
  parsed: ParsedArgs,
  baseName = 'target',
): Promise<TextAddress | undefined> {
  const payload = await resolveJsonInput(parsed, baseName);
  if (!payload) return undefined;
  return validateTextAddress(payload, baseName);
}

export async function requireTextAddressPayload(
  parsed: ParsedArgs,
  commandName: string,
  baseName = 'target',
): Promise<TextAddress> {
  const payload = await resolveTextAddressPayload(parsed, baseName);
  if (!payload) {
    throw new CliError('MISSING_REQUIRED', `${commandName}: provide --${baseName}-json or --${baseName}-file.`);
  }
  return payload;
}

export async function requireNodeAddressPayload(
  parsed: ParsedArgs,
  commandName: string,
  baseName = 'address',
): Promise<NodeAddress> {
  const payload = await resolveJsonInput(parsed, baseName);
  if (!payload) {
    throw new CliError('MISSING_REQUIRED', `${commandName}: provide --${baseName}-json or --${baseName}-file.`);
  }
  return validateNodeAddress(payload, baseName);
}

export async function resolveCreateParagraphPayload(
  parsed: ParsedArgs,
  baseName = 'input',
): Promise<CreateParagraphInput | undefined> {
  const payload = await resolveJsonInput(parsed, baseName);
  if (!payload) return undefined;
  return validateCreateParagraphInput(payload, baseName);
}

export async function resolveListsListQueryPayload(
  parsed: ParsedArgs,
  baseName = 'query',
): Promise<ListsListQuery | undefined> {
  const payload = await resolveJsonInput(parsed, baseName);
  if (!payload) return undefined;
  return validateListsListQuery(payload, baseName);
}

export async function resolveListItemAddressPayload(
  parsed: ParsedArgs,
  baseName = 'target',
): Promise<ListItemAddress | undefined> {
  const payload = await resolveJsonInput(parsed, baseName);
  if (!payload) return undefined;
  return validateListItemAddress(payload, baseName);
}

export async function requireListItemAddressPayload(
  parsed: ParsedArgs,
  commandName: string,
  baseName = 'target',
): Promise<ListItemAddress> {
  const payload = await resolveListItemAddressPayload(parsed, baseName);
  if (!payload) {
    throw new CliError('MISSING_REQUIRED', `${commandName}: provide --${baseName}-json or --${baseName}-file.`);
  }
  return payload;
}

export async function resolveListInsertPayload(
  parsed: ParsedArgs,
  baseName = 'input',
): Promise<ListInsertInput | undefined> {
  const payload = await resolveJsonInput(parsed, baseName);
  if (!payload) return undefined;
  return validateListInsertInput(payload, baseName);
}

export async function resolveListSetTypePayload(
  parsed: ParsedArgs,
  baseName = 'input',
): Promise<ListSetTypeInput | undefined> {
  const payload = await resolveJsonInput(parsed, baseName);
  if (!payload) return undefined;
  return validateListSetTypeInput(payload, baseName);
}

export async function resolveListTargetPayload(
  parsed: ParsedArgs,
  baseName = 'input',
): Promise<ListTargetInput | undefined> {
  const payload = await resolveJsonInput(parsed, baseName);
  if (!payload) return undefined;
  return validateListTargetInput(payload, baseName);
}
