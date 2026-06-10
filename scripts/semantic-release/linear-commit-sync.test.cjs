/* eslint-env node */

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  collectIssueIdsFromCommits,
  extractIssueIdsFromText,
  formatComment,
  isReleaseAutomationCommit,
} = require('./linear-commit-sync.cjs');

test('extractIssueIdsFromText reads Linear refs from commit messages and trailers', () => {
  const issues = extractIssueIdsFromText(
    [
      'fix(superdoc): preserve table state SD-3385',
      '',
      'Body mentions eng-99 but the release config filters to SD.',
      '',
      'Linear-Issue: sd-3385',
      'Linear-Issue: SD-3390',
    ].join('\n'),
    ['SD'],
  );

  assert.deepEqual(issues, ['SD-3385', 'SD-3390']);
});

test('extractIssueIdsFromText honors Linear-Sync none', () => {
  assert.deepEqual(
    extractIssueIdsFromText('chore: generated update SD-3385\n\nLinear-Sync: none', ['SD']),
    [],
  );
});

test('collectIssueIdsFromCommits dedupes across released commits', () => {
  const issues = collectIssueIdsFromCommits(
    [
      { message: 'fix: one SD-3385' },
      { message: 'feat: two\n\nLinear-Issue: SD-3385\nLinear-Issue: SD-3390' },
    ],
    { cwd: process.cwd(), teamKeys: ['SD'] },
  );

  assert.deepEqual(issues, ['SD-3385', 'SD-3390']);
});

test('collectIssueIdsFromCommits ignores generated release commits with old notes', () => {
  const issues = collectIssueIdsFromCommits(
    [
      { message: 'chore(superdoc): 1.2.3 [skip ci]\n\nPrevious release notes mention SD-1000' },
      { message: 'fix: real change SD-2000' },
    ],
    { cwd: process.cwd(), teamKeys: ['SD'] },
  );

  assert.equal(isReleaseAutomationCommit('chore(superdoc): 1.2.3 [skip ci]\n\nSD-1000'), true);
  assert.deepEqual(issues, ['SD-2000']);
});


test('formatComment keeps the existing release comment template behavior', () => {
  assert.equal(
    formatComment(
      'shipped in {package} {releaseLink} {channel}',
      '1.2.3',
      'next',
      'superdoc',
      'v1.2.3',
      'https://github.com/superdoc-dev/superdoc.git',
    ),
    'shipped in **superdoc** [1.2.3](https://github.com/superdoc-dev/superdoc/releases/tag/v1.2.3) (next channel)',
  );
});
