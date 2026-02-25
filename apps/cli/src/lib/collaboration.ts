import { HocuspocusProvider } from '@hocuspocus/provider';
import { WebsocketProvider } from 'y-websocket';
import { Doc as YDoc } from 'yjs';
import { CliError } from './errors';
import { isRecord } from './guards';

export type CollaborationProviderType = 'hocuspocus' | 'y-websocket';

export type CollaborationInput = {
  providerType: CollaborationProviderType;
  url: string;
  documentId?: string;
  tokenEnv?: string;
  syncTimeoutMs?: number;
};

export type CollaborationProfile = {
  providerType: CollaborationProviderType;
  url: string;
  documentId: string;
  tokenEnv?: string;
  syncTimeoutMs?: number;
};

type SyncableProvider = {
  on?(event: string, handler: (...args: unknown[]) => void): void;
  off?(event: string, handler: (...args: unknown[]) => void): void;
  disconnect?(): void;
  destroy?(): void;
  synced?: boolean;
  isSynced?: boolean;
};

export type CollaborationRuntime = {
  ydoc: YDoc;
  provider: SyncableProvider;
  waitForSync(): Promise<void>;
  dispose(): void;
};

const DEFAULT_SYNC_TIMEOUT_MS = 10_000;
const SYNC_POLL_INTERVAL_MS = 25;
const ENV_VAR_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isSynced(provider: SyncableProvider): boolean {
  return provider.synced === true || provider.isSynced === true;
}

function expectNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CliError('VALIDATION_ERROR', `${path} must be a non-empty string.`);
  }
  return value;
}

function expectOptionalPositiveNumber(value: unknown, path: string): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new CliError('VALIDATION_ERROR', `${path} must be a positive number.`);
  }
  return value;
}

function expectOptionalEnvVarName(value: unknown, path: string): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string' || !ENV_VAR_NAME_PATTERN.test(value)) {
    throw new CliError('VALIDATION_ERROR', `${path} must be a valid environment variable name.`);
  }
  return value;
}

function normalizeProviderType(value: unknown, path: string): CollaborationProviderType {
  if (value === 'hocuspocus' || value === 'y-websocket') return value;
  throw new CliError('VALIDATION_ERROR', `${path} must be "hocuspocus" or "y-websocket".`);
}

export function parseCollaborationInput(value: unknown): CollaborationInput {
  if (!isRecord(value)) {
    throw new CliError('VALIDATION_ERROR', 'collaboration must be an object.');
  }

  if ('token' in value) {
    throw new CliError('VALIDATION_ERROR', 'collaboration.token is not supported in v1; use collaboration.tokenEnv.');
  }

  if ('params' in value) {
    throw new CliError('VALIDATION_ERROR', 'collaboration.params is not supported in v1.');
  }

  const allowedKeys = new Set(['providerType', 'url', 'documentId', 'tokenEnv', 'syncTimeoutMs']);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new CliError('VALIDATION_ERROR', `collaboration.${key} is not supported.`);
    }
  }

  return {
    providerType: normalizeProviderType(value.providerType, 'collaboration.providerType'),
    url: expectNonEmptyString(value.url, 'collaboration.url').trim(),
    documentId:
      value.documentId != null ? expectNonEmptyString(value.documentId, 'collaboration.documentId') : undefined,
    tokenEnv: expectOptionalEnvVarName(value.tokenEnv, 'collaboration.tokenEnv'),
    syncTimeoutMs: expectOptionalPositiveNumber(value.syncTimeoutMs, 'collaboration.syncTimeoutMs'),
  };
}

export function resolveCollaborationProfile(input: CollaborationInput, sessionId: string): CollaborationProfile {
  const documentId = input.documentId?.trim() || sessionId;
  return {
    providerType: input.providerType,
    url: input.url,
    documentId,
    tokenEnv: input.tokenEnv,
    syncTimeoutMs: input.syncTimeoutMs,
  };
}

export function resolveCollaborationToken(profile: CollaborationProfile): string | undefined {
  if (!profile.tokenEnv) return undefined;
  const token = process.env[profile.tokenEnv];
  if (!token) {
    throw new CliError('MISSING_REQUIRED', `Missing collaboration token env var: ${profile.tokenEnv}`, {
      tokenEnv: profile.tokenEnv,
    });
  }
  return token;
}

function waitForProviderSync(provider: SyncableProvider, timeoutMs: number): Promise<void> {
  if (isSynced(provider)) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup: Array<() => void> = [];

    const finish = (error?: CliError) => {
      if (settled) return;
      settled = true;
      for (const run of cleanup) {
        run();
      }
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };

    const onSync = (value?: unknown) => {
      if (value === false) return;
      finish();
    };

    if (provider.on) {
      provider.on('synced', onSync);
      cleanup.push(() => provider.off?.('synced', onSync));

      provider.on('sync', onSync);
      cleanup.push(() => provider.off?.('sync', onSync));
    }

    const timer = setTimeout(() => {
      finish(
        new CliError('COLLABORATION_SYNC_TIMEOUT', `Collaboration sync timed out after ${timeoutMs}ms.`, {
          timeoutMs,
        }),
      );
    }, timeoutMs);
    cleanup.push(() => clearTimeout(timer));

    const poll = setInterval(() => {
      if (isSynced(provider)) {
        finish();
      }
    }, SYNC_POLL_INTERVAL_MS);
    cleanup.push(() => clearInterval(poll));
  });
}

export function createCollaborationRuntime(profile: CollaborationProfile): CollaborationRuntime {
  const token = resolveCollaborationToken(profile);
  const ydoc = new YDoc({ gc: false });

  let provider: SyncableProvider;
  if (profile.providerType === 'y-websocket') {
    const providerOptions: { params?: Record<string, string> } = {};
    if (token) {
      providerOptions.params = { token };
    }
    provider = new WebsocketProvider(
      profile.url,
      profile.documentId,
      ydoc,
      providerOptions,
    ) as unknown as SyncableProvider;
  } else {
    provider = new HocuspocusProvider({
      url: profile.url,
      document: ydoc,
      name: profile.documentId,
      token: token ?? '',
      preserveConnection: false,
    }) as unknown as SyncableProvider;
  }

  return {
    ydoc,
    provider,
    waitForSync() {
      return waitForProviderSync(provider, profile.syncTimeoutMs ?? DEFAULT_SYNC_TIMEOUT_MS);
    },
    dispose() {
      provider.disconnect?.();
      provider.destroy?.();
      ydoc.destroy();
    },
  };
}
