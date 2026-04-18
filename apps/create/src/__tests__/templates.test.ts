import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectFramework, generateAgentsMd, type DetectedFramework } from '../templates';

describe('detectFramework', () => {
  let testDir: string;

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function createDir(deps: Record<string, string> = {}, devDeps: Record<string, string> = {}): string {
    testDir = mkdtempSync(join(tmpdir(), 'superdoc-fw-'));
    const pkg: Record<string, unknown> = {};
    if (Object.keys(deps).length) pkg.dependencies = deps;
    if (Object.keys(devDeps).length) pkg.devDependencies = devDeps;
    writeFileSync(join(testDir, 'package.json'), JSON.stringify(pkg));
    return testDir;
  }

  const cases: [string, Record<string, string>, DetectedFramework][] = [
    ['react', { react: '^19' }, 'react'],
    ['@superdoc-dev/react', { '@superdoc-dev/react': '^1' }, 'react'],
    ['next', { next: '^15', react: '^19' }, 'nextjs'],
    ['vue', { vue: '^3' }, 'vue'],
    ['nuxt', { nuxt: '^4', vue: '^3' }, 'nuxt'],
    ['@angular/core', { '@angular/core': '^19' }, 'angular'],
    ['svelte', { svelte: '^5' }, 'svelte'],
  ];

  for (const [dep, deps, expected] of cases) {
    test(`detects ${expected} from ${dep}`, () => {
      const dir = createDir(deps);
      expect(detectFramework(dir)).toBe(expected);
    });
  }

  test('returns vanilla when no framework deps', () => {
    const dir = createDir({});
    expect(detectFramework(dir)).toBe('vanilla');
  });

  test('returns vanilla when no package.json', () => {
    testDir = mkdtempSync(join(tmpdir(), 'superdoc-fw-'));
    expect(detectFramework(testDir)).toBe('vanilla');
  });

  test('detects from devDependencies', () => {
    testDir = mkdtempSync(join(tmpdir(), 'superdoc-fw-'));
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ devDependencies: { react: '^19' } }));
    expect(detectFramework(testDir)).toBe('react');
  });

  test('prefers next over react', () => {
    const dir = createDir({ next: '^15', react: '^19' });
    expect(detectFramework(dir)).toBe('nextjs');
  });

  test('prefers nuxt over vue', () => {
    const dir = createDir({ nuxt: '^4', vue: '^3' });
    expect(detectFramework(dir)).toBe('nuxt');
  });
});

describe('generateAgentsMd', () => {
  test('react template includes @superdoc-dev/react', () => {
    const md = generateAgentsMd('react');
    expect(md).toContain('@superdoc-dev/react');
    expect(md).toContain('Embed editor — React');
  });

  test('nextjs template includes use client', () => {
    const md = generateAgentsMd('nextjs');
    expect(md).toContain("'use client'");
    expect(md).toContain('Embed editor — Next.js');
    expect(md).toContain('client component');
  });

  test('nuxt template includes ClientOnly', () => {
    const md = generateAgentsMd('nuxt');
    expect(md).toContain('ClientOnly');
    expect(md).toContain('Embed editor — Nuxt');
    expect(md).toContain('Disable SSR');
  });

  test('vanilla template uses superdoc import', () => {
    const md = generateAgentsMd('vanilla');
    expect(md).toContain("import { SuperDoc } from 'superdoc'");
    expect(md).toContain("import 'superdoc/style.css'");
  });

  test('all templates contain knowledge corrections', () => {
    for (const fw of ['react', 'nextjs', 'vue', 'nuxt', 'angular', 'svelte', 'vanilla'] as const) {
      const md = generateAgentsMd(fw);
      expect(md).toContain('Knowledge corrections');
      expect(md).toContain('python-docx');
      expect(md).toContain('superdoc.activeEditor.commands.addComment');
      expect(md).toContain('modules.toolbar.customButtons');
    }
  });

  test('all templates contain MCP and SDK sections', () => {
    for (const fw of ['react', 'nextjs', 'vue', 'nuxt', 'angular', 'svelte', 'vanilla'] as const) {
      const md = generateAgentsMd(fw);
      expect(md).toContain('claude mcp add superdoc');
      expect(md).toContain('@superdoc-dev/sdk');
      expect(md).toContain('@superdoc-dev/cli');
    }
  });

  test('all templates contain correct API names', () => {
    for (const fw of ['react', 'nextjs', 'vue', 'nuxt', 'angular', 'svelte', 'vanilla'] as const) {
      const md = generateAgentsMd(fw);
      expect(md).toContain("superdoc.on('ready'");
      expect(md).not.toContain('content-changed');
      expect(md).not.toContain('customItems');
    }
  });
});
