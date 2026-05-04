import { SuperDocClient } from '@superdoc-dev/sdk';

const STARTUP_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 90_000;
const SYNC_TIMEOUT_MS = 60_000;

export interface EditorOptions {
  roomId: string;
  docPath: string;
  collabUrl: string;
  changeMode?: 'direct' | 'tracked';
}

export interface EditorHandle {
  client: SuperDocClient;
  document: any; // BoundDocApi from SDK
  sessionId: string;
}

export async function createEditor(options: EditorOptions): Promise<EditorHandle> {
  const client = new SuperDocClient({
    startupTimeoutMs: STARTUP_TIMEOUT_MS,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    defaultChangeMode: options.changeMode ?? 'direct',
  });

  await client.connect();

  const doc = await client.open(
    {
      doc: options.docPath,
      collaboration: {
        providerType: 'y-websocket',
        url: options.collabUrl,
        documentId: options.roomId,
        syncTimeoutMs: SYNC_TIMEOUT_MS,
      },
    },
    { timeoutMs: 90_000 },
  );

  return {
    client,
    document: doc,
    sessionId: doc.sessionId,
  };
}

export async function disposeEditor(handle: EditorHandle): Promise<void> {
  try {
    await handle.document.close({});
  } catch {
    // ignore close errors
  }
  try {
    await handle.client.dispose();
  } catch {
    // ignore dispose errors
  }
}
