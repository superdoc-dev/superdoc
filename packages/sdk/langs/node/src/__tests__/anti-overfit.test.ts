/**
 * Anti-overfit gates.
 *
 * Product code must not depend on eval IDs, fixture names, benchmark
 * descriptions, or test metadata. Benchmark-only routing must not appear in
 * product-default routing surfaces. These gates run as unit tests so a
 * regression is loud and immediate.
 */
import { describe, expect, test } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BENCHMARK_PROFILES, PRODUCT_DEFAULT_PROFILE, resolveProductToolsetProfile } from '../tool-capabilities.ts';
import { OPERATION_CATALOG } from '../agent/operation-catalog.ts';
import { validatePlan, type AgentPlan } from '../agent/ir.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '..');
const AGENT_DIR = join(SRC_DIR, 'agent');

const PRODUCT_FILES = ['agent', 'index.ts', 'tools.ts', 'tool-capabilities.ts', 'runtime'];

/**
 * Patterns that indicate product code is depending on eval IDs, fixture
 * names, or test metadata. Linear ticket references inside code comments are
 * not eval overfit and are filtered separately.
 */
const EVAL_ID_PATTERNS: readonly RegExp[] = [
  /\bpp-[a-z0-9-]+\b/, // promptfoo-shaped IDs e.g. pp-product-proof-...
  /\beval-id:[a-z0-9-]+\b/i,
  /\bfixture:[a-z0-9-]+\b/i,
  /\b(?:eval|benchmark)Fixture(?:Name|Id)\b/,
];

// Stable benchmark substring rules that historically appeared in product
// routing. The product router must no longer mention them in product paths.
const BENCHMARK_SUBSTRING_RULES: readonly string[] = [
  'high liability',
  'risk for our side',
  'risk for the company',
  'risk for the client',
  'clauses that create risk',
  'clauses that create liability',
  'style must be preserved',
  'styled template',
  'paste this content below',
  'paste content below',
  'long numbered list',
  'large numbered list',
];

async function readProductSources(): Promise<Array<{ path: string; content: string }>> {
  const files: Array<{ path: string; content: string }> = [];
  async function walk(dir: string): Promise<void> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'generated' || entry.name === 'workflow-poc') continue;
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        const content = await readFile(full, 'utf8');
        files.push({ path: full, content });
      }
    }
  }
  for (const root of PRODUCT_FILES) {
    const full = join(SRC_DIR, root);
    try {
      const stat = await readFile(full, 'utf8');
      files.push({ path: full, content: stat });
    } catch {
      await walk(full);
    }
  }
  return files;
}

describe('anti-overfit gates', () => {
  test('product router always returns the clean product profile', () => {
    const tasks = [
      'replace text',
      'add comments to clauses with high liability for our side',
      'insert a Heading 2 with the styled template',
      'create a 30 item numbered list',
      'unrelated request',
      '',
    ];
    for (const task of tasks) {
      const decision = resolveProductToolsetProfile({ task });
      expect(decision.profile).toBe(PRODUCT_DEFAULT_PROFILE);
      expect(BENCHMARK_PROFILES.has(decision.profile)).toBe(false);
    }
  });

  test('product source files do not reference eval IDs, ticket numbers, or fixture names', async () => {
    const sources = await readProductSources();
    expect(sources.length).toBeGreaterThan(0);
    for (const { path, content } of sources) {
      for (const pattern of EVAL_ID_PATTERNS) {
        if (pattern.test(content)) {
          throw new Error(`Eval/fixture ID leaked into product source: ${path} matches ${pattern}`);
        }
      }
    }
  });

  test('agent runtime does not use benchmark substring rules', async () => {
    const sources = await readProductSources();
    const agentSources = sources.filter((s) => s.path.includes('/agent/'));
    expect(agentSources.length).toBeGreaterThan(0);
    for (const { path, content } of agentSources) {
      const lower = content.toLowerCase();
      for (const rule of BENCHMARK_SUBSTRING_RULES) {
        if (lower.includes(rule.toLowerCase())) {
          throw new Error(`Benchmark substring rule "${rule}" leaked into agent source: ${path}`);
        }
      }
    }
  });

  test('benchmark profiles are explicitly quarantined', () => {
    for (const profile of BENCHMARK_PROFILES) {
      expect(profile).not.toBe(PRODUCT_DEFAULT_PROFILE);
    }
  });

  test('IR validator rejects unknown operations', () => {
    const plan: AgentPlan = {
      intent: 'unknown',
      steps: [{ kind: 'apply', operationId: 'doc.unknown.thing', args: {} }],
    };
    const result = validatePlan(plan);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'UNKNOWN_OPERATION')).toBe(true);
  });

  test('IR validator rejects mutating plans without a verify step', () => {
    const plan: AgentPlan = {
      intent: 'replace text',
      steps: [{ kind: 'apply', operationId: 'doc.replace', args: { find: 'a', replace: 'b' } }],
    };
    const result = validatePlan(plan);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'MISSING_VERIFY_STEP')).toBe(true);
  });

  test('IR validator rejects reserved arg keys', () => {
    const plan: AgentPlan = {
      intent: 'replace text',
      steps: [
        {
          kind: 'apply',
          operationId: 'doc.replace',
          args: { find: 'a', replace: 'b', sessionId: 'leak' },
        },
        { kind: 'verify', checks: [{ kind: 'revision-changed' }] },
      ],
    };
    const result = validatePlan(plan);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'RESERVED_ARG_KEY')).toBe(true);
  });

  test('IR validator accepts a well-formed mutating plan', () => {
    const plan: AgentPlan = {
      intent: 'replace text',
      steps: [
        { kind: 'inspect', operationId: 'doc.info', args: {} },
        { kind: 'apply', operationId: 'doc.replace', args: { find: 'old', replace: 'new' } },
        { kind: 'verify', checks: [{ kind: 'revision-changed' }] },
      ],
    };
    const result = validatePlan(plan);
    expect(result.ok).toBe(true);
    expect(result.references.length).toBeGreaterThanOrEqual(2);
  });

  test('operation catalog covers core agent verbs', () => {
    const ids = new Set(OPERATION_CATALOG.map((e) => e.operationId));
    for (const id of ['doc.info', 'doc.blocks.list', 'doc.replace', 'doc.comments.create', 'doc.lists.insert']) {
      expect(ids.has(id)).toBe(true);
    }
  });
});
