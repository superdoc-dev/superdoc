import { describe, expect, test } from 'bun:test';
import { CLI_OPERATION_METADATA, CLI_OPERATION_OPTION_SPECS, type CliOperationId } from '../../cli';
import { getOperationRuntimeMetadata } from '../../lib/operation-runtime-metadata';

describe('operation runtime metadata', () => {
  test('covers every CLI operation id', () => {
    const operationIds = Object.keys(CLI_OPERATION_METADATA) as CliOperationId[];
    for (const operationId of operationIds) {
      const runtime = getOperationRuntimeMetadata(operationId);
      expect(runtime.operationId).toBe(operationId);
      expect(runtime.profile).toBeDefined();
      expect(runtime.context).toBeDefined();
      expect(runtime.traits).toBeDefined();
    }
  });

  test('marks lifecycle and session admin operations explicitly', () => {
    expect(getOperationRuntimeMetadata('doc.open').profile).toBe('lifecycle');
    expect(getOperationRuntimeMetadata('doc.save').profile).toBe('lifecycle');
    expect(getOperationRuntimeMetadata('doc.close').profile).toBe('lifecycle');
    expect(getOperationRuntimeMetadata('doc.session.list').profile).toBe('sessionAdmin');
    expect(getOperationRuntimeMetadata('doc.session.save').profile).toBe('sessionAdmin');
    expect(getOperationRuntimeMetadata('doc.session.close').profile).toBe('sessionAdmin');
    expect(getOperationRuntimeMetadata('doc.session.setDefault').profile).toBe('sessionAdmin');
  });

  test('derives mutation traits for text operations', () => {
    const insert = getOperationRuntimeMetadata('doc.insert');
    expect(insert.profile).toBe('mutation');
    expect(insert.traits.supportsDryRun).toBe(true);
    expect(insert.traits.supportsChangeMode).toBe(true);
    expect(insert.traits.supportsExpectedRevision).toBe(true);
    expect(insert.traits.requiresOutInStateless).toBe(true);
  });

  test('marks describe operations as stateless only', () => {
    const describe = getOperationRuntimeMetadata('doc.describe');
    const describeCommand = getOperationRuntimeMetadata('doc.describeCommand');

    expect(describe.context.supportsStateless).toBe(true);
    expect(describe.context.supportsSession).toBe(false);
    expect(describeCommand.context.supportsStateless).toBe(true);
    expect(describeCommand.context.supportsSession).toBe(false);
  });

  test('doc.open metadata includes userName and userEmail params', () => {
    const openMeta = CLI_OPERATION_METADATA['doc.open'];
    const paramNames = openMeta.params.map((p) => p.name);
    expect(paramNames).toContain('userName');
    expect(paramNames).toContain('userEmail');
  });

  test('doc.open option specs include user-name and user-email flags', () => {
    const openOptions = CLI_OPERATION_OPTION_SPECS['doc.open'];
    const optionNames = openOptions.map((o) => o.name);
    expect(optionNames).toContain('user-name');
    expect(optionNames).toContain('user-email');
  });

  test('doc.open metadata includes password param', () => {
    const openMeta = CLI_OPERATION_METADATA['doc.open'];
    const paramNames = openMeta.params.map((p) => p.name);
    expect(paramNames).toContain('password');
  });

  test('doc.open password param is not agent-visible', () => {
    const openMeta = CLI_OPERATION_METADATA['doc.open'];
    const passwordParam = openMeta.params.find((p) => p.name === 'password');
    expect(passwordParam).toBeDefined();
    expect(passwordParam!.agentVisible).toBe(false);
  });

  test('doc.open option specs include password flag', () => {
    const openOptions = CLI_OPERATION_OPTION_SPECS['doc.open'];
    const optionNames = openOptions.map((o) => o.name);
    expect(optionNames).toContain('password');
  });

  test('doc.open metadata includes trackChanges JSON param', () => {
    const openMeta = CLI_OPERATION_METADATA['doc.open'];
    const trackChangesParam = openMeta.params.find((p) => p.name === 'trackChanges');

    expect(trackChangesParam).toBeDefined();
    expect(trackChangesParam!.kind).toBe('jsonFlag');
    expect(trackChangesParam!.type).toBe('json');
    expect(trackChangesParam!.flag).toBe('track-changes-json');
    expect(trackChangesParam!.schema).toEqual({
      type: 'object',
      properties: {
        replacements: {
          type: 'string',
          enum: ['paired', 'independent'],
          description: 'How adjacent insertion/deletion replacement wrappers are projected.',
        },
      },
    });
  });

  test('doc.open option specs include track-changes-json flag', () => {
    const openOptions = CLI_OPERATION_OPTION_SPECS['doc.open'];
    const trackChangesOption = openOptions.find((o) => o.name === 'track-changes-json');

    expect(trackChangesOption).toBeDefined();
    expect(trackChangesOption!.type).toBe('string');
  });

  test('final recipe-provider parity operations expose their promoted CLI params', () => {
    const blocksListMeta = CLI_OPERATION_METADATA['doc.blocks.list'];
    expect(blocksListMeta.params.find((p) => p.name === 'in')?.flag).toBe('in-json');

    const createTocMeta = CLI_OPERATION_METADATA['doc.create.tableOfContents'];
    expect(createTocMeta.params.find((p) => p.name === 'instruction')?.flag).toBe('instruction');

    const footnotesInsertMeta = CLI_OPERATION_METADATA['doc.footnotes.insert'];
    expect(footnotesInsertMeta.params.find((p) => p.name === 'body')?.flag).toBe('body-json');

    const fieldsInsertMeta = CLI_OPERATION_METADATA['doc.fields.insert'];
    expect(fieldsInsertMeta.params.find((p) => p.name === 'cachedResultText')?.flag).toBe('cached-result-text');
    expect(fieldsInsertMeta.params.find((p) => p.name === 'updatePolicy')?.flag).toBe('update-policy');

    const markRunMeta = CLI_OPERATION_METADATA['doc.format.paragraph.setMarkRunProps'];
    expect(markRunMeta.params.find((p) => p.name === 'markRunProps')?.flag).toBe('mark-run-props-json');
  });

  test('paragraph format operations expose block shortcuts without text-range flags', () => {
    const paragraphFormatMeta = CLI_OPERATION_METADATA['doc.format.paragraph.setMarkRunProps'];
    const paragraphParamNames = paragraphFormatMeta.params.map((p) => p.name);

    expect(paragraphParamNames).toContain('blockId');
    expect(paragraphParamNames).not.toContain('start');
    expect(paragraphParamNames).not.toContain('end');

    const inlineFormatMeta = CLI_OPERATION_METADATA['doc.format.apply'];
    const inlineParamNames = inlineFormatMeta.params.map((p) => p.name);

    expect(inlineParamNames).toContain('blockId');
    expect(inlineParamNames).toContain('start');
    expect(inlineParamNames).toContain('end');
  });
});
