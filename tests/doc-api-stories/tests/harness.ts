import { access, copyFile, mkdir, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach } from 'vitest';
import { createSuperDocClient, type SuperDocClient } from '@superdoc-dev/sdk';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const STORIES_ROOT = path.resolve(import.meta.dirname, '..');
const CLI_DIST_BIN = path.join(REPO_ROOT, 'apps/cli/dist/index.js');
const CLI_SRC_BIN = path.join(REPO_ROOT, 'apps/cli/src/index.ts');
const execFileAsync = promisify(execFile);

interface CliInvocation {
  command: string;
  prefixArgs: string[];
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
  client: SuperDocClient;
  resultsDir: string;
  /** Copy a source doc into the results dir and return its path. */
  copyDoc(source: string, name?: string): Promise<string>;
  /** Return a path inside the results dir. */
  outPath(name: string): string;
  /** Run a raw CLI command with the story's state dir and parse the JSON envelope. */
  runCli(args: string[], options?: { allowError?: boolean }): Promise<any>;
}

export interface StoryHarnessOptions {
  /**
   * Keep prior test outputs in the story results directory.
   * When true, the directory is cleaned once (first test setup) instead of before every test.
   */
  preserveResults?: boolean;
}

export function useStoryHarness(storyName: string, options: StoryHarnessOptions = {}): StoryContext {
  const sessionIds: string[] = [];
  let ctx: StoryContext | null = null;
  let hasPreparedResultsDir = false;
  const preserveResults = options.preserveResults ?? false;

  const original = {
    open: undefined as any,
  };

  beforeEach(async () => {
    const resultsDir = path.join(STORIES_ROOT, 'results', storyName);
    if (!preserveResults || !hasPreparedResultsDir) {
      await rm(resultsDir, { recursive: true, force: true });
      hasPreparedResultsDir = true;
    }
    await mkdir(resultsDir, { recursive: true });

    const cliBin = await access(CLI_DIST_BIN).then(
      () => CLI_DIST_BIN,
      () => CLI_SRC_BIN,
    );
    const stateDir = path.join(resultsDir, '.superdoc-cli-state');

    const client = createSuperDocClient({
      env: {
        SUPERDOC_CLI_BIN: cliBin,
        SUPERDOC_CLI_STATE_DIR: stateDir,
      },
      requestTimeoutMs: 30_000,
      startupTimeoutMs: 30_000,
      shutdownTimeoutMs: 30_000,
    });

    await client.connect();

    // Track opened sessions for cleanup
    original.open = client.doc.open.bind(client.doc);
    client.doc.open = async (args: any) => {
      const result = await original.open(args);
      if (args.sessionId) sessionIds.push(args.sessionId);
      return result;
    };

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
    };
  });

  afterEach(async () => {
    if (!ctx) return;
    for (const sid of sessionIds.splice(0)) {
      await ctx.client.doc.close({ sessionId: sid, discard: true }).catch(() => {});
    }
    await ctx.client.dispose();
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
  } as StoryContext;

  Object.defineProperty(api, 'resultsDir', {
    get: () => requireCtx().resultsDir,
  });

  return api;
}
