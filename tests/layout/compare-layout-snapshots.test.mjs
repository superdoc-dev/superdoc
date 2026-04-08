import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import {
  buildAgentArtifact,
  buildVisualComparisonPlan,
  collectMissingVisualTestingPackages,
  determineCompareStatus,
  normalizeGenerationWarningMessage,
  normalizeDocSnapshot,
  toDisplayDocPath,
} from './compare-layout-snapshots.mjs';

const REPO_ROOT = process.cwd();

test('normalizeGenerationWarningMessage strips command-service prefix and trims whitespace', () => {
  const raw = '   [CommandService] Dispatch failed: Invalid content for node structuredContentBlock   ';
  const normalized = normalizeGenerationWarningMessage(raw);
  assert.equal(normalized, 'Invalid content for node structuredContentBlock');
});

test('normalizeGenerationWarningMessage falls back to default text for empty values', () => {
  const normalized = normalizeGenerationWarningMessage('');
  assert.equal(normalized, 'Unknown generation error');
});

test('toDisplayDocPath returns relative doc path inside input root', () => {
  const inputRoot = path.join('/tmp', 'repo', 'test-corpus');
  const docPath = path.join(inputRoot, 'permissions', 'sd-1840-perm-tags.docx');
  const displayPath = toDisplayDocPath(docPath, inputRoot);

  assert.equal(displayPath, 'permissions/sd-1840-perm-tags.docx');
});

test('toDisplayDocPath preserves absolute path for docs outside input root', () => {
  const inputRoot = path.join('/tmp', 'repo', 'test-corpus');
  const outsidePath = path.join('/tmp', 'other', 'doc.docx');
  const displayPath = toDisplayDocPath(outsidePath, inputRoot);

  assert.equal(displayPath, '/tmp/other/doc.docx');
});

test('determineCompareStatus treats generation failures as failed', () => {
  const status = determineCompareStatus({
    changedDocCount: 0,
    missingInReference: [],
    missingInCandidate: [],
    candidateGenerationFailures: [{ path: 'foo.docx', message: 'warning' }],
    referenceGenerationFailures: [],
    visualComparison: { status: 'skipped' },
  });

  assert.equal(status, 'failed');
});

test('buildVisualComparisonPlan includes widespread-only changed docs in visual coverage', () => {
  const plan = buildVisualComparisonPlan({
    changedDocs: [
      {
        path: 'layout/79.docx.layout.json',
        widespreadOnly: true,
      },
      {
        path: 'layout/82.docx.layout.json',
        widespreadOnly: false,
      },
    ],
    visualOnChange: true,
    visualReference: '1.24.0-next.65',
  });

  assert.equal(plan.visualEligible, true);
  assert.equal(plan.visualSkipReason, null);
  assert.deepEqual(plan.changedDocPaths, ['layout/79.docx', 'layout/82.docx']);
});

test('buildVisualComparisonPlan reports no changed docs only when there are no changed docs at all', () => {
  const plan = buildVisualComparisonPlan({
    changedDocs: [],
    visualOnChange: true,
    visualReference: '1.24.0-next.65',
  });

  assert.equal(plan.visualEligible, false);
  assert.equal(plan.visualSkipReason, 'No changed docs.');
  assert.deepEqual(plan.changedDocPaths, []);
});

test('collectMissingVisualTestingPackages flags broken or missing package manifests', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'visual-deps-'));
  const createManifest = async (packageName) => {
    const manifestPath = path.join(tempRoot, 'node_modules', ...packageName.split('/'), 'package.json');
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(manifestPath, JSON.stringify({ name: packageName }), 'utf8');
  };

  try {
    await createManifest('dotenv');
    await createManifest('tsx');

    const missingPackages = await collectMissingVisualTestingPackages(tempRoot);

    assert.deepEqual(missingPackages, ['pngjs', '@playwright/test']);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('normalizeDocSnapshot ignores internal paint image block ids', () => {
  const buildRawSnapshot = (imageBlockId) => ({
    layoutSnapshot: {
      blocks: [{ id: 'layout-block-uuid' }],
      layout: {
        pages: [{ fragments: [{ blockId: 'layout-block-uuid' }] }],
      },
    },
    paintSnapshot: {
      pages: [],
      entities: {
        images: [
          {
            kind: 'fragment',
            pageIndex: 0,
            element: {},
            blockId: imageBlockId,
          },
        ],
      },
    },
  });

  const reference = normalizeDocSnapshot(buildRawSnapshot('image-uuid-a'));
  const candidate = normalizeDocSnapshot(buildRawSnapshot('image-uuid-b'));

  assert.deepEqual(reference.paintSnapshot, candidate.paintSnapshot);
  assert.equal(reference.paintSnapshot.entities.images[0].blockId, undefined);
  assert.equal(reference.layoutSnapshot.layout.pages[0].fragments[0].blockId, 'b0');
});

test('buildAgentArtifact produces repo-relative report paths', () => {
  const args = {
    reference: '1.24.0-next.36',
    referenceRoot: null,
    matches: ['footnotes'],
    limit: 4,
    pipeline: 'presentation',
    jobs: 4,
  };
  const summary = {
    generatedAt: '2026-03-28T18:24:07.572Z',
    reportDir: path.join(REPO_ROOT, 'tests/layout/reports/example-report'),
    candidateRoot: path.join(REPO_ROOT, 'tests/layout/candidate'),
    referenceRoot: path.join(REPO_ROOT, 'tests/layout/reference/v.1.24.0-next.36'),
    referenceLabel: 'v.1.24.0-next.36',
    candidateDocCount: 4,
    referenceDocCount: 4,
    matchedDocCount: 4,
    changedDocCount: 1,
    uniqueChangeDocCount: 1,
    widespreadOnlyDocCount: 0,
    unchangedDocCount: 3,
    missingInReference: [],
    missingInCandidate: [],
    changedDocs: [
      {
        path: 'footnotes/basic.docx.layout.json',
        diffCount: 2,
        pagesChanged: [1],
        pageCountChanged: false,
        widespreadOnly: false,
        reportFile: 'docs/footnotes/basic.docx.layout.json.diff.json',
      },
    ],
    candidateGenerationFailures: [],
    referenceGenerationFailures: [],
    visualComparison: {
      status: 'skipped',
      workdir: path.join(REPO_ROOT, 'devtools/visual-testing'),
      docsRoot: path.join(REPO_ROOT, 'test-corpus'),
    },
  };

  const artifact = buildAgentArtifact({ summary, args });

  assert.equal(artifact.status, 'changed');
  assert.equal(artifact.scope.report.dir, 'tests/layout/reports/example-report');
  assert.equal(artifact.scope.report.summaryJson, 'tests/layout/reports/example-report/summary.json');
  assert.equal(artifact.scope.reference.root, 'tests/layout/reference/v.1.24.0-next.36');
  assert.equal(artifact.counts.untestedDocs, 0);
  assert.equal(artifact.counts.generationFailures, 0);
});

test('buildAgentArtifact surfaces untested docs from generation failures', () => {
  const args = {
    reference: '1.24.0-next.36',
    referenceRoot: null,
    matches: [],
    limit: null,
    pipeline: 'presentation',
    jobs: 8,
  };
  const summary = {
    generatedAt: '2026-03-28T19:33:57.739Z',
    reportDir: path.join(REPO_ROOT, 'tests/layout/reports/example-report'),
    candidateRoot: path.join(REPO_ROOT, 'tests/layout/candidate'),
    referenceRoot: path.join(REPO_ROOT, 'tests/layout/reference/v.1.24.0-next.36'),
    referenceLabel: 'v.1.24.0-next.36',
    candidateDocCount: 424,
    referenceDocCount: 424,
    matchedDocCount: 423,
    changedDocCount: 0,
    uniqueChangeDocCount: 0,
    widespreadOnlyDocCount: 0,
    unchangedDocCount: 423,
    missingInReference: [],
    missingInCandidate: [],
    changedDocs: [],
    candidateGenerationFailures: [
      {
        path: 'other/sd-1459-font-size-test-line-size.docx',
        stage: 'candidate generation',
        message: 'TypeError: undefined is not an object',
        stackPreview: ['TypeError: undefined is not an object', 'at encode$54 (...)'],
      },
    ],
    referenceGenerationFailures: [],
    visualComparison: {
      status: 'skipped',
      workdir: null,
      docsRoot: null,
    },
  };

  const artifact = buildAgentArtifact({ summary, args });

  assert.equal(artifact.status, 'failed');
  assert.equal(artifact.counts.untestedDocs, 1);
  assert.equal(artifact.counts.generationFailures, 1);
  assert.deepEqual(artifact.untestedDocs, [
    {
      path: 'other/sd-1459-font-size-test-line-size.docx',
      candidate: {
        stage: 'candidate generation',
        message: 'TypeError: undefined is not an object',
        stackPreview: ['TypeError: undefined is not an object', 'at encode$54 (...)'],
      },
    },
  ]);
});
