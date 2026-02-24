import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from './risk-label.mjs';

describe('classify', () => {
  it('empty file list returns low', () => {
    assert.equal(classify([]).level, 'low');
  });

  it('low-risk files only', () => {
    const result = classify([
      'apps/docs/guides/foo.mdx',
      'packages/react/src/SuperDocEditor.tsx',
      '.github/workflows/ci.yml',
    ]);
    assert.equal(result.level, 'low');
    assert.equal(result.downgraded, false);
  });

  it('sensitive: extensions', () => {
    assert.equal(
      classify(['packages/super-editor/src/extensions/bold/bold.ts']).level,
      'sensitive',
    );
  });

  it('sensitive: esign', () => {
    assert.equal(classify(['packages/esign/src/foo.ts']).level, 'sensitive');
  });

  it('sensitive: contracts', () => {
    assert.equal(
      classify(['packages/layout-engine/contracts/src/index.ts']).level,
      'sensitive',
    );
  });

  it('sensitive: shared utilities', () => {
    assert.equal(
      classify(['shared/font-utils/index.js']).level,
      'sensitive',
    );
  });

  it('sensitive: superdoc src (non-core)', () => {
    assert.equal(
      classify(['packages/superdoc/src/SuperDoc.vue']).level,
      'sensitive',
    );
    assert.equal(
      classify(['packages/superdoc/src/components/CommentsLayer/FloatingComments.vue']).level,
      'sensitive',
    );
  });

  it('critical: superdoc/src/core still wins over sensitive superdoc/src', () => {
    assert.equal(
      classify(['packages/superdoc/src/core/SuperDoc.js']).level,
      'critical',
    );
  });

  it('critical: style-engine', () => {
    assert.equal(
      classify(['packages/layout-engine/style-engine/src/resolve.js']).level,
      'critical',
    );
  });

  it('critical: super-converter', () => {
    assert.equal(
      classify([
        'packages/super-editor/src/core/super-converter/v2/importer/foo.js',
      ]).level,
      'critical',
    );
  });

  it('critical: layout-engine core', () => {
    assert.equal(
      classify(['packages/layout-engine/layout-engine/src/index.ts']).level,
      'critical',
    );
  });

  it('critical: pm-adapter', () => {
    assert.equal(
      classify(['packages/layout-engine/pm-adapter/src/foo.js']).level,
      'critical',
    );
  });

  it('critical: painters', () => {
    assert.equal(
      classify(['packages/layout-engine/painters/dom/src/renderer.ts']).level,
      'critical',
    );
  });

  it('critical: superdoc core', () => {
    assert.equal(
      classify(['packages/superdoc/src/core/SuperDoc.js']).level,
      'critical',
    );
  });

  it('critical: presentation-editor', () => {
    assert.equal(
      classify([
        'packages/super-editor/src/core/presentation-editor/PresentationEditor.ts',
      ]).level,
      'critical',
    );
  });

  it('critical: layout-bridge', () => {
    assert.equal(
      classify(['packages/layout-engine/layout-bridge/src/foo.ts']).level,
      'critical',
    );
  });

  it('critical: measuring', () => {
    assert.equal(
      classify(['packages/layout-engine/measuring/src/foo.ts']).level,
      'critical',
    );
  });

  it('highest risk wins when mixed', () => {
    const result = classify([
      'packages/layout-engine/style-engine/src/resolve.js',
      'packages/super-editor/src/extensions/bold/bold.ts',
      'apps/docs/guides/foo.mdx',
    ]);
    assert.equal(result.level, 'critical');
  });

  it('super-editor/src/core/ non-critical subpath is sensitive', () => {
    assert.equal(
      classify(['packages/super-editor/src/core/helpers/utils.js']).level,
      'sensitive',
    );
  });

  it('downgrade: critical test-only becomes sensitive', () => {
    const result = classify([
      'packages/layout-engine/style-engine/__tests__/resolve.test.js',
      'packages/super-editor/src/core/super-converter/__tests__/import.test.js',
    ]);
    assert.equal(result.level, 'sensitive');
    assert.equal(result.downgraded, true);
  });

  it('downgrade: sensitive test-only becomes low', () => {
    const result = classify([
      'packages/super-editor/src/extensions/bold/bold.test.ts',
    ]);
    assert.equal(result.level, 'low');
    assert.equal(result.downgraded, true);
  });

  it('no downgrade when mix of test and source in risky paths', () => {
    const result = classify([
      'packages/layout-engine/style-engine/src/resolve.js',
      'packages/layout-engine/style-engine/__tests__/resolve.test.js',
    ]);
    assert.equal(result.level, 'critical');
    assert.equal(result.downgraded, false);
  });

  it('test directories are recognized as low risk', () => {
    assert.equal(
      classify(['tests/visual/tests/rendering/rendering.spec.ts']).level,
      'low',
    );
    assert.equal(classify(['e2e-tests/foo.test.ts']).level, 'low');
  });
});
