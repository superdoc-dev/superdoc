/**
 * CLI command routing table — derives from document-api + CLI operation set.
 *
 * For doc-backed operations, metadata is inherited from document-api.
 * Only CLI-only operations and aliases are hand-written.
 */

import { COMMAND_CATALOG } from '@superdoc/document-api';
import type { CliCommandSpec } from './types';
import {
  CLI_DOC_OPERATIONS,
  CLI_ONLY_OPERATIONS,
  CLI_OPERATION_IDS,
  cliCategory,
  cliCommandTokens,
  cliDescription,
  cliRequiresDocumentContext,
  toDocApiId,
  type CliOperationId,
} from './operation-set';

// ---------------------------------------------------------------------------
// Build command specs for doc-backed operations
// ---------------------------------------------------------------------------

function buildDocBackedSpec(docApiId: string, cliOpId: CliOperationId): CliCommandSpec {
  const tokens = cliCommandTokens(cliOpId);
  const key = tokens.join(' ');
  const catalog = COMMAND_CATALOG[docApiId as keyof typeof COMMAND_CATALOG];

  return {
    key,
    tokens,
    operationId: cliOpId,
    category: cliCategory(cliOpId),
    description: cliDescription(cliOpId),
    mutates: catalog.mutates,
    requiresDocumentContext: cliRequiresDocumentContext(cliOpId),
    alias: false,
    canonicalKey: key,
    examples: [],
  };
}

// ---------------------------------------------------------------------------
// CLI-only operation specs (hand-written)
// ---------------------------------------------------------------------------

type CliOnlySpecOverride = {
  mutates: boolean;
  examples?: readonly string[];
};

const CLI_ONLY_OVERRIDES: Record<string, CliOnlySpecOverride> = {
  open: { mutates: true, examples: ['superdoc open my-doc.docx', 'superdoc open my-doc.docx --session my-session'] },
  save: { mutates: true, examples: ['superdoc save', 'superdoc save --out copy.docx'] },
  close: { mutates: true, examples: ['superdoc close'] },
  status: { mutates: false, examples: ['superdoc status'] },
  describe: { mutates: false, examples: ['superdoc describe'] },
  describeCommand: { mutates: false, examples: ['superdoc describe command find'] },
  'session.list': { mutates: false, examples: ['superdoc session list'] },
  'session.save': {
    mutates: true,
    examples: ['superdoc session save my-session', 'superdoc session save --session my-session --out copy.docx'],
  },
  'session.close': {
    mutates: true,
    examples: ['superdoc session close my-session', 'superdoc session close --session my-session --discard'],
  },
  'session.setDefault': {
    mutates: true,
    examples: ['superdoc session set-default my-session', 'superdoc session set-default --session my-session'],
  },
};

function buildCliOnlySpec(cliOnlyOp: string, cliOpId: CliOperationId): CliCommandSpec {
  const tokens = cliCommandTokens(cliOpId);
  const key = tokens.join(' ');
  const override = CLI_ONLY_OVERRIDES[cliOnlyOp] ?? { mutates: false };

  return {
    key,
    tokens,
    operationId: cliOpId,
    category: cliCategory(cliOpId),
    description: cliDescription(cliOpId),
    mutates: override.mutates,
    requiresDocumentContext: cliRequiresDocumentContext(cliOpId),
    alias: false,
    canonicalKey: key,
    examples: override.examples ?? [],
  };
}

// ---------------------------------------------------------------------------
// Alias specs
// ---------------------------------------------------------------------------

const ALIAS_SPECS: CliCommandSpec[] = [
  {
    key: 'session use',
    tokens: ['session', 'use'],
    operationId: 'doc.session.setDefault',
    category: 'session',
    description: 'Alias for session set-default.',
    mutates: true,
    requiresDocumentContext: false,
    alias: true,
    canonicalKey: 'session set-default',
    examples: ['superdoc session use my-session', 'superdoc session use --session my-session'],
  },
];

// ---------------------------------------------------------------------------
// Build and export
// ---------------------------------------------------------------------------

function buildAllSpecs(): CliCommandSpec[] {
  const specs: CliCommandSpec[] = [];

  for (const docApiId of CLI_DOC_OPERATIONS) {
    const cliOpId = `doc.${docApiId}` as CliOperationId;
    specs.push(buildDocBackedSpec(docApiId, cliOpId));
  }

  for (const cliOnlyOp of CLI_ONLY_OPERATIONS) {
    const cliOpId = `doc.${cliOnlyOp}` as CliOperationId;
    specs.push(buildCliOnlySpec(cliOnlyOp, cliOpId));
  }

  specs.push(...ALIAS_SPECS);

  return specs;
}

export const CLI_COMMAND_SPECS: readonly CliCommandSpec[] = buildAllSpecs();

export type CliCommandKey = (typeof CLI_COMMAND_SPECS)[number]['key'];

export const CLI_COMMAND_KEYS: readonly string[] = CLI_COMMAND_SPECS.map((spec) => spec.key);

export const CLI_MAX_COMMAND_TOKENS: number = Math.max(...CLI_COMMAND_SPECS.map((spec) => spec.tokens.length));

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

function buildHelpText(): string {
  const lines: string[] = ['Usage: superdoc <command> [options]', ''];

  const categories = new Map<string, CliCommandSpec[]>();
  for (const spec of CLI_COMMAND_SPECS) {
    if (spec.alias) continue;
    const list = categories.get(spec.category) ?? [];
    list.push(spec);
    categories.set(spec.category, list);
  }

  const categoryOrder = [
    'query',
    'mutation',
    'format',
    'create',
    'lists',
    'comments',
    'trackChanges',
    'lifecycle',
    'session',
    'introspection',
  ];

  for (const category of categoryOrder) {
    const specs = categories.get(category);
    if (!specs || specs.length === 0) continue;

    lines.push(`${category}:`);
    const maxKey = Math.max(...specs.map((spec) => spec.key.length));
    for (const spec of specs) {
      lines.push(`  ${spec.key.padEnd(maxKey)}  ${spec.description}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

export const CLI_HELP: string = buildHelpText();

// ---------------------------------------------------------------------------
// Lookup maps
// ---------------------------------------------------------------------------

/** Maps CliOperationId → CLI command key. */
const CANONICAL_SPEC_BY_OPERATION = new Map<CliOperationId, CliCommandSpec>(
  CLI_COMMAND_SPECS.filter((spec) => !spec.alias).map((spec) => [spec.operationId as CliOperationId, spec] as const),
);

export const CLI_OPERATION_COMMAND_KEYS: Record<CliOperationId, string> = Object.fromEntries(
  CLI_OPERATION_IDS.map((operationId) => {
    const spec = CANONICAL_SPEC_BY_OPERATION.get(operationId);
    if (!spec) {
      throw new Error(`Missing canonical command spec for operation: ${operationId}`);
    }
    return [operationId, spec.key] as const;
  }),
) as Record<CliOperationId, string>;

export { CLI_OPERATION_IDS, toDocApiId, type CliOperationId } from './operation-set';
