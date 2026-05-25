/**
 * Unit tests for the pure validator exported from
 * `scripts/report-public-contract.mjs`. Runs under `node --test`.
 *
 * Each test builds a tiny in-memory publicContract + exports map,
 * calls `validatePublicContract`, and asserts the failure list
 * matches expectations. No fs / no spawn / no process exit.
 *
 * Local usage:
 *   node --test scripts/report-public-contract.test.mjs
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { validatePublicContract } from './report-public-contract.mjs';

/** Minimal exports entry shape with a types path. */
const ent = (typesPath) => ({ types: typesPath, import: typesPath.replace(/\.d\.ts$/, '.js') });

/** Minimal valid contract - used as a starting point and mutated per test. */
function baseContract() {
  return {
    supported: [{ subpath: '.', tier: 'supported', note: 'root' }],
    legacy: [],
    legacyRaw: [],
    asset: [],
    deprecated: [],
  };
}
function baseExports() {
  return { '.': ent('./dist/superdoc/src/public/index.d.ts') };
}

describe('validatePublicContract', () => {
  it('passes for a minimal well-formed contract', () => {
    const failures = validatePublicContract(baseContract(), baseExports());
    assert.deepEqual(failures, []);
  });

  describe('coverage', () => {
    it('flags exports subpaths missing from the contract', () => {
      const exportsMap = { ...baseExports(), './extra': ent('./dist/superdoc/src/public/extra.d.ts') };
      const failures = validatePublicContract(baseContract(), exportsMap);
      assert.equal(failures.length, 1);
      assert.match(failures[0], /MISSING contract entry: package\.json#exports has "\.\/extra"/);
    });

    it('flags contract entries missing from exports', () => {
      const contract = baseContract();
      contract.legacy.push({ subpath: './gone', tier: 'legacy', note: 'removed export' });
      const failures = validatePublicContract(contract, baseExports());
      assert.equal(failures.length, 1);
      assert.match(failures[0], /STALE contract entry: publicContract has "\.\/gone"/);
    });
  });

  describe('partition', () => {
    it('flags a subpath listed in two tiers', () => {
      const contract = baseContract();
      contract.legacy.push({ subpath: '.', tier: 'legacy', note: 'duplicate' });
      const failures = validatePublicContract(contract, baseExports());
      // Duplicate detection triggers two failures: the tier-mismatch on
      // the duplicate entry AND the partition violation.
      assert.ok(
        failures.some((f) => /appears in multiple tiers: supported and legacy/.test(f)),
        `expected partition failure, got: ${failures.join('\n')}`,
      );
    });
  });

  describe('per-entry tier field', () => {
    it('flags an entry whose tier disagrees with its bucket', () => {
      const contract = baseContract();
      // Misclassified: lives in `supported` but tier label says legacy.
      contract.supported[0].tier = 'legacy';
      const failures = validatePublicContract(contract, baseExports());
      assert.ok(
        failures.some((f) => /entry "\." in publicContract\.supported has tier="legacy"; expected "supported"/.test(f)),
        `expected tier-mismatch failure, got: ${failures.join('\n')}`,
      );
    });

    it('uses kebab-case "legacy-raw" for the legacyRaw bucket', () => {
      const contract = baseContract();
      contract.legacyRaw.push({ subpath: './super-editor', tier: 'legacyRaw', note: 'wrong case' });
      const exportsMap = { ...baseExports(), './super-editor': ent('./dist/superdoc/src/super-editor.d.ts') };
      const failures = validatePublicContract(contract, exportsMap);
      assert.ok(
        failures.some((f) => /tier="legacyRaw"; expected "legacy-raw"/.test(f)),
        `expected kebab-case tier failure, got: ${failures.join('\n')}`,
      );
    });
  });

  describe('routing rules', () => {
    it('flags a supported subpath that does not route through src/public/**', () => {
      const exportsMap = { '.': ent('./dist/superdoc/src/elsewhere.d.ts') };
      const failures = validatePublicContract(baseContract(), exportsMap);
      assert.equal(failures.length, 1);
      assert.match(failures[0], /supported "\.".*expected to route through \.\/dist\/superdoc\/src\/public\/\*\*/);
    });

    it('flags a supported subpath that routes through the legacy facade', () => {
      const exportsMap = { '.': ent('./dist/superdoc/src/public/legacy/index.d.ts') };
      const failures = validatePublicContract(baseContract(), exportsMap);
      assert.equal(failures.length, 1);
      assert.match(failures[0], /supported "\.".*must not route through the legacy facade/);
    });

    it('flags a legacy subpath that does not route through public/legacy/**', () => {
      const contract = baseContract();
      contract.legacy.push({ subpath: './conv', tier: 'legacy', note: '' });
      const exportsMap = {
        ...baseExports(),
        './conv': ent('./dist/superdoc/src/public/conv.d.ts'),
      };
      const failures = validatePublicContract(contract, exportsMap);
      assert.equal(failures.length, 1);
      assert.match(failures[0], /legacy "\.\/conv".*expected to route through \.\/dist\/superdoc\/src\/public\/legacy\/\*\*/);
    });

    it('passes the canonical legacy routing (e.g. ./converter -> public/legacy/)', () => {
      const contract = baseContract();
      contract.legacy.push({ subpath: './converter', tier: 'legacy', note: '' });
      const exportsMap = {
        ...baseExports(),
        './converter': ent('./dist/superdoc/src/public/legacy/converter.d.ts'),
      };
      const failures = validatePublicContract(contract, exportsMap);
      assert.deepEqual(failures, []);
    });
  });

  describe('legacyRaw allowlist', () => {
    it('passes for the accepted ./super-editor entry', () => {
      const contract = baseContract();
      contract.legacyRaw.push({ subpath: './super-editor', tier: 'legacy-raw', note: '' });
      const exportsMap = {
        ...baseExports(),
        './super-editor': ent('./dist/superdoc/src/super-editor.d.ts'),
      };
      const failures = validatePublicContract(contract, exportsMap);
      assert.deepEqual(failures, []);
    });

    it('flags a non-allowlisted legacyRaw subpath', () => {
      const contract = baseContract();
      contract.legacyRaw.push({ subpath: './fake', tier: 'legacy-raw', note: '' });
      const exportsMap = {
        ...baseExports(),
        './fake': ent('./dist/superdoc/src/fake.d.ts'),
      };
      const failures = validatePublicContract(contract, exportsMap);
      assert.ok(
        failures.some((f) => /legacyRaw "\.\/fake": not on the accepted list/.test(f)),
        `expected allowlist failure, got: ${failures.join('\n')}`,
      );
    });

    it('flags a legacyRaw subpath that accidentally routes through public/', () => {
      const contract = baseContract();
      contract.legacyRaw.push({ subpath: './super-editor', tier: 'legacy-raw', note: '' });
      const exportsMap = {
        ...baseExports(),
        // Routes under public/ - should not be in legacyRaw.
        './super-editor': ent('./dist/superdoc/src/public/super-editor.d.ts'),
      };
      const failures = validatePublicContract(contract, exportsMap);
      assert.equal(failures.length, 1);
      assert.match(failures[0], /legacyRaw "\.\/super-editor".*promote to legacy/);
    });
  });

  describe('exports-entry shapes', () => {
    it('accepts string-only exports', () => {
      const exportsMap = { '.': './dist/superdoc/src/public/index.d.ts' };
      const failures = validatePublicContract(baseContract(), exportsMap);
      assert.deepEqual(failures, []);
    });

    it('accepts conditional types: { import, require }', () => {
      const exportsMap = {
        '.': {
          types: {
            import: './dist/superdoc/src/public/index.d.ts',
            require: './dist/superdoc/src/public/index.d.cts',
          },
          import: './dist/superdoc.es.js',
          require: './dist/superdoc.cjs',
        },
      };
      const failures = validatePublicContract(baseContract(), exportsMap);
      assert.deepEqual(failures, []);
    });

    it('flags a supported exports entry that has no types field at all', () => {
      const exportsMap = { '.': { import: './dist/superdoc.es.js' } };
      const failures = validatePublicContract(baseContract(), exportsMap);
      assert.equal(failures.length, 1);
      assert.match(failures[0], /supported "\.": no types field on the exports entry/);
    });

    it('passes asset entries with no types field (e.g. CSS)', () => {
      const contract = baseContract();
      contract.asset.push({ subpath: './style.css', tier: 'asset', note: 'CSS bundle' });
      const exportsMap = { ...baseExports(), './style.css': './dist/style.css' };
      const failures = validatePublicContract(contract, exportsMap);
      assert.deepEqual(failures, []);
    });
  });

  describe('conditional types divergence', () => {
    it('flags a supported entry whose types.require routes outside src/public/**', () => {
      // types.import is routed correctly, types.require routes to the
      // wrong directory. Earlier validator only checked types.import and
      // missed this; both conditional branches must be checked now.
      const exportsMap = {
        '.': {
          types: {
            import: './dist/superdoc/src/public/index.d.ts',
            require: './dist/superdoc/src/elsewhere/index.d.cts',
          },
        },
      };
      const failures = validatePublicContract(baseContract(), exportsMap);
      assert.equal(failures.length, 1);
      assert.match(
        failures[0],
        /supported "\.".*"\.\/dist\/superdoc\/src\/elsewhere\/index\.d\.cts".*expected to route through \.\/dist\/superdoc\/src\/public\/\*\*/,
      );
    });

    it('flags a legacy entry whose types.require routes outside the legacy facade', () => {
      const contract = baseContract();
      contract.legacy.push({ subpath: './converter', tier: 'legacy', note: '' });
      const exportsMap = {
        ...baseExports(),
        './converter': {
          types: {
            import: './dist/superdoc/src/public/legacy/converter.d.ts',
            require: './dist/superdoc/src/public/converter.d.cts',
          },
        },
      };
      const failures = validatePublicContract(contract, exportsMap);
      assert.equal(failures.length, 1);
      assert.match(
        failures[0],
        /legacy "\.\/converter".*"\.\/dist\/superdoc\/src\/public\/converter\.d\.cts".*expected to route through \.\/dist\/superdoc\/src\/public\/legacy\/\*\*/,
      );
    });
  });
});
