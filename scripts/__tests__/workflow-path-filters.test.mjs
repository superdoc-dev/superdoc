import assert from 'node:assert/strict';
import test from 'node:test';

import { collectPathFilters, globToRegExp, matchesSomething } from '../lib/workflow-path-filters.mjs';

// The parser returns `{ entries, unparsed }`; these cases assert on entries.
const collectFilters = (source) => collectPathFilters(source).entries;

const TREE = [
  'packages/superdoc/src/index.ts',
  'packages/superdoc/README.md',
  'packages/layout-engine/painters/dom/src/renderer.ts',
  '.github/workflows/ci-superdoc.yml',
  'scripts/check-workflow-paths.mjs',
];

test('a directory glob matches files beneath it', () => {
  assert.equal(matchesSomething('packages/superdoc/**', TREE), true);
});

test('a bare directory name does not stand in for a glob', () => {
  // Deliberately false. This test asserted the opposite until review pointed out
  // that the lane selector matches the anchored glob, so `packages/superdoc`
  // selects no change while `packages/superdoc/**` selects everything beneath.
  // Reporting the first as live described a trigger that cannot fire.
  assert.equal(matchesSomething('packages/superdoc', TREE), false);
  assert.equal(matchesSomething('packages/superdoc/**', TREE), true);
});

test('an exact file path matches itself', () => {
  assert.equal(matchesSomething('scripts/check-workflow-paths.mjs', TREE), true);
});

test('a deleted package is reported', () => {
  assert.equal(matchesSomething('packages/super-editor/**', TREE), false);
});

test('a deleted exact file is reported', () => {
  assert.equal(matchesSomething('scripts/gone.mjs', TREE), false);
});

test('a single star does not span directories', () => {
  // `packages/*` names the children of packages/, not files at any depth.
  assert.equal(globToRegExp('packages/*').test('packages/superdoc/src/index.ts'), false);
  assert.equal(globToRegExp('packages/**').test('packages/superdoc/src/index.ts'), true);
});

test('a repo-wide extension filter is never reported', () => {
  // `**/*.md` names a kind of file, not a location: it cannot go stale when a
  // package moves, and a tree with no Markdown today is not a broken filter.
  assert.equal(matchesSomething('**/*.md', TREE), true);
  assert.equal(matchesSomething('**/*.rs', TREE), true);
});

test('a root-level kind filter is never reported', () => {
  // Sometimes matching nothing is the point. The DOCX privacy gate watches
  // `*.[dD][oO][cC][xX]` at the root so a fixture landing there triggers a
  // scan; a repo with no root-level DOCX is the healthy state.
  assert.equal(matchesSomething('*.[dD][oO][cC][xX]', TREE), true);
  assert.equal(matchesSomething('*.lock', TREE), true);
});

test('a specific basename under **/ is still checked', () => {
  // The exemption is for filters naming a KIND of file, so the leaf has to
  // start with a wildcard. `**/renamed-package.json` names one basename that was
  // expected to exist: once the last one is deleted it selects nothing, which is
  // exactly the rot this guard exists to catch. Same rule the lane guard uses.
  assert.equal(matchesSomething('**/renamed-package.json', TREE), false);
  assert.equal(matchesSomething('**/gone-file.txt', TREE), false);

  // A live basename still passes on its own merits.
  assert.equal(matchesSomething('**/README.md', TREE), true);
});

test('collectFilters records each entry with its line number', () => {
  const workflow = [
    'on:',
    '  pull_request:',
    '    paths:',
    "      - 'packages/superdoc/**'",
    "      - 'packages/gone/**'",
    'jobs:',
    '  build:',
    '    runs-on: ubuntu-latest',
  ].join('\n');

  assert.deepEqual(collectFilters(workflow), [
    { glob: 'packages/superdoc/**', line: 4 },
    { glob: 'packages/gone/**', line: 5 },
  ]);
});

test('collectFilters skips negative patterns', () => {
  // `!foo` subtracts from a set and may legitimately name an absent path.
  const workflow = ["on:", "  pull_request:", "    paths:", "      - '**/*.md'", "      - '!packages/gone/**'"].join(
    '\n',
  );
  assert.deepEqual(collectFilters(workflow), [{ glob: '**/*.md', line: 4 }]);
});

test('collectFilters skips paths-ignore entries', () => {
  // Every entry under paths-ignore is an exclusion, so one matching nothing does
  // not make the workflow unreachable. Same reasoning as `!foo`.
  const workflow = ['on:', '  push:', '    paths-ignore:', "      - 'docs/**'"].join('\n');
  assert.deepEqual(collectFilters(workflow), []);
});

test('a paths-ignore block does not swallow a following paths block', () => {
  // The exclusion block must end at dedent, or a real dead trigger after it goes
  // unchecked.
  const workflow = [
    'on:',
    '  push:',
    '    paths-ignore:',
    "      - 'docs/**'",
    '  pull_request:',
    '    paths:',
    "      - 'packages/superdoc/**'",
  ].join('\n');
  assert.deepEqual(collectFilters(workflow), [{ glob: 'packages/superdoc/**', line: 7 }]);
});

test('collectFilters stops at the end of the block', () => {
  // `runs-on` is a sibling key, not a path entry; a parser that kept reading
  // would report workflow syntax as a dead filter.
  const workflow = [
    'on:',
    '  pull_request:',
    '    paths:',
    "      - 'packages/superdoc/**'",
    'jobs:',
    '  build:',
    '    steps:',
    '      - run: echo hi',
  ].join('\n');
  assert.deepEqual(collectFilters(workflow), [{ glob: 'packages/superdoc/**', line: 4 }]);
});

test('collectFilters reads dorny/paths-filter blocks', () => {
  // A stale entry here does not stop the workflow, it makes a job's `if:`
  // never fire, which is the same silent pass one level down.
  const workflow = [
    'jobs:',
    '  detect:',
    '    steps:',
    '      - uses: dorny/paths-filter@v3',
    '        with:',
    '          filters: |',
    '            superdoc:',
    "              - 'packages/superdoc/**'",
    "              - 'shared/**'",
    '            docs:',
    "              - 'apps/docs/**'",
    '      - run: echo done',
  ].join('\n');

  assert.deepEqual(collectFilters(workflow), [
    { glob: 'packages/superdoc/**', line: 8 },
    { glob: 'shared/**', line: 9 },
    { glob: 'apps/docs/**', line: 11 },
  ]);
});

test('collectFilters does not read past a dorny block', () => {
  // `- run:` and `- uses:` are steps, not paths. Treating them as globs would
  // report every workflow as broken.
  const workflow = [
    'jobs:',
    '  detect:',
    '    steps:',
    '      - uses: dorny/paths-filter@v3',
    '        with:',
    '          filters: |',
    "            superdoc:",
    "              - 'packages/superdoc/**'",
    '      - run: echo after',
    '      - uses: actions/checkout@v6',
  ].join('\n');

  assert.deepEqual(collectFilters(workflow), [{ glob: 'packages/superdoc/**', line: 8 }]);
});

test('the shared parser reads every filter form both guards see', () => {
  // These shapes were each fixed once in the Orbit-side parser while this one
  // still missed them. Sharing the implementation is what keeps them in step,
  // so the coverage lives with the shared module.
  const cases = [
    ["on:\n  push:\n    paths: ['scripts/**']", ['scripts/**']],
    ["on:\n  push:\n    paths: ['scripts/**'] # inputs", ['scripts/**']],
    ["on:\n  push:\n    paths: ['scripts/[Ss]uperdoc.mjs']", ['scripts/[Ss]uperdoc.mjs']],
    ["on:\n  push:\n    paths: [\n      'a/**',\n      'b/**'\n    ]", ['a/**', 'b/**']],
    [
      "jobs:\n  d:\n    steps:\n      - uses: dorny/paths-filter@v3\n        with:\n          filters: |2- # note\n            g:\n              - 'x/**'",
      ['x/**'],
    ],
  ];
  for (const [source, expected] of cases) {
    assert.deepEqual(
      collectFilters(source).map((entry) => entry.glob),
      expected,
      `failed on: ${JSON.stringify(source)}`,
    );
  }
});

test('an uninterpretable filter value is reported rather than skipped', () => {
  // Silently finding nothing is the same failure the guard exists to catch, one
  // level up: a shape the parser cannot read must not read as "no filters".
  const anchor = collectPathFilters("on:\n  push:\n    paths: &alias\n");
  assert.equal(anchor.entries.length, 0);
  assert.equal(anchor.unparsed.length, 1);
  assert.equal(anchor.unparsed[0].line, 3);

  const unterminated = collectPathFilters("on:\n  push:\n    paths: ['a/**',\n");
  assert.equal(unterminated.unparsed.length, 1);

  // A form it does read reports nothing unparsed.
  assert.deepEqual(collectPathFilters("on:\n  push:\n    paths: ['a/**']\n").unparsed, []);
});

test('sequence entries may sit at the same indentation as their key', () => {
  // Valid YAML, and a strict `>` check dropped the first entry then abandoned
  // the block, omitting every filter written this way.
  const workflow = ['on:', '  push:', '    paths:', "    - 'packages/gone/**'", "    - 'scripts/**'"].join('\n');
  assert.deepEqual(
    collectFilters(workflow).map((entry) => entry.glob),
    ['packages/gone/**', 'scripts/**'],
  );
});

test('a per-entry comment in a multiline flow sequence is stripped', () => {
  // Keeping it fused the comment onto the next entry and produced one bogus
  // glob out of two live ones, failing a workflow whose filters were all fine.
  const workflow = [
    'on:',
    '  push:',
    '    paths: [',
    "      'scripts/**', # workflow inputs",
    "      'package.json'",
    '    ]',
  ].join('\n');
  assert.deepEqual(
    collectFilters(workflow).map((entry) => entry.glob),
    ['scripts/**', 'package.json'],
  );
});

test('a hash inside a quoted glob is part of the path', () => {
  // Comment stripping must be quote aware, or a legitimate `#` truncates.
  const workflow = ['on:', '  push:', '    paths:', "      - 'docs/c#-guide/**'"].join('\n');
  assert.deepEqual(
    collectFilters(workflow).map((entry) => entry.glob),
    ['docs/c#-guide/**'],
  );
});

test('? makes the preceding character optional, per the Actions dialect', () => {
  // GitHub's docs: "the question mark (?) can be used to match zero or one
  // occurrence of the preceding character." Reading it as a single-character
  // wildcard calls a live filter dead, which blocks a correct workflow.
  const pattern = globToRegExp('.github/workflows/superdoc-quality.ym?l');
  assert.equal(pattern.test('.github/workflows/superdoc-quality.yml'), true);
  assert.equal(pattern.test('.github/workflows/superdoc-quality.yl'), true);
  assert.equal(pattern.test('.github/workflows/superdoc-quality.yXl'), false);

  // `?` after a wildcard makes that whole atom optional.
  assert.equal(globToRegExp('a/*?b').test('a/b'), true);
  assert.equal(globToRegExp('a/*?b').test('a/xxb'), true);

  // A leading `?` has no preceding atom; treat it as an optional character
  // rather than throwing.
  assert.equal(globToRegExp('?a').test('a'), true);
});

test('+ is one-or-more of the preceding character', () => {
  // GitHub lists `+` alongside `*`, `**`, `?`, and `!` as a filter operator.
  // Escaping it as a literal calls a live filter dead.
  const pattern = globToRegExp('.github/workflows/superdoc-quality.ym+l');
  assert.equal(pattern.test('.github/workflows/superdoc-quality.yml'), true);
  assert.equal(pattern.test('.github/workflows/superdoc-quality.ymml'), true);
  assert.equal(pattern.test('.github/workflows/superdoc-quality.yl'), false);
});

test('a backslash escapes an operator so it matches literally', () => {
  assert.equal(globToRegExp('a\\+b').test('a+b'), true);
  assert.equal(globToRegExp('a\\+b').test('aab'), false);
  assert.equal(globToRegExp('a\\*b').test('a*b'), true);
});

test('a kind filter inside a directory needs that directory to exist', () => {
  // `*.docx` names a kind of file wherever it sits, so the leaf cannot go stale.
  // The directory half can: a deleted package makes `packages/gone/*.ts`
  // unreachable. Both guards must agree, so the rule lives here.
  const tree = ['superdoc/public/package.json', 'packages/live/src/a.ts'];

  assert.equal(matchesSomething('superdoc/public/*.[dD]ocx', tree), true);
  assert.equal(matchesSomething('packages/gone/*.ts', tree), false);

  // A caller may resolve the directory itself, for a dir with no tracked files.
  assert.equal(matchesSomething('empty/dir/*.docx', tree, (dir) => dir === 'empty/dir'), true);
  assert.equal(matchesSomething('empty/dir/*.docx', tree, () => false), false);
});

test('every legal YAML shape for a path filter is either read or reported', () => {
  // A table rather than one case per shape, because the recurring failure here
  // was not any single form: it was discovering, one review round at a time,
  // that some legal spelling slipped through unseen. Silence is the bug, so the
  // requirement is that each shape is SEEN or explicitly flagged, never ignored.
  const shapes = [
    ['block sequence, deeper indent', "on:\n  push:\n    paths:\n      - 'X/**'\n"],
    ['block sequence, same indent', "on:\n  push:\n    paths:\n    - 'X/**'\n"],
    ['flow sequence', "on:\n  push:\n    paths: ['X/**']\n"],
    ['flow sequence, multiline', "on:\n  push:\n    paths: [\n      'X/**'\n    ]\n"],
    ['flow sequence with comment', "on:\n  push:\n    paths: ['X/**'] # note\n"],
    ['flow mapping', "on:\n  push: { paths: ['X/**'] }\n"],
    ['double-quoted scalar', 'on:\n  push:\n    paths:\n      - "X/**"\n'],
    ['unquoted scalar', 'on:\n  push:\n    paths:\n      - X/**\n'],
    ['dorny literal block', "j:\n d:\n  steps:\n   - with:\n      filters: |\n        g:\n          - 'X/**'\n"],
    ['dorny literal, chomped', "j:\n d:\n  steps:\n   - with:\n      filters: |-\n        g:\n          - 'X/**'\n"],
    ['dorny folded block', "j:\n d:\n  steps:\n   - with:\n      filters: >\n        g:\n          - 'X/**'\n"],
    ['dorny folded, chomped', "j:\n d:\n  steps:\n   - with:\n      filters: >-\n        g:\n          - 'X/**'\n"],
  ];

  for (const [name, source] of shapes) {
    const { entries, unparsed } = collectPathFilters(source);
    assert.ok(
      entries.some((entry) => entry.glob === 'X/**') || unparsed.length > 0,
      `${name}: filter neither read nor reported`,
    );
  }
});

test('the documented glob operators all behave as GitHub specifies', () => {
  // Checked against the workflow-syntax reference. Each of `?`, `+`, and the
  // backslash escape reached review as a bug, so they are pinned together.
  const cases = [
    ['**/a.md', 'x/y/a.md', true],
    ['p/*', 'p/q/r.ts', false],
    ['a.ym?l', 'a.yml', true],
    ['a.ym?l', 'a.yl', true],
    ['a.ym+l', 'a.ymml', true],
    ['a.ym+l', 'a.yml', true],
    ['a.ym+l', 'a.yl', false],
    ['*.[dD]ocx', 'A.Docx', true],
    ['v[0-9].md', 'v7.md', true],
    ['a\\+b', 'a+b', true],
    ['a\\+b', 'aab', false],
    ['a\\*b', 'a*b', true],
    ['a\\?b', 'a?b', true],
  ];
  for (const [glob, file, want] of cases) {
    assert.equal(globToRegExp(glob).test(file), want, `${glob} vs ${file}`);
  }
});

test('a paths-ignore key in a flow mapping is still skipped', () => {
  const { entries } = collectPathFilters("on:\n  push: { paths-ignore: ['never/**'] }\n");
  assert.deepEqual(entries, []);
});

test('an unreadable value is reported even inside a flow mapping', () => {
  assert.equal(collectPathFilters('on:\n  push:\n    paths: &alias\n').unparsed.length, 1);
  assert.equal(collectPathFilters('on:\n  push: { paths: !!seq [ ] }\n').unparsed.length, 1);
});

test('a paths key outside the on: block is not a path filter', () => {
  // A `strategy.matrix.paths` axis is a legal matrix dimension. Reading `fast`
  // and `thorough` as globs and checking them against the tree fails a correct
  // workflow, which is the wrong direction for this guard.
  const matrix = [
    'jobs:',
    '  build:',
    '    strategy:',
    '      matrix:',
    '        paths: [fast, thorough]',
  ].join('\n');
  assert.deepEqual(collectPathFilters(matrix).entries, []);
  assert.deepEqual(collectPathFilters(matrix).unparsed, []);

  // Block form of the same non-filter key.
  const blockMatrix = [
    'jobs:',
    '  build:',
    '    strategy:',
    '      matrix:',
    '        paths:',
    '          - fast',
  ].join('\n');
  assert.deepEqual(collectPathFilters(blockMatrix).entries, []);
});

test('a character class survives inside a flow mapping', () => {
  // The class's own `]` is not the array closer. The line-leading flow parser
  // already scanned for it outside quotes; the mapping parser has to as well.
  const workflow = "on: { push: { paths: ['scripts/[Ss]uperdoc-workflow-policy.mjs'] } }";
  assert.deepEqual(
    collectPathFilters(workflow).entries.map((entry) => entry.glob),
    ['scripts/[Ss]uperdoc-workflow-policy.mjs'],
  );
});

test('dorny filters are still read from under jobs:', () => {
  // Only the `paths:` forms are scoped to `on:`. A dorny block is recognized by
  // its own key and lives under `jobs:`, so scoping must not swallow it.
  const workflow = [
    'jobs:',
    '  detect:',
    '    steps:',
    '      - uses: dorny/paths-filter@v3',
    '        with:',
    '          filters: |',
    '            group:',
    "              - 'packages/superdoc/**'",
  ].join('\n');
  assert.deepEqual(
    collectPathFilters(workflow).entries.map((entry) => entry.glob),
    ['packages/superdoc/**'],
  );
});

test('a bare directory name is not treated as a prefix', () => {
  // GitHub's `paths:` semantics would expand `scripts` to everything beneath it,
  // but the lane selector matches the anchored glob, so `scripts` selects no
  // change. Calling it live would report a trigger as healthy that cannot
  // activate its own lane. Write `scripts/**` if that is the intent.
  const tree = ['scripts/a.mjs', 'package.json'];
  assert.equal(matchesSomething('scripts', tree), false);
  assert.equal(matchesSomething('scripts/', tree), false);
  assert.equal(matchesSomething('scripts/**', tree), true);

  // An exact tracked file still matches itself.
  assert.equal(matchesSomething('package.json', tree), true);
});

test('a quoted YAML key is the same key', () => {
  // `'on':` and `"paths":` are equivalent spellings and appear in hand-written
  // workflows. Missing them meant a dead filter passed silently.
  const cases = [
    "'on':\n  push:\n    paths:\n      - 'pkg/gone/**'\n",
    'on:\n  push:\n    "paths": ["pkg/gone/**"]\n',
    "on:\n  push:\n    'paths':\n      - 'pkg/gone/**'\n",
    "'on': { push: { 'paths': ['pkg/gone/**'] } }\n",
  ];
  for (const source of cases) {
    assert.deepEqual(
      collectPathFilters(source).entries.map((entry) => entry.glob),
      ['pkg/gone/**'],
      `failed on: ${JSON.stringify(source)}`,
    );
  }
});

test('a comment on any line a glob passes through is stripped', () => {
  // A table because this bug arrived four separate times: the entry line, the
  // continuation line, the block-scalar header, and finally the flow opener,
  // each fixed in isolation while the next one waited. The requirement is that
  // no comment survives into a glob on ANY path through the parser, so the
  // shapes are enumerated rather than discovered.
  const shapes = [
    ['block entry', "on:\n  push:\n    paths:\n      - 'a/**' # c\n"],
    ['block key line', "on:\n  push:\n    paths: # c\n      - 'a/**'\n"],
    ['flow single line', "on:\n  push:\n    paths: ['a/**'] # c\n"],
    ['flow opener', "on:\n  push:\n    paths: [ # c\n      'a/**'\n    ]\n"],
    ['flow continuation', "on:\n  push:\n    paths: [\n      'a/**', # c\n      'b/**'\n    ]\n"],
    ['flow closer line', "on:\n  push:\n    paths: [\n      'a/**'\n    ] # c\n"],
    ['flow mapping', "on:\n  push: { paths: ['a/**'] } # c\n"],
    ['dorny entry', "jobs:\n d:\n  steps:\n   - with:\n      filters: |\n        g:\n          - 'a/**' # c\n"],
    ['dorny header', "jobs:\n d:\n  steps:\n   - with:\n      filters: | # c\n        g:\n          - 'a/**'\n"],
    ['dorny group line', "jobs:\n d:\n  steps:\n   - with:\n      filters: |\n        g: # c\n          - 'a/**'\n"],
  ];

  for (const [name, source] of shapes) {
    const globs = collectPathFilters(source).entries.map((entry) => entry.glob);
    assert.ok(globs.length > 0, `${name}: filter not read at all`);
    for (const glob of globs) {
      assert.ok(!glob.includes('#'), `${name}: comment leaked into ${JSON.stringify(glob)}`);
    }
  }
});

test('every recognized key accepts every legal spelling', () => {
  // A quoted key is the same key in YAML. `paths` and `on` were fixed for this
  // one round before `filters` was reported with the identical gap, because each
  // key defined its own quoting. The quoting rule is now shared, and this table
  // is what makes a new key that forgets it visible.
  const shapes = [
    ['on', (key) => `${key}:\n  push:\n    paths:\n      - 'X/**'\n`],
    ['paths', (key) => `on:\n  push:\n    ${key}:\n      - 'X/**'\n`],
    ['paths', (key) => `on:\n  push:\n    ${key}: ['X/**']\n`],
    ['paths', (key) => `on:\n  push: { ${key}: ['X/**'] }\n`],
    [
      'filters',
      (key) => `jobs:\n d:\n  steps:\n   - with:\n      ${key}: |\n        g:\n          - 'X/**'\n`,
    ],
  ];

  for (const [name, build] of shapes) {
    for (const spelling of [name, `'${name}'`, `"${name}"`]) {
      const globs = collectPathFilters(build(spelling)).entries.map((entry) => entry.glob);
      assert.ok(
        globs.includes('X/**'),
        `key ${spelling} in the ${name} position: filter not read`,
      );
    }
  }
});

test('a dorny change-type mapping yields its paths, not the mapping', () => {
  // dorny's own FilterItemYaml is
  //   string | { [changeTypes]: string | string[] } | FilterItemYaml[]
  // so an entry may carry `added`, `modified`, `deleted`, joined by `|`, with a
  // single glob or a list. Those types are metadata; passing the whole mapping
  // through as a glob reports a live filter as dead.
  const wrap = (body) => `jobs:\n d:\n  steps:\n   - with:\n      filters: |\n        g:\n${body}`;
  const cases = [
    ["          - 'X/**'\n", ['X/**']],
    ['          - X/**\n', ['X/**']],
    ["          - added: 'X/**'\n", ['X/**']],
    ["          - added|modified: 'X/**'\n", ['X/**']],
    ["          - added|deleted|modified: 'X/**'\n", ['X/**']],
    ['          - added|modified: X/**\n', ['X/**']],
    ["          - added|modified: ['X/**', 'Y/**']\n", ['X/**', 'Y/**']],
    ["          - added: 'X/**' # note\n", ['X/**']],
  ];
  for (const [body, expected] of cases) {
    assert.deepEqual(
      collectPathFilters(wrap(body)).entries.map((entry) => entry.glob),
      expected,
      `failed on: ${body.trim()}`,
    );
  }

  // A path that merely starts with a change-type word is not a mapping.
  assert.deepEqual(
    collectPathFilters(wrap("          - 'added-files/**'\n")).entries.map((e) => e.glob),
    ['added-files/**'],
  );
});
