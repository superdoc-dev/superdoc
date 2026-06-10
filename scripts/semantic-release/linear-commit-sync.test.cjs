/* eslint-env node */

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  collectIssueIdsFromCommits,
  extractIssueIdsFromText,
  formatComment,
  isVersionLabel,
  isReleaseAutomationCommit,
  success,
} = require('./linear-commit-sync.cjs');

function createLinearFetch(handler) {
  const calls = [];
  const fetch = async (_url, options = {}) => {
    const request = JSON.parse(options.body || '{}');
    calls.push(request);
    const payload = await handler(request, calls);
    return {
      ok: payload.ok ?? true,
      status: payload.status ?? 200,
      json: async () => payload.body ?? payload,
    };
  };
  return { calls, fetch };
}

function makeLogger() {
  return {
    logs: [],
    warnings: [],
    log(...args) {
      this.logs.push(args.join(' '));
    },
    warn(...args) {
      this.warnings.push(args.join(' '));
    },
  };
}

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

test('isVersionLabel requires the configured prefix followed by a digit', () => {
  assert.equal(isVersionLabel('v1.2.3', 'v'), true);
  assert.equal(isVersionLabel('superdoc-v1.2.3', 'superdoc-v'), true);
  assert.equal(isVersionLabel('verified', 'v'), false);
  assert.equal(isVersionLabel('vendor', 'v'), false);
  assert.equal(isVersionLabel('superdoc-verified', 'superdoc-v'), false);
});

test('success does not call issueUpdate with an empty label set when issue labels cannot be fetched', async () => {
  const originalFetch = global.fetch;
  let issueByUuidFetches = 0;
  const { calls, fetch } = createLinearFetch(({ query, variables }) => {
    if (query.includes('query FindLabel')) {
      return { data: { issueLabels: { nodes: [{ id: 'label-new', name: 'superdoc-v1.2.3' }] } } };
    }
    if (query.includes('query GetIssue') && variables.identifier === 'SD-3385') {
      return {
        data: {
          issue: {
            id: 'issue-uuid',
            identifier: 'SD-3385',
            title: 'Bug',
            labels: { nodes: [{ id: 'label-keep', name: 'priority' }] },
          },
        },
      };
    }
    if (query.includes('query GetIssue') && variables.identifier === 'issue-uuid') {
      issueByUuidFetches += 1;
      if (issueByUuidFetches === 1) {
        return {
          data: {
            issue: {
              id: 'issue-uuid',
              identifier: 'SD-3385',
              title: 'Bug',
              labels: { nodes: [{ id: 'label-keep', name: 'priority' }] },
            },
          },
        };
      }
      return { errors: [{ message: 'temporary Linear failure' }] };
    }
    throw new Error(`Unexpected Linear request: ${query}`);
  });
  global.fetch = fetch;

  try {
    const logger = makeLogger();
    await success(
      { teamKeys: ['SD'], packageName: 'superdoc' },
      {
        commits: [{ message: 'fix: preserve labels SD-3385' }],
        cwd: process.cwd(),
        logger,
        nextRelease: { version: '1.2.3', type: 'patch', gitTag: 'v1.2.3' },
        options: { repositoryUrl: 'https://github.com/superdoc-dev/superdoc.git' },
      },
    );
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(
    calls.some((call) => call.query.includes('mutation AddLabel')),
    false,
    'must not update Linear labels when the existing label set could not be fetched',
  );
});

test('success retries label lookup when concurrent label creation wins the race', async () => {
  const originalFetch = global.fetch;
  let findLabelCalls = 0;
  const { calls, fetch } = createLinearFetch(({ query, variables }) => {
    if (query.includes('query FindLabel')) {
      findLabelCalls += 1;
      return {
        data: {
          issueLabels: {
            nodes: findLabelCalls === 1 ? [] : [{ id: 'label-new', name: 'superdoc-v1.2.3' }],
          },
        },
      };
    }
    if (query.includes('mutation CreateLabel')) {
      return { errors: [{ message: 'Label already exists' }] };
    }
    if (query.includes('query GetIssue')) {
      return {
        data: {
          issue: {
            id: 'issue-uuid',
            identifier: variables.identifier === 'SD-3385' ? 'SD-3385' : undefined,
            title: 'Bug',
            labels: { nodes: [{ id: 'label-keep', name: 'priority' }] },
          },
        },
      };
    }
    if (query.includes('mutation AddLabel')) {
      return { data: { issueUpdate: { issue: { id: variables.issueId } } } };
    }
    throw new Error(`Unexpected Linear request: ${query}`);
  });
  global.fetch = fetch;

  try {
    const logger = makeLogger();
    await success(
      { teamKeys: ['SD'], packageName: 'superdoc' },
      {
        commits: [{ message: 'fix: retry labels SD-3385' }],
        cwd: process.cwd(),
        logger,
        nextRelease: { version: '1.2.3', type: 'patch', gitTag: 'v1.2.3' },
        options: { repositoryUrl: 'https://github.com/superdoc-dev/superdoc.git' },
      },
    );
  } finally {
    global.fetch = originalFetch;
  }

  const addLabelCall = calls.find((call) => call.query.includes('mutation AddLabel'));
  assert.ok(addLabelCall, 'expected Linear label update after duplicate-create recovery');
  assert.deepEqual(addLabelCall.variables.labelIds, ['label-keep', 'label-new']);
});
