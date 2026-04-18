import { access, copyFile, mkdir, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach } from 'vitest';
import { createSuperDocClient, type SuperDocClient, type SuperDocClientOptions } from '@superdoc-dev/sdk';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const STORIES_ROOT = path.resolve(import.meta.dirname, '..');
const CLI_DIST_BIN = path.join(REPO_ROOT, 'apps/cli/dist/index.js');
const CLI_SRC_BIN = path.join(REPO_ROOT, 'apps/cli/src/index.ts');
const execFileAsync = promisify(execFile);

interface CliInvocation {
  command: string;
  prefixArgs: string[];
}

type HandleDoc = Awaited<ReturnType<SuperDocClient['open']>>;

export interface LegacyStoryClient {
  doc: any;
  connect(): Promise<void>;
  dispose(): Promise<void>;
  describe(params?: Record<string, unknown>): Promise<unknown>;
  describeCommand(params: Record<string, unknown>): Promise<unknown>;
}

function resolveInvocation(cliBin: string): CliInvocation {
  if (cliBin.toLowerCase().endsWith('.js')) {
    return { command: 'node', prefixArgs: [cliBin] };
  }
  if (cliBin.toLowerCase().endsWith('.ts')) {
    return { command: 'bun', prefixArgs: [cliBin] };
  }
  return { command: cliBin, prefixArgs: [] };
}

function parseJsonEnvelope(stdout: string, stderr: string): any {
  const sources = [stdout.trim(), stderr.trim()].filter((source) => source.length > 0);
  if (sources.length === 0) {
    throw new Error('No CLI JSON envelope output found.');
  }

  for (const source of sources) {
    try {
      return JSON.parse(source);
    } catch {
      const lines = source.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        const candidate = lines.slice(index).join('\n').trim();
        if (!candidate.startsWith('{')) continue;
        try {
          return JSON.parse(candidate);
        } catch {
          // continue scanning
        }
      }
    }
  }

  throw new Error(`Failed to parse CLI JSON envelope:\n${sources.join('\n')}`);
}

/** Resolve a test-corpus relative path to its absolute location. */
export function corpusDoc(relativePath: string): string {
  return path.join(REPO_ROOT, 'test-corpus', relativePath);
}

export function unwrap<T>(payload: any): T {
  return payload?.result ?? payload?.undefined ?? payload;
}

export interface StoryContext {
  client: LegacyStoryClient;
  resultsDir: string;
  /** Copy a source doc into the results dir and return its path. */
  copyDoc(source: string, name?: string): Promise<string>;
  /** Return a path inside the results dir. */
  outPath(name: string): string;
  /** Run a raw CLI command with the story's state dir and parse the JSON envelope. */
  runCli(args: string[], options?: { allowError?: boolean }): Promise<any>;
  /** Create a real bound-handle SDK client that shares this story's CLI state dir. */
  createHandleClient(options?: SuperDocClientOptions): Promise<SuperDocClient>;
}

export interface StoryHarnessOptions {
  /**
   * Keep prior test outputs in the story results directory.
   * When true, the directory is cleaned once (first test setup) instead of before every test.
   */
  preserveResults?: boolean;
  /** Optional SDK client configuration for this story harness. */
  clientOptions?: SuperDocClientOptions;
  /** Choose which CLI binary the harness should use. */
  cliBinMode?: 'auto' | 'dist' | 'source';
}

export function useStoryHarness(storyName: string, options: StoryHarnessOptions = {}): StoryContext {
  let ctx: StoryContext | null = null;
  let hasPreparedResultsDir = false;
  const preserveResults = options.preserveResults ?? false;
  const clientOptions = options.clientOptions ?? {};
  const cliBinMode = options.cliBinMode ?? 'auto';

  beforeEach(async () => {
    const resultsDir = path.join(STORIES_ROOT, 'results', storyName);
    if (!preserveResults || !hasPreparedResultsDir) {
      await rm(resultsDir, { recursive: true, force: true });
      hasPreparedResultsDir = true;
    }
    await mkdir(resultsDir, { recursive: true });

    const cliBin =
      cliBinMode === 'source'
        ? CLI_SRC_BIN
        : cliBinMode === 'dist'
          ? CLI_DIST_BIN
          : await access(CLI_DIST_BIN).then(
              () => CLI_DIST_BIN,
              () => CLI_SRC_BIN,
            );
    const stateDir = path.join(resultsDir, '.superdoc-cli-state');

    const clients: SuperDocClient[] = [];
    const baseHandles = new Map<string, HandleDoc>();

    const createHandleClient = async (overrideOptions: SuperDocClientOptions = {}): Promise<SuperDocClient> => {
      const client = createSuperDocClient({
        requestTimeoutMs: 30_000,
        startupTimeoutMs: 30_000,
        shutdownTimeoutMs: 30_000,
        ...clientOptions,
        ...overrideOptions,
        env: {
          ...clientOptions.env,
          ...overrideOptions.env,
          SUPERDOC_CLI_BIN: cliBin,
          SUPERDOC_CLI_STATE_DIR: stateDir,
        },
      });

      await client.connect();
      clients.push(client);
      return client;
    };

    const baseClient = await createHandleClient();
    const client = createLegacyStoryClient(baseClient, baseHandles);

    ctx = {
      client,
      resultsDir,
      copyDoc: async (source, name = 'source.docx') => {
        const dest = path.join(resultsDir, name);
        await copyFile(source, dest);
        return dest;
      },
      outPath: (name) => path.join(resultsDir, name),
      runCli: async (args, options = {}) => {
        const invocation = resolveInvocation(cliBin);
        const argv = [...invocation.prefixArgs, ...args, '--output', 'json'];
        let stdout = '';
        let stderr = '';

        try {
          const executed = await execFileAsync(invocation.command, argv, {
            cwd: REPO_ROOT,
            env: {
              ...process.env,
              SUPERDOC_CLI_STATE_DIR: stateDir,
            },
          });
          stdout = executed.stdout;
          stderr = executed.stderr;
        } catch (error) {
          const failed = error as { stdout?: string; stderr?: string };
          stdout = failed.stdout ?? '';
          stderr = failed.stderr ?? '';
        }

        const envelope = parseJsonEnvelope(stdout, stderr);
        if (envelope?.ok === false && options.allowError !== true) {
          const code = envelope.error?.code ?? 'UNKNOWN';
          const message = envelope.error?.message ?? 'Unknown CLI error';
          throw new Error(`${code}: ${message}`);
        }
        return envelope;
      },
      createHandleClient,
    };

    Object.defineProperty(ctx, '__storyClients', {
      value: clients,
      enumerable: false,
      configurable: true,
    });
    Object.defineProperty(ctx, '__baseHandles', {
      value: baseHandles,
      enumerable: false,
      configurable: true,
    });
  });

  afterEach(async () => {
    if (!ctx) return;

    const internalCtx = ctx as StoryContext & {
      __storyClients?: SuperDocClient[];
      __baseHandles?: Map<string, HandleDoc>;
    };

    for (const handle of internalCtx.__baseHandles?.values() ?? []) {
      await handle.close({ discard: true }).catch(() => {});
    }

    for (const client of internalCtx.__storyClients ?? []) {
      await client.dispose().catch(() => {});
    }

    ctx = null;
  });

  const requireCtx = (): StoryContext => {
    if (!ctx) {
      throw new Error('Story harness is not initialized. Access it inside a test lifecycle hook.');
    }
    return ctx;
  };

  const clientProxy = new Proxy({} as SuperDocClient, {
    get: (_target, prop) => (requireCtx().client as any)[prop],
  });

  const api = {
    client: clientProxy,
    copyDoc: (source: string, name?: string) => requireCtx().copyDoc(source, name),
    outPath: (name: string) => requireCtx().outPath(name),
    runCli: (args: string[], options?: { allowError?: boolean }) => requireCtx().runCli(args, options),
    createHandleClient: (clientOptions?: SuperDocClientOptions) => requireCtx().createHandleClient(clientOptions),
  } as StoryContext;

  Object.defineProperty(api, 'resultsDir', {
    get: () => requireCtx().resultsDir,
  });

  return api;
}

function createLegacyStoryClient(client: SuperDocClient, handles: Map<string, HandleDoc>): LegacyStoryClient {
  return {
    doc: createLegacyDocProxy(client, handles),
    connect: () => client.connect(),
    dispose: () => client.dispose(),
    describe: (params) => client.describe(params),
    describeCommand: (params) => client.describeCommand(params),
  };
}

function createLegacyDocProxy(client: SuperDocClient, handles: Map<string, HandleDoc>, pathTokens: string[] = []): any {
  return new Proxy(() => {}, {
    get: (_target, prop) => {
      if (typeof prop !== 'string') return undefined;
      if (prop === 'then') return undefined;
      return createLegacyDocProxy(client, handles, [...pathTokens, prop]);
    },
    apply: async (_target, _thisArg, argArray) => {
      const [params = {}, invokeOptions] = argArray as [unknown?, unknown?];
      if (pathTokens.length === 0) {
        throw new Error('Legacy story client invoked with no operation path.');
      }

      const operationPath = pathTokens.join('.');
      if (operationPath === 'open') {
        const handle = await client.open(asParamsRecord(params, operationPath));
        handles.set(handle.sessionId, handle);
        return handle.openResult;
      }

      const { sessionId, payload } = splitSessionParams(params, operationPath);
      const handle = resolveHandle(handles, sessionId, operationPath);

      if (operationPath === 'close') {
        const result = await handle.close(payload, invokeOptions as any);
        handles.delete(handle.sessionId);
        return result;
      }

      const method = resolveHandleMethod(handle, pathTokens, operationPath);
      return method(payload, invokeOptions);
    },
  });
}

function asParamsRecord(params: unknown, operationPath: string): Record<string, unknown> {
  if (params == null) return {};
  if (typeof params !== 'object' || Array.isArray(params)) {
    throw new Error(`doc.${operationPath} expected an object params payload.`);
  }
  return params as Record<string, unknown>;
}

function splitSessionParams(
  params: unknown,
  operationPath: string,
): {
  sessionId: string | undefined;
  payload: Record<string, unknown>;
} {
  const payload = asParamsRecord(params, operationPath);
  const { sessionId, ...rest } = payload;
  return {
    sessionId: typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : undefined,
    payload: rest,
  };
}

function resolveHandle(
  handles: Map<string, HandleDoc>,
  sessionId: string | undefined,
  operationPath: string,
): HandleDoc {
  if (sessionId != null) {
    const handle = handles.get(sessionId);
    if (handle) return handle;
    throw new Error(`doc.${operationPath} could not find an open handle for session "${sessionId}".`);
  }

  if (handles.size === 1) {
    return handles.values().next().value as HandleDoc;
  }

  throw new Error(`doc.${operationPath} requires an explicit sessionId in the story harness.`);
}

function resolveHandleMethod(
  handle: HandleDoc,
  pathTokens: string[],
  operationPath: string,
): (...args: unknown[]) => unknown {
  let cursor: unknown = handle;
  let parent: unknown = handle;

  for (const token of pathTokens) {
    parent = cursor;
    cursor = (cursor as Record<string, unknown> | undefined)?.[token];
  }

  if (typeof cursor !== 'function') {
    throw new Error(`doc.${operationPath} is not available on the bound document handle.`);
  }

  return cursor.bind(parent);
}
