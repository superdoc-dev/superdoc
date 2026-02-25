import { access, copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import { createSuperDocClient, type SuperDocClient } from '@superdoc-dev/sdk';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const STORIES_ROOT = path.resolve(import.meta.dirname, '..');
const CLI_DIST_BIN = path.join(REPO_ROOT, 'apps/cli/dist/index.js');
const CLI_SRC_BIN = path.join(REPO_ROOT, 'apps/cli/src/index.ts');

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

    const client = createSuperDocClient({
      env: {
        SUPERDOC_CLI_BIN: cliBin,
        SUPERDOC_CLI_STATE_DIR: path.join(resultsDir, '.superdoc-cli-state'),
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
  } as StoryContext;

  Object.defineProperty(api, 'resultsDir', {
    get: () => requireCtx().resultsDir,
  });

  return api;
}
