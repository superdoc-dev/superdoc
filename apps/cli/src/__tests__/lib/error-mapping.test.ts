import { describe, expect, test } from 'bun:test';
import { mapInvokeError } from '../../lib/error-mapping';

describe('mapInvokeError', () => {
  test('maps blocks.delete INVALID_INPUT errors to INVALID_ARGUMENT', () => {
    const error = Object.assign(new Error('blocks.delete requires a target.'), {
      code: 'INVALID_INPUT',
      details: { field: 'target' },
    });

    const mapped = mapInvokeError('blocks.delete', error);
    expect(mapped.code).toBe('INVALID_ARGUMENT');
    expect(mapped.message).toBe('blocks.delete requires a target.');
    expect(mapped.details).toEqual({ operationId: 'blocks.delete', details: { field: 'target' } });
  });
});
