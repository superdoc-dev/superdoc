import { SuperDocClient, type SuperDocDocument } from '@superdoc-dev/sdk';

const STARTUP_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 90_000;
const SYNC_TIMEOUT_MS = 60_000;

export interface EditorHandle {
  client: SuperDocClient;
  document: SuperDocDocument;
}

export interface CreateEditorOptions {
  roomId: string;
  docPath: string;
  collaborationUrl: string;
}

export async function createEditor(options: CreateEditorOptions): Promise<EditorHandle> {
  const client = new SuperDocClient({
    startupTimeoutMs: STARTUP_TIMEOUT_MS,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
  });
  await client.connect();

  try {
    const document = await client.open(
      {
        doc: options.docPath,
        collaboration: {
          providerType: 'y-websocket',
          url: options.collaborationUrl,
          documentId: options.roomId,
          syncTimeoutMs: SYNC_TIMEOUT_MS,
        },
      },
      { timeoutMs: REQUEST_TIMEOUT_MS },
    );
    return { client, document };
  } catch (error) {
    await client.dispose().catch(() => undefined);
    throw error;
  }
}

export async function disposeEditor(handle: EditorHandle): Promise<void> {
  await handle.document.close({}).catch(() => undefined);
  await handle.client.dispose().catch(() => undefined);
}
