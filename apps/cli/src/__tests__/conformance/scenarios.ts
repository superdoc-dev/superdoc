import type { CliOperationId } from '../../cli';
import { CLI_OPERATION_COMMAND_KEYS } from '../../cli';
import type { ConformanceHarness } from './harness';
import { INLINE_PROPERTY_REGISTRY } from '@superdoc/document-api';

export type ScenarioInvocation = {
  stateDir: string;
  args: string[];
  stdinBytes?: Uint8Array;
};

export type OperationScenario = {
  operationId: CliOperationId;
  success: (harness: ConformanceHarness) => Promise<ScenarioInvocation>;
  failure: (harness: ConformanceHarness) => Promise<ScenarioInvocation>;
  expectedFailureCodes: string[];
  skipRuntimeConformance?: boolean;
};

function commandTokens(operationId: CliOperationId): string[] {
  const key = CLI_OPERATION_COMMAND_KEYS[operationId];
  return key.split(' ');
}

function genericInvalidArgumentFailure(operationId: CliOperationId) {
  return async (harness: ConformanceHarness): Promise<ScenarioInvocation> => ({
    stateDir: await harness.createStateDir(`${operationId}-failure`),
    args: [...commandTokens(operationId), '--invalid-flag-for-conformance'],
  });
}

function extractDiscoveryItems(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== 'object') return [];

  for (const value of Object.values(data as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;

    const asContainer = value as {
      items?: unknown;
      result?: {
        items?: unknown;
      };
    };
    const maybeItems = Array.isArray(asContainer.items)
      ? asContainer.items
      : Array.isArray(asContainer.result?.items)
        ? asContainer.result.items
        : null;

    if (Array.isArray(maybeItems)) {
      return maybeItems.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object');
    }
  }

  return [];
}

function requireSectionAddress(item: Record<string, unknown>, context: string): Record<string, unknown> {
  const address = item.address;
  if (!address || typeof address !== 'object') {
    throw new Error(`Missing section address for ${context}.`);
  }
  return address as Record<string, unknown>;
}

async function resolveFirstSection(
  harness: ConformanceHarness,
  stateDir: string,
  docPath: string,
  context: string,
): Promise<{ item: Record<string, unknown>; address: Record<string, unknown> }> {
  const listed = await harness.runCli([...commandTokens('doc.sections.list'), docPath, '--limit', '10'], stateDir);
  if (listed.result.code !== 0 || listed.envelope.ok !== true) {
    throw new Error(`Failed to list sections for ${context}.`);
  }

  const items = extractDiscoveryItems(listed.envelope.data);
  const first = items[0];
  if (!first) {
    throw new Error(`No sections available for ${context}.`);
  }

  return {
    item: first,
    address: requireSectionAddress(first, context),
  };
}

async function createDocWithSecondSection(
  harness: ConformanceHarness,
  stateDir: string,
  label: string,
): Promise<{ docPath: string; first: Record<string, unknown>; second: Record<string, unknown> }> {
  const sourceDoc = await harness.copyFixtureDoc(`${label}-source`);
  const withBreakDoc = harness.createOutputPath(`${label}-with-break`);
  const created = await harness.runCli(
    [...commandTokens('doc.create.sectionBreak'), sourceDoc, '--break-type', 'nextPage', '--out', withBreakDoc],
    stateDir,
  );
  if (created.result.code !== 0 || created.envelope.ok !== true) {
    throw new Error(`Failed to create second section for ${label}.`);
  }

  const listed = await harness.runCli([...commandTokens('doc.sections.list'), withBreakDoc, '--limit', '10'], stateDir);
  if (listed.result.code !== 0 || listed.envelope.ok !== true) {
    throw new Error(`Failed to list sections after break creation for ${label}.`);
  }

  const items = extractDiscoveryItems(listed.envelope.data);
  const first = items[0];
  const second = items[1];
  if (!first || !second) {
    throw new Error(`Expected at least 2 sections for ${label}.`);
  }

  return { docPath: withBreakDoc, first, second };
}

type ListDiscoveryItem = {
  address?: Record<string, unknown>;
};

async function listDiscoveryItems(
  harness: ConformanceHarness,
  stateDir: string,
  docPath: string,
  limit: number,
): Promise<ListDiscoveryItem[]> {
  const listed = await harness.runCli(['lists', 'list', docPath, '--limit', String(limit)], stateDir);
  if (listed.result.code !== 0 || listed.envelope.ok !== true) {
    throw new Error(`Failed to list list items for ${docPath}.`);
  }

  const items = ((listed.envelope.data as { result?: { items?: ListDiscoveryItem[] } }).result?.items ?? []).filter(
    (item) => !!item,
  );
  return items;
}

async function nthListAddress(
  harness: ConformanceHarness,
  stateDir: string,
  docPath: string,
  index: number,
): Promise<Record<string, unknown>> {
  const items = await listDiscoveryItems(harness, stateDir, docPath, Math.max(index + 1, 2));
  const address = items[index]?.address;
  if (!address || typeof address !== 'object') {
    throw new Error(`Missing list address at index ${index} for ${docPath}.`);
  }
  return address;
}

type ListTargetPreparation = {
  docPath: string;
  target: Record<string, unknown>;
};

/**
 * Load a pre-separated list fixture (two adjacent lists that share the same
 * abstractNumId) and resolve the second list item as the target.
 *
 * This avoids a runtime `lists separate` → DOCX export → re-import round-trip
 * which can lose numbering definition compatibility on some platforms.
 */
async function prepareSeparatedSecondListTarget(
  harness: ConformanceHarness,
  stateDir: string,
  label: string,
): Promise<ListTargetPreparation> {
  const docPath = await harness.copyPreSeparatedListDoc(label);
  const items = await listDiscoveryItems(harness, stateDir, docPath, 10);

  if (items.length < 2) {
    throw new Error(
      `[${label}] Pre-separated fixture has fewer than 2 list items (found ${items.length}). ` +
        `Items: ${JSON.stringify(items)}`,
    );
  }

  const target = items[1]?.address;
  if (!target || typeof target !== 'object') {
    throw new Error(`[${label}] Second list item has no address. Items: ${JSON.stringify(items)}`);
  }

  return { docPath, target };
}

function sectionMutationScenario(
  operationId: CliOperationId,
  label: string,
  extraArgs: string[],
): (harness: ConformanceHarness) => Promise<ScenarioInvocation> {
  return async (harness) => {
    const stateDir = await harness.createStateDir(`${label}-success`);
    const docPath = await harness.copyFixtureDoc(`${label}-source`);
    const { address } = await resolveFirstSection(harness, stateDir, docPath, label);
    return {
      stateDir,
      args: [
        ...commandTokens(operationId),
        docPath,
        '--target-json',
        JSON.stringify(address),
        ...extraArgs,
        '--out',
        harness.createOutputPath(`${label}-output`),
      ],
    };
  };
}

type InlineAliasKey = (typeof INLINE_PROPERTY_REGISTRY)[number]['key'];
type FormatInlineAliasCliOperationId = `doc.format.${InlineAliasKey}`;

function sampleInlineAliasValue(key: InlineAliasKey): unknown {
  switch (key) {
    case 'underline':
      return true;
    case 'vertAlign':
      return 'superscript';
    case 'shading':
      return { fill: 'FFFF00' };
    case 'border':
      return { val: 'single' };
    case 'fitText':
      return { val: 12 };
    case 'lang':
      return { val: 'en-US' };
    case 'rFonts':
      return { ascii: 'Calibri', hAnsi: 'Calibri' };
    case 'eastAsianLayout':
      return { vert: true };
    case 'stylisticSets':
      return [{ id: 1, val: true }];
    case 'rStyle':
      return 'DefaultParagraphFont';
    case 'color':
      return '#FF0000';
    case 'highlight':
      return 'yellow';
    case 'em':
      return 'dot';
    case 'ligatures':
      return 'standard';
    case 'numForm':
      return 'lining';
    case 'numSpacing':
      return 'proportional';
    case 'fontSize':
    case 'fontSizeCs':
      return 14;
    case 'letterSpacing':
      return 0.5;
    case 'position':
      return 1;
    case 'charScale':
      return 100;
    case 'kerning':
      return 8;
    default: {
      const entry = INLINE_PROPERTY_REGISTRY.find((candidate) => candidate.key === key);
      if (!entry) throw new Error(`Unknown inline alias key: ${key}`);
      if (entry.type === 'boolean') return true;
      if (entry.type === 'number') return 1;
      if (entry.type === 'string') return 'on';
      if (entry.type === 'array') return [{ id: 1, val: true }];
      return { val: 'on' };
    }
  }
}

function formatInlineAliasSuccessScenario(
  operationId: FormatInlineAliasCliOperationId,
): (harness: ConformanceHarness) => Promise<ScenarioInvocation> {
  return async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const key = operationId.slice('doc.format.'.length) as InlineAliasKey;
    const stateDir = await harness.createStateDir(`${operationId.replace(/\./g, '-')}-success`);
    const docPath = await harness.copyFixtureDoc(`${operationId.replace(/\./g, '-')}`);
    const target = await harness.firstTextRange(docPath, stateDir);
    return {
      stateDir,
      args: [
        ...commandTokens(operationId),
        docPath,
        '--target-json',
        JSON.stringify(target),
        '--value-json',
        JSON.stringify(sampleInlineAliasValue(key)),
        '--out',
        harness.createOutputPath(`${operationId.replace(/\./g, '-')}-output`),
      ],
    };
  };
}

const FORMAT_INLINE_ALIAS_SUCCESS_SCENARIOS: Record<
  FormatInlineAliasCliOperationId,
  (harness: ConformanceHarness) => Promise<ScenarioInvocation>
> = Object.fromEntries(
  INLINE_PROPERTY_REGISTRY.map((entry) => {
    const operationId = `doc.format.${entry.key}` as FormatInlineAliasCliOperationId;
    return [operationId, formatInlineAliasSuccessScenario(operationId)];
  }),
) as Record<FormatInlineAliasCliOperationId, (harness: ConformanceHarness) => Promise<ScenarioInvocation>>;

function paragraphMutationScenario(
  operationId: CliOperationId,
  label: string,
  extraArgs: string[],
  prepare: Array<{ operationId: CliOperationId; extraArgs: string[] }> = [],
): (harness: ConformanceHarness) => Promise<ScenarioInvocation> {
  return async (harness) => {
    const stateDir = await harness.createStateDir(`${label}-success`);
    let docPath = await harness.copyFixtureDoc(`${label}-source`);
    let block = await harness.firstBlockMatch(docPath, stateDir);

    for (let index = 0; index < prepare.length; index += 1) {
      const step = prepare[index];
      const preparedOut = harness.createOutputPath(`${label}-prepare-${index + 1}`);
      const prepared = await harness.runCli(
        [
          ...commandTokens(step.operationId),
          docPath,
          '--target-json',
          JSON.stringify({ kind: 'block', nodeType: 'paragraph', nodeId: block.nodeId }),
          ...step.extraArgs,
          '--out',
          preparedOut,
        ],
        stateDir,
      );

      if (prepared.result.code !== 0 || prepared.envelope.ok !== true) {
        throw new Error(`Failed to prepare paragraph scenario ${label} with ${step.operationId}.`);
      }

      docPath = preparedOut;
      block = await harness.firstBlockMatch(docPath, stateDir);
    }

    return {
      stateDir,
      args: [
        ...commandTokens(operationId),
        docPath,
        '--target-json',
        JSON.stringify({ kind: 'block', nodeType: 'paragraph', nodeId: block.nodeId }),
        ...extraArgs,
        '--out',
        harness.createOutputPath(`${label}-output`),
      ],
    };
  };
}
// ---------------------------------------------------------------------------
// Table scenario helpers (DRY builders for the 40 table operations)
// ---------------------------------------------------------------------------

/** Creates a table in a session and runs a table mutation operation on it. */
function tableMutationScenario(
  op: string,
  extraArgs: string[],
): (harness: ConformanceHarness) => Promise<ScenarioInvocation> {
  return async (harness) => {
    const label = `table-${op.replace(/\./g, '-')}`;
    const stateDir = await harness.createStateDir(`${label}-success`);
    const { tableNodeId, sessionId } = await harness.createTableFixture(stateDir, label);
    return {
      stateDir,
      args: [
        ...commandTokens(`doc.${op}` as CliOperationId),
        '--session',
        sessionId,
        '--node-id',
        tableNodeId,
        ...extraArgs,
        '--out',
        harness.createOutputPath(`${label}-out`),
      ],
    };
  };
}

/** Creates a table in a session and runs a table read operation on it. */
function tableReadScenario(
  op: string,
  extraArgs: string[] = [],
): (harness: ConformanceHarness) => Promise<ScenarioInvocation> {
  return async (harness) => {
    const label = `table-${op.replace(/\./g, '-')}`;
    const stateDir = await harness.createStateDir(`${label}-success`);
    const { tableNodeId, sessionId } = await harness.createTableFixture(stateDir, label);
    return {
      stateDir,
      args: [
        ...commandTokens(`doc.${op}` as CliOperationId),
        '--session',
        sessionId,
        '--node-id',
        tableNodeId,
        ...extraArgs,
      ],
    };
  };
}

/** Creates a table in a session and runs a cell-level mutation on it using --node-id with cellNodeId. */
function cellMutationScenario(
  op: string,
  extraArgs: string[],
): (harness: ConformanceHarness) => Promise<ScenarioInvocation> {
  return async (harness) => {
    const label = `table-${op.replace(/\./g, '-')}`;
    const stateDir = await harness.createStateDir(`${label}-success`);
    const { cellNodeId, sessionId } = await harness.createTableFixture(stateDir, label);
    return {
      stateDir,
      args: [
        ...commandTokens(`doc.${op}` as CliOperationId),
        '--session',
        sessionId,
        '--node-id',
        cellNodeId,
        ...extraArgs,
        '--out',
        harness.createOutputPath(`${label}-out`),
      ],
    };
  };
}

/** Table-scoped mutation in a session: uses --table-node-id instead of --node-id. */
function tableScopedMutationScenario(
  op: string,
  extraArgs: string[],
): (harness: ConformanceHarness) => Promise<ScenarioInvocation> {
  return async (harness) => {
    const label = `table-${op.replace(/\./g, '-')}`;
    const stateDir = await harness.createStateDir(`${label}-success`);
    const { tableNodeId, sessionId } = await harness.createTableFixture(stateDir, label);
    return {
      stateDir,
      args: [
        ...commandTokens(`doc.${op}` as CliOperationId),
        '--session',
        sessionId,
        '--table-node-id',
        tableNodeId,
        ...extraArgs,
        '--out',
        harness.createOutputPath(`${label}-out`),
      ],
    };
  };
}

function tocMutationScenario(
  op: string,
  extraArgs: string[],
): (harness: ConformanceHarness) => Promise<ScenarioInvocation> {
  return async (harness) => {
    const label = `toc-${op.replace(/\./g, '-')}`;
    const stateDir = await harness.createStateDir(`${label}-success`);
    const docPath = await harness.copyTocFixtureDoc(`${label}-source`, stateDir);
    const tocTarget = await harness.firstTocAddress(docPath, stateDir);
    return {
      stateDir,
      args: [
        ...commandTokens(`doc.${op}` as CliOperationId),
        docPath,
        '--target-json',
        JSON.stringify(tocTarget),
        ...extraArgs,
        '--out',
        harness.createOutputPath(`${label}-out`),
      ],
    };
  };
}

function tocReadWithTargetScenario(op: string): (harness: ConformanceHarness) => Promise<ScenarioInvocation> {
  return async (harness) => {
    const label = `toc-${op.replace(/\./g, '-')}`;
    const stateDir = await harness.createStateDir(`${label}-success`);
    const docPath = await harness.copyTocFixtureDoc(`${label}-source`, stateDir);
    const tocTarget = await harness.firstTocAddress(docPath, stateDir);
    return {
      stateDir,
      args: [...commandTokens(`doc.${op}` as CliOperationId), docPath, '--target-json', JSON.stringify(tocTarget)],
    };
  };
}

type TocEntryAddress = {
  kind: 'inline';
  nodeType: 'tableOfContentsEntry';
  nodeId: string;
};

function buildTocEntryInsertionTarget(paragraphNodeId: string): Record<string, unknown> {
  return {
    kind: 'inline-insert',
    anchor: {
      nodeType: 'paragraph',
      nodeId: paragraphNodeId,
    },
    position: 'end',
  };
}

async function createDocWithMarkedTocEntry(
  harness: ConformanceHarness,
  stateDir: string,
  label: string,
): Promise<{ docPath: string; entryAddress: TocEntryAddress }> {
  const sourceDoc = await harness.copyFixtureDoc(`${label}-source`);
  const textTarget = await harness.firstTextRange(sourceDoc, stateDir);
  const markedDoc = harness.createOutputPath(`${label}-marked`);

  const mark = await harness.runCli(
    [
      ...commandTokens('doc.toc.markEntry'),
      sourceDoc,
      '--target-json',
      JSON.stringify(buildTocEntryInsertionTarget(textTarget.blockId)),
      '--text',
      'Conformance TC Entry',
      '--level',
      '2',
      '--out',
      markedDoc,
    ],
    stateDir,
  );
  if (mark.result.code !== 0 || mark.envelope.ok !== true) {
    throw new Error(`Failed to seed toc entry fixture for ${label}.`);
  }

  const listed = await harness.runCli([...commandTokens('doc.toc.listEntries'), markedDoc, '--limit', '1'], stateDir);
  if (listed.result.code !== 0 || listed.envelope.ok !== true) {
    throw new Error(`Failed to list toc entries for ${label}.`);
  }

  const entryAddress = (
    listed.envelope.data as {
      result?: {
        items?: Array<{
          address?: TocEntryAddress;
        }>;
      };
    }
  ).result?.items?.[0]?.address;

  if (!entryAddress) {
    throw new Error(`No toc entry address found for ${label}.`);
  }

  return { docPath: markedDoc, entryAddress };
}

export const SUCCESS_SCENARIOS = {
  'doc.open': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-open-success');
    const docPath = await harness.copyFixtureDoc('doc-open');
    return {
      stateDir,
      args: ['open', docPath, '--session', 'open-success-session'],
    };
  },
  'doc.status': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => ({
    stateDir: await harness.createStateDir('doc-status-success'),
    args: ['status'],
  }),
  'doc.save': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-save-success');
    await harness.openSessionFixture(stateDir, 'doc-save', 'doc-save-session');
    return {
      stateDir,
      args: ['save', '--session', 'doc-save-session', '--out', harness.createOutputPath('doc-save-output')],
    };
  },
  'doc.close': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-close-success');
    await harness.openSessionFixture(stateDir, 'doc-close', 'doc-close-session');
    return {
      stateDir,
      args: ['close', '--session', 'doc-close-session', '--discard'],
    };
  },
  'doc.info': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-info-success');
    const docPath = await harness.copyFixtureDoc('doc-info');
    return { stateDir, args: ['info', docPath] };
  },
  'doc.describe': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => ({
    stateDir: await harness.createStateDir('doc-describe-success'),
    args: ['describe'],
  }),
  'doc.describeCommand': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => ({
    stateDir: await harness.createStateDir('doc-describe-command-success'),
    args: ['describe', 'command', 'doc.find'],
  }),
  'doc.find': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-find-success');
    const docPath = await harness.copyFixtureDoc('doc-find');
    return { stateDir, args: ['find', docPath, '--type', 'text', '--pattern', 'Wilde', '--limit', '1'] };
  },
  'doc.getNode': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-get-node-success');
    const docPath = await harness.copyFixtureDoc('doc-get-node');
    const { address } = await harness.firstBlockMatch(docPath, stateDir);
    return {
      stateDir,
      args: ['get-node', docPath, '--address-json', JSON.stringify(address)],
    };
  },
  'doc.getNodeById': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-get-node-by-id-success');
    const docPath = await harness.copyFixtureDoc('doc-get-node-by-id');
    const match = await harness.firstBlockMatch(docPath, stateDir);
    return {
      stateDir,
      args: ['get-node-by-id', docPath, '--id', match.nodeId, '--node-type', match.nodeType],
    };
  },
  'doc.comments.create': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-comments-create-success');
    const docPath = await harness.copyFixtureDoc('doc-comments-add');
    const target = await harness.firstTextRange(docPath, stateDir);
    return {
      stateDir,
      args: [
        'comments',
        'create',
        docPath,
        '--target-json',
        JSON.stringify(target),
        '--text',
        'Conformance create comment',
        '--out',
        harness.createOutputPath('doc-comments-create-output'),
      ],
    };
  },
  'doc.comments.patch': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-comments-patch-success');
    const fixture = await harness.addCommentFixture(stateDir, 'doc-comments-patch');
    return {
      stateDir,
      args: [
        'comments',
        'patch',
        fixture.docPath,
        '--id',
        fixture.commentId,
        '--text',
        'Conformance patched comment',
        '--out',
        harness.createOutputPath('doc-comments-patch-output'),
      ],
    };
  },
  'doc.comments.delete': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-comments-delete-success');
    const fixture = await harness.addCommentFixture(stateDir, 'doc-comments-delete');
    return {
      stateDir,
      args: [
        'comments',
        'delete',
        fixture.docPath,
        '--id',
        fixture.commentId,
        '--out',
        harness.createOutputPath('doc-comments-delete-output'),
      ],
    };
  },
  'doc.comments.get': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-comments-get-success');
    const fixture = await harness.addCommentFixture(stateDir, 'doc-comments-get');
    return {
      stateDir,
      args: ['comments', 'get', fixture.docPath, '--id', fixture.commentId],
    };
  },
  'doc.comments.list': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-comments-list-success');
    const fixture = await harness.addCommentFixture(stateDir, 'doc-comments-list');
    return {
      stateDir,
      args: ['comments', 'list', fixture.docPath, '--include-resolved', 'false'],
    };
  },
  'doc.getText': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-get-text-success');
    const docPath = await harness.copyFixtureDoc('doc-get-text');
    return { stateDir, args: ['get-text', docPath] };
  },
  'doc.getMarkdown': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-get-markdown-success');
    const docPath = await harness.copyFixtureDoc('doc-get-text');
    return { stateDir, args: ['get-markdown', docPath] };
  },
  'doc.getHtml': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-get-html-success');
    const docPath = await harness.copyFixtureDoc('doc-get-text');
    return { stateDir, args: ['get-html', docPath] };
  },
  'doc.query.match': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-query-match-success');
    const docPath = await harness.copyFixtureDoc('doc-query-match');
    return {
      stateDir,
      args: [
        'query',
        'match',
        docPath,
        '--select-json',
        JSON.stringify({ type: 'node', nodeType: 'paragraph' }),
        '--require',
        'any',
        '--limit',
        '1',
      ],
    };
  },
  'doc.mutations.preview': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-mutations-preview-success');
    const docPath = await harness.copyFixtureDoc('doc-mutations-preview');
    const steps = [
      {
        id: 'preview-insert',
        op: 'text.insert',
        where: {
          by: 'select',
          select: { type: 'node', nodeType: 'paragraph' },
          require: 'first',
        },
        args: {
          position: 'before',
          content: { text: 'PREVIEW_MUTATION_TOKEN' },
        },
      },
    ];
    return {
      stateDir,
      args: [
        'mutations',
        'preview',
        docPath,
        '--expected-revision',
        '0',
        '--atomic-json',
        'true',
        '--change-mode',
        'direct',
        '--steps-json',
        JSON.stringify(steps),
      ],
    };
  },
  'doc.mutations.apply': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-mutations-apply-success');
    const docPath = await harness.copyFixtureDoc('doc-mutations-apply');
    const steps = [
      {
        id: 'apply-insert',
        op: 'text.insert',
        where: {
          by: 'select',
          select: { type: 'node', nodeType: 'paragraph' },
          require: 'first',
        },
        args: {
          position: 'before',
          content: { text: 'APPLY_MUTATION_TOKEN' },
        },
      },
    ];
    return {
      stateDir,
      args: [
        'mutations',
        'apply',
        docPath,
        '--atomic-json',
        'true',
        '--change-mode',
        'direct',
        '--steps-json',
        JSON.stringify(steps),
        '--out',
        harness.createOutputPath('doc-mutations-apply-output'),
      ],
    };
  },
  'doc.capabilities.get': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-capabilities-get-success');
    await harness.openSessionFixture(stateDir, 'doc-capabilities-get', 'capabilities-session');
    return { stateDir, args: ['capabilities', '--session', 'capabilities-session'] };
  },
  'doc.create.heading': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-create-heading-success');
    const docPath = await harness.copyFixtureDoc('doc-create-heading');
    return {
      stateDir,
      args: [
        'create',
        'heading',
        docPath,
        '--input-json',
        JSON.stringify({ level: 1, text: 'Conformance heading text' }),
        '--out',
        harness.createOutputPath('doc-create-heading-output'),
      ],
    };
  },
  'doc.create.tableOfContents': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-create-toc-success');
    const docPath = await harness.copyFixtureDoc('doc-create-toc');
    return {
      stateDir,
      args: [
        ...commandTokens('doc.create.tableOfContents'),
        docPath,
        '--at-json',
        JSON.stringify({ kind: 'documentStart' }),
        '--config-json',
        JSON.stringify({ hyperlinks: true, outlineLevels: { from: 1, to: 3 } }),
        '--out',
        harness.createOutputPath('doc-create-toc-output'),
      ],
    };
  },
  'doc.create.paragraph': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-create-paragraph-success');
    const docPath = await harness.copyFixtureDoc('doc-create-paragraph');
    return {
      stateDir,
      args: [
        'create',
        'paragraph',
        docPath,
        '--input-json',
        JSON.stringify({ text: 'Conformance paragraph text' }),
        '--out',
        harness.createOutputPath('doc-create-paragraph-output'),
      ],
    };
  },
  'doc.create.sectionBreak': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-create-section-break-success');
    const docPath = await harness.copyFixtureDoc('doc-create-section-break');
    return {
      stateDir,
      args: [
        ...commandTokens('doc.create.sectionBreak'),
        docPath,
        '--break-type',
        'nextPage',
        '--out',
        harness.createOutputPath('doc-create-section-break-output'),
      ],
    };
  },
  'doc.sections.list': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-sections-list-success');
    const docPath = await harness.copyFixtureDoc('doc-sections-list');
    return {
      stateDir,
      args: [...commandTokens('doc.sections.list'), docPath, '--limit', '10'],
    };
  },
  'doc.sections.get': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-sections-get-success');
    const docPath = await harness.copyFixtureDoc('doc-sections-get');
    const { address } = await resolveFirstSection(harness, stateDir, docPath, 'doc.sections.get');
    return {
      stateDir,
      args: [...commandTokens('doc.sections.get'), docPath, '--address-json', JSON.stringify(address)],
    };
  },
  'doc.sections.setBreakType': sectionMutationScenario('doc.sections.setBreakType', 'doc-sections-set-break-type', [
    '--break-type',
    'continuous',
  ]),
  'doc.sections.setPageMargins': sectionMutationScenario(
    'doc.sections.setPageMargins',
    'doc-sections-set-page-margins',
    ['--top', '1.1', '--right', '1.2', '--bottom', '1.3', '--left', '1.4'],
  ),
  'doc.sections.setHeaderFooterMargins': sectionMutationScenario(
    'doc.sections.setHeaderFooterMargins',
    'doc-sections-set-header-footer-margins',
    ['--header', '0.6', '--footer', '0.8'],
  ),
  'doc.sections.setPageSetup': sectionMutationScenario('doc.sections.setPageSetup', 'doc-sections-set-page-setup', [
    '--orientation',
    'landscape',
  ]),
  'doc.sections.setColumns': sectionMutationScenario('doc.sections.setColumns', 'doc-sections-set-columns', [
    '--count',
    '2',
    '--gap',
    '0.8',
    '--equal-width',
    'true',
  ]),
  'doc.sections.setLineNumbering': sectionMutationScenario(
    'doc.sections.setLineNumbering',
    'doc-sections-set-line-numbering',
    ['--enabled', 'true', '--count-by', '2', '--start', '1', '--distance', '0.25', '--restart', 'newSection'],
  ),
  'doc.sections.setPageNumbering': sectionMutationScenario(
    'doc.sections.setPageNumbering',
    'doc-sections-set-page-numbering',
    ['--start', '5', '--format', 'decimal'],
  ),
  'doc.sections.setTitlePage': sectionMutationScenario('doc.sections.setTitlePage', 'doc-sections-set-title-page', [
    '--enabled',
    'true',
  ]),
  'doc.sections.setOddEvenHeadersFooters': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-sections-set-odd-even-success');
    const docPath = await harness.copyFixtureDoc('doc-sections-set-odd-even');
    return {
      stateDir,
      args: [
        ...commandTokens('doc.sections.setOddEvenHeadersFooters'),
        docPath,
        '--enabled',
        'true',
        '--out',
        harness.createOutputPath('doc-sections-set-odd-even-output'),
      ],
    };
  },
  'doc.sections.setVerticalAlign': sectionMutationScenario(
    'doc.sections.setVerticalAlign',
    'doc-sections-set-vertical-align',
    ['--value', 'center'],
  ),
  'doc.sections.setSectionDirection': sectionMutationScenario(
    'doc.sections.setSectionDirection',
    'doc-sections-set-direction',
    ['--direction', 'rtl'],
  ),
  'doc.sections.setHeaderFooterRef': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-sections-set-header-footer-ref-success');
    const docPath = await harness.copyFixtureDoc('doc-sections-set-header-footer-ref');
    const { item, address } = await resolveFirstSection(harness, stateDir, docPath, 'doc.sections.setHeaderFooterRef');
    const footerRefs = item.footerRefs as Record<string, unknown> | undefined;
    const refId =
      (typeof footerRefs?.default === 'string' ? footerRefs.default : undefined) ??
      (typeof footerRefs?.even === 'string' ? footerRefs.even : undefined);
    if (!refId) {
      throw new Error('No footer relationship id available for doc.sections.setHeaderFooterRef.');
    }
    return {
      stateDir,
      args: [
        ...commandTokens('doc.sections.setHeaderFooterRef'),
        docPath,
        '--target-json',
        JSON.stringify(address),
        '--kind',
        'footer',
        '--variant',
        'first',
        '--ref-id',
        refId,
        '--out',
        harness.createOutputPath('doc-sections-set-header-footer-ref-output'),
      ],
    };
  },
  'doc.sections.clearHeaderFooterRef': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-sections-clear-header-footer-ref-success');
    const sourceDoc = await harness.copyFixtureDoc('doc-sections-clear-header-footer-ref');
    const { item, address } = await resolveFirstSection(
      harness,
      stateDir,
      sourceDoc,
      'doc.sections.clearHeaderFooterRef:prepare',
    );
    const footerRefs = item.footerRefs as Record<string, unknown> | undefined;
    const refId =
      (typeof footerRefs?.default === 'string' ? footerRefs.default : undefined) ??
      (typeof footerRefs?.even === 'string' ? footerRefs.even : undefined);
    if (!refId) {
      throw new Error('No footer relationship id available for doc.sections.clearHeaderFooterRef.');
    }

    const preparedDoc = harness.createOutputPath('doc-sections-clear-header-footer-ref-prepared');
    const prepared = await harness.runCli(
      [
        ...commandTokens('doc.sections.setHeaderFooterRef'),
        sourceDoc,
        '--target-json',
        JSON.stringify(address),
        '--kind',
        'footer',
        '--variant',
        'first',
        '--ref-id',
        refId,
        '--out',
        preparedDoc,
      ],
      stateDir,
    );
    if (prepared.result.code !== 0 || prepared.envelope.ok !== true) {
      throw new Error('Failed to prepare explicit header/footer ref for clear scenario.');
    }

    return {
      stateDir,
      args: [
        ...commandTokens('doc.sections.clearHeaderFooterRef'),
        preparedDoc,
        '--target-json',
        JSON.stringify(address),
        '--kind',
        'footer',
        '--variant',
        'first',
        '--out',
        harness.createOutputPath('doc-sections-clear-header-footer-ref-output'),
      ],
    };
  },
  'doc.sections.setLinkToPrevious': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-sections-set-link-to-previous-success');
    const fixture = await createDocWithSecondSection(harness, stateDir, 'doc-sections-set-link-to-previous');
    const secondAddress = requireSectionAddress(fixture.second, 'doc.sections.setLinkToPrevious');
    return {
      stateDir,
      args: [
        ...commandTokens('doc.sections.setLinkToPrevious'),
        fixture.docPath,
        '--target-json',
        JSON.stringify(secondAddress),
        '--kind',
        'header',
        '--variant',
        'default',
        '--linked',
        'false',
        '--out',
        harness.createOutputPath('doc-sections-set-link-to-previous-output'),
      ],
    };
  },
  'doc.sections.setPageBorders': sectionMutationScenario(
    'doc.sections.setPageBorders',
    'doc-sections-set-page-borders',
    ['--borders-json', JSON.stringify({ top: { style: 'single', size: 8, color: '000000' } })],
  ),
  'doc.sections.clearPageBorders': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-sections-clear-page-borders-success');
    const sourceDoc = await harness.copyFixtureDoc('doc-sections-clear-page-borders');
    const { address } = await resolveFirstSection(harness, stateDir, sourceDoc, 'doc.sections.clearPageBorders');

    const withBordersDoc = harness.createOutputPath('doc-sections-clear-page-borders-prepared');
    const prepared = await harness.runCli(
      [
        ...commandTokens('doc.sections.setPageBorders'),
        sourceDoc,
        '--target-json',
        JSON.stringify(address),
        '--borders-json',
        JSON.stringify({ top: { style: 'single', size: 8, color: '000000' } }),
        '--out',
        withBordersDoc,
      ],
      stateDir,
    );
    if (prepared.result.code !== 0 || prepared.envelope.ok !== true) {
      throw new Error('Failed to prepare page borders for clear-page-borders scenario.');
    }

    return {
      stateDir,
      args: [
        ...commandTokens('doc.sections.clearPageBorders'),
        withBordersDoc,
        '--target-json',
        JSON.stringify(address),
        '--out',
        harness.createOutputPath('doc-sections-clear-page-borders-output'),
      ],
    };
  },
  'doc.blocks.delete': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-blocks-delete-success');
    const docPath = await harness.copyFixtureDoc('doc-blocks-delete');
    const block = await harness.firstBlockMatch(docPath, stateDir);
    return {
      stateDir,
      args: [
        'blocks',
        'delete',
        docPath,
        '--target-json',
        JSON.stringify({ kind: 'block', nodeType: block.nodeType, nodeId: block.nodeId }),
        '--out',
        harness.createOutputPath('doc-blocks-delete-output'),
      ],
    };
  },
  'doc.lists.list': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-lists-list-success');
    const docPath = await harness.copyListFixtureDoc('doc-lists-list');
    return {
      stateDir,
      args: ['lists', 'list', docPath, '--limit', '10'],
    };
  },
  'doc.lists.get': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-lists-get-success');
    const docPath = await harness.copyListFixtureDoc('doc-lists-get');
    const address = await harness.firstListItemAddress(docPath, stateDir);
    return {
      stateDir,
      args: ['lists', 'get', docPath, '--address-json', JSON.stringify(address)],
    };
  },
  'doc.lists.insert': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-lists-insert-success');
    const docPath = await harness.copyListFixtureDoc('doc-lists-insert');
    const target = await harness.firstListItemAddress(docPath, stateDir);
    return {
      stateDir,
      args: [
        'lists',
        'insert',
        docPath,
        '--target-json',
        JSON.stringify(target),
        '--position',
        'after',
        '--text',
        'CONFORMANCE_LIST_INSERT',
        '--out',
        harness.createOutputPath('doc-lists-insert-output'),
      ],
    };
  },
  'doc.lists.create': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-lists-create-success');
    const docPath = await harness.copyFixtureDoc('doc-lists-create');
    const at = await harness.firstBlockMatch(docPath, stateDir);
    return {
      stateDir,
      args: [
        'lists',
        'create',
        docPath,
        '--input-json',
        JSON.stringify({
          mode: 'empty',
          at: { kind: 'block', nodeType: at.nodeType, nodeId: at.nodeId },
          kind: 'ordered',
        }),
        '--out',
        harness.createOutputPath('doc-lists-create-output'),
      ],
    };
  },
  'doc.lists.detach': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-lists-detach-success');
    const docPath = await harness.copyListFixtureDoc('doc-lists-detach');
    const target = await harness.firstListItemAddress(docPath, stateDir);
    return {
      stateDir,
      args: [
        'lists',
        'detach',
        docPath,
        '--target-json',
        JSON.stringify(target),
        '--out',
        harness.createOutputPath('doc-lists-detach-output'),
      ],
    };
  },
  'doc.lists.setLevel': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-lists-set-level-success');
    const docPath = await harness.copyListFixtureDoc('doc-lists-set-level');
    const target = await harness.firstListItemAddress(docPath, stateDir);
    return {
      stateDir,
      args: [
        'lists',
        'set-level',
        docPath,
        '--input-json',
        JSON.stringify({ target, level: 1 }),
        '--out',
        harness.createOutputPath('doc-lists-set-level-output'),
      ],
    };
  },
  'doc.lists.convertToText': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-lists-convert-to-text-success');
    const docPath = await harness.copyListFixtureDoc('doc-lists-convert-to-text');
    const target = await harness.firstListItemAddress(docPath, stateDir);
    return {
      stateDir,
      args: [
        'lists',
        'convert-to-text',
        docPath,
        '--target-json',
        JSON.stringify(target),
        '--out',
        harness.createOutputPath('doc-lists-convert-to-text-output'),
      ],
    };
  },
  'doc.lists.indent': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-lists-indent-success');
    const docPath = await harness.copyListFixtureDoc('doc-lists-indent');
    const target = await harness.firstListItemAddress(docPath, stateDir);
    return {
      stateDir,
      args: [
        'lists',
        'indent',
        docPath,
        '--target-json',
        JSON.stringify(target),
        '--out',
        harness.createOutputPath('doc-lists-indent-output'),
      ],
    };
  },
  'doc.lists.outdent': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-lists-outdent-success');
    const docPath = await harness.copyListFixtureDoc('doc-lists-outdent');
    const target = await harness.firstListItemAddress(docPath, stateDir);
    const prepOut = harness.createOutputPath('doc-lists-outdent-prepared');
    const prep = await harness.runCli(
      ['lists', 'indent', docPath, '--target-json', JSON.stringify(target), '--out', prepOut],
      stateDir,
    );
    if (prep.result.code !== 0) {
      throw new Error('Failed to prepare outdent conformance fixture via lists indent.');
    }

    return {
      stateDir,
      args: [
        'lists',
        'outdent',
        prepOut,
        '--target-json',
        JSON.stringify(target),
        '--out',
        harness.createOutputPath('doc-lists-outdent-output'),
      ],
    };
  },
  'doc.lists.setValue': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-lists-set-value-success');
    const docPath = await harness.copyListFixtureDoc('doc-lists-set-value');
    const target = await harness.firstListItemAddress(docPath, stateDir);
    return {
      stateDir,
      args: [
        'lists',
        'set-value',
        docPath,
        '--input-json',
        JSON.stringify({ target, value: 5 }),
        '--out',
        harness.createOutputPath('doc-lists-set-value-output'),
      ],
    };
  },
  'doc.lists.continuePrevious': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-lists-continue-previous-success');
    const prepared = await prepareSeparatedSecondListTarget(harness, stateDir, 'doc-lists-continue-previous');

    return {
      stateDir,
      args: [
        'lists',
        'continue-previous',
        prepared.docPath,
        '--target-json',
        JSON.stringify(prepared.target),
        '--out',
        harness.createOutputPath('doc-lists-continue-previous-output'),
      ],
    };
  },
  'doc.lists.canJoin': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-lists-can-join-success');
    const docPath = await harness.copyListFixtureDoc('doc-lists-can-join');
    const target = await harness.firstListItemAddress(docPath, stateDir);
    return {
      stateDir,
      args: ['lists', 'can-join', docPath, '--input-json', JSON.stringify({ target, direction: 'withNext' })],
    };
  },
  'doc.lists.canContinuePrevious': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-lists-can-continue-previous-success');
    const docPath = await harness.copyListFixtureDoc('doc-lists-can-continue-previous');
    const target = await harness.firstListItemAddress(docPath, stateDir);
    return {
      stateDir,
      args: ['lists', 'can-continue-previous', docPath, '--target-json', JSON.stringify(target)],
    };
  },
  'doc.lists.attach': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-lists-attach-success');
    const docPath = await harness.copyFixtureDoc('doc-lists-attach');
    const listSeedTarget = await harness.firstBlockMatch(docPath, stateDir);
    const seededDoc = harness.createOutputPath('doc-lists-attach-seeded');
    const create = await harness.runCli(
      [
        'lists',
        'create',
        docPath,
        '--input-json',
        JSON.stringify({
          mode: 'empty',
          at: { kind: 'block', nodeType: listSeedTarget.nodeType, nodeId: listSeedTarget.nodeId },
          kind: 'ordered',
        }),
        '--out',
        seededDoc,
      ],
      stateDir,
    );
    if (create.result.code !== 0) {
      throw new Error('Failed to prepare attach conformance fixture via lists create.');
    }

    const attachTo = await harness.firstListItemAddress(seededDoc, stateDir);
    const target = await harness.firstBlockMatch(seededDoc, stateDir);

    return {
      stateDir,
      args: [
        'lists',
        'attach',
        seededDoc,
        '--input-json',
        JSON.stringify({
          target: { kind: 'block', nodeType: target.nodeType, nodeId: target.nodeId },
          attachTo,
        }),
        '--out',
        harness.createOutputPath('doc-lists-attach-output'),
      ],
    };
  },
  'doc.lists.join': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-lists-join-success');
    const prepared = await prepareSeparatedSecondListTarget(harness, stateDir, 'doc-lists-join');

    return {
      stateDir,
      args: [
        'lists',
        'join',
        prepared.docPath,
        '--input-json',
        JSON.stringify({ target: prepared.target, direction: 'withPrevious' }),
        '--out',
        harness.createOutputPath('doc-lists-join-output'),
      ],
    };
  },
  'doc.lists.separate': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-lists-separate-success');
    const docPath = await harness.copyListFixtureDoc('doc-lists-separate');
    const target = await nthListAddress(harness, stateDir, docPath, 1);
    return {
      stateDir,
      args: [
        'lists',
        'separate',
        docPath,
        '--target-json',
        JSON.stringify(target),
        '--out',
        harness.createOutputPath('doc-lists-separate-output'),
      ],
    };
  },
  'doc.lists.setLevelRestart': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-lists-set-level-restart-success');
    const docPath = await harness.copyListFixtureDoc('doc-lists-set-level-restart');
    const target = await harness.firstListItemAddress(docPath, stateDir);
    return {
      stateDir,
      args: [
        'lists',
        'set-level-restart',
        docPath,
        '--input-json',
        JSON.stringify({ target, level: 1, restartAfterLevel: 0 }),
        '--out',
        harness.createOutputPath('doc-lists-set-level-restart-output'),
      ],
    };
  },
  'doc.insert': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-insert-success');
    const docPath = await harness.copyFixtureDoc('doc-insert');
    const target = await harness.firstTextRange(docPath, stateDir);
    const collapsed = { ...target, range: { start: target.range.start, end: target.range.start } };
    return {
      stateDir,
      args: [
        'insert',
        docPath,
        '--target-json',
        JSON.stringify(collapsed),
        '--value',
        'CONFORMANCE_INSERT',
        '--out',
        harness.createOutputPath('doc-insert-output'),
      ],
    };
  },
  'doc.replace': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-replace-success');
    const docPath = await harness.copyFixtureDoc('doc-replace');
    const target = await harness.firstTextRange(docPath, stateDir);
    return {
      stateDir,
      args: [
        'replace',
        docPath,
        '--target-json',
        JSON.stringify(target),
        '--text',
        'CONFORMANCE_REPLACE',
        '--out',
        harness.createOutputPath('doc-replace-output'),
      ],
    };
  },
  'doc.delete': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-delete-success');
    const docPath = await harness.copyFixtureDoc('doc-delete');
    const target = await harness.firstTextRange(docPath, stateDir);
    return {
      stateDir,
      args: [
        'delete',
        docPath,
        '--target-json',
        JSON.stringify(target),
        '--out',
        harness.createOutputPath('doc-delete-output'),
      ],
    };
  },
  'doc.format.apply': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-style-apply-success');
    const docPath = await harness.copyFixtureDoc('doc-style-apply');
    const target = await harness.firstTextRange(docPath, stateDir);
    return {
      stateDir,
      args: [
        'format',
        'apply',
        docPath,
        '--target-json',
        JSON.stringify(target),
        '--inline-json',
        JSON.stringify({ bold: true }),
        '--out',
        harness.createOutputPath('doc-style-apply-output'),
      ],
    };
  },
  ...FORMAT_INLINE_ALIAS_SUCCESS_SCENARIOS,
  'doc.styles.paragraph.setStyle': paragraphMutationScenario('doc.styles.paragraph.setStyle', 'styles-paragraph-set', [
    '--style-id',
    'Normal',
  ]),
  'doc.styles.paragraph.clearStyle': paragraphMutationScenario(
    'doc.styles.paragraph.clearStyle',
    'styles-paragraph-clear',
    [],
    [{ operationId: 'doc.styles.paragraph.setStyle', extraArgs: ['--style-id', '__ConformanceTmpStyle__'] }],
  ),
  'doc.format.paragraph.resetDirectFormatting': paragraphMutationScenario(
    'doc.format.paragraph.resetDirectFormatting',
    'format-paragraph-reset',
    [],
  ),
  'doc.format.paragraph.setAlignment': paragraphMutationScenario(
    'doc.format.paragraph.setAlignment',
    'format-paragraph-set-alignment',
    ['--alignment', 'center'],
    [{ operationId: 'doc.format.paragraph.setAlignment', extraArgs: ['--alignment', 'left'] }],
  ),
  'doc.format.paragraph.clearAlignment': paragraphMutationScenario(
    'doc.format.paragraph.clearAlignment',
    'format-paragraph-clear-alignment',
    [],
  ),
  'doc.format.paragraph.setIndentation': paragraphMutationScenario(
    'doc.format.paragraph.setIndentation',
    'format-paragraph-set-indentation',
    ['--left', '720'],
  ),
  'doc.format.paragraph.clearIndentation': paragraphMutationScenario(
    'doc.format.paragraph.clearIndentation',
    'format-paragraph-clear-indentation',
    [],
    [{ operationId: 'doc.format.paragraph.setIndentation', extraArgs: ['--left', '720'] }],
  ),
  'doc.format.paragraph.setSpacing': paragraphMutationScenario(
    'doc.format.paragraph.setSpacing',
    'format-paragraph-set-spacing',
    ['--before', '120', '--after', '120'],
  ),
  'doc.format.paragraph.clearSpacing': paragraphMutationScenario(
    'doc.format.paragraph.clearSpacing',
    'format-paragraph-clear-spacing',
    [],
    [{ operationId: 'doc.format.paragraph.setSpacing', extraArgs: ['--before', '120', '--after', '120'] }],
  ),
  'doc.format.paragraph.setKeepOptions': paragraphMutationScenario(
    'doc.format.paragraph.setKeepOptions',
    'format-paragraph-set-keep-options',
    ['--keep-next', 'true'],
  ),
  'doc.format.paragraph.setOutlineLevel': paragraphMutationScenario(
    'doc.format.paragraph.setOutlineLevel',
    'format-paragraph-set-outline',
    ['--outline-level-json', '1'],
  ),
  'doc.format.paragraph.setFlowOptions': paragraphMutationScenario(
    'doc.format.paragraph.setFlowOptions',
    'format-paragraph-set-flow',
    ['--contextual-spacing', 'true'],
  ),
  'doc.format.paragraph.setTabStop': paragraphMutationScenario(
    'doc.format.paragraph.setTabStop',
    'format-paragraph-set-tab-stop',
    ['--position', '720', '--alignment', 'left'],
  ),
  'doc.format.paragraph.clearTabStop': paragraphMutationScenario(
    'doc.format.paragraph.clearTabStop',
    'format-paragraph-clear-tab-stop',
    ['--position', '720'],
    [{ operationId: 'doc.format.paragraph.setTabStop', extraArgs: ['--position', '720', '--alignment', 'left'] }],
  ),
  'doc.format.paragraph.clearAllTabStops': paragraphMutationScenario(
    'doc.format.paragraph.clearAllTabStops',
    'format-paragraph-clear-all-tab-stops',
    [],
    [{ operationId: 'doc.format.paragraph.setTabStop', extraArgs: ['--position', '720', '--alignment', 'left'] }],
  ),
  'doc.format.paragraph.setBorder': paragraphMutationScenario(
    'doc.format.paragraph.setBorder',
    'format-paragraph-set-border',
    ['--side', 'top', '--style', 'single', '--color', '000000'],
  ),
  'doc.format.paragraph.clearBorder': paragraphMutationScenario(
    'doc.format.paragraph.clearBorder',
    'format-paragraph-clear-border',
    ['--side', 'top'],
    [
      {
        operationId: 'doc.format.paragraph.setBorder',
        extraArgs: ['--side', 'top', '--style', 'single', '--color', '000000'],
      },
    ],
  ),
  'doc.format.paragraph.setShading': paragraphMutationScenario(
    'doc.format.paragraph.setShading',
    'format-paragraph-set-shading',
    ['--fill', 'FFFF00'],
  ),
  'doc.format.paragraph.clearShading': paragraphMutationScenario(
    'doc.format.paragraph.clearShading',
    'format-paragraph-clear-shading',
    [],
    [{ operationId: 'doc.format.paragraph.setShading', extraArgs: ['--fill', 'FFFF00'] }],
  ),
  'doc.styles.apply': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-styles-apply-success');
    const docPath = await harness.copyFixtureDoc('doc-styles-apply');
    return {
      stateDir,
      args: [
        'styles',
        'apply',
        docPath,
        '--target-json',
        JSON.stringify({ scope: 'docDefaults', channel: 'run' }),
        '--patch-json',
        JSON.stringify({ bold: true }),
        '--out',
        harness.createOutputPath('doc-styles-apply-output'),
      ],
    };
  },
  'doc.trackChanges.list': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-track-changes-list-success');
    const fixture = await harness.addTrackedChangeFixture(stateDir, 'doc-track-changes-list');
    return {
      stateDir,
      args: ['track-changes', 'list', fixture.docPath, '--limit', '10'],
    };
  },
  'doc.trackChanges.get': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-track-changes-get-success');
    const fixture = await harness.addTrackedChangeFixture(stateDir, 'doc-track-changes-get');
    return {
      stateDir,
      args: ['track-changes', 'get', fixture.docPath, '--id', fixture.changeId],
    };
  },
  'doc.trackChanges.decide': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-trackChanges-decide-success');
    const fixture = await harness.addTrackedChangeFixture(stateDir, 'doc-trackChanges-decide');
    return {
      stateDir,
      args: [
        'track-changes',
        'decide',
        fixture.docPath,
        '--decision',
        'accept',
        '--target-json',
        JSON.stringify({ id: fixture.changeId }),
        '--out',
        harness.createOutputPath('doc-trackChanges-decide-output'),
      ],
    };
  },
  'doc.toc.list': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-toc-list-success');
    const docPath = await harness.copyTocFixtureDoc('doc-toc-list', stateDir);
    return {
      stateDir,
      args: [...commandTokens('doc.toc.list'), docPath, '--limit', '1'],
    };
  },
  'doc.toc.get': tocReadWithTargetScenario('toc.get'),
  'doc.toc.configure': tocMutationScenario('toc.configure', ['--patch-json', JSON.stringify({ hyperlinks: false })]),
  'doc.toc.update': tocMutationScenario('toc.update', []),
  'doc.toc.remove': tocMutationScenario('toc.remove', []),
  'doc.toc.markEntry': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-toc-mark-entry-success');
    const docPath = await harness.copyFixtureDoc('doc-toc-mark-entry');
    const textTarget = await harness.firstTextRange(docPath, stateDir);
    return {
      stateDir,
      args: [
        ...commandTokens('doc.toc.markEntry'),
        docPath,
        '--target-json',
        JSON.stringify(buildTocEntryInsertionTarget(textTarget.blockId)),
        '--text',
        'Conformance mark-entry',
        '--level',
        '2',
        '--table-identifier',
        'A',
        '--out',
        harness.createOutputPath('doc-toc-mark-entry-output'),
      ],
    };
  },
  'doc.toc.unmarkEntry': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-toc-unmark-entry-success');
    const fixture = await createDocWithMarkedTocEntry(harness, stateDir, 'doc-toc-unmark-entry');
    return {
      stateDir,
      args: [
        ...commandTokens('doc.toc.unmarkEntry'),
        fixture.docPath,
        '--target-json',
        JSON.stringify(fixture.entryAddress),
        '--out',
        harness.createOutputPath('doc-toc-unmark-entry-output'),
      ],
    };
  },
  'doc.toc.listEntries': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-toc-list-entries-success');
    const docPath = await harness.copyFixtureDoc('doc-toc-list-entries');
    return {
      stateDir,
      args: [...commandTokens('doc.toc.listEntries'), docPath, '--limit', '10'],
    };
  },
  'doc.toc.getEntry': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-toc-get-entry-success');
    const fixture = await createDocWithMarkedTocEntry(harness, stateDir, 'doc-toc-get-entry');
    return {
      stateDir,
      args: [
        ...commandTokens('doc.toc.getEntry'),
        fixture.docPath,
        '--target-json',
        JSON.stringify(fixture.entryAddress),
      ],
    };
  },
  'doc.toc.editEntry': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-toc-edit-entry-success');
    const fixture = await createDocWithMarkedTocEntry(harness, stateDir, 'doc-toc-edit-entry');
    return {
      stateDir,
      args: [
        ...commandTokens('doc.toc.editEntry'),
        fixture.docPath,
        '--target-json',
        JSON.stringify(fixture.entryAddress),
        '--patch-json',
        JSON.stringify({ text: 'Edited Conformance TC Entry', level: 3 }),
        '--out',
        harness.createOutputPath('doc-toc-edit-entry-output'),
      ],
    };
  },
  'doc.session.list': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-session-list-success');
    await harness.openSessionFixture(stateDir, 'doc-session-list', 'session-list-success');
    return {
      stateDir,
      args: ['session', 'list'],
    };
  },
  'doc.session.save': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-session-save-success');
    await harness.openSessionFixture(stateDir, 'doc-session-save', 'session-save-success');
    return {
      stateDir,
      args: [
        'session',
        'save',
        '--session',
        'session-save-success',
        '--out',
        harness.createOutputPath('doc-session-save-output'),
      ],
    };
  },
  'doc.session.close': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-session-close-success');
    await harness.openSessionFixture(stateDir, 'doc-session-close', 'session-close-success');
    return {
      stateDir,
      args: ['session', 'close', '--session', 'session-close-success', '--discard'],
    };
  },
  'doc.session.setDefault': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-session-set-default-success');
    await harness.openSessionFixture(stateDir, 'doc-session-set-default', 'session-default-success');
    return {
      stateDir,
      args: ['session', 'set-default', '--session', 'session-default-success'],
    };
  },

  // ---------------------------------------------------------------------------
  // Table operations
  // ---------------------------------------------------------------------------

  'doc.create.table': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('create-table-success');
    const docPath = await harness.copyFixtureDoc('create-table');
    return {
      stateDir,
      args: [
        'create',
        'table',
        docPath,
        '--rows',
        '3',
        '--columns',
        '3',
        '--out',
        harness.createOutputPath('create-table-out'),
      ],
    };
  },
  'doc.tables.convertFromText': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const label = 'table-convertFromText';
    const stateDir = await harness.createStateDir(`${label}-success`);
    const { sessionId } = await harness.createTableFixture(stateDir, label);
    // convertFromText targets a paragraph, not a table — find the first paragraph in the session
    const { result, envelope } = await harness.runCli(
      ['find', '--session', sessionId, '--type', 'node', '--node-type', 'paragraph', '--limit', '1'],
      stateDir,
    );
    if (result.code !== 0 || envelope.ok !== true) {
      throw new Error('Failed to find paragraph for convertFromText conformance scenario.');
    }
    const paraNodeId = (envelope.data as { result?: { items?: Array<{ address?: { nodeId?: string } }> } }).result
      ?.items?.[0]?.address?.nodeId;
    if (!paraNodeId) throw new Error('No paragraph found for convertFromText scenario.');
    return {
      stateDir,
      args: [
        ...commandTokens('doc.tables.convertFromText'),
        '--session',
        sessionId,
        '--node-id',
        paraNodeId,
        '--delimiter-json',
        JSON.stringify('tab'),
        '--out',
        harness.createOutputPath(`${label}-out`),
      ],
    };
  },
  'doc.tables.delete': tableMutationScenario('tables.delete', []),
  'doc.tables.clearContents': tableMutationScenario('tables.clearContents', []),
  'doc.tables.move': tableMutationScenario('tables.move', [
    '--destination-json',
    JSON.stringify({ kind: 'documentEnd' }),
  ]),
  'doc.tables.split': tableMutationScenario('tables.split', ['--at-row-index', '1']),
  'doc.tables.convertToText': tableMutationScenario('tables.convertToText', ['--delimiter', 'tab']),
  'doc.tables.setLayout': tableMutationScenario('tables.setLayout', ['--alignment', 'center']),
  'doc.tables.insertRow': tableScopedMutationScenario('tables.insertRow', ['--row-index', '0', '--position', 'below']),
  'doc.tables.deleteRow': tableScopedMutationScenario('tables.deleteRow', ['--row-index', '0']),
  'doc.tables.setRowHeight': tableScopedMutationScenario('tables.setRowHeight', [
    '--row-index',
    '0',
    '--height-pt',
    '36',
    '--rule',
    'atLeast',
  ]),
  'doc.tables.distributeRows': tableMutationScenario('tables.distributeRows', []),
  'doc.tables.setRowOptions': tableScopedMutationScenario('tables.setRowOptions', [
    '--row-index',
    '0',
    '--allow-break-across-pages',
  ]),
  'doc.tables.insertColumn': tableScopedMutationScenario('tables.insertColumn', [
    '--column-index',
    '0',
    '--position',
    'right',
  ]),
  'doc.tables.deleteColumn': tableScopedMutationScenario('tables.deleteColumn', ['--column-index', '0']),
  'doc.tables.setColumnWidth': tableScopedMutationScenario('tables.setColumnWidth', [
    '--column-index',
    '0',
    '--width-pt',
    '72',
  ]),
  'doc.tables.distributeColumns': tableMutationScenario('tables.distributeColumns', []),
  'doc.tables.insertCell': cellMutationScenario('tables.insertCell', ['--mode', 'shiftRight']),
  'doc.tables.deleteCell': cellMutationScenario('tables.deleteCell', ['--mode', 'shiftLeft']),
  'doc.tables.mergeCells': tableScopedMutationScenario('tables.mergeCells', [
    '--start-json',
    JSON.stringify({ rowIndex: 0, columnIndex: 0 }),
    '--end-json',
    JSON.stringify({ rowIndex: 0, columnIndex: 1 }),
  ]),
  'doc.tables.unmergeCells': cellMutationScenario('tables.unmergeCells', []),
  'doc.tables.splitCell': cellMutationScenario('tables.splitCell', ['--rows', '2', '--columns', '1']),
  'doc.tables.setCellProperties': cellMutationScenario('tables.setCellProperties', ['--vertical-align', 'center']),
  'doc.tables.sort': tableMutationScenario('tables.sort', [
    '--keys-json',
    JSON.stringify([{ columnIndex: 0, direction: 'ascending', type: 'text' }]),
  ]),
  'doc.tables.setAltText': tableMutationScenario('tables.setAltText', ['--title', 'Test Table']),
  'doc.tables.setStyle': tableMutationScenario('tables.setStyle', ['--style-id', 'TableGrid']),
  'doc.tables.clearStyle': tableMutationScenario('tables.clearStyle', []),
  'doc.tables.setStyleOption': tableMutationScenario('tables.setStyleOption', ['--flag', 'headerRow', '--enabled']),
  'doc.tables.setBorder': tableMutationScenario('tables.setBorder', [
    '--edge',
    'top',
    '--line-style',
    'single',
    '--line-weight-pt',
    '1',
    '--color',
    '000000',
  ]),
  'doc.tables.clearBorder': tableMutationScenario('tables.clearBorder', ['--edge', 'top']),
  'doc.tables.applyBorderPreset': tableMutationScenario('tables.applyBorderPreset', ['--preset', 'all']),
  'doc.tables.setShading': tableMutationScenario('tables.setShading', ['--color', 'FF0000']),
  'doc.tables.clearShading': tableMutationScenario('tables.clearShading', []),
  'doc.tables.setTablePadding': tableMutationScenario('tables.setTablePadding', [
    '--top-pt',
    '5',
    '--right-pt',
    '5',
    '--bottom-pt',
    '5',
    '--left-pt',
    '5',
  ]),
  'doc.tables.setCellPadding': cellMutationScenario('tables.setCellPadding', [
    '--top-pt',
    '5',
    '--right-pt',
    '5',
    '--bottom-pt',
    '5',
    '--left-pt',
    '5',
  ]),
  'doc.tables.setCellSpacing': tableMutationScenario('tables.setCellSpacing', ['--spacing-pt', '2']),
  'doc.tables.clearCellSpacing': tableMutationScenario('tables.clearCellSpacing', []),
  'doc.tables.get': tableReadScenario('tables.get'),
  'doc.tables.getCells': tableReadScenario('tables.getCells'),
  'doc.tables.getProperties': tableReadScenario('tables.getProperties'),
  'doc.tables.getStyles': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('table-getStyles-success');
    const { sessionId } = await harness.createTableFixture(stateDir, 'table-getStyles');
    return {
      stateDir,
      args: [...commandTokens('doc.tables.getStyles'), '--session', sessionId],
    };
  },
  'doc.tables.setDefaultStyle': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('table-setDefaultStyle-success');
    const { sessionId } = await harness.createTableFixture(stateDir, 'table-setDefaultStyle');
    return {
      stateDir,
      args: [
        ...commandTokens('doc.tables.setDefaultStyle'),
        '--session',
        sessionId,
        '--style-id',
        'TableGrid',
        '--out',
        harness.createOutputPath('table-setDefaultStyle-out'),
      ],
    };
  },
  'doc.tables.clearDefaultStyle': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('table-clearDefaultStyle-success');
    const { sessionId } = await harness.createTableFixture(stateDir, 'table-clearDefaultStyle');
    // First set a default so the clear actually has something to remove
    await harness.runCli(
      [
        ...commandTokens('doc.tables.setDefaultStyle'),
        '--session',
        sessionId,
        '--style-id',
        'TableGrid',
        '--out',
        harness.createOutputPath('table-clearDefaultStyle-setup-out'),
      ],
      stateDir,
    );
    return {
      stateDir,
      args: [
        ...commandTokens('doc.tables.clearDefaultStyle'),
        '--session',
        sessionId,
        '--out',
        harness.createOutputPath('table-clearDefaultStyle-out'),
      ],
    };
  },

  // ---------------------------------------------------------------------------
  // History operations
  // ---------------------------------------------------------------------------

  'doc.history.get': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-history-get-success');
    await harness.openSessionFixture(stateDir, 'doc-history-get', 'history-get-session');
    return { stateDir, args: ['history', 'get', '--session', 'history-get-session'] };
  },
  'doc.history.undo': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-history-undo-success');
    await harness.openSessionFixture(stateDir, 'doc-history-undo', 'history-undo-session');
    return { stateDir, args: ['history', 'undo', '--session', 'history-undo-session'] };
  },
  'doc.history.redo': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-history-redo-success');
    await harness.openSessionFixture(stateDir, 'doc-history-redo', 'history-redo-session');
    return { stateDir, args: ['history', 'redo', '--session', 'history-redo-session'] };
  },
} as const satisfies Record<CliOperationId, (harness: ConformanceHarness) => Promise<ScenarioInvocation>>;

const RUNTIME_CONFORMANCE_SKIP = new Set<CliOperationId>([
  'doc.toc.markEntry',
  'doc.toc.unmarkEntry',
  'doc.toc.getEntry',
  'doc.toc.editEntry',
  // OOB table-style mutations require translatedLinkedStyles from the style-engine,
  // which the CLI test harness fixture does not populate.
  'doc.tables.setDefaultStyle',
  'doc.tables.clearDefaultStyle',
]);

export const OPERATION_SCENARIOS = (Object.keys(SUCCESS_SCENARIOS) as CliOperationId[]).map((operationId) => {
  const scenario: OperationScenario = {
    operationId,
    success: SUCCESS_SCENARIOS[operationId],
    failure: genericInvalidArgumentFailure(operationId),
    expectedFailureCodes: ['INVALID_ARGUMENT', 'MISSING_REQUIRED'],
    ...(RUNTIME_CONFORMANCE_SKIP.has(operationId) ? { skipRuntimeConformance: true } : {}),
  };
  return scenario;
});
