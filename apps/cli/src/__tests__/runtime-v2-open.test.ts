import { describe, expect, test } from 'bun:test';
import { openV2CollaborativeDocument, openV2Document } from '../lib/document-v2';
import { CliError } from '../lib/errors';
import type { CliIO } from '../lib/types';

const io: CliIO = {
  stdout() {},
  stderr() {},
  readStdinBytes: async () => new Uint8Array(),
  now: () => 0,
};

async function expectV2Unavailable(action: () => Promise<unknown>, feature: string): Promise<void> {
  try {
    await action();
    throw new Error('Expected V2 runtime to be unavailable.');
  } catch (error) {
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe('RUNTIME_V2_UNAVAILABLE');
    expect((error as CliError).details).toMatchObject({ runtime: 'v2', feature });
  }
}

describe('CLI public v2 runtime stub', () => {
  test('openV2Document fails with a named unavailable-runtime error', async () => {
    await expectV2Unavailable(() => openV2Document(undefined, io), 'open');
  });

  test('openV2CollaborativeDocument fails with a named unavailable-runtime error', async () => {
    await expectV2Unavailable(
      () =>
        openV2CollaborativeDocument(undefined, io, {
          providerType: 'y-websocket',
          url: 'ws://collab.example.test',
          documentId: 'doc-1',
        }),
      'collaborative-open',
    );
  });
});
