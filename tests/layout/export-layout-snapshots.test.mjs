import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSnapshotStatusLines,
  createReporterEventLine,
  parseReporterEventLine,
} from './export-layout-snapshots.mjs';

test('reporter event lines round-trip through the parser', () => {
  const originalEvent = {
    type: 'doc-ok',
    workerId: 2,
    progress: '[14/42]',
    relativePath: 'tables/example.docx',
    pageCount: 3,
    docElapsedMs: 250,
  };

  const encoded = createReporterEventLine(originalEvent);
  const parsed = parseReporterEventLine(encoded);

  assert.deepEqual(parsed, originalEvent);
});

test('parser ignores ordinary log lines', () => {
  assert.equal(parseReporterEventLine('[w2] [14/42] OK  tables/example.docx (3 pages, 0.25s)'), null);
});

test('status lines show only active docs plus retained warnings and failures', () => {
  const nowMs = Date.parse('2026-03-28T12:00:00.000Z');
  const lines = buildSnapshotStatusLines({
    totalDocs: 10,
    jobs: 3,
    successCount: 7,
    failureCount: 1,
    activeDocs: [
      {
        workerId: 3,
        progress: '[10/10]',
        relativePath: 'z-last.docx',
        startedAtMs: nowMs - 4_500,
      },
      {
        workerId: 1,
        progress: '[9/10]',
        relativePath: 'a-first.docx',
        startedAtMs: nowMs - 2_500,
      },
    ],
    warningCount: 3,
    warningSnapshot: {
      entries: [{ text: '[w3] EMF conversion requires browser environment with DOM support', count: 2 }],
      hiddenCount: 1,
    },
    failureSnapshot: {
      entries: [{ text: '  [w2] [8/10] broken.docx failed after 0.20s: Timed out waiting for layout', count: 1 }],
      hiddenCount: 0,
    },
    startedAtMs: nowMs - 65_000,
    nowMs,
  });

  assert.equal(lines[1], 'Progress   8/10 done | 2 active | 1 failed | 3 warnings | 1m 5s');
  assert.deepEqual(lines.slice(2, 5), [
    'Active',
    '  [w1] [9/10] a-first.docx (2.50s)',
    '  [w3] [10/10] z-last.docx (4.50s)',
  ]);
  assert.ok(lines.includes('Failures'));
  assert.ok(lines.includes('Warnings'));
  assert.ok(lines.includes('  [w3] EMF conversion requires browser environment with DOM support (x2)'));
  assert.ok(lines.includes('  ... 1 more warning'));
});
