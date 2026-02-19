import type { Dirent } from 'node:fs';
import { copyFile, mkdir, open, readdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir, hostname } from 'node:os';
import { join, resolve } from 'node:path';
import { CliError } from './errors';
import { asRecord, pathExists } from './guards';
import type { CollaborationProfile } from './collaboration';
import { validateSessionId } from './session';
import type { CliIO } from './types';

const CONTEXT_VERSION = 'v1';
const ACTIVE_SESSION_FILENAME = 'active-session';
const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
const LOCK_RETRY_INTERVAL_MS = 50;

export type SourceSnapshot = {
  mtimeMs: number;
  size: number;
  checksum: string;
};

export type SessionType = 'local' | 'collab';

export type ContextMetadata = {
  contextId: string;
  projectRoot: string;
  source: 'path' | 'stdin';
  sourcePath?: string;
  workingDocPath: string;
  dirty: boolean;
  revision: number;
  sessionType: SessionType;
  collaboration?: CollaborationProfile;
  openedAt: string;
  updatedAt: string;
  lastSavedAt?: string;
  sourceSnapshot?: SourceSnapshot;
};

export type ContextPaths = {
  stateRoot: string;
  contextDir: string;
  metadataPath: string;
  workingDocPath: string;
  lockPath: string;
};

export type ProjectSessionSummary = {
  sessionId: string;
  source: 'path' | 'stdin';
  sourcePath?: string;
  dirty: boolean;
  revision: number;
  sessionType: SessionType;
  collaboration?: CollaborationProfile;
  openedAt: string;
  updatedAt: string;
  lastSavedAt?: string;
};

type ProjectPaths = {
  projectHash: string;
  projectDir: string;
  activeSessionPath: string;
};

type LockMetadata = {
  pid: number;
  hostname: string;
  startedAt: string;
  projectRoot: string;
  command: string;
};

function getStateRoot(): string {
  const override = process.env.SUPERDOC_CLI_STATE_DIR;
  if (override && override.length > 0) {
    return resolve(override);
  }

  return join(homedir(), '.superdoc-cli', 'state', CONTEXT_VERSION);
}

export function getContextPaths(contextId: string): ContextPaths {
  const normalizedContextId = validateSessionId(contextId, 'session id');
  const stateRoot = getStateRoot();
  const contextDir = join(stateRoot, 'contexts', normalizedContextId);

  return {
    stateRoot,
    contextDir,
    metadataPath: join(contextDir, 'metadata.json'),
    workingDocPath: join(contextDir, 'working.docx'),
    lockPath: join(contextDir, 'lock'),
  };
}

export function getProjectRoot(): string {
  return resolve(process.cwd());
}

function getProjectPaths(projectRoot = getProjectRoot()): ProjectPaths {
  const stateRoot = getStateRoot();
  const projectHash = createHash('sha256').update(projectRoot).digest('hex').slice(0, 16);
  const projectDir = join(stateRoot, 'projects', projectHash);

  return {
    projectHash,
    projectDir,
    activeSessionPath: join(projectDir, ACTIVE_SESSION_FILENAME),
  };
}

function nowIso(io: CliIO): string {
  return new Date(io.now()).toISOString();
}

function normalizeSessionType(value: unknown): SessionType {
  if (value === 'collab') return 'collab';
  return 'local';
}

function normalizeCollaborationProfile(value: unknown): CollaborationProfile | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  const providerType = record.providerType;
  const url = record.url;
  const documentId = record.documentId;
  const tokenEnv = record.tokenEnv;
  const syncTimeoutMs = record.syncTimeoutMs;

  if (providerType !== 'hocuspocus' && providerType !== 'y-websocket') return undefined;
  if (typeof url !== 'string' || url.length === 0) return undefined;
  if (typeof documentId !== 'string' || documentId.length === 0) return undefined;
  if (tokenEnv != null && (typeof tokenEnv !== 'string' || tokenEnv.length === 0)) return undefined;
  if (
    syncTimeoutMs != null &&
    (typeof syncTimeoutMs !== 'number' || !Number.isFinite(syncTimeoutMs) || syncTimeoutMs <= 0)
  ) {
    return undefined;
  }

  return {
    providerType,
    url,
    documentId,
    tokenEnv: typeof tokenEnv === 'string' ? tokenEnv : undefined,
    syncTimeoutMs: typeof syncTimeoutMs === 'number' ? syncTimeoutMs : undefined,
  };
}

function normalizeContextMetadata(metadata: ContextMetadata): ContextMetadata {
  const sessionType = normalizeSessionType(metadata.sessionType);
  const collaboration = normalizeCollaborationProfile(metadata.collaboration);

  if (sessionType === 'collab' && collaboration) {
    return {
      ...metadata,
      sessionType,
      collaboration,
    };
  }

  return {
    ...metadata,
    sessionType: 'local',
    collaboration: undefined,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

function isLockAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ESRCH') return false;
    if (code === 'EPERM') return true;
    return true;
  }
}

async function readLockMetadata(lockPath: string): Promise<LockMetadata | null> {
  let raw: string;
  try {
    raw = await readFile(lockPath, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ENOENT') return null;
    throw new CliError('FILE_READ_ERROR', `Could not read context lock file: ${lockPath}`, {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const parsed = JSON.parse(raw) as LockMetadata;
    if (typeof parsed?.pid !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeLockMetadata(lockPath: string, metadata: LockMetadata): Promise<void> {
  try {
    const handle = await open(lockPath, 'wx');
    try {
      await handle.writeFile(`${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
    } finally {
      await handle.close();
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'EEXIST') {
      throw new CliError('CONTEXT_LOCK_TIMEOUT', 'Context lock already exists.', {
        lockPath,
      });
    }

    throw new CliError('FILE_WRITE_ERROR', `Could not acquire context lock: ${lockPath}`, {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function tryRemoveLock(lockPath: string): Promise<void> {
  try {
    await unlink(lockPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ENOENT') return;
    throw new CliError('FILE_WRITE_ERROR', `Could not release context lock: ${lockPath}`, {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function assertProjectMatch(metadata: ContextMetadata): void {
  const currentProjectRoot = getProjectRoot();
  if (metadata.projectRoot === currentProjectRoot) return;

  throw new CliError(
    'PROJECT_CONTEXT_MISMATCH',
    'Active context belongs to a different project root than the current working directory.',
    {
      expectedProjectRoot: metadata.projectRoot,
      actualProjectRoot: currentProjectRoot,
    },
  );
}

async function writeAtomic(path: string, content: string): Promise<void> {
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, content, 'utf8');
  await rename(tempPath, path);
}

export async function getActiveSessionId(projectRoot = getProjectRoot()): Promise<string | null> {
  const paths = getProjectPaths(projectRoot);
  let raw: string;
  try {
    raw = await readFile(paths.activeSessionPath, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ENOENT') return null;
    throw new CliError('FILE_READ_ERROR', `Unable to read active session pointer: ${paths.activeSessionPath}`, {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const sessionId = raw.trim();
  if (!sessionId) return null;

  try {
    return validateSessionId(sessionId, 'active session id');
  } catch (error) {
    if (error instanceof CliError) {
      return null;
    }
    throw error;
  }
}

export async function setActiveSessionId(sessionId: string, projectRoot = getProjectRoot()): Promise<void> {
  const normalizedSessionId = validateSessionId(sessionId, 'session id');
  const paths = getProjectPaths(projectRoot);
  await mkdir(paths.projectDir, { recursive: true });

  try {
    await writeAtomic(paths.activeSessionPath, `${normalizedSessionId}\n`);
  } catch (error) {
    throw new CliError('FILE_WRITE_ERROR', `Unable to write active session pointer: ${paths.activeSessionPath}`, {
      message: error instanceof Error ? error.message : String(error),
      projectHash: paths.projectHash,
    });
  }
}

export async function clearActiveSessionId(projectRoot = getProjectRoot()): Promise<void> {
  const paths = getProjectPaths(projectRoot);
  try {
    await unlink(paths.activeSessionPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ENOENT') return;
    throw new CliError('FILE_WRITE_ERROR', `Unable to clear active session pointer: ${paths.activeSessionPath}`, {
      message: error instanceof Error ? error.message : String(error),
      projectHash: paths.projectHash,
    });
  }
}

export async function withContextLock<T>(
  io: CliIO,
  command: string,
  action: (paths: ContextPaths) => Promise<T>,
  timeoutMs = DEFAULT_LOCK_TIMEOUT_MS,
  contextId?: string,
): Promise<T> {
  const resolvedContextId = contextId ?? 'default';
  const paths = getContextPaths(resolvedContextId);
  await mkdir(paths.contextDir, { recursive: true });

  const startedAt = io.now();
  const lockMetadata: LockMetadata = {
    pid: process.pid,
    hostname: hostname(),
    startedAt: nowIso(io),
    projectRoot: getProjectRoot(),
    command,
  };

  let acquired = false;

  while (!acquired) {
    try {
      await writeLockMetadata(paths.lockPath, lockMetadata);
      acquired = true;
      break;
    } catch (error) {
      if (!(error instanceof CliError) || error.code !== 'CONTEXT_LOCK_TIMEOUT') {
        throw error;
      }

      const owner = await readLockMetadata(paths.lockPath);
      const ownerAlive = owner ? isLockAlive(owner.pid) : false;

      if (!ownerAlive) {
        await tryRemoveLock(paths.lockPath);
        continue;
      }

      if (io.now() - startedAt >= timeoutMs) {
        throw new CliError('CONTEXT_LOCK_TIMEOUT', `Timed out waiting for context lock after ${timeoutMs}ms.`, {
          timeoutMs,
          lockPath: paths.lockPath,
          owner,
        });
      }

      await sleep(LOCK_RETRY_INTERVAL_MS);
    }
  }

  try {
    return await action(paths);
  } finally {
    if (acquired) {
      await tryRemoveLock(paths.lockPath);
    }
  }
}

export async function readContextMetadata(paths: ContextPaths): Promise<ContextMetadata | null> {
  let raw: string;
  try {
    raw = await readFile(paths.metadataPath, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ENOENT') return null;

    throw new CliError('FILE_READ_ERROR', `Unable to read active context metadata: ${paths.metadataPath}`, {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const parsed = JSON.parse(raw) as ContextMetadata;
    return normalizeContextMetadata(parsed);
  } catch (error) {
    throw new CliError('JSON_PARSE_ERROR', `Active context metadata is invalid JSON: ${paths.metadataPath}`, {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function writeContextMetadata(paths: ContextPaths, metadata: ContextMetadata): Promise<void> {
  await mkdir(paths.contextDir, { recursive: true });

  try {
    await writeFile(paths.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  } catch (error) {
    throw new CliError('FILE_WRITE_ERROR', `Unable to write active context metadata: ${paths.metadataPath}`, {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function readContextMetadataById(contextId: string): Promise<ContextMetadata | null> {
  const paths = getContextPaths(contextId);
  return readContextMetadata(paths);
}

export async function listProjectSessions(): Promise<ProjectSessionSummary[]> {
  const stateRoot = getStateRoot();
  const contextsDir = join(stateRoot, 'contexts');
  const projectRoot = getProjectRoot();

  let entries: Dirent[] = [];
  try {
    entries = await readdir(contextsDir, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ENOENT') return [];
    throw new CliError('FILE_READ_ERROR', `Unable to read sessions directory: ${contextsDir}`, {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const sessions: ProjectSessionSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sessionId = entry.name;
    let metadata: ContextMetadata | null = null;

    try {
      metadata = await readContextMetadataById(sessionId);
    } catch {
      continue;
    }

    if (!metadata) continue;
    if (metadata.projectRoot !== projectRoot) continue;

    sessions.push({
      sessionId: metadata.contextId,
      source: metadata.source,
      sourcePath: metadata.sourcePath,
      dirty: metadata.dirty,
      revision: metadata.revision,
      sessionType: metadata.sessionType,
      collaboration: metadata.collaboration,
      openedAt: metadata.openedAt,
      updatedAt: metadata.updatedAt,
      lastSavedAt: metadata.lastSavedAt,
    });
  }

  sessions.sort((a, b) => {
    if (a.updatedAt === b.updatedAt) {
      return a.sessionId.localeCompare(b.sessionId);
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  return sessions;
}

export async function ensureSessionExistsForProject(sessionId: string): Promise<ContextMetadata> {
  const metadata = await readContextMetadataById(sessionId);
  if (!metadata) {
    throw new CliError('SESSION_NOT_FOUND', `Session not found: ${sessionId}`, {
      sessionId,
    });
  }

  if (metadata.projectRoot !== getProjectRoot()) {
    throw new CliError('SESSION_NOT_FOUND', `Session not found in this project: ${sessionId}`, {
      sessionId,
    });
  }

  return metadata;
}

export async function clearContext(paths: ContextPaths): Promise<void> {
  await rm(paths.contextDir, { recursive: true, force: true });
}

export async function withActiveContext<T>(
  io: CliIO,
  command: string,
  action: (state: { metadata: ContextMetadata; paths: ContextPaths }) => Promise<T>,
  contextId?: string,
): Promise<T> {
  const resolvedContextId = contextId ?? (await getActiveSessionId());
  if (!resolvedContextId) {
    throw new CliError('NO_ACTIVE_DOCUMENT', 'No active document. Run "superdoc open <doc>" first.');
  }

  return withContextLock(
    io,
    command,
    async (paths) => {
      const metadata = await readContextMetadata(paths);
      if (!metadata) {
        throw new CliError('NO_ACTIVE_DOCUMENT', 'No active document. Run "superdoc open <doc>" first.');
      }

      assertProjectMatch(metadata);

      return action({ metadata, paths });
    },
    DEFAULT_LOCK_TIMEOUT_MS,
    resolvedContextId,
  );
}

export function resolveSourcePathForMetadata(docArg: string): string {
  return resolve(getProjectRoot(), docArg);
}

export async function snapshotSourceFile(path: string): Promise<SourceSnapshot> {
  let bytes: Uint8Array;
  let sourceStat: Awaited<ReturnType<typeof stat>>;

  try {
    const buffer = await readFile(path);
    bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    sourceStat = await stat(path);
  } catch (error) {
    throw new CliError('FILE_READ_ERROR', `Unable to read source file snapshot: ${path}`, {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const checksum = createHash('sha256').update(bytes).digest('hex');
  return {
    mtimeMs: sourceStat.mtimeMs,
    size: sourceStat.size,
    checksum,
  };
}

export async function detectSourceDrift(metadata: ContextMetadata): Promise<{
  drifted: boolean;
  expected?: SourceSnapshot;
  actual?: SourceSnapshot;
  reason?: string;
}> {
  if (metadata.source !== 'path' || !metadata.sourcePath || !metadata.sourceSnapshot) {
    return { drifted: false };
  }

  if (!(await pathExists(metadata.sourcePath))) {
    return {
      drifted: true,
      expected: metadata.sourceSnapshot,
      reason: 'SOURCE_MISSING',
    };
  }

  const actual = await snapshotSourceFile(metadata.sourcePath);
  const expected = metadata.sourceSnapshot;
  const drifted =
    actual.mtimeMs !== expected.mtimeMs || actual.size !== expected.size || actual.checksum !== expected.checksum;

  return {
    drifted,
    expected,
    actual,
  };
}

export async function copyWorkingDocumentToPath(
  paths: ContextPaths,
  outputPath: string,
  force = false,
): Promise<{ path: string; byteLength: number }> {
  const exists = await pathExists(outputPath);
  if (exists && !force) {
    throw new CliError('OUTPUT_EXISTS', `Output path already exists: ${outputPath}`, {
      path: outputPath,
      hint: 'Use --force to overwrite.',
    });
  }

  try {
    await copyFile(paths.workingDocPath, outputPath);
  } catch (error) {
    throw new CliError('FILE_WRITE_ERROR', `Failed to write output file: ${outputPath}`, {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const outputStat = await stat(outputPath);
  return {
    path: outputPath,
    byteLength: outputStat.size,
  };
}

export async function getWorkingDocumentSize(paths: ContextPaths): Promise<number> {
  try {
    const info = await stat(paths.workingDocPath);
    return info.size;
  } catch (error) {
    throw new CliError('FILE_READ_ERROR', `Failed to read working document: ${paths.workingDocPath}`, {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export function markContextUpdated(
  io: CliIO,
  metadata: ContextMetadata,
  patch: Partial<ContextMetadata>,
): ContextMetadata {
  return {
    ...metadata,
    ...patch,
    updatedAt: nowIso(io),
  };
}

export function assertExpectedRevision(metadata: ContextMetadata, expectedRevision: number | undefined): void {
  if (expectedRevision == null) return;
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new CliError('VALIDATION_ERROR', '--expected-revision must be a non-negative integer.');
  }

  if (metadata.revision !== expectedRevision) {
    throw new CliError('REVISION_MISMATCH', 'Document revision did not match --expected-revision.', {
      expectedRevision,
      actualRevision: metadata.revision,
    });
  }
}

export function createInitialContextMetadata(
  io: CliIO,
  paths: ContextPaths,
  contextId: string,
  input: {
    source: 'path' | 'stdin';
    sourcePath?: string;
    sourceSnapshot?: SourceSnapshot;
    sessionType?: SessionType;
    collaboration?: CollaborationProfile;
  },
): ContextMetadata {
  const timestamp = nowIso(io);
  const sessionType = input.sessionType ?? 'local';

  return {
    contextId,
    projectRoot: getProjectRoot(),
    source: input.source,
    sourcePath: input.sourcePath,
    workingDocPath: paths.workingDocPath,
    dirty: false,
    revision: 0,
    sessionType,
    collaboration: sessionType === 'collab' ? input.collaboration : undefined,
    openedAt: timestamp,
    updatedAt: timestamp,
    sourceSnapshot: input.sourceSnapshot,
  };
}
