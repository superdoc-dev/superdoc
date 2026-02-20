import { describe, expect, test } from 'bun:test';
import { CLI_OPERATION_METADATA, type CliOperationId } from '../../cli';
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
});
