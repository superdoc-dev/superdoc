import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { auditArtifact, auditNativeBinary, auditSuperdocPackageArtifact } from '../audit-publish-artifact.mjs';

function withTempDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'superdoc-audit-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('publish artifact audit scans no-extension native binaries in bin directories', () => {
  withTempDir((dir) => {
    const binDir = path.join(dir, 'bin');
    mkdirSync(binDir, { recursive: true });
    writeFileSync(
      path.join(binDir, 'superdoc'),
      Buffer.from('prefix /Users/example/project/superdoc/v2/src/private.ts suffix'),
    );

    const result = auditArtifact(dir, { label: 'fixture' });

    assert.equal(result.ok, false);
    assert.ok(
      result.violations.some((violation) => violation.includes('bin/superdoc: native binary embeds')),
      `expected native binary violation, got: ${result.violations.join('\n')}`,
    );
  });
});

test('native binary audit permits known Bun toolchain build paths', () => {
  withTempDir((dir) => {
    const binary = path.join(dir, 'superdoc');
    writeFileSync(
      binary,
      Buffer.from(
        [
          '/Users/runner/work/_temp/webkit-release/build/JavaScriptCore',
          '/Users/administrator/Library/Services/buildkite-agent/builds/bun-release/',
          '/Users/administrator/Library/Services/buildkite-agent/builds/darwin-aarch64-15-1/bun/bun/vendor/lolhtml/src/rewriter/mod.rs',
          '/Users/administrator/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/example/parser.rs',
          '/usr/local/etc/buildkite-agent/builds/darwin-x64-mini-2-1/bun/bun/vendor/example.rs',
        ].join('\0'),
      ),
    );

    assert.deepEqual(auditNativeBinary(binary, { label: 'superdoc' }), { ok: true, violations: [] });
  });
});

test('native binary audit rejects paths outside the known Bun Buildkite release', () => {
  withTempDir((dir) => {
    const binary = path.join(dir, 'superdoc');
    const rejectedPaths = [
      '/Users/administrator/Library/Services/buildkite-agent/builds/orbit/private.ts',
      '/Users/administrator/Library/Services/buildkite-agent/builds/darwin-aarch64-15-1/orbit/private.ts',
    ];
    writeFileSync(binary, Buffer.from(rejectedPaths.join('\0')));

    const result = auditNativeBinary(binary, { label: 'superdoc' });
    assert.equal(result.ok, false);
    for (const rejectedPath of rejectedPaths) {
      assert.ok(result.violations.some((violation) => violation.includes(rejectedPath)));
    }
  });
});

test('native binary audit does not let an allowed NUL-delimited path hide a local path', () => {
  withTempDir((dir) => {
    const binary = path.join(dir, 'superdoc');
    writeFileSync(
      binary,
      Buffer.from('/Users/runner/work/_temp/webkit-release/build/JavaScriptCore\0/Users/example/orbit/private.ts\0'),
    );

    const result = auditNativeBinary(binary, { label: 'superdoc' });
    assert.equal(result.ok, false);
    assert.ok(result.violations.some((violation) => violation.includes('/Users/example/orbit/private.ts')));
  });
});

test('SuperDoc package audit accepts an exact prerelease engine dependency and external runtime imports', () => {
  withTempDir((dir) => {
    const packageDir = path.join(dir, 'package');
    const distDir = path.join(packageDir, 'dist');
    mkdirSync(distDir, { recursive: true });
    writeFileSync(path.join(packageDir, 'LICENSE'), 'AGPL license');
    writeFileSync(path.join(packageDir, 'NOTICE'), 'SuperDoc notice');
    writeFileSync(path.join(packageDir, 'README.md'), '# superdoc');
    writeFileSync(
      path.join(packageDir, 'package.json'),
      JSON.stringify({
        name: 'superdoc',
        version: '2.3.0-next.1',
        license: 'AGPL-3.0',
        dependencies: { '@superdoc/docx-engine': '0.1.3-next.1' },
      }),
    );
    writeFileSync(path.join(distDir, 'superdoc.es.js'), "import '@superdoc/docx-engine';");
    writeFileSync(path.join(distDir, 'superdoc.cjs'), "require('@superdoc/docx-engine');");
    writeFileSync(path.join(distDir, 'style.css'), '@import "@superdoc/docx-engine/style.css";');
    const tarball = path.join(dir, 'superdoc.tgz');
    execFileSync('tar', ['-czf', tarball, 'package'], { cwd: dir });

    assert.deepEqual(auditSuperdocPackageArtifact(tarball), { ok: true, violations: [] });
  });
});

test('SuperDoc package audit accepts engine imports in emitted chunks', () => {
  withTempDir((dir) => {
    writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ dependencies: { '@superdoc/docx-engine': '0.1.0' } }),
    );
    mkdirSync(path.join(dir, 'chunks'));
    writeFileSync(path.join(dir, 'superdoc.es.js'), "export * from './chunks/index.es.js';");
    writeFileSync(path.join(dir, 'superdoc.cjs'), "module.exports = require('./chunks/index.cjs');");
    writeFileSync(path.join(dir, 'chunks/index.es.js'), "import('@superdoc/docx-engine');");
    writeFileSync(path.join(dir, 'chunks/index.cjs'), "import('@superdoc/docx-engine');");
    writeFileSync(path.join(dir, 'style.css'), '@import "@superdoc/docx-engine/style.css";');

    assert.deepEqual(auditSuperdocPackageArtifact(dir), { ok: true, violations: [] });
  });
});

test('SuperDoc package audit rejects engine bytes and ranged dependencies', () => {
  withTempDir((dir) => {
    writeFileSync(path.join(dir, 'superdoc.es.js'), "import '@superdoc/docx-engine';");
    writeFileSync(path.join(dir, 'superdoc.cjs'), "require('@superdoc/docx-engine');\n/* DOCX Engine v0.1.0 */");
    writeFileSync(
      path.join(dir, 'style.css'),
      '@import "@superdoc/docx-engine/style.css";\n.v2-document-loading-overlay{}',
    );

    const result = auditSuperdocPackageArtifact(dir);
    assert.equal(result.ok, false);
    assert.ok(result.violations.some((violation) => violation.includes('DOCX Engine package version banner')));
    assert.ok(result.violations.includes('style.css contains inlined DOCX Engine styles'));
  });
});
