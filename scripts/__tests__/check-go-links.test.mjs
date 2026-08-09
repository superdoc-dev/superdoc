import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { findGoLinkProblems } from '../check-go-links.mjs';

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function withRegistry(run) {
  const root = mkdtempSync(path.join(tmpdir(), 'superdoc-go-links-'));
  const goLinks = path.join(root, 'go-links');
  mkdirSync(goLinks, { recursive: true });
  mkdirSync(path.join(root, 'examples', 'react'), { recursive: true });
  mkdirSync(path.join(root, 'examples', 'vanilla'), { recursive: true });

  const config = {
    links: { repo: 'superdoc/docx-editor', file: 'go-links/links.json' },
  };
  const registry = {
    version: 1,
    defaults: { repository: 'superdoc/docx-editor', ref: 'main' },
    links: {
      'examples/react': { path: 'examples/react' },
      'examples/vanilla': { path: 'examples/vanilla' },
      react: { path: 'examples/react' },
      vanilla: { path: 'examples/vanilla' },
    },
  };
  const published = ['examples/react', 'examples/vanilla', 'react', 'vanilla'];

  const write = () => {
    writeFileSync(path.join(goLinks, 'linkkeeper.json'), JSON.stringify(config));
    writeFileSync(path.join(goLinks, 'links.json'), JSON.stringify(registry));
    writeFileSync(path.join(goLinks, 'published-routes.json'), JSON.stringify(published));
  };

  try {
    write();
    run({ root, registry, published, write });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('accepts canonical example routes and their old aliases', () => {
  withRegistry(({ root }) => assert.deepEqual(findGoLinkProblems(root), []));
});

test('keeps a published route in the registry', () => {
  withRegistry(({ root, registry, write }) => {
    delete registry.links.react;
    write();
    assert.match(findGoLinkProblems(root).join('\n'), /react: published route is missing/);
  });
});

test('rejects deleting a permanent route from both mutable files', () => {
  withRegistry(({ root, registry, published, write }) => {
    registry.links.comments = { repository: 'superdoc-dev/demos', path: 'comments' };
    published.push('comments');
    published.sort();
    write();

    git(root, ['init', '--quiet']);
    git(root, ['add', '.']);
    git(root, [
      '-c',
      'user.name=SuperDoc CI',
      '-c',
      'user.email=ci@superdoc.dev',
      'commit',
      '--quiet',
      '-m',
      'baseline',
    ]);
    const baselineRef = git(root, ['rev-parse', 'HEAD']);

    delete registry.links.comments;
    published.splice(published.indexOf('comments'), 1);
    write();

    assert.match(
      findGoLinkProblems(root, { baselineRef }).join('\n'),
      /comments: permanent route was removed from go-links\/published-routes.json/,
    );
  });
});

test('allows the permanent record to be introduced on a baseline that lacks it', () => {
  withRegistry(({ root, write }) => {
    rmSync(path.join(root, 'go-links'), { recursive: true, force: true });
    git(root, ['init', '--quiet']);
    writeFileSync(path.join(root, 'README.md'), 'before go links\n');
    git(root, ['add', '.']);
    git(root, [
      '-c',
      'user.name=SuperDoc CI',
      '-c',
      'user.email=ci@superdoc.dev',
      'commit',
      '--quiet',
      '-m',
      'baseline',
    ]);
    const baselineRef = git(root, ['rev-parse', 'HEAD']);

    mkdirSync(path.join(root, 'go-links'), { recursive: true });
    write();
    assert.deepEqual(findGoLinkProblems(root, { baselineRef }), []);
  });
});

test('rejects a historical removal after a later commit', () => {
  withRegistry(({ root, registry, published, write }) => {
    registry.links.comments = { repository: 'superdoc-dev/demos', path: 'comments' };
    published.push('comments');
    published.sort();
    write();

    git(root, ['init', '--quiet']);
    git(root, ['add', '.']);
    git(root, [
      '-c',
      'user.name=SuperDoc CI',
      '-c',
      'user.email=ci@superdoc.dev',
      'commit',
      '--quiet',
      '-m',
      'published',
    ]);

    delete registry.links.comments;
    published.splice(published.indexOf('comments'), 1);
    write();
    git(root, ['add', '.']);
    git(root, [
      '-c',
      'user.name=SuperDoc CI',
      '-c',
      'user.email=ci@superdoc.dev',
      'commit',
      '--quiet',
      '-m',
      'bad removal',
    ]);

    writeFileSync(path.join(root, 'README.md'), 'later commit\n');
    git(root, ['add', '.']);
    git(root, [
      '-c',
      'user.name=SuperDoc CI',
      '-c',
      'user.email=ci@superdoc.dev',
      'commit',
      '--quiet',
      '-m',
      'later commit',
    ]);

    assert.match(
      findGoLinkProblems(root, { historyRef: 'HEAD' }).join('\n'),
      /comments: permanent route was removed from go-links\/published-routes.json/,
    );
  });
});

test('requires a newly published route to enter the permanent record', () => {
  withRegistry(({ root, registry, write }) => {
    registry.links['examples/new-example'] = { repository: 'superdoc-dev/demos', path: 'new-example' };
    write();
    assert.match(findGoLinkProblems(root).join('\n'), /add new route to go-links\/published-routes/);
  });
});

test('allows a permanent route to follow a moved source directory', () => {
  withRegistry(({ root, registry, write }) => {
    mkdirSync(path.join(root, 'moved', 'react'), { recursive: true });
    registry.links['examples/react'].path = 'moved/react';
    registry.links.react.path = 'moved/react';
    write();
    assert.deepEqual(findGoLinkProblems(root), []);
  });
});

test('keeps a compatibility route on the canonical destination', () => {
  withRegistry(({ root, registry, write }) => {
    registry.links.react.path = 'examples/vanilla';
    write();
    assert.match(findGoLinkProblems(root).join('\n'), /react: compatibility route must match examples\/react/);
  });
});

test('rejects a missing local destination', () => {
  withRegistry(({ root, registry, write }) => {
    registry.links.react.path = 'missing/react';
    registry.links['examples/react'].path = 'missing/react';
    write();
    assert.match(findGoLinkProblems(root).join('\n'), /local destination 'missing\/react' does not exist/);
  });
});

test('does not confuse a dot-prefixed local directory with traversal', () => {
  withRegistry(({ root, registry, write }) => {
    mkdirSync(path.join(root, '..hidden', 'react'), { recursive: true });
    registry.links.react.path = '..hidden/react';
    registry.links['examples/react'].path = '..hidden/react';
    write();
    assert.deepEqual(findGoLinkProblems(root), []);
  });
});

test('rejects malformed nested routes', () => {
  withRegistry(({ root, registry, published, write }) => {
    registry.links['examples//broken'] = { repository: 'superdoc-dev/demos', path: 'broken' };
    published.unshift('examples//broken');
    write();
    assert.match(findGoLinkProblems(root).join('\n'), /route must contain lowercase kebab-case path segments/);
  });
});
