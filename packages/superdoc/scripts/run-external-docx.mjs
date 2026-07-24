import { existsSync, statSync } from 'node:fs';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const usage = `Usage:
  pnpm --filter superdoc test:external-docx -- --fixture <input.docx> [--output <roundtrip.docx>] [--evidence <evidence.json>]
`;

const parseOptions = (args) => {
  if (args.includes('--help')) return { help: true };

  const values = new Map();
  const allowed = new Set(['--fixture', '--output', '--evidence']);
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag || !allowed.has(flag)) throw new Error(`Unknown option: ${flag ?? ''}`);
    if (!value) throw new Error(`${flag} requires a value`);
    if (values.has(flag)) throw new Error(`${flag} may only be provided once`);
    values.set(flag, value);
  }

  const fixture = values.get('--fixture');
  if (!fixture) throw new Error('--fixture is required');
  return {
    fixture: resolve(fixture),
    output: values.has('--output') ? resolve(values.get('--output')) : null,
    evidence: values.has('--evidence') ? resolve(values.get('--evidence')) : null,
  };
};

const main = async () => {
  let options;
  try {
    const args = process.argv.slice(2);
    if (args[0] === '--') args.shift();
    options = parseOptions(args);
  } catch (error) {
    console.error(error.message);
    console.error(usage);
    return 1;
  }

  if (options.help) {
    console.log(usage);
    return 0;
  }

  if (extname(options.fixture).toLowerCase() !== '.docx') {
    console.error(`Fixture must be a .docx file: ${options.fixture}`);
    return 1;
  }
  if (!existsSync(options.fixture) || !statSync(options.fixture).isFile()) {
    console.error(`Fixture does not exist: ${options.fixture}`);
    return 1;
  }

  const artifactsDirectory =
    options.output && options.evidence ? null : await mkdtemp(join(tmpdir(), 'superdoc-external-docx-'));
  const output = options.output ?? join(artifactsDirectory, 'roundtrip.docx');
  const evidence = options.evidence ?? join(artifactsDirectory, 'evidence.json');
  if (extname(output).toLowerCase() !== '.docx') {
    console.error(`Output must be a .docx file: ${output}`);
    return 1;
  }
  if (extname(evidence).toLowerCase() !== '.json') {
    console.error(`Evidence must be a .json file: ${evidence}`);
    return 1;
  }
  if (new Set([options.fixture, output, evidence]).size !== 3) {
    console.error('Fixture, output, and evidence paths must be different');
    return 1;
  }
  const existingArtifact = [output, evidence].find((path) => existsSync(path));
  if (existingArtifact) {
    console.error(`Artifact path already exists: ${existingArtifact}`);
    return 1;
  }
  await Promise.all([mkdir(dirname(output), { recursive: true }), mkdir(dirname(evidence), { recursive: true })]);

  console.log(`Fixture: ${options.fixture}`);
  console.log(`Round-trip DOCX: ${output}`);
  console.log(`Evidence: ${evidence}`);

  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = spawnSync(
    pnpmCommand,
    ['exec', 'vitest', 'run', '--config', 'tests/external-docx/vitest.config.js', '--reporter=verbose'],
    {
      cwd: packageRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        SUPERDOC_TEST_DOCX: options.fixture,
        SUPERDOC_TEST_OUTPUT: output,
        SUPERDOC_TEST_EVIDENCE: evidence,
      },
    },
  );

  if (result.error) {
    console.error(`Unable to start Vitest: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
};

process.exitCode = await main();
