import { describe, expect, test } from 'bun:test';
import { createCliV2SingleDocCollaborationRuntime } from '..';
import { CliError } from '../../errors';

describe('createCliV2SingleDocCollaborationRuntime', () => {
  test('fails closed while the public CLI does not bundle the V2 runtime', () => {
    try {
      createCliV2SingleDocCollaborationRuntime({
        providerType: 'y-websocket',
        url: 'ws://collab.example.test',
        documentId: 'doc-1',
      });
      throw new Error('Expected V2 collaboration runtime to be unavailable.');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe('RUNTIME_V2_UNAVAILABLE');
      expect((error as CliError).details).toMatchObject({ runtime: 'v2', feature: 'collaboration' });
    }
  });
});
