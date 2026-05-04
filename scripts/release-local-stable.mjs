#!/usr/bin/env node

/**
 * Stable tooling bundle: CLI -> SDK -> MCP, in order.
 *
 * Used both in CI (release-stable.yml) and locally (`pnpm release:local`).
 * Releasing these three together solves three GitHub Actions semantics
 * problems that per-workflow chains hit: shared concurrency cancellation,
 * `id-token: write` permission propagation for PyPI OIDC, and double-fire
 * from overlapping path filters. One workflow, one queue slot, one
 * permission context.
 *
 * Order rationale:
 * - CLI ships native binaries used by SDK.
 * - SDK packages those CLI binaries into Node + Python distributions.
 * - MCP imports SDK + engine code and ships against pinned SDK versions.
 *
 * superdoc, react, esign, template-builder, and vscode-ext release
 * independently via their own per-package stable workflows. SuperDoc
 * promotion of docs-stable is keyed to the SuperDoc workflow specifically.
 *
 * Usage:
 *   pnpm run release:local [-- --dry-run]
 *   node scripts/release-local-stable.mjs [--dry-run] [--branch=<name>]
 *
 * Flags:
 *   --branch=<name>  Override the expected branch (default: stable)
 *   All other flags are forwarded to every semantic-release invocation.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listTags, pruneLocalOnlyReleaseTags, run, runSemanticRelease } from './release-local.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const GITHUB_API_VERSION = '2022-11-28';

const CLI_NPM_PACKAGES = [
  '@superdoc-dev/cli-darwin-arm64',
  '@superdoc-dev/cli-darwin-x64',
  '@superdoc-dev/cli-linux-x64',
  '@superdoc-dev/cli-linux-arm64',
  '@superdoc-dev/cli-windows-x64',
  '@superdoc-dev/cli',
];

const SDK_NODE_NPM_PACKAGES = [
  '@superdoc-dev/sdk-darwin-arm64',
  '@superdoc-dev/sdk-darwin-x64',
  '@superdoc-dev/sdk-linux-x64',
  '@superdoc-dev/sdk-linux-arm64',
  '@superdoc-dev/sdk-windows-x64',
  '@superdoc-dev/sdk',
];

const SDK_PYTHON_PACKAGES = [
  'superdoc-sdk-cli-darwin-arm64',
  'superdoc-sdk-cli-darwin-x64',
  'superdoc-sdk-cli-linux-x64',
  'superdoc-sdk-cli-linux-arm64',
  'superdoc-sdk-cli-windows-x64',
  'superdoc-sdk',
];

function runInWorkspace(workspaceRoot, command, args, options = {}) {
  const { capture = false, env = process.env } = options;
  return execFileSync(command, args, {
    cwd: workspaceRoot,
    env,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
}

function captureInWorkspace(workspaceRoot, command, args, options = {}) {
  const { env = process.env } = options;
  try {
    return {
      stdout: execFileSync(command, args, {
        cwd: workspaceRoot,
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
      stderr: '',
      status: 0,
      error: null,
    };
  } catch (error) {
    return {
      stdout: typeof error.stdout === 'string' ? error.stdout : String(error.stdout ?? ''),
      stderr: typeof error.stderr === 'string' ? error.stderr : String(error.stderr ?? ''),
      status: Number.isInteger(error.status) ? error.status : null,
      error,
    };
  }
}

function getCurrentBranch(cwd = REPO_ROOT) {
  return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd,
    encoding: 'utf8',
  }).trim();
}

function getCurrentHead(cwd = REPO_ROOT) {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd,
    encoding: 'utf8',
  }).trim();
}

function getRemoteHead(branchName) {
  return execFileSync('git', ['rev-parse', `origin/${branchName}`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim();
}

function getTagCommit(tag) {
  return execFileSync('git', ['rev-list', '-1', tag], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim();
}

function listMergedTags(pattern, ref = 'HEAD') {
  const output = execFileSync(
    'git',
    ['tag', '--merged', ref, '--list', pattern, '--sort=-version:refname'],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    },
  ).trim();

  return output
    ? output
        .split('\n')
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];
}

function isPrereleaseTag(tag) {
  return tag.includes('-next.');
}

// On stable, prerelease tags (`*-next.*`) created on main are still reachable
// through merge commits but must NEVER be treated as "the latest stable
// release" during recovery. Filter them out at every callsite that consumes
// a stable tag list.
function listStableMergedTags(pattern, ref = 'HEAD') {
  return listMergedTags(pattern, ref).filter((tag) => !isPrereleaseTag(tag));
}

function getPreviousMergedReleaseTag(pattern, currentTag, ref = 'HEAD') {
  const tags = isPrereleaseTag(currentTag)
    ? listMergedTags(pattern, ref)
    : listStableMergedTags(pattern, ref);
  const currentIndex = tags.indexOf(currentTag);
  return currentIndex === -1 ? '' : (tags[currentIndex + 1] ?? '');
}

function getDistTagForVersion(version) {
  return version.includes('-next.') ? 'next' : 'latest';
}

function getVersionFromTag(pkg, tag) {
  return tag.startsWith(pkg.tagPrefix) ? tag.slice(pkg.tagPrefix.length) : tag;
}

function isLikelyStaleHeadFailure(error) {
  const message = error && typeof error.message === 'string' ? error.message : String(error);
  return (
    message.includes('failed to push some refs') ||
    message.includes('non-fast-forward') ||
    message.includes('Updates were rejected because the remote contains work that you do not have locally') ||
    message.includes('Updates were rejected because the tip of your current branch is behind')
  );
}

function isVersionLookupNotFound(details) {
  return /E404|Not found|not found|No match found/i.test(details);
}

function isNpmVersionPublished(packageName, version, workspaceRoot = REPO_ROOT) {
  const result = captureInWorkspace(
    workspaceRoot,
    'npm',
    ['view', `${packageName}@${version}`, 'version'],
  );

  if (result.status === 0) {
    return true;
  }

  const details = `${result.stderr}\n${result.stdout}`.trim();
  if (isVersionLookupNotFound(details)) {
    return false;
  }

  if (result.error) {
    throw result.error;
  }

  throw new Error(`Failed to check published version for ${packageName}@${version}: ${details || 'unknown error'}`);
}

function isVsCodeExtensionNotFound(details) {
  return /not found|does not exist|404/i.test(details);
}

function isVsCodeExtensionVersionPublished(extensionId, version, workspaceRoot = REPO_ROOT) {
  const extensionPrefix = join(workspaceRoot, 'apps/vscode-ext');
  const result = captureInWorkspace(
    workspaceRoot,
    'pnpm',
    ['--prefix', extensionPrefix, 'exec', 'vsce', 'show', extensionId, '--json'],
  );

  if (result.status !== 0) {
    const details = `${result.stderr}\n${result.stdout}`.trim();
    if (isVsCodeExtensionNotFound(details)) {
      return false;
    }
    if (result.error) {
      throw result.error;
    }
    throw new Error(`Failed to inspect VS Code extension ${extensionId}: ${details || 'unknown error'}`);
  }

  const metadata = JSON.parse(result.stdout);
  const versions = Array.isArray(metadata.versions) ? metadata.versions : [];
  if (versions.length === 0 && typeof metadata.version === 'string') {
    return metadata.version === version;
  }

  return versions.some((entry) => {
    if (typeof entry === 'string') return entry === version;
    return entry && typeof entry.version === 'string' ? entry.version === version : false;
  });
}

async function isPyPiVersionPublished(packageName, version) {
  const response = await fetchWithRetry(
    `https://pypi.org/pypi/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}/json`,
    { headers: { Accept: 'application/json' } },
    { label: `PyPI ${packageName}@${version}` },
  );

  if (response.status === 404) {
    return false;
  }

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Failed to check PyPI version for ${packageName}@${version}: ${response.status} ${details}`);
  }

  return true;
}

function getOriginRepository() {
  const repository = process.env.GITHUB_REPOSITORY;
  if (repository) {
    return repository;
  }

  try {
    const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();

    const sshMatch = remoteUrl.match(/^git@github\.com:(.+?)(?:\.git)?$/);
    if (sshMatch) {
      return sshMatch[1];
    }

    const httpsMatch = remoteUrl.match(/^https:\/\/github\.com\/(.+?)(?:\.git)?$/);
    if (httpsMatch) {
      return httpsMatch[1];
    }
  } catch {
    return '';
  }

  return '';
}

function hasGitHubReleaseContext() {
  return Boolean(process.env.GITHUB_TOKEN) && Boolean(getOriginRepository());
}

// Wraps fetch with bounded retry on transient network errors. The original
// stable bundle failure that drove this refactor was a one-off `fetch failed`
// against api.github.com during a release-state probe; without retry that
// blip cancelled the entire release.
async function fetchWithRetry(url, init, { attempts = 3, label = url } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      const cause = error && error.cause ? ` (cause: ${error.cause.code || error.cause.message || error.cause})` : '';
      if (attempt === attempts) {
        throw new Error(`fetch ${label} failed after ${attempts} attempts: ${error.message}${cause}`);
      }
      const backoffMs = 500 * 2 ** (attempt - 1);
      console.warn(`fetch ${label} attempt ${attempt}/${attempts} failed: ${error.message}${cause} - retrying in ${backoffMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastError;
}

async function githubJsonRequest(pathname, options = {}) {
  const { method = 'GET', body, allow404 = false } = options;
  const response = await fetchWithRetry(
    `https://api.github.com${pathname}`,
    {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'superdoc-release-stable',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
      body: body ? JSON.stringify(body) : undefined,
    },
    { label: `GitHub ${method} ${pathname}` },
  );

  if (allow404 && response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`GitHub API ${method} ${pathname} failed: ${response.status} ${details}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function githubBinaryRequest(url, options = {}) {
  const { method = 'POST', body, headers = {} } = options;
  const response = await fetchWithRetry(
    url,
    {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'User-Agent': 'superdoc-release-stable',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        ...headers,
      },
      body,
    },
    { label: `GitHub upload ${method}` },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`GitHub upload ${method} ${url} failed: ${response.status} ${details}`);
  }

  return response.json();
}

async function getGitHubReleaseByTag(tag) {
  if (!hasGitHubReleaseContext()) {
    return null;
  }

  const repository = getOriginRepository();
  return githubJsonRequest(`/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`, { allow404: true });
}

async function generateGitHubReleaseNotes({ tag, targetCommit, previousTag }) {
  const repository = getOriginRepository();
  try {
    return await githubJsonRequest(`/repos/${repository}/releases/generate-notes`, {
      method: 'POST',
      body: {
        tag_name: tag,
        target_commitish: targetCommit,
        ...(previousTag ? { previous_tag_name: previousTag } : {}),
      },
    });
  } catch (error) {
    console.warn(`Failed to generate GitHub release notes for ${tag}: ${error.message}`);
    return { name: tag, body: `Recovered release metadata for ${tag}.` };
  }
}

function getExpectedReleaseAssets(pkg, workspaceRoot) {
  if (pkg.name !== 'vscode-ext') {
    return [];
  }

  const extensionDir = join(workspaceRoot, 'apps/vscode-ext');
  let assets = readdirSync(extensionDir)
    .filter((entry) => entry.endsWith('.vsix'))
    .map((entry) => join(extensionDir, entry));

  if (assets.length > 0) {
    return assets;
  }

  runInWorkspace(workspaceRoot, 'pnpm', ['--prefix', extensionDir, 'run', 'package']);
  assets = readdirSync(extensionDir)
    .filter((entry) => entry.endsWith('.vsix'))
    .map((entry) => join(extensionDir, entry));

  if (assets.length === 0) {
    throw new Error('Expected VS Code packaging to produce a .vsix artifact.');
  }

  return assets;
}

async function ensureGitHubReleaseAssets(release, pkg, workspaceRoot) {
  const assets = getExpectedReleaseAssets(pkg, workspaceRoot);
  const existing = new Set((release.assets ?? []).map((asset) => asset.name));
  const uploadBaseUrl = release.upload_url.replace(/\{\?name,label\}$/, '');

  for (const assetPath of assets) {
    const assetName = basename(assetPath);
    if (existing.has(assetName)) {
      continue;
    }

    const binary = readFileSync(assetPath);
    await githubBinaryRequest(`${uploadBaseUrl}?name=${encodeURIComponent(assetName)}`, {
      body: binary,
      headers: {
        'Content-Length': String(binary.byteLength),
        'Content-Type': 'application/octet-stream',
      },
    });
  }
}

function isGitHubReleaseComplete(pkg, release) {
  if (!hasGitHubReleaseContext()) {
    return true;
  }

  if (!release) {
    return false;
  }

  if (pkg.name === 'vscode-ext') {
    return Array.isArray(release.assets) && release.assets.some((asset) => asset.name.endsWith('.vsix'));
  }

  return true;
}

async function ensureGitHubRelease(pkg, { tag, targetCommit, previousTag, workspaceRoot }) {
  if (!hasGitHubReleaseContext()) {
    return null;
  }

  const repository = getOriginRepository();
  let release = await getGitHubReleaseByTag(tag);
  if (!release) {
    const generated = await generateGitHubReleaseNotes({ tag, targetCommit, previousTag });
    release = await githubJsonRequest(`/repos/${repository}/releases`, {
      method: 'POST',
      body: {
        tag_name: tag,
        target_commitish: targetCommit,
        name: generated.name || tag,
        body: generated.body || '',
        draft: false,
        prerelease: false,
      },
    });
  }

  if (pkg.name === 'vscode-ext') {
    await ensureGitHubReleaseAssets(release, pkg, workspaceRoot);
    release = await getGitHubReleaseByTag(tag);
  }

  return release;
}

function installWorkspaceDependencies(workspaceRoot) {
  console.log(`Installing dependencies in tagged snapshot: ${workspaceRoot}`);
  runInWorkspace(workspaceRoot, 'pnpm', ['install', '--frozen-lockfile']);
}

async function withTemporaryWorktree(tag, callback) {
  const tempRoot = mkdtempSync(join(tmpdir(), 'stable-release-'));
  const worktreeRoot = join(tempRoot, 'worktree');

  run('git', ['worktree', 'add', '--detach', worktreeRoot, tag]);

  try {
    return await callback(worktreeRoot);
  } finally {
    run('git', ['worktree', 'remove', '--force', worktreeRoot]);
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function copySdkPythonArtifacts(workspaceRoot, tag) {
  const tempRoot = mkdtempSync(join(tmpdir(), `sdk-python-${tag.replace(/[^a-zA-Z0-9.-]/g, '-')}-`));
  const companionDir = join(tempRoot, 'companion-dist');
  const mainDir = join(tempRoot, 'dist');

  cpSync(join(workspaceRoot, 'packages/sdk/langs/python/companion-dist'), companionDir, { recursive: true });
  cpSync(join(workspaceRoot, 'packages/sdk/langs/python/dist'), mainDir, { recursive: true });

  return { tag, companionDir, mainDir };
}

function setStepOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) {
    return;
  }

  appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value ?? ''}\n`);
}

function recordSdkPythonSnapshot(snapshot) {
  if (!snapshot) {
    return;
  }

  setStepOutput('sdk_python_snapshot_tag', snapshot.tag);
  setStepOutput('sdk_python_snapshot_companion_dir', snapshot.companionDir);
  setStepOutput('sdk_python_snapshot_main_dir', snapshot.mainDir);
}

// Bundle order is CLI -> SDK -> MCP. After MCP releases, HEAD points at MCP's
// version commit, so `git tag --points-at HEAD --list 'sdk-v*'` returns
// nothing. Emit SDK release coordinates directly so the Python publish step
// has stable inputs that don't depend on HEAD.
function recordSdkReleaseOutputs(sdkResult) {
  if (!sdkResult || !sdkResult.newTags || sdkResult.newTags.length === 0) {
    return;
  }

  const tag = sdkResult.newTags[0];
  const version = tag.startsWith('sdk-v') ? tag.slice('sdk-v'.length) : tag;
  const distTag = version.includes('-next.') ? 'next' : 'latest';

  setStepOutput('sdk_release_present', 'true');
  setStepOutput('sdk_release_tag', tag);
  setStepOutput('sdk_release_version', version);
  setStepOutput('sdk_release_dist_tag', distTag);
}

async function inspectPackageReleaseState(pkg, { tag, version, workspaceRoot = REPO_ROOT }) {
  let publishComplete = true;
  if (pkg.vsCodeExtensionId) {
    publishComplete = isVsCodeExtensionVersionPublished(pkg.vsCodeExtensionId, version, workspaceRoot);
  } else if (pkg.npmPackages) {
    publishComplete = pkg.npmPackages.every((packageName) =>
      isNpmVersionPublished(packageName, version, workspaceRoot),
    );
  }

  const release = hasGitHubReleaseContext() ? await getGitHubReleaseByTag(tag) : null;
  const githubComplete = isGitHubReleaseComplete(pkg, release);

  let sdkPythonPublished = true;
  if (pkg.pythonPackages) {
    const publishedFlags = await Promise.all(
      pkg.pythonPackages.map((packageName) => isPyPiVersionPublished(packageName, version)),
    );
    sdkPythonPublished = publishedFlags.every(Boolean);
  }

  return {
    publishComplete,
    githubComplete,
    sdkPythonPublished,
    release,
  };
}

function isTagAtHead(tag) {
  return getTagCommit(tag) === getCurrentHead();
}

function refreshRemoteState(branchName) {
  run('git', ['fetch', 'origin', branchName, '--tags']);
}

class StableBranchAdvancedError extends Error {}

function ensureBranchHeadCurrent(branchName) {
  const localHead = getCurrentHead();
  const remoteHead = getRemoteHead(branchName);

  if (localHead !== remoteHead) {
    throw new StableBranchAdvancedError(
      `Branch ${branchName} advanced during the release run (local ${localHead.slice(0, 12)} vs remote ${remoteHead.slice(0, 12)}).`,
    );
  }
}

function resumePackagePublish(pkg, distTag, options = {}) {
  const { workspaceRoot = REPO_ROOT, skipBuild = workspaceRoot === REPO_ROOT } = options;

  switch (pkg.name) {
    case 'cli':
      runInWorkspace(workspaceRoot, 'pnpm', ['--prefix', join(workspaceRoot, 'apps/cli'), 'run', 'build:prepublish']);
      runInWorkspace(workspaceRoot, 'node', [join(workspaceRoot, 'apps/cli/scripts/publish.js'), '--tag', distTag]);
      break;
    case 'sdk':
      runInWorkspace(workspaceRoot, 'node', [
        join(workspaceRoot, 'packages/sdk/scripts/sdk-release-publish.mjs'),
        '--tag',
        distTag,
        '--npm-only',
      ]);
      break;
    case 'mcp': {
      // MCP recovery snapshots only run `pnpm install`, so MCP's build output
      // isn't on disk. Rebuild before publishing so the `dist/` tarball
      // declared in apps/mcp/package.json files actually ships.
      if (!skipBuild) {
        runInWorkspace(workspaceRoot, 'pnpm', ['run', 'generate:all']);
        runInWorkspace(workspaceRoot, 'pnpm', ['run', 'build:superdoc']);
        runInWorkspace(workspaceRoot, 'pnpm', ['--prefix', join(workspaceRoot, 'packages/sdk/langs/node'), 'run', 'build']);
      }
      const mcpRoot = join(workspaceRoot, 'apps/mcp');
      runInWorkspace(mcpRoot, 'pnpm', ['run', 'build']);
      // `pnpm publish` does not honor `--prefix` (passes through to npm and
      // errors with EUSAGE); it must run with cwd at the package root.
      runInWorkspace(mcpRoot, 'pnpm', [
        'publish',
        '--no-git-checks',
        '--access',
        'public',
        '--tag',
        distTag,
      ]);
      break;
    }
    default:
      throw new Error(`No resume command configured for ${pkg.name}`);
  }
}

async function recoverPackageRelease(pkg, { tag, version, distTag, branchRef, initialState = null }) {
  const targetCommit = getTagCommit(tag);
  const tagAtHead = isTagAtHead(tag);

  const recoverInWorkspace = async (workspaceRoot, { snapshot }) => {
    if (snapshot) {
      installWorkspaceDependencies(workspaceRoot);
    }

    let state = initialState ?? (await inspectPackageReleaseState(pkg, { tag, version, workspaceRoot }));
    const needsSnapshotPython = pkg.name === 'sdk' && !state.sdkPythonPublished && snapshot;
    const needsPublishResume = !state.publishComplete || needsSnapshotPython;

    if (needsPublishResume) {
      console.log(
        `${pkg.name} release ${tag} is incomplete; resuming publish (${distTag})${snapshot ? ' from tagged snapshot' : ''}.`,
      );
      resumePackagePublish(pkg, distTag, { workspaceRoot, skipBuild: !snapshot });
      state = await inspectPackageReleaseState(pkg, { tag, version, workspaceRoot });
    }

    let sdkPythonSnapshot = null;
    if (pkg.name === 'sdk' && !state.sdkPythonPublished && snapshot) {
      console.log(`Preparing Python SDK artifacts for recovered ${tag} snapshot.`);
      runInWorkspace(workspaceRoot, 'node', [join(workspaceRoot, 'packages/sdk/scripts/build-python-sdk.mjs')]);
      sdkPythonSnapshot = copySdkPythonArtifacts(workspaceRoot, tag);
    }

    const previousTag = getPreviousMergedReleaseTag(pkg.tagPattern, tag, branchRef);
    await ensureGitHubRelease(pkg, {
      tag,
      targetCommit,
      previousTag,
      workspaceRoot,
    });

    const finalState = await inspectPackageReleaseState(pkg, { tag, version, workspaceRoot });
    const readyForWorkflowPython = pkg.name !== 'sdk' || finalState.sdkPythonPublished || sdkPythonSnapshot || tagAtHead;
    const missingParts = [
      finalState.publishComplete ? '' : 'package publish',
      finalState.githubComplete ? '' : 'GitHub release',
      readyForWorkflowPython ? '' : 'Python snapshot artifacts',
    ].filter(Boolean);

    if (missingParts.length > 0) {
      throw new Error(`Recovery for ${pkg.name} ${tag} is still incomplete: ${missingParts.join(', ')}`);
    }

    return { tag, version, distTag, sdkPythonSnapshot };
  };

  if (tagAtHead) {
    return recoverInWorkspace(REPO_ROOT, { snapshot: false });
  }

  return withTemporaryWorktree(tag, (workspaceRoot) => recoverInWorkspace(workspaceRoot, { snapshot: true }));
}

async function maybeRecoverIncompleteRelease(pkg, branchRef) {
  // Stable recovery must skip `*-next.*` tags - those are prereleases cut on
  // main that flow into stable through merge commits but never represent a
  // pending stable publish. Picking one would resume against a npm @next
  // package as if it were @latest, polluting the stable channel.
  const latestTag = expectedBranch === 'stable'
    ? listStableMergedTags(pkg.tagPattern, branchRef)[0]
    : listMergedTags(pkg.tagPattern, branchRef)[0];
  if (!latestTag) {
    return null;
  }

  const version = getVersionFromTag(pkg, latestTag);
  const distTag = getDistTagForVersion(version);
  const state = await inspectPackageReleaseState(pkg, {
    tag: latestTag,
    version,
  });

  const needsSnapshotPython = pkg.name === 'sdk' && !state.sdkPythonPublished && !isTagAtHead(latestTag);
  const needsRecovery = !state.publishComplete || !state.githubComplete || needsSnapshotPython;
  if (!needsRecovery) {
    return null;
  }

  console.log(
    `\nRecovering incomplete ${pkg.name} release ${latestTag}${isTagAtHead(latestTag) ? ' from current HEAD' : ' from tagged snapshot'}.`,
  );
  const recovery = await recoverPackageRelease(pkg, {
    tag: latestTag,
    version,
    distTag,
    branchRef,
    initialState: state,
  });
  recordSdkPythonSnapshot(recovery.sdkPythonSnapshot);
  return recovery;
}

// ---------------------------------------------------------------------------
// Parse own flags vs forwarded flags
// ---------------------------------------------------------------------------

let expectedBranch = 'stable';
const forwardedArgs = [];

for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--branch=')) {
    expectedBranch = arg.slice('--branch='.length);
  } else {
    forwardedArgs.push(arg);
  }
}

setStepOutput('sdk_python_snapshot_tag', '');
setStepOutput('sdk_python_snapshot_companion_dir', '');
setStepOutput('sdk_python_snapshot_main_dir', '');
setStepOutput('sdk_release_present', 'false');
setStepOutput('sdk_release_tag', '');
setStepOutput('sdk_release_version', '');
setStepOutput('sdk_release_dist_tag', '');

// ---------------------------------------------------------------------------
// Branch guard
// ---------------------------------------------------------------------------

const currentBranch = getCurrentBranch();
if (currentBranch !== expectedBranch) {
  console.error(`Expected branch ${expectedBranch} but on ${currentBranch}`);
  console.error('Use --branch=<name> to override.');
  process.exit(1);
}

const isDryRun = forwardedArgs.includes('--dry-run') || forwardedArgs.includes('-d');
const branchRef = `origin/${expectedBranch}`;

// ---------------------------------------------------------------------------
// Release pipeline
// ---------------------------------------------------------------------------

// Stable bundle: CLI -> SDK -> MCP. These three share artifacts (SDK packages
// CLI native binaries; MCP imports SDK + engine code), so they must release
// together in this order. superdoc, react, esign, template-builder, and
// vscode-ext release independently via their own per-package stable workflows.
const packages = [
  {
    name: 'cli',
    packageCwd: 'apps/cli',
    tagPrefix: 'cli-v',
    tagPattern: 'cli-v*',
    npmPackages: CLI_NPM_PACKAGES,
  },
  {
    name: 'sdk',
    packageCwd: 'packages/sdk',
    tagPrefix: 'sdk-v',
    tagPattern: 'sdk-v*',
    npmPackages: SDK_NODE_NPM_PACKAGES,
    pythonPackages: SDK_PYTHON_PACKAGES,
  },
  {
    name: 'mcp',
    packageCwd: 'apps/mcp',
    tagPrefix: 'mcp-v',
    tagPattern: 'mcp-v*',
    npmPackages: ['@superdoc-dev/mcp'],
  },
];

/**
 * @typedef {object} PackageResult
 * @property {'released' | 'resumed' | 'would-release' | 'no-op' | 'deferred' | 'FAILED (partial)' | 'FAILED' | 'skipped'} status
 * @property {string[]} newTags - Tags created during this release attempt.
 */

/** @type {Map<string, PackageResult>} */
const results = new Map();

let hasFailed = false;
let deferredReason = '';

function markRemainingSkipped(startIndex) {
  for (let index = startIndex; index < packages.length; index += 1) {
    results.set(packages[index].name, { status: 'skipped', newTags: [] });
  }
}

for (let index = 0; index < packages.length; index += 1) {
  const pkg = packages[index];

  if (hasFailed) {
    results.set(pkg.name, { status: 'skipped', newTags: [] });
    continue;
  }

  refreshRemoteState(expectedBranch);

  let recoveredRelease = null;
  if (!isDryRun) {
    try {
      recoveredRelease = await maybeRecoverIncompleteRelease(pkg, branchRef);
    } catch (error) {
      console.error(`\n${pkg.name} recovery failed:\n${error.message || error}`);
      results.set(pkg.name, { status: 'FAILED', newTags: [] });
      hasFailed = true;
      continue;
    }
  }

  try {
    ensureBranchHeadCurrent(expectedBranch);
  } catch (error) {
    if (error instanceof StableBranchAdvancedError) {
      deferredReason = error.message;
      console.log(`\n${deferredReason}`);
      results.set(pkg.name, {
        status: recoveredRelease ? 'resumed' : 'deferred',
        newTags: recoveredRelease ? [recoveredRelease.tag] : [],
      });
      markRemainingSkipped(index + 1);
      break;
    }
    throw error;
  }

  // Remove stale local-only tags first, including tags in the current package
  // namespace, before snapshotting. Otherwise a leftover local tag can skew
  // semantic-release's lastRelease lookup or mask a newly created tag.
  pruneLocalOnlyReleaseTags();

  // Snapshot tags before release to detect new tags. On real releases
  // semantic-release creates+pushes the tag before publish plugins run, so a
  // publish-time failure can still leave behind a real release tag.
  const tagsBefore = new Set(listTags(pkg.tagPattern));

  try {
    const runResult = runSemanticRelease(pkg.packageCwd, forwardedArgs);

    const tagsAfter = new Set(listTags(pkg.tagPattern));
    const newTags = [...tagsAfter].filter((t) => !tagsBefore.has(t));
    const status = runResult.dryRun
      ? runResult.wouldRelease
        ? 'would-release'
        : recoveredRelease
          ? 'resumed'
          : 'no-op'
      : newTags.length > 0
        ? 'released'
        : recoveredRelease
          ? 'resumed'
          : 'no-op';
    const reportedTags = newTags.length > 0 ? newTags : recoveredRelease ? [recoveredRelease.tag] : [];
    results.set(pkg.name, { status, newTags: reportedTags });
  } catch (error) {
    const message = error && typeof error.message === 'string' ? error.message : String(error);
    const tagsAfter = new Set(listTags(pkg.tagPattern));
    const newTags = [...tagsAfter].filter((t) => !tagsBefore.has(t));

    if (isLikelyStaleHeadFailure(error) && newTags.length === 0) {
      deferredReason = `Stable advanced while releasing ${pkg.name}; deferring the remaining work to the queued run on the latest stable head.`;
      console.log(`\n${deferredReason}`);
      results.set(pkg.name, {
        status: recoveredRelease ? 'resumed' : 'deferred',
        newTags: recoveredRelease ? [recoveredRelease.tag] : [],
      });
      markRemainingSkipped(index + 1);
      break;
    }

    console.error(`\n${pkg.name} release failed:\n${message}`);

    if (newTags.length > 0) {
      const recoveryTag = newTags[0];
      const recoveryVersion = getVersionFromTag(pkg, recoveryTag);
      const recoveryDistTag = getDistTagForVersion(recoveryVersion);

      try {
        console.log(`Attempting recovery for tagged ${pkg.name} release ${recoveryTag}.`);
        const recovery = await recoverPackageRelease(pkg, {
          tag: recoveryTag,
          version: recoveryVersion,
          distTag: recoveryDistTag,
          branchRef,
        });
        recordSdkPythonSnapshot(recovery.sdkPythonSnapshot);
        results.set(pkg.name, { status: 'released', newTags });
        continue;
      } catch (recoveryError) {
        console.error(`Recovery for ${pkg.name} ${recoveryTag} failed:\n${recoveryError.message || recoveryError}`);
      }
    }

    const status = newTags.length > 0 ? 'FAILED (partial)' : 'FAILED';
    results.set(pkg.name, { status, newTags });
    hasFailed = true;
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

recordSdkReleaseOutputs(results.get('sdk'));

console.log('\n--- Release Summary ---');
for (const [name, { status, newTags }] of results) {
  const tagInfo = newTags.length > 0 ? `  [${newTags.join(', ')}]` : '';
  console.log(`  ${name.padEnd(12)} ${status}${tagInfo}`);
}

if (hasFailed) {
  const partials = [...results.entries()].filter(([, r]) => r.status === 'FAILED (partial)');
  const released = [...results.entries()].filter(([, r]) => r.status === 'released');
  const tagsToReview = [...partials, ...released].flatMap(([, r]) => r.newTags);

  if (tagsToReview.length > 0) {
    console.log(`\nTags created before the failure: ${tagsToReview.join(', ')}`);
    console.log('Review these tags and decide whether manual rollback is needed.');
  }
  process.exitCode = 1;
}

if (deferredReason && !hasFailed) {
  console.log('\nCurrent run stopped before publishing from a stale checkout. The next queued stable run should continue from the latest branch head.');
}

// Remind operator about @semantic-release/git behavior on stable
const anyReleased = [...results.values()].some((r) => r.status === 'released');
if (anyReleased && !isDryRun) {
  console.log('\n@semantic-release/git automatically pushes version commits and tags on the stable branch.');
}
