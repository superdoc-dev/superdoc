import type { CliOperationId } from '../../cli';
import { CLI_OPERATION_COMMAND_KEYS } from '../../cli';
import type { ConformanceHarness } from './harness';

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
  'doc.lists.setType': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-lists-set-type-success');
    const docPath = await harness.copyListFixtureDoc('doc-lists-set-type');
    const target = await harness.firstListItemAddress(docPath, stateDir);
    const getResult = await harness.runCli(
      ['lists', 'get', docPath, '--address-json', JSON.stringify(target)],
      stateDir,
    );
    if (getResult.result.code !== 0 || getResult.envelope.ok !== true) {
      throw new Error('Failed to resolve list item kind for set-type conformance scenario.');
    }
    const currentKind = (getResult.envelope.data as { item?: { kind?: string } }).item?.kind;
    const requestedKind = currentKind === 'ordered' ? 'bullet' : 'ordered';

    return {
      stateDir,
      args: [
        'lists',
        'set-type',
        docPath,
        '--target-json',
        JSON.stringify(target),
        '--kind',
        requestedKind,
        '--out',
        harness.createOutputPath('doc-lists-set-type-output'),
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
  'doc.lists.restart': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-lists-restart-success');
    const docPath = await harness.copyListFixtureDoc('doc-lists-restart');
    const listed = await harness.runCli(['lists', 'list', docPath, '--limit', '50'], stateDir);
    if (listed.result.code !== 0 || listed.envelope.ok !== true) {
      throw new Error('Failed to list list items for restart conformance scenario.');
    }
    const restartTarget = (
      (
        listed.envelope.data as {
          result?: { items?: Array<{ ordinal?: number; address?: Record<string, unknown> }> };
        }
      ).result?.items ?? []
    ).find((item) => typeof item.ordinal === 'number' && item.ordinal > 1)?.address;
    if (!restartTarget) {
      throw new Error('Restart conformance scenario requires a list item with ordinal > 1.');
    }

    return {
      stateDir,
      args: [
        'lists',
        'restart',
        docPath,
        '--target-json',
        JSON.stringify(restartTarget),
        '--out',
        harness.createOutputPath('doc-lists-restart-output'),
      ],
    };
  },
  'doc.lists.exit': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-lists-exit-success');
    const docPath = await harness.copyListFixtureDoc('doc-lists-exit');
    const target = await harness.firstListItemAddress(docPath, stateDir);
    return {
      stateDir,
      args: [
        'lists',
        'exit',
        docPath,
        '--target-json',
        JSON.stringify(target),
        '--out',
        harness.createOutputPath('doc-lists-exit-output'),
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
        JSON.stringify({ bold: 'on' }),
        '--out',
        harness.createOutputPath('doc-style-apply-output'),
      ],
    };
  },
  'doc.format.fontSize': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-format-font-size-success');
    const docPath = await harness.copyFixtureDoc('doc-format-font-size');
    const target = await harness.firstTextRange(docPath, stateDir);
    return {
      stateDir,
      args: [
        'format',
        'font-size',
        docPath,
        '--target-json',
        JSON.stringify(target),
        '--value-json',
        JSON.stringify('14pt'),
        '--out',
        harness.createOutputPath('doc-format-font-size-output'),
      ],
    };
  },
  'doc.format.fontFamily': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-format-font-family-success');
    const docPath = await harness.copyFixtureDoc('doc-format-font-family');
    const target = await harness.firstTextRange(docPath, stateDir);
    return {
      stateDir,
      args: [
        'format',
        'font-family',
        docPath,
        '--target-json',
        JSON.stringify(target),
        '--value-json',
        JSON.stringify('Arial'),
        '--out',
        harness.createOutputPath('doc-format-font-family-output'),
      ],
    };
  },
  'doc.format.color': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-format-color-success');
    const docPath = await harness.copyFixtureDoc('doc-format-color');
    const target = await harness.firstTextRange(docPath, stateDir);
    return {
      stateDir,
      args: [
        'format',
        'color',
        docPath,
        '--target-json',
        JSON.stringify(target),
        '--value-json',
        JSON.stringify('#ff0000'),
        '--out',
        harness.createOutputPath('doc-format-color-output'),
      ],
    };
  },
  'doc.format.align': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-format-align-success');
    const docPath = await harness.copyFixtureDoc('doc-format-align');
    const target = await harness.firstTextRange(docPath, stateDir);
    return {
      stateDir,
      args: [
        'format',
        'align',
        docPath,
        '--target-json',
        JSON.stringify(target),
        '--alignment-json',
        JSON.stringify('center'),
        '--out',
        harness.createOutputPath('doc-format-align-output'),
      ],
    };
  },
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
} as const satisfies Record<CliOperationId, (harness: ConformanceHarness) => Promise<ScenarioInvocation>>;

export const OPERATION_SCENARIOS = (Object.keys(SUCCESS_SCENARIOS) as CliOperationId[]).map((operationId) => {
  const scenario: OperationScenario = {
    operationId,
    success: SUCCESS_SCENARIOS[operationId],
    failure: genericInvalidArgumentFailure(operationId),
    expectedFailureCodes: ['INVALID_ARGUMENT', 'MISSING_REQUIRED'],
  };
  return scenario;
});
