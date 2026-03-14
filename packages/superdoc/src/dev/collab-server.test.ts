import { describe, expect, test } from 'vitest';
import { validateUpgradePath } from './collab-server';

describe('validateUpgradePath', () => {
  test('accepts valid collaboration path with document id', () => {
    expect(validateUpgradePath('/v1/collaboration/superdoc-dev-room')).toEqual({
      ok: true,
      documentId: 'superdoc-dev-room',
    });
  });

  test('decodes encoded document id', () => {
    expect(validateUpgradePath('/v1/collaboration/room%2Fchild')).toEqual({
      ok: true,
      documentId: 'room/child',
    });
  });

  test('rejects unknown path with 404', () => {
    expect(validateUpgradePath('/v1/other/room')).toEqual({
      ok: false,
      statusCode: 404,
    });
  });

  test('rejects missing document id with 400', () => {
    expect(validateUpgradePath('/v1/collaboration/')).toEqual({
      ok: false,
      statusCode: 400,
    });
  });

  test('rejects malformed percent-encoding with 400', () => {
    expect(validateUpgradePath('/v1/collaboration/%E0%A4%A')).toEqual({
      ok: false,
      statusCode: 400,
    });
  });
});
