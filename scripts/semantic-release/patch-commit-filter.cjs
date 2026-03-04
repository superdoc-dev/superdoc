/* eslint-env node */

/**
 * Shared git-log-parser patch for semantic-release.
 *
 * semantic-release only analyzes commits that touch the package's own directory
 * by default. For packages that bundle multiple sub-packages (CLI bundles
 * layout-engine, super-editor, etc.), we need git-log to also return commits
 * from those dependency paths so that a `fix(layout-engine):` commit can
 * trigger a CLI or SDK release.
 *
 * This works by monkey-patching git-log-parser's `parse()` to append extra
 * `-- <path>` arguments to the underlying `git log` command.
 *
 * IMPORTANT: This helper REPLACES the `semantic-release-commit-filter` plugin.
 * Do NOT use both — the filter plugin restricts commits to the package's CWD,
 * which undoes the path expansion this patch provides.
 *
 * Tech debt: This relies on git-log-parser's internal module structure
 * (node_modules/git-log-parser/src/index.js exporting a `parse` function).
 * If that changes, the patch will throw a loud error rather than silently
 * degrade. Pin git-log-parser in the lockfile.
 */

const path = require('path');

/**
 * Patch git-log-parser so semantic-release sees commits from additional paths.
 *
 * @param {string[]} includePaths - Repo-root-relative paths to include
 *   (e.g. ['packages/superdoc', 'packages/super-editor'])
 */
function patchCommitFilter(includePaths) {
  if (!Array.isArray(includePaths) || includePaths.length === 0) {
    throw new Error('patchCommitFilter: includePaths must be a non-empty array');
  }

  const matchingModules = Object.keys(require.cache).filter((m) =>
    path.posix.normalize(m).endsWith('/node_modules/git-log-parser/src/index.js'),
  );

  if (matchingModules.length === 0) {
    throw new Error(
      'patchCommitFilter: git-log-parser module not found in require.cache. ' +
        'This patch must be required AFTER semantic-release has loaded its plugins. ' +
        'If git-log-parser changed its export path, this patch needs updating.',
    );
  }

  for (const moduleName of matchingModules) {
    const mod = require.cache[moduleName];
    if (!mod || !mod.exports || typeof mod.exports.parse !== 'function') {
      throw new Error(
        `patchCommitFilter: git-log-parser module at ${moduleName} does not export a parse() function. ` +
          'The package may have changed its API — this patch needs updating.',
      );
    }

    const originalParse = mod.exports.parse;
    mod.exports.parse = (config, options) => {
      const repoRoot = path.resolve(options.cwd, '..', '..');
      const expandedPaths = includePaths.map((p) => path.join(repoRoot, p));

      if (Array.isArray(config._)) {
        config._.push(...expandedPaths);
      } else if (config._) {
        config._ = [config._, ...expandedPaths];
      } else {
        config._ = expandedPaths;
      }

      return originalParse(config, options);
    };
  }
}

module.exports = patchCommitFilter;
