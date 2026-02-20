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
  'doc.comments.add': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-comments-add-success');
    const docPath = await harness.copyFixtureDoc('doc-comments-add');
    const target = await harness.firstTextRange(docPath, stateDir);
    return {
      stateDir,
      args: [
        'comments',
        'add',
        docPath,
        '--target-json',
        JSON.stringify(target),
        '--text',
        'Conformance add comment',
        '--out',
        harness.createOutputPath('doc-comments-add-output'),
      ],
    };
  },
  'doc.comments.edit': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-comments-edit-success');
    const fixture = await harness.addCommentFixture(stateDir, 'doc-comments-edit');
    return {
      stateDir,
      args: [
        'comments',
        'edit',
        fixture.docPath,
        '--id',
        fixture.commentId,
        '--text',
        'Conformance edited comment',
        '--out',
        harness.createOutputPath('doc-comments-edit-output'),
      ],
    };
  },
  'doc.comments.reply': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-comments-reply-success');
    const fixture = await harness.addCommentFixture(stateDir, 'doc-comments-reply');
    return {
      stateDir,
      args: [
        'comments',
        'reply',
        fixture.docPath,
        '--parent-id',
        fixture.commentId,
        '--text',
        'Conformance reply',
        '--out',
        harness.createOutputPath('doc-comments-reply-output'),
      ],
    };
  },
  'doc.comments.move': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-comments-move-success');
    const fixture = await harness.addCommentFixture(stateDir, 'doc-comments-move');
    const moveTarget = await harness.firstTextRange(fixture.docPath, stateDir, 'overflow');
    return {
      stateDir,
      args: [
        'comments',
        'move',
        fixture.docPath,
        '--id',
        fixture.commentId,
        '--target-json',
        JSON.stringify(moveTarget),
        '--out',
        harness.createOutputPath('doc-comments-move-output'),
      ],
    };
  },
  'doc.comments.resolve': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-comments-resolve-success');
    const fixture = await harness.addCommentFixture(stateDir, 'doc-comments-resolve');
    return {
      stateDir,
      args: [
        'comments',
        'resolve',
        fixture.docPath,
        '--id',
        fixture.commentId,
        '--out',
        harness.createOutputPath('doc-comments-resolve-output'),
      ],
    };
  },
  'doc.comments.remove': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-comments-remove-success');
    const fixture = await harness.addCommentFixture(stateDir, 'doc-comments-remove');
    return {
      stateDir,
      args: [
        'comments',
        'remove',
        fixture.docPath,
        '--id',
        fixture.commentId,
        '--out',
        harness.createOutputPath('doc-comments-remove-output'),
      ],
    };
  },
  'doc.comments.setInternal': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-comments-set-internal-success');
    const fixture = await harness.addCommentFixture(stateDir, 'doc-comments-set-internal');
    return {
      stateDir,
      args: [
        'comments',
        'set-internal',
        fixture.docPath,
        '--id',
        fixture.commentId,
        '--is-internal',
        'true',
        '--out',
        harness.createOutputPath('doc-comments-set-internal-output'),
      ],
    };
  },
  'doc.comments.setActive': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-comments-set-active-success');
    const fixture = await harness.addCommentFixture(stateDir, 'doc-comments-set-active');
    return {
      stateDir,
      args: ['comments', 'set-active', fixture.docPath, '--id', fixture.commentId],
    };
  },
  'doc.comments.goTo': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-comments-go-to-success');
    const fixture = await harness.addCommentFixture(stateDir, 'doc-comments-go-to');
    return {
      stateDir,
      args: ['comments', 'go-to', fixture.docPath, '--id', fixture.commentId],
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
        '--text',
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
  'doc.format.bold': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-format-bold-success');
    const docPath = await harness.copyFixtureDoc('doc-format-bold');
    const target = await harness.firstTextRange(docPath, stateDir);
    return {
      stateDir,
      args: [
        'format',
        'bold',
        docPath,
        '--target-json',
        JSON.stringify(target),
        '--out',
        harness.createOutputPath('doc-format-bold-output'),
      ],
    };
  },
  'doc.format.italic': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-format-italic-success');
    const docPath = await harness.copyFixtureDoc('doc-format-italic');
    const target = await harness.firstTextRange(docPath, stateDir);
    return {
      stateDir,
      args: [
        'format',
        'italic',
        docPath,
        '--target-json',
        JSON.stringify(target),
        '--out',
        harness.createOutputPath('doc-format-italic-output'),
      ],
    };
  },
  'doc.format.underline': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-format-underline-success');
    const docPath = await harness.copyFixtureDoc('doc-format-underline');
    const target = await harness.firstTextRange(docPath, stateDir);
    return {
      stateDir,
      args: [
        'format',
        'underline',
        docPath,
        '--target-json',
        JSON.stringify(target),
        '--out',
        harness.createOutputPath('doc-format-underline-output'),
      ],
    };
  },
  'doc.format.strikethrough': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-format-strikethrough-success');
    const docPath = await harness.copyFixtureDoc('doc-format-strikethrough');
    const target = await harness.firstTextRange(docPath, stateDir);
    return {
      stateDir,
      args: [
        'format',
        'strikethrough',
        docPath,
        '--target-json',
        JSON.stringify(target),
        '--out',
        harness.createOutputPath('doc-format-strikethrough-output'),
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
  'doc.trackChanges.accept': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-track-changes-accept-success');
    const fixture = await harness.addTrackedChangeFixture(stateDir, 'doc-track-changes-accept');
    return {
      stateDir,
      args: [
        'track-changes',
        'accept',
        fixture.docPath,
        '--id',
        fixture.changeId,
        '--out',
        harness.createOutputPath('doc-track-changes-accept-output'),
      ],
    };
  },
  'doc.trackChanges.reject': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-track-changes-reject-success');
    const fixture = await harness.addTrackedChangeFixture(stateDir, 'doc-track-changes-reject');
    return {
      stateDir,
      args: [
        'track-changes',
        'reject',
        fixture.docPath,
        '--id',
        fixture.changeId,
        '--out',
        harness.createOutputPath('doc-track-changes-reject-output'),
      ],
    };
  },
  'doc.trackChanges.acceptAll': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-track-changes-accept-all-success');
    const fixture = await harness.addTrackedChangeFixture(stateDir, 'doc-track-changes-accept-all');
    return {
      stateDir,
      args: [
        'track-changes',
        'accept-all',
        fixture.docPath,
        '--out',
        harness.createOutputPath('doc-track-changes-accept-all-output'),
      ],
    };
  },
  'doc.trackChanges.rejectAll': async (harness: ConformanceHarness): Promise<ScenarioInvocation> => {
    const stateDir = await harness.createStateDir('doc-track-changes-reject-all-success');
    const fixture = await harness.addTrackedChangeFixture(stateDir, 'doc-track-changes-reject-all');
    return {
      stateDir,
      args: [
        'track-changes',
        'reject-all',
        fixture.docPath,
        '--out',
        harness.createOutputPath('doc-track-changes-reject-all-output'),
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
