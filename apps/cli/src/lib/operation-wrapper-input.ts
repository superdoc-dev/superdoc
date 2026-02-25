import { resolveJsonInput, type ParsedArgs } from './args';
import { resolveChangeMode } from './change-mode';
import { resolveCreateParagraphInput } from './create-paragraph-input';
import { CliError } from './errors';
import { resolveFindQuery } from './find-query';
import { parseOperationArgs } from './operation-args';
import { requireListItemAddressPayload, requireNodeAddressPayload, resolveListsListQueryPayload } from './payload';
import { validateListsListQuery, validateNodeAddress } from './validate';
import type { CliOperationId } from '../cli';

function stripUndefinedFields(value: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue;
    normalized[key] = entry;
  }
  return normalized;
}

const FLAT_LIST_QUERY_FLAGS = ['limit', 'offset', 'kind', 'level', 'ordinal'];

function hasFlatListQueryFlags(parsed: ParsedArgs): boolean {
  return FLAT_LIST_QUERY_FLAGS.some((flag) => parsed.options[flag] != null);
}

async function resolveListsListQuery(
  parsed: ParsedArgs,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const queryPayload = await resolveListsListQueryPayload(parsed, 'query');
  if (queryPayload && hasFlatListQueryFlags(parsed)) {
    throw new CliError('INVALID_ARGUMENT', 'lists list: do not combine --query-* with flat query flags.');
  }

  const withinPayload = await resolveJsonInput(parsed, 'within');
  let within: Record<string, unknown> | undefined;
  if (withinPayload != null) {
    const validated = validateNodeAddress(withinPayload, 'within');
    if (validated.kind !== 'block') {
      throw new CliError('VALIDATION_ERROR', 'within.kind must be "block".');
    }
    within = validated as unknown as Record<string, unknown>;
  }

  const draft =
    queryPayload ??
    ({
      limit: args.limit,
      offset: args.offset,
      kind: args.kind,
      level: args.level,
      ordinal: args.ordinal,
    } as Record<string, unknown>);

  const query = validateListsListQuery(
    within
      ? {
          ...(draft as Record<string, unknown>),
          within,
        }
      : draft,
    'query',
  );

  return stripUndefinedFields(query as unknown as Record<string, unknown>);
}

export async function parseWrapperOperationInput(
  operationId: CliOperationId,
  tokens: string[],
  commandName: string,
): Promise<Record<string, unknown>> {
  if (operationId === 'doc.find') {
    const { parsed, args } = parseOperationArgs('doc.find', tokens, {
      commandName,
      skipConstraints: true,
      extraOptionSpecs: [
        { name: 'type', type: 'string' },
        { name: 'node-type', type: 'string' },
        { name: 'kind', type: 'string' },
        { name: 'pattern', type: 'string' },
        { name: 'mode', type: 'string' },
        { name: 'case-sensitive', type: 'boolean' },
        { name: 'query-json', type: 'string' },
        { name: 'query-file', type: 'string' },
        { name: 'within-json', type: 'string' },
        { name: 'within-file', type: 'string' },
      ],
    });

    const query = await resolveFindQuery(parsed);
    return stripUndefinedFields({
      doc: args.doc,
      sessionId: args.sessionId,
      query,
    });
  }

  if (operationId === 'doc.getNode') {
    const { parsed, args } = parseOperationArgs('doc.getNode', tokens, {
      commandName,
      extraOptionSpecs: [{ name: 'address-file', type: 'string' }],
    });

    const address = await requireNodeAddressPayload(parsed, commandName, 'address');
    return stripUndefinedFields({
      doc: args.doc,
      sessionId: args.sessionId,
      address,
    });
  }

  if (operationId === 'doc.lists.get') {
    const { parsed, args } = parseOperationArgs('doc.lists.get', tokens, {
      commandName,
      extraOptionSpecs: [{ name: 'address-file', type: 'string' }],
    });

    const address = await requireListItemAddressPayload(parsed, commandName, 'address');
    return stripUndefinedFields({
      doc: args.doc,
      sessionId: args.sessionId,
      address,
    });
  }

  if (operationId === 'doc.lists.list') {
    const { parsed, args } = parseOperationArgs('doc.lists.list', tokens, {
      commandName,
      extraOptionSpecs: [
        { name: 'kind', type: 'string' },
        { name: 'level', type: 'number' },
        { name: 'ordinal', type: 'number' },
        { name: 'query-json', type: 'string' },
        { name: 'query-file', type: 'string' },
        { name: 'within-json', type: 'string' },
        { name: 'within-file', type: 'string' },
      ],
    });

    const query = await resolveListsListQuery(parsed, args as Record<string, unknown>);
    return stripUndefinedFields({
      doc: args.doc,
      sessionId: args.sessionId,
      query,
    });
  }

  if (operationId === 'doc.create.paragraph') {
    const { parsed, args } = parseOperationArgs('doc.create.paragraph', tokens, {
      commandName,
      extraOptionSpecs: [
        { name: 'input-file', type: 'string' },
        { name: 'text', type: 'string' },
        { name: 'at', type: 'string' },
        { name: 'before-address-json', type: 'string' },
        { name: 'before-address-file', type: 'string' },
        { name: 'after-address-json', type: 'string' },
        { name: 'after-address-file', type: 'string' },
        { name: 'tracked', type: 'boolean' },
        { name: 'direct', type: 'boolean' },
      ],
    });

    const input = await resolveCreateParagraphInput(parsed, commandName);
    const changeMode = resolveChangeMode(parsed, commandName);

    return stripUndefinedFields({
      doc: args.doc,
      sessionId: args.sessionId,
      input,
      changeMode,
      out: args.out,
      dryRun: args.dryRun,
      force: args.force,
      expectedRevision: args.expectedRevision,
    });
  }

  const { args } = parseOperationArgs(operationId, tokens, { commandName });
  return stripUndefinedFields(args as Record<string, unknown>);
}
