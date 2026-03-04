import { ensureNoUnknownFlags, isDirectExecution, runNodeScript } from './utils.js';

const allowedFlags = new Set(['--all', '--single-platform', '--skip-cli-build']);

/**
 * Parses options for the prepublish build pipeline.
 *
 * @param {string[]} argv - CLI args.
 * @returns {{ allPlatforms: boolean; nativeBuildArgs: string[]; skipCliBuild: boolean }}
 * @throws {Error} If unsupported flag combinations are provided.
 */
export function resolveBuildAndStageOptions(argv) {
  ensureNoUnknownFlags(argv, allowedFlags);
  const forceAll = argv.includes('--all');
  const singlePlatform = argv.includes('--single-platform');
  const skipCliBuild = argv.includes('--skip-cli-build');

  if (forceAll && singlePlatform) {
    throw new Error('Use either --all or --single-platform, not both.');
  }

  const allPlatforms = forceAll || !singlePlatform;
  const nativeBuildArgs = allPlatforms ? ['--all'] : [];
  return { allPlatforms, nativeBuildArgs, skipCliBuild };
}

/**
 * Runs the full native CLI prepublish pipeline.
 *
 * @param {string[]} [argv=process.argv.slice(2)] - CLI args.
 * @param {(scriptPath: string, args?: string[], label?: string) => void} [runScript=runNodeScript] - Script runner.
 * @returns {void}
 */
export function main(argv = process.argv.slice(2), runScript = runNodeScript) {
  const { allPlatforms, nativeBuildArgs, skipCliBuild } = resolveBuildAndStageOptions(argv);

  runScript('./apps/cli/scripts/sync-version.js', [], 'Sync CLI versions');

  if (!skipCliBuild) {
    runScript(
      './apps/cli/scripts/build-native-cli.js',
      nativeBuildArgs,
      allPlatforms ? 'Build native CLI artifacts (all)' : 'Build native CLI artifacts',
    );
  }

  runScript('./apps/cli/scripts/stage-artifacts.js', [], 'Stage CLI artifacts');

  console.log('\n[cli] Build pipeline complete.');
}

if (isDirectExecution(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
