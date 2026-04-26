// Run with: node --test .github/scripts/ci-gate.test.mjs
//
// Pure-logic tests for the CI gate. Does not exercise the gh CLI or
// GITHUB_OUTPUT side effects - those are integration concerns and run
// for real on every gate invocation.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SUITES, globToRegex, matchesSuite } from './ci-gate.mjs';

describe('globToRegex', () => {
  it('matches recursive subtrees with trailing **', () => {
    const re = globToRegex('packages/superdoc/**');
    assert.match('packages/superdoc/index.ts', re);
    assert.match('packages/superdoc/src/foo/bar.ts', re);
    assert.doesNotMatch('packages/super-editor/index.ts', re);
    assert.doesNotMatch('packages/superdoc', re);
  });

  it('matches leading **/ as zero-or-more segments', () => {
    const re = globToRegex('**/CHANGELOG.md');
    assert.match('CHANGELOG.md', re);
    assert.match('packages/superdoc/CHANGELOG.md', re);
    assert.match('a/b/c/CHANGELOG.md', re);
    assert.doesNotMatch('CHANGELOG.txt', re);
  });

  it('treats single * as a same-segment wildcard', () => {
    const re = globToRegex('tsconfig*.json');
    assert.match('tsconfig.json', re);
    assert.match('tsconfig.base.json', re);
    assert.doesNotMatch('packages/foo/tsconfig.json', re);
  });

  it('escapes regex specials in literal segments', () => {
    const re = globToRegex('vite.sourceResolve.ts');
    assert.match('vite.sourceResolve.ts', re);
    assert.doesNotMatch('viteXsourceResolveXts', re);
  });

  it('matches an exact filename literally', () => {
    const re = globToRegex('pnpm-lock.yaml');
    assert.match('pnpm-lock.yaml', re);
    assert.doesNotMatch('packages/foo/pnpm-lock.yaml', re);
  });
});

describe('matchesSuite', () => {
  it('returns true when any pattern matches', () => {
    const patterns = ['packages/foo/**', 'tsconfig*.json'];
    assert.equal(matchesSuite('packages/foo/index.ts', patterns), true);
    assert.equal(matchesSuite('tsconfig.base.json', patterns), true);
    assert.equal(matchesSuite('packages/bar/index.ts', patterns), false);
  });
});

describe('SUITES', () => {
  it('has exactly the 12 expected workflows', () => {
    assert.deepEqual(Object.keys(SUITES).sort(), [
      'behavior',
      'demos',
      'docs',
      'document-api',
      'esign',
      'examples',
      'mcp',
      'react',
      'sdk',
      'superdoc',
      'template-builder',
      'vscode-ext',
    ]);
  });

  it('every suite includes its own workflow file and the gate script', () => {
    const workflowFor = {
      behavior: '.github/workflows/ci-behavior.yml',
      demos: '.github/workflows/ci-demos.yml',
      docs: '.github/workflows/ci-docs.yml',
      'document-api': '.github/workflows/ci-document-api.yml',
      esign: '.github/workflows/ci-esign.yml',
      examples: '.github/workflows/ci-examples.yml',
      mcp: '.github/workflows/ci-mcp.yml',
      react: '.github/workflows/ci-react.yml',
      sdk: '.github/workflows/ci-sdk.yml',
      superdoc: '.github/workflows/ci-superdoc.yml',
      'template-builder': '.github/workflows/ci-template-builder.yml',
      'vscode-ext': '.github/workflows/ci-vscode-ext.yml',
    };
    for (const [suite, patterns] of Object.entries(SUITES)) {
      assert.ok(
        patterns.includes(workflowFor[suite]),
        `suite '${suite}' is missing its own workflow file`,
      );
      assert.ok(
        patterns.includes('.github/scripts/ci-gate.mjs'),
        `suite '${suite}' is missing the gate script`,
      );
    }
  });

  it('superdoc suite covers the root build helpers', () => {
    // These root files are imported by the SuperDoc/super-editor build and
    // would otherwise slip past a positive include list.
    const required = [
      'tsconfig*.json',
      'eslint.config.mjs',
      'vitest.config.mjs',
      'vitest.baseConfig.ts',
      'vite.sourceResolve.ts',
    ];
    for (const p of required) {
      assert.ok(
        SUITES.superdoc.includes(p),
        `superdoc suite must cover '${p}'`,
      );
    }
  });

  it('matches a real superdoc-only change', () => {
    assert.equal(
      matchesSuite('packages/superdoc/src/index.ts', SUITES.superdoc),
      true,
    );
    assert.equal(
      matchesSuite('packages/superdoc/src/index.ts', SUITES['template-builder']),
      true, // template-builder depends on superdoc
    );
    assert.equal(
      matchesSuite('packages/template-builder/src/index.tsx', SUITES.superdoc),
      false,
    );
    assert.equal(
      matchesSuite('apps/docs/page.mdx', SUITES.superdoc),
      false,
    );
    assert.equal(
      matchesSuite('apps/docs/page.mdx', SUITES.docs),
      true,
    );
  });

  it('matches root build helper changes for superdoc only', () => {
    assert.equal(matchesSuite('vite.sourceResolve.ts', SUITES.superdoc), true);
    assert.equal(matchesSuite('vite.sourceResolve.ts', SUITES.react), false);
    assert.equal(
      matchesSuite('vite.sourceResolve.ts', SUITES['template-builder']),
      false,
    );
  });
});
