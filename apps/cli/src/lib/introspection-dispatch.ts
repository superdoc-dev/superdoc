/**
 * Dispatch for CLI-only introspection operations: describe, describeCommand, status.
 *
 * These operations are not doc-backed (they don't call editor.doc.invoke()) and
 * are not lifecycle operations (they don't create/save/close sessions). They are
 * CLI-level introspection that runs without a document context or with an
 * optional session for status.
 */

import type { CliOperationId } from '../cli';
import { buildContractOverview, buildContractOperationDetail } from './contract';
import { getActiveSessionId, getWorkingDocumentSize, withActiveContext } from './context';
import { CliError } from './errors';
import { readRequiredString } from './input-readers';
import type { CommandContext, CommandExecution } from './types';

type IntrospectionInvoker = (input: Record<string, unknown>, context: CommandContext) => Promise<CommandExecution>;

// ---------------------------------------------------------------------------
// Describe
// ---------------------------------------------------------------------------

function buildDescribePretty(data: ReturnType<typeof buildContractOverview>): string {
  const lines: string[] = [
    `Contract ${data.contractVersion} (${data.operationCount} operations)`,
    `CLI: ${data.cli.package}@${data.cli.minVersion}`,
    `Host protocol: ${data.protocol.host.protocolVersion}`,
  ];

  for (const operation of data.operations) {
    lines.push(`- ${operation.id} -> ${operation.command.join(' ')} (${operation.category})`);
  }

  return lines.join('\n');
}

type OperationDetail = NonNullable<ReturnType<typeof buildContractOperationDetail>>;
type DescribedParam = {
  name: string;
  kind: string;
  flag?: string;
  type: string;
  required?: boolean;
  schema?: unknown;
};
type ConstraintsShape = {
  requiresOneOf?: ReadonlyArray<ReadonlyArray<string>>;
  mutuallyExclusive?: ReadonlyArray<ReadonlyArray<string>>;
  requiredWhen?: ReadonlyArray<{ param: string; whenParam: string; equals?: unknown; present?: boolean }>;
};

function extractEnumValues(schema: unknown): string | null {
  if (typeof schema !== 'object' || schema == null) return null;
  const record = schema as Record<string, unknown>;

  if (Array.isArray(record.oneOf)) {
    const values = record.oneOf
      .map((entry) => {
        if (typeof entry !== 'object' || entry == null) return null;
        if (!Object.prototype.hasOwnProperty.call(entry, 'const')) return null;
        return String((entry as { const: unknown }).const);
      })
      .filter((value): value is string => Boolean(value));
    if (values.length > 0 && values.length <= 6) return values.join('|');
  }

  if (Array.isArray(record.enum) && record.enum.length > 0 && record.enum.length <= 6) {
    return record.enum.map(String).join('|');
  }

  return null;
}

function flagForParamName(name: string, params: readonly DescribedParam[]): string {
  const param = params.find((candidate) => candidate.name === name);
  if (!param) return name;
  if (param.kind === 'doc') return `<${param.name}>`;
  if (param.kind === 'flag' || param.kind === 'jsonFlag') return param.flag ? `--${param.flag}` : param.name;
  return param.name;
}

function paramLabel(param: DescribedParam): string {
  if (param.kind === 'doc') return `<${param.name}>`;
  if (param.kind !== 'flag' && param.kind !== 'jsonFlag') return param.name;

  const base = param.flag ? `--${param.flag}` : param.name;
  if (param.type === 'boolean') return base;

  const enumValues = extractEnumValues(param.schema);
  const valueLabel = enumValues ? `<${enumValues}>` : `<${param.type}>`;
  return `${base} ${valueLabel}`;
}

function formatConstraints(constraints: ConstraintsShape, params: readonly DescribedParam[]): string[] {
  const lines: string[] = [];

  for (const group of constraints.requiresOneOf ?? []) {
    if (group.length === 0) continue;
    lines.push(`Requires one of: ${group.map((name) => flagForParamName(name, params)).join(' | ')}`);
  }

  const conflictMap = new Map<string, string[]>();
  for (const pair of constraints.mutuallyExclusive ?? []) {
    if (pair.length < 2) continue;
    const [first, second] = pair;
    const existing = conflictMap.get(first) ?? [];
    if (!existing.includes(second)) existing.push(second);
    conflictMap.set(first, existing);
  }

  for (const [name, conflicts] of conflictMap) {
    const left = flagForParamName(name, params);
    const right = conflicts.map((conflict) => flagForParamName(conflict, params)).join(', ');
    lines.push(`Mutually exclusive: ${left} conflicts with ${right}`);
  }

  for (const rule of constraints.requiredWhen ?? []) {
    const required = flagForParamName(rule.param, params);
    const when = flagForParamName(rule.whenParam, params);
    if (rule.present === true) {
      lines.push(`Required when: ${required} required when ${when} is present`);
      continue;
    }
    if (rule.present === false) {
      lines.push(`Required when: ${required} required when ${when} is absent`);
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(rule, 'equals')) {
      lines.push(`Required when: ${required} required when ${when} = ${JSON.stringify(rule.equals)}`);
    }
  }

  return lines;
}

function buildDescribeCommandPretty(data: OperationDetail): string {
  const operation = data.operation;
  const lines: string[] = [];

  lines.push(`superdoc ${operation.command.join(' ')} (${operation.id}): ${operation.description}`);
  lines.push('');
  lines.push(
    `  Category: ${operation.category} | Stability: ${operation.stability} | Mutates: ${
      operation.mutates ? 'yes' : 'no'
    } | Requires document context: ${operation.requiresDocumentContext ? 'yes' : 'no'}`,
  );
  lines.push(`  Capabilities: ${(operation.capabilities ?? []).join(', ') || '<none>'}`);

  const params = [...operation.params] as DescribedParam[];
  const constraints =
    'constraints' in operation ? (operation.constraints as unknown as ConstraintsShape | undefined) : undefined;
  if (params.length > 0) {
    lines.push('');
    lines.push('Parameters:');

    const requiresOneOf = constraints?.requiresOneOf;
    const formatted = params.map((param) => {
      const label = paramLabel(param);
      const detailParts: string[] = [];
      if (param.kind === 'doc' && param.name === 'doc') {
        detailParts.push('Document path or stdin');
      }
      const oneOfGroup = requiresOneOf?.find((group) => group.includes(param.name));
      if (oneOfGroup && oneOfGroup.length > 1) {
        const peers = oneOfGroup.map((name) => flagForParamName(name, params)).join(' or ');
        detailParts.push(`(required with one of: ${peers})`);
      } else if (param.required === true) {
        detailParts.push('(required)');
      }
      return { label, detail: detailParts.join(' ') };
    });
    const maxLabel = Math.max(...formatted.map((entry) => entry.label.length));
    for (const entry of formatted) {
      const suffix = entry.detail.length > 0 ? `  ${entry.detail}` : '';
      lines.push(`  ${entry.label.padEnd(maxLabel)}${suffix}`);
    }
  }

  if (constraints) {
    const constraintLines = formatConstraints(constraints, params);
    if (constraintLines.length > 0) {
      lines.push('');
      lines.push('Constraints:');
      for (const constraintLine of constraintLines) {
        lines.push(`  ${constraintLine}`);
      }
    }
  }

  if (operation.errors.length > 0) {
    lines.push('');
    lines.push('Error codes:');
    for (const code of operation.errors) {
      lines.push(`  ${code}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Invoker map
// ---------------------------------------------------------------------------

const INTROSPECTION_INVOKERS: Partial<Record<CliOperationId, IntrospectionInvoker>> = {
  'doc.describe': async () => {
    const data = buildContractOverview();
    return {
      command: 'describe',
      data,
      pretty: buildDescribePretty(data),
    };
  },

  'doc.describeCommand': async (input) => {
    const query = readRequiredString(input, 'operationId', 'describe command');
    const detail = buildContractOperationDetail(query);
    if (!detail) {
      throw new CliError('TARGET_NOT_FOUND', `Unknown operation: ${query}`, { query });
    }
    return {
      command: 'describe command',
      data: detail,
      pretty: buildDescribeCommandPretty(detail),
    };
  },

  'doc.status': async (_input, context) => {
    const activeSessionId = await getActiveSessionId();

    try {
      return await withActiveContext(
        context.io,
        'status',
        async ({ metadata, paths }) => {
          const byteLength = await getWorkingDocumentSize(paths);

          return {
            command: 'status',
            data: {
              active: true,
              contextId: metadata.contextId,
              activeSessionId: activeSessionId ?? undefined,
              projectRoot: metadata.projectRoot,
              document: {
                path: metadata.sourcePath,
                source: metadata.source,
                byteLength,
                revision: metadata.revision,
              },
              dirty: metadata.dirty,
              sessionType: metadata.sessionType,
              collaboration: metadata.collaboration,
              openedAt: metadata.openedAt,
              updatedAt: metadata.updatedAt,
              lastSavedAt: metadata.lastSavedAt,
            },
            pretty: [
              `Context: ${metadata.contextId}`,
              `Default: ${activeSessionId ?? '<none>'}`,
              `Document: ${metadata.sourcePath ?? '<stdin>'}`,
              `Session Type: ${metadata.sessionType}`,
              metadata.collaboration ? `Collab Doc ID: ${metadata.collaboration.documentId}` : undefined,
              `Revision: ${metadata.revision}`,
              `Dirty: ${metadata.dirty ? 'yes' : 'no'}`,
            ]
              .filter((line): line is string => Boolean(line))
              .join('\n'),
          };
        },
        context.sessionId,
      );
    } catch (error) {
      if (error instanceof CliError && error.code === 'NO_ACTIVE_DOCUMENT') {
        return {
          command: 'status',
          data: {
            active: false,
            activeSessionId: activeSessionId ?? undefined,
            requestedSessionId: context.sessionId,
          },
          pretty: 'No active document',
        };
      }
      throw error;
    }
  },
};

/**
 * Dispatches a CLI-only introspection operation.
 * Returns the execution result, or null if the operation is not an introspection op.
 */
export async function dispatchIntrospectionOperation(
  operationId: CliOperationId,
  input: Record<string, unknown>,
  context: CommandContext,
): Promise<CommandExecution | null> {
  const invoker = INTROSPECTION_INVOKERS[operationId];
  if (!invoker) return null;
  return invoker(input, context);
}
