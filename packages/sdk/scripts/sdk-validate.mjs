#!/usr/bin/env node

/**
 * SDK validation pipeline.
 *
 * Checks:
 *  1. CLI export contract is current (--check)
 *  2. SDK/codegen artifacts are regenerated from current contract
 *  3. Contract JSON loads and has required structure
 *  4. All operations have outputSchema
 *  5. Node SDK typechecks (tsc --noEmit)
 *  6. Python SDK imports successfully
 *  7. Tool catalog operation count matches contract
 *  8. Tool name map covers all operations
 *  9. Provider bundles are consistent
 * 10. Node/Python parity — both generated clients expose same operations
 * 11. Catalog input schemas present and required params match contract
 * 12. Skill files only reference existing operations (fails on unknown refs)
 * 13. Provider tool name extraction smoke test
 * 14. Node npm pack includes required tools/*.json, skills/*.md, and CJS artifacts
 * 15. SDK release scripts test suite passes
 * 16. SDK test suite passes (contract-integrity + cross-lang parity)
 * 17. Node SDK platform package manifests exist and are well-formed
 * 18. Node SDK optionalDependencies reference all expected platform packages
 * 19. CLI compiled binary can open a document on host platform
 * 20. Python SDK can open a document via host compiled CLI binary
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');

let failures = 0;
let passes = 0;

async function check(name, fn) {
  try {
    await fn();
    passes += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message ?? error}`);
  }
}

async function run(command, args, { cwd = REPO_ROOT, env = {} } = {}) {
  const { stdout } = await execFileAsync(command, args, { cwd, env: { ...process.env, ...env } });
  return stdout.trim();
}

function resolveHostCliArtifact() {
  const ext = process.platform === 'win32' ? '.exe' : '';
  if (process.platform === 'darwin' && process.arch === 'arm64') return `darwin-arm64/superdoc${ext}`;
  if (process.platform === 'darwin' && process.arch === 'x64') return `darwin-x64/superdoc${ext}`;
  if (process.platform === 'linux' && process.arch === 'x64') return `linux-x64/superdoc${ext}`;
  if (process.platform === 'linux' && process.arch === 'arm64') return `linux-arm64/superdoc${ext}`;
  if (process.platform === 'win32' && process.arch === 'x64') return `windows-x64/superdoc${ext}`;

  throw new Error(`Unsupported host platform for native CLI smoke test: ${process.platform}/${process.arch}`);
}

function resolveHostCliBinaryPath() {
  return path.join(REPO_ROOT, 'apps/cli/artifacts', resolveHostCliArtifact());
}

let superdocBuilt = false;

async function ensureSuperdocBuilt() {
  if (superdocBuilt) return;
  await run('pnpm', ['--prefix', path.join(REPO_ROOT, 'packages/superdoc'), 'run', 'build:es']);
  superdocBuilt = true;
}

async function buildHostCliBinary() {
  await ensureSuperdocBuilt();
  await run('node', [path.join(REPO_ROOT, 'apps/cli/scripts/build-native-cli.js')], {
    cwd: path.join(REPO_ROOT, 'apps/cli'),
  });
}

function parseLastJsonLine(stdout, contextLabel) {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    throw new Error(`${contextLabel}: command produced no output`);
  }

  const lastLine = lines[lines.length - 1];
  try {
    return JSON.parse(lastLine);
  } catch {
    throw new Error(`${contextLabel}: last output line was not valid JSON: ${lastLine}`);
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function main() {
  console.log('SDK validation...\n');

  // 1. Contract freshness
  await check('CLI export contract is current', async () => {
    await run('bun', [
      path.join(REPO_ROOT, 'apps/cli/scripts/export-sdk-contract.ts'),
      '--check',
    ]);
  });

  // 2. Regenerate SDK artifacts from current contract
  await check('SDK/codegen artifacts are current', async () => {
    await run('node', [path.join(REPO_ROOT, 'packages/sdk/codegen/src/generate-all.mjs')]);
  });

  // 3. Load contract and verify structure
  const contractPath = path.join(REPO_ROOT, 'apps/cli/generated/sdk-contract.json');
  let contract;
  await check('Contract JSON loads and has operations', async () => {
    contract = await readJson(contractPath);
    const opCount = Object.keys(contract.operations).length;
    if (opCount === 0) throw new Error('Contract has zero operations');
    if (!contract.contractVersion) throw new Error('Missing contractVersion');
    if (!contract.cli) throw new Error('Missing cli metadata');
    if (!contract.protocol) throw new Error('Missing protocol metadata');
  });

  // 4. All operations have outputSchema
  await check('All operations have outputSchema', async () => {
    for (const [id, op] of Object.entries(contract.operations)) {
      if (!op.outputSchema) throw new Error(`${id} missing outputSchema`);
    }
  });

  // 5. Node SDK typecheck
  await check('Node SDK typechecks (tsc --noEmit)', async () => {
    await run('npx', ['tsc', '--noEmit'], {
      cwd: path.join(REPO_ROOT, 'packages/sdk/langs/node'),
    });
  });

  // 6. Python SDK imports
  await check('Python SDK imports successfully', async () => {
    await run('python3', [
      '-c',
      'from superdoc import SuperDocClient, AsyncSuperDocClient, SuperDocError, get_tool_catalog, list_tools, resolve_tool_operation, choose_tools, dispatch_superdoc_tool, dispatch_superdoc_tool_async, infer_document_features',
    ], {
      cwd: path.join(REPO_ROOT, 'packages/sdk/langs/python'),
    });
  });

  // 7. Tool catalog integrity
  await check('Tool catalog operation count matches contract', async () => {
    const catalog = await readJson(path.join(REPO_ROOT, 'packages/sdk/tools/catalog.json'));
    const contractOpCount = Object.keys(contract.operations).length;
    const intentToolCount = catalog.profiles.intent.tools.length;
    const operationToolCount = catalog.profiles.operation.tools.length;

    if (intentToolCount !== contractOpCount) {
      throw new Error(`Intent tools (${intentToolCount}) != contract ops (${contractOpCount})`);
    }
    if (operationToolCount !== contractOpCount) {
      throw new Error(`Operation tools (${operationToolCount}) != contract ops (${contractOpCount})`);
    }
  });

  // 8. Tool name map covers all operations
  await check('Tool name map covers all operations', async () => {
    const nameMap = await readJson(path.join(REPO_ROOT, 'packages/sdk/tools/tool-name-map.json'));
    const contractOps = new Set(Object.keys(contract.operations));
    const mappedOps = new Set(Object.values(nameMap));

    for (const opId of contractOps) {
      if (!mappedOps.has(opId)) {
        throw new Error(`Operation ${opId} not covered by any tool name`);
      }
    }
  });

  // 9. Provider bundles exist and have correct profile counts
  await check('Provider bundles are consistent', async () => {
    const providers = ['openai', 'anthropic', 'vercel', 'generic'];
    const contractOpCount = Object.keys(contract.operations).length;

    for (const provider of providers) {
      const bundle = await readJson(path.join(REPO_ROOT, `packages/sdk/tools/tools.${provider}.json`));
      if (!bundle.profiles) throw new Error(`${provider} bundle missing profiles`);
      if (!Array.isArray(bundle.profiles.intent)) throw new Error(`${provider} bundle missing intent tools`);
      if (!Array.isArray(bundle.profiles.operation)) throw new Error(`${provider} bundle missing operation tools`);
      if (bundle.profiles.intent.length !== contractOpCount) {
        throw new Error(`${provider} intent tool count mismatch`);
      }
      if (bundle.profiles.operation.length !== contractOpCount) {
        throw new Error(`${provider} operation tool count mismatch`);
      }
    }
  });

  // 10. Node/Python parity — generated clients expose same operations
  await check('Node/Python generated clients have matching operation counts', async () => {
    const nodeContract = await readFile(
      path.join(REPO_ROOT, 'packages/sdk/langs/node/src/generated/contract.ts'),
      'utf8',
    );
    const pythonContract = await readFile(
      path.join(REPO_ROOT, 'packages/sdk/langs/python/superdoc/generated/contract.py'),
      'utf8',
    );

    // Count operation IDs in each generated contract.
    // Node: pretty-printed JSON → "operationId": "doc.find"
    // Python: escaped JSON string → \"operationId\":\"doc.find\"
    const nodeOps = (nodeContract.match(/"operationId":\s*"doc\.[^"]+"/g) ?? []).length;
    const pythonOps = (pythonContract.match(/\\"operationId\\":\\"doc\.[^\\]+\\"/g) ?? []).length;

    if (nodeOps === 0) throw new Error('Node contract has zero operation references');
    if (pythonOps === 0) throw new Error('Python contract has zero operation references');
    if (nodeOps !== pythonOps) {
      throw new Error(`Node (${nodeOps}) and Python (${pythonOps}) operation counts differ`);
    }
  });

  // 11. All catalog tools have input schemas and required params match contract
  await check('Catalog input schemas present and required params match contract', async () => {
    const catalog = await readJson(path.join(REPO_ROOT, 'packages/sdk/tools/catalog.json'));

    for (const profileKey of ['intent', 'operation']) {
      for (const tool of catalog.profiles[profileKey].tools) {
        if (!tool.inputSchema || typeof tool.inputSchema !== 'object') {
          throw new Error(`${tool.operationId} (${profileKey}) missing inputSchema`);
        }

        // Verify required params from contract appear as required in inputSchema
        const contractOp = contract.operations[tool.operationId];
        if (!contractOp) continue;

        const contractRequired = (contractOp.params ?? [])
          .filter((p) => p.required === true)
          .map((p) => p.name)
          // Exclude transport-envelope params that are intentionally omitted from tool schemas
          .filter((name) => !['out', 'json', 'expectedRevision', 'changeMode', 'dryRun'].includes(name));

        const schemaRequired = new Set(tool.inputSchema.required ?? []);
        for (const name of contractRequired) {
          // Only check if the param is in the schema properties (some params are omitted by design)
          if (tool.inputSchema.properties && name in tool.inputSchema.properties && !schemaRequired.has(name)) {
            throw new Error(
              `${tool.operationId} (${profileKey}): param "${name}" is required in contract but not in inputSchema`,
            );
          }
        }
      }
    }
  });

  // 12. Skill files only reference existing operations
  await check('Skill files reference valid operations', async () => {
    const skillDirs = [
      path.join(REPO_ROOT, 'packages/sdk/langs/node/skills'),
      path.join(REPO_ROOT, 'packages/sdk/langs/python/superdoc/skills'),
    ];
    const validOps = new Set(Object.keys(contract.operations));
    const unknownRefs = [];

    for (const dir of skillDirs) {
      let files;
      try {
        files = await readdir(dir);
      } catch {
        continue;
      }
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const content = await readFile(path.join(dir, file), 'utf8');
        // Match operation-style references: doc.something.something
        const opRefs = content.match(/\bdoc\.\w+(?:\.\w+)*/g) ?? [];
        for (const ref of opRefs) {
          if (validOps.has(ref)) continue;
          // Must have at least one dot beyond doc. to look like an operation
          if (ref.split('.').length < 2) continue;
          // Allow namespace prefixes (e.g., doc.format is a prefix of doc.format.bold)
          const isNamespacePrefix = [...validOps].some((op) => op.startsWith(ref + '.'));
          if (isNamespacePrefix) continue;
          unknownRefs.push(`${path.basename(dir)}/${file}: ${ref}`);
        }
      }
    }

    if (unknownRefs.length > 0) {
      throw new Error(`Skill files reference unknown operations:\n      ${unknownRefs.join('\n      ')}`);
    }
  });

  // 13. Provider tool name extraction smoke test
  await check('OpenAI/Vercel tools have extractable names', async () => {
    const openaiBundle = await readJson(path.join(REPO_ROOT, 'packages/sdk/tools/tools.openai.json'));
    const nameMap = await readJson(path.join(REPO_ROOT, 'packages/sdk/tools/tool-name-map.json'));

    for (const tool of openaiBundle.profiles.intent) {
      const name = tool?.function?.name ?? tool?.name;
      if (typeof name !== 'string' || !name) {
        throw new Error('OpenAI intent tool missing extractable name');
      }
      if (!(name in nameMap)) {
        throw new Error(`OpenAI tool name "${name}" not in tool-name-map`);
      }
    }
  });

  // 14. Node package tarball includes required tools/*.json, skills/*.md, and CJS artifacts
  await check('Node npm pack includes tools/*.json, skills/*.md, and CJS artifacts', async () => {
    const npmCacheDir = path.join(REPO_ROOT, '.cache', 'npm');
    const { stdout } = await execFileAsync('npm', ['pack', '--dry-run', '--json'], {
      cwd: path.join(REPO_ROOT, 'packages/sdk/langs/node'),
      env: { ...process.env, npm_config_cache: npmCacheDir },
    });
    const packOutput = JSON.parse(stdout);
    const files = (packOutput[0]?.files ?? []).map((f) => f.path);

    const requiredTools = [
      'catalog.json',
      'tool-name-map.json',
      'tools-policy.json',
      'tools.openai.json',
      'tools.anthropic.json',
      'tools.vercel.json',
      'tools.generic.json',
    ];
    const missingTools = requiredTools.filter((name) => !files.some((f) => f === `tools/${name}`));
    if (missingTools.length > 0) {
      throw new Error(`Node tarball missing tools: ${missingTools.join(', ')}. Check symlinks and prepack script.`);
    }

    const hasPublishedSkills = files.some((filePath) => /^skills\/.+\.md$/.test(filePath));
    if (!hasPublishedSkills) {
      throw new Error('Node tarball missing skills/*.md artifacts.');
    }

    // Dual-package CJS artifacts: entry point + key runtime modules
    const requiredCjs = ['dist/index.cjs', 'dist/runtime/embedded-cli.cjs', 'dist/tools.cjs', 'dist/skills.cjs'];
    const missingCjs = requiredCjs.filter((name) => !files.some((f) => f === name));
    if (missingCjs.length > 0) {
      throw new Error(`Node tarball missing CJS artifacts: ${missingCjs.join(', ')}. Run "pnpm run build" in packages/sdk/langs/node.`);
    }
  });

  // 15. Run SDK release script tests
  await check('SDK release scripts tests pass', async () => {
    await run('pnpm', ['--prefix', path.join(REPO_ROOT, 'packages/sdk'), 'run', 'test:scripts']);
  });

  // 16. Run SDK codegen test suite (contract-integrity + cross-lang parity)
  await check('SDK test suite passes (bun test)', async () => {
    await run('bun', ['test', path.join(REPO_ROOT, 'packages/sdk/codegen/src/__tests__/')]);
  });

  // 17. Node SDK platform package manifests exist and are well-formed
  const EXPECTED_NODE_PLATFORMS = [
    { name: '@superdoc-dev/sdk-darwin-arm64', dir: 'sdk-darwin-arm64', os: 'darwin', cpu: 'arm64' },
    { name: '@superdoc-dev/sdk-darwin-x64', dir: 'sdk-darwin-x64', os: 'darwin', cpu: 'x64' },
    { name: '@superdoc-dev/sdk-linux-x64', dir: 'sdk-linux-x64', os: 'linux', cpu: 'x64' },
    { name: '@superdoc-dev/sdk-linux-arm64', dir: 'sdk-linux-arm64', os: 'linux', cpu: 'arm64' },
    { name: '@superdoc-dev/sdk-windows-x64', dir: 'sdk-windows-x64', os: 'win32', cpu: 'x64' },
  ];

  await check('Node SDK platform package manifests exist and are well-formed', async () => {
    for (const platform of EXPECTED_NODE_PLATFORMS) {
      const pkgPath = path.join(REPO_ROOT, 'packages/sdk/langs/node/platforms', platform.dir, 'package.json');
      const pkg = await readJson(pkgPath);
      if (pkg.name !== platform.name) {
        throw new Error(`${platform.dir}: expected name "${platform.name}", got "${pkg.name}"`);
      }
      if (!pkg.os?.includes(platform.os)) {
        throw new Error(`${platform.dir}: missing os constraint "${platform.os}"`);
      }
      if (!pkg.cpu?.includes(platform.cpu)) {
        throw new Error(`${platform.dir}: missing cpu constraint "${platform.cpu}"`);
      }
      if (!pkg.bin) {
        throw new Error(`${platform.dir}: missing bin entry`);
      }
    }
  });

  // 18. Node SDK optionalDependencies reference all expected platform packages
  await check('Node SDK optionalDependencies reference all platform packages', async () => {
    const nodePkg = await readJson(path.join(REPO_ROOT, 'packages/sdk/langs/node/package.json'));
    const optDeps = nodePkg.optionalDependencies ?? {};
    const missing = EXPECTED_NODE_PLATFORMS.filter((p) => !(p.name in optDeps));
    if (missing.length > 0) {
      throw new Error(`Node SDK missing optionalDependencies: ${missing.map((p) => p.name).join(', ')}`);
    }
  });

  // 19. Host-platform compiled CLI smoke test
  await check('CLI compiled binary can open a document on host platform', async () => {
    const cliBinaryPath = resolveHostCliBinaryPath();
    const sourceDocPath = path.join(REPO_ROOT, 'packages/super-editor/src/tests/data/basic-paragraph.docx');
    const stateDir = await mkdtemp(path.join(tmpdir(), 'superdoc-cli-validate-'));

    try {
      await buildHostCliBinary();

      const { stdout } = await execFileAsync(
        cliBinaryPath,
        ['open', sourceDocPath, '--output', 'json'],
        {
          cwd: REPO_ROOT,
          env: {
            ...process.env,
            SUPERDOC_CLI_STATE_DIR: stateDir,
          },
        },
      );

      const payload = parseLastJsonLine(stdout, 'compiled-cli-open');

      if (payload?.ok !== true) {
        throw new Error(`Compiled CLI open failed: ${JSON.stringify(payload)}`);
      }
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  // 20. Python SDK + compiled CLI integration smoke test
  await check('Python SDK can open a document via host compiled CLI binary', async () => {
    const cliBinaryPath = resolveHostCliBinaryPath();
    const sourceDocPath = path.join(REPO_ROOT, 'packages/super-editor/src/tests/data/basic-paragraph.docx');
    const stateDir = await mkdtemp(path.join(tmpdir(), 'superdoc-python-sdk-validate-'));

    try {
      await buildHostCliBinary();

      const pythonSmokeScript = [
        'from superdoc import SuperDocClient',
        `cli_bin = ${JSON.stringify(cliBinaryPath)}`,
        `doc_path = ${JSON.stringify(sourceDocPath)}`,
        `state_dir = ${JSON.stringify(stateDir)}`,
        'client = SuperDocClient(env={"SUPERDOC_CLI_BIN": cli_bin, "SUPERDOC_CLI_STATE_DIR": state_dir}, watchdog_timeout_ms=120_000)',
        'try:',
        '    result = client.doc.open({"doc": doc_path}, timeout_ms=90_000)',
        '    if result.get("active") is not True:',
        '        raise RuntimeError(f"doc.open did not report an active session: {result!r}")',
        '    client.doc.close({})',
        'finally:',
        '    client.dispose()',
      ].join('\n');

      await run('python3', ['-c', pythonSmokeScript], {
        cwd: path.join(REPO_ROOT, 'packages/sdk/langs/python'),
      });
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
