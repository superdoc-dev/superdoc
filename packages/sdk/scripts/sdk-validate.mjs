#!/usr/bin/env node

/**
 * SDK validation pipeline.
 *
 * Checks:
 *  1. CLI export contract is current (--check)
 *  2. Contract JSON loads and has required structure
 *  3. All operations have outputSchema
 *  4. Node SDK typechecks (tsc --noEmit)
 *  5. Python SDK imports successfully
 *  6. Tool catalog operation count matches contract
 *  7. Tool name map covers all operations
 *  8. Provider bundles are consistent
 *  9. Node/Python parity — both generated clients expose same operations
 * 10. Catalog input schemas present and required params match contract
 * 11. Skill files only reference existing operations (fails on unknown refs)
 * 12. Provider tool name extraction smoke test
 * 13. Node npm pack includes required tools/*.json assets
 * 14. SDK release scripts test suite passes
 * 15. SDK test suite passes (contract-integrity + cross-lang parity)
 */

import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
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

async function run(command, args, { cwd = REPO_ROOT } = {}) {
  const { stdout } = await execFileAsync(command, args, { cwd, env: process.env });
  return stdout.trim();
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

  // 2. Load contract and verify structure
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

  // 3. All operations have outputSchema
  await check('All operations have outputSchema', async () => {
    for (const [id, op] of Object.entries(contract.operations)) {
      if (!op.outputSchema) throw new Error(`${id} missing outputSchema`);
    }
  });

  // 4. Node SDK typecheck
  await check('Node SDK typechecks (tsc --noEmit)', async () => {
    await run('npx', ['tsc', '--noEmit'], {
      cwd: path.join(REPO_ROOT, 'packages/sdk/langs/node'),
    });
  });

  // 5. Python SDK imports
  await check('Python SDK imports successfully', async () => {
    await run('python3', [
      '-c',
      'from superdoc import SuperDocClient, AsyncSuperDocClient, SuperDocError, get_tool_catalog, list_tools, resolve_tool_operation, choose_tools, dispatch_superdoc_tool, dispatch_superdoc_tool_async, infer_document_features',
    ], {
      cwd: path.join(REPO_ROOT, 'packages/sdk/langs/python'),
    });
  });

  // 6. Tool catalog integrity
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

  // 7. Tool name map covers all operations
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

  // 8. Provider bundles exist and have correct profile counts
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

  // 9. Node/Python parity — generated clients expose same operations
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

  // 10. All catalog tools have input schemas and required params match contract
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

  // 11. Skill files only reference existing operations
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

  // 12. Provider tool name extraction smoke test
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

  // 13. Node package tarball includes required tools/*.json assets
  await check('Node npm pack includes tools/*.json assets', async () => {
    const npmCacheDir = path.join(REPO_ROOT, '.cache', 'npm');
    const { stdout } = await execFileAsync('npm', ['pack', '--dry-run', '--json'], {
      cwd: path.join(REPO_ROOT, 'packages/sdk/langs/node'),
      env: { ...process.env, npm_config_cache: npmCacheDir },
    });
    const packOutput = JSON.parse(stdout);
    const files = (packOutput[0]?.files ?? []).map((f) => f.path);

    const requiredTools = ['catalog.json', 'tool-name-map.json', 'tools.openai.json', 'tools.anthropic.json', 'tools.vercel.json', 'tools.generic.json'];
    const missing = requiredTools.filter((name) => !files.some((f) => f === `tools/${name}`));
    if (missing.length > 0) {
      throw new Error(`Node tarball missing tools: ${missing.join(', ')}. Check symlinks and prepack script.`);
    }
  });

  // 14. Run SDK release script tests
  await check('SDK release scripts tests pass', async () => {
    await run('pnpm', ['--prefix', path.join(REPO_ROOT, 'packages/sdk'), 'run', 'test:scripts']);
  });

  // 15. Run SDK codegen test suite (contract-integrity + cross-lang parity)
  await check('SDK test suite passes (bun test)', async () => {
    await run('bun', ['test', path.join(REPO_ROOT, 'packages/sdk/codegen/src/__tests__/')]);
  });

  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
