import { describe, expect, test } from 'bun:test';
import { CONTRACT_VERSION } from '@superdoc/document-api';
import { createFailureEnvelope, createSuccessEnvelope } from '../../lib/envelope';
import { CliError } from '../../lib/errors';

describe('createSuccessEnvelope', () => {
  test('creates a success envelope', () => {
    const envelope = createSuccessEnvelope('doc open', { sessionId: 'abc' }, 123);
    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe('doc open');
    expect(envelope.data).toEqual({ sessionId: 'abc' });
    expect(envelope.meta.elapsedMs).toBe(123);
    expect(envelope.meta.version).toBe(CONTRACT_VERSION);
  });
});

describe('createFailureEnvelope', () => {
  test('creates a failure envelope from CliError', () => {
    const error = new CliError('INVALID_ARGUMENT', 'bad input', { field: 'doc' });
    const envelope = createFailureEnvelope(error, 50);
    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe('INVALID_ARGUMENT');
    expect(envelope.error.message).toBe('bad input');
    expect(envelope.error.details).toEqual({ field: 'doc' });
    expect(envelope.meta.elapsedMs).toBe(50);
  });
});
