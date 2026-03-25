import { CliError } from '../errors';
import { isRecord } from '../guards';
import {
  ENV_VAR_NAME_PATTERN,
  type CollaborationInput,
  type CollaborationProviderType,
  type LiveblocksCollaborationInput,
  type OnMissing,
  type WebSocketCollaborationInput,
  type WebSocketProviderType,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_SHORTHAND_COLLABORATION_PROVIDER_TYPE: WebSocketProviderType = 'y-websocket';

const WEBSOCKET_ALLOWED_KEYS = new Set([
  'providerType',
  'url',
  'documentId',
  'tokenEnv',
  'syncTimeoutMs',
  'onMissing',
  'bootstrapSettlingMs',
]);

const LIVEBLOCKS_ALLOWED_KEYS = new Set([
  'providerType',
  'roomId',
  'publicApiKey',
  'authEndpoint',
  'authHeadersEnv',
  'syncTimeoutMs',
  'onMissing',
  'bootstrapSettlingMs',
]);

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

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

function parseOnMissing(value: unknown): OnMissing | undefined {
  if (value == null) return undefined;
  if (value !== 'seedFromDoc' && value !== 'blank' && value !== 'error') {
    throw new CliError('VALIDATION_ERROR', 'collaboration.onMissing must be "seedFromDoc", "blank", or "error".');
  }
  return value;
}

function parseSharedFields(raw: Record<string, unknown>): {
  syncTimeoutMs: number | undefined;
  onMissing: OnMissing | undefined;
  bootstrapSettlingMs: number | undefined;
} {
  return {
    syncTimeoutMs: expectOptionalPositiveNumber(raw.syncTimeoutMs, 'collaboration.syncTimeoutMs'),
    onMissing: parseOnMissing(raw.onMissing),
    bootstrapSettlingMs: expectOptionalPositiveNumber(raw.bootstrapSettlingMs, 'collaboration.bootstrapSettlingMs'),
  };
}

function normalizeProviderType(value: unknown, path: string): CollaborationProviderType {
  if (value === 'hocuspocus' || value === 'y-websocket' || value === 'liveblocks') return value;
  throw new CliError('VALIDATION_ERROR', `${path} must be "hocuspocus", "y-websocket", or "liveblocks".`);
}

function rejectUnknownKeys(raw: Record<string, unknown>, allowed: Set<string>): void {
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      throw new CliError('VALIDATION_ERROR', `collaboration.${key} is not supported.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Variant-specific parsers
// ---------------------------------------------------------------------------

function parseWebSocketInput(raw: Record<string, unknown>): WebSocketCollaborationInput {
  rejectUnknownKeys(raw, WEBSOCKET_ALLOWED_KEYS);

  if ('token' in raw) {
    throw new CliError('VALIDATION_ERROR', 'collaboration.token is not supported in v1; use collaboration.tokenEnv.');
  }
  if ('params' in raw) {
    throw new CliError('VALIDATION_ERROR', 'collaboration.params is not supported in v1.');
  }

  const providerType = normalizeProviderType(raw.providerType, 'collaboration.providerType') as WebSocketProviderType;

  return {
    providerType,
    url: expectNonEmptyString(raw.url, 'collaboration.url').trim(),
    documentId: raw.documentId != null ? expectNonEmptyString(raw.documentId, 'collaboration.documentId') : undefined,
    tokenEnv: expectOptionalEnvVarName(raw.tokenEnv, 'collaboration.tokenEnv'),
    ...parseSharedFields(raw),
  };
}

function parseLiveblocksInput(raw: Record<string, unknown>): LiveblocksCollaborationInput {
  // Reject cross-provider fields with specific guidance before the generic unknown-key check
  if ('url' in raw) {
    throw new CliError('VALIDATION_ERROR', 'collaboration.url is not supported for Liveblocks; use roomId.');
  }
  if ('documentId' in raw) {
    throw new CliError('VALIDATION_ERROR', 'collaboration.documentId is not supported for Liveblocks; use roomId.');
  }
  if ('tokenEnv' in raw) {
    throw new CliError('VALIDATION_ERROR', 'collaboration.tokenEnv is not supported for Liveblocks.');
  }
  if ('token' in raw) {
    throw new CliError('VALIDATION_ERROR', 'collaboration.token is not supported in v1.');
  }
  if ('params' in raw) {
    throw new CliError('VALIDATION_ERROR', 'collaboration.params is not supported in v1.');
  }
  if ('headers' in raw) {
    throw new CliError(
      'VALIDATION_ERROR',
      'collaboration.headers is not supported; use authHeadersEnv for custom auth headers.',
    );
  }

  rejectUnknownKeys(raw, LIVEBLOCKS_ALLOWED_KEYS);

  const roomId = expectNonEmptyString(raw.roomId, 'collaboration.roomId');
  const publicApiKey =
    raw.publicApiKey != null ? expectNonEmptyString(raw.publicApiKey, 'collaboration.publicApiKey') : undefined;
  const authEndpoint =
    raw.authEndpoint != null ? expectNonEmptyString(raw.authEndpoint, 'collaboration.authEndpoint') : undefined;
  const authHeadersEnv = expectOptionalEnvVarName(raw.authHeadersEnv, 'collaboration.authHeadersEnv');

  // Exactly one auth mode required
  if (publicApiKey && authEndpoint) {
    throw new CliError('VALIDATION_ERROR', 'collaboration must specify either publicApiKey or authEndpoint, not both.');
  }
  if (!publicApiKey && !authEndpoint) {
    throw new CliError('VALIDATION_ERROR', 'collaboration must specify either publicApiKey or authEndpoint.');
  }

  // authHeadersEnv only valid with authEndpoint
  if (authHeadersEnv && !authEndpoint) {
    throw new CliError('VALIDATION_ERROR', 'collaboration.authHeadersEnv is only valid with authEndpoint.');
  }

  // authEndpoint must be absolute
  if (authEndpoint && !authEndpoint.startsWith('http://') && !authEndpoint.startsWith('https://')) {
    throw new CliError(
      'VALIDATION_ERROR',
      'collaboration.authEndpoint must be an absolute URL (starting with http:// or https://). ' +
        'Relative paths are not supported because the CLI host has no browser origin to resolve them against.',
    );
  }

  return {
    providerType: 'liveblocks',
    roomId,
    publicApiKey,
    authEndpoint,
    authHeadersEnv,
    ...parseSharedFields(raw),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseCollaborationInput(value: unknown): CollaborationInput {
  if (!isRecord(value)) {
    throw new CliError('VALIDATION_ERROR', 'collaboration must be an object.');
  }

  const providerType = normalizeProviderType(value.providerType, 'collaboration.providerType');

  if (providerType === 'liveblocks') {
    return parseLiveblocksInput(value);
  }

  // Reject Liveblocks-only fields on websocket providers
  if ('roomId' in value) {
    throw new CliError(
      'VALIDATION_ERROR',
      'collaboration.roomId is not supported for websocket providers; use documentId.',
    );
  }
  if ('publicApiKey' in value) {
    throw new CliError('VALIDATION_ERROR', 'collaboration.publicApiKey is only supported for Liveblocks.');
  }
  if ('authEndpoint' in value) {
    throw new CliError('VALIDATION_ERROR', 'collaboration.authEndpoint is only supported for Liveblocks.');
  }
  if ('authHeadersEnv' in value) {
    throw new CliError('VALIDATION_ERROR', 'collaboration.authHeadersEnv is only supported for Liveblocks.');
  }

  return parseWebSocketInput(value);
}

export function buildShorthandCollaborationInput(params: {
  url: string;
  documentId?: string;
  onMissing?: string;
  bootstrapSettlingMs?: number;
}): CollaborationInput {
  return parseCollaborationInput({
    providerType: DEFAULT_SHORTHAND_COLLABORATION_PROVIDER_TYPE,
    ...params,
  });
}
