/**
 * Executes the documented V2 migration examples.
 *
 * AIDEV-NOTE: What each layer of this lane actually proves, because the
 * distinction has been overstated before and it matters when reading a green run:
 *
 *   - The typecheck proves the examples compile against the public API. It says
 *     nothing about what they do.
 *   - These Node cases prove the authored call flow and payload: which
 *     operations run, in what order, with what input. The document is a stub,
 *     so a call that is well-formed but semantically wrong still passes. Every
 *     behavioral defect found in review so far was of exactly that kind.
 *   - The headless cases (MIGRATION_SNIPPETS_CONTRACT_ONLY unset) run against a
 *     real DOCX and are the strongest evidence here.
 *
 * None of them compares v1 and v2 behavior. Equivalence is a claim the prose
 * makes and a human has to check.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// AIDEV-NOTE: Every page in the migration section, not one hardcoded file.
// When the advanced recipes moved out of overview.mdx, a hardcoded path silently
// dropped 27 of the 44 examples from this check while still reporting success.
const migrationDir = resolve(appRoot, 'content/docs/editor/migrate-from-v1');
const pages = (await readdir(migrationDir)).filter((name) => name.endsWith('.mdx')).sort();
const lines = [];
for (const page of pages) {
  lines.push(...(await readFile(resolve(migrationDir, page), 'utf8')).split(/\r?\n/));
}
const snippets = [];
let heading = '';

for (let index = 0; index < lines.length; index += 1) {
  const headingMatch = /^#{3,4}\s+(.+)$/.exec(lines[index]);
  if (headingMatch) heading = headingMatch[1];

  const opening = lines[index].trim();
  if (!/^<MigrationExample\s+version=['"]V2['"][^>]*>$/.test(opening)) continue;
  const test = /\stest=['"]([^'"]+)['"]/.exec(opening)?.[1] ?? 'compile';
  const testCase = /\stestCase=['"]([^'"]+)['"]/.exec(opening)?.[1];

  const body = [];
  for (index += 1; index < lines.length && lines[index].trim() !== '</MigrationExample>'; index += 1) {
    body.push(lines[index]);
  }

  const fenced = body.join('\n').match(/```ts\s*\n([\s\S]*?)\n\s*```/);
  if (!fenced) throw new Error(`Missing TypeScript fence for V2 example: ${heading}`);
  snippets.push({ heading, source: fenced[1].replace(/^ {4}/gm, ''), test, testCase });
}

const nodeSnippets = snippets.filter(({ test }) => test === 'node');
const headlessSnippets = snippets.filter(({ test }) => test === 'headless');
const executableSnippets = [...nodeSnippets, ...headlessSnippets];
const duplicateCases = executableSnippets
  .map(({ testCase }) => testCase)
  .filter((testCase, index, all) => !testCase || all.indexOf(testCase) !== index);
assert.deepEqual(duplicateCases, [], 'Every Node snippet must have a unique testCase.');

function compileSnippet(snippet) {
  const output = ts.transpileModule(snippet.source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    fileName: `${snippet.testCase}.ts`,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    output,
    { module, exports: module.exports, console, Map, Error },
    { filename: `${snippet.testCase}.js` },
  );
  return module.exports;
}

function createHarness(doc) {
  return { activeEditor: { doc } };
}

function assertJson(actual, expected) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
}

const selectionTarget = {
  kind: 'text',
  segments: [{ blockId: 'paragraph-1', range: { start: 0, end: 5 } }],
};

const cases = {
  'selection-current': async ({ currentSelection }) => {
    const calls = [];
    const expected = { text: 'Hello', selectionTarget };
    const result = await currentSelection(
      createHarness({ selection: { current: async (input) => (calls.push(input), expected) } }),
    );
    assert.equal(result, expected);
    assertJson(calls, [{ includeText: true }]);
  },
  'selection-target': async ({ selectionTarget: readSelectionTarget }) => {
    const calls = [];
    const result = await readSelectionTarget(
      createHarness({
        selection: { current: async (input) => (calls.push(input), { selectionTarget }) },
      }),
    );
    assert.equal(result, selectionTarget);
    assertJson(calls, [{}]);
  },
  'collaboration-config': async ({ collaborativeDocument }) => {
    const data = {};
    const result = collaborativeDocument(data, 'acme:42', 'wss://collab.example.test', 'secret', 'create');
    assert.equal(result.data, data);
    assertJson(result.v2Collaboration, {
      providerType: 'hocuspocus',
      documentId: 'acme:42',
      serverUrl: 'wss://collab.example.test',
      token: 'secret',
      roomMode: 'create',
    });
  },
};

assert.deepEqual(
  nodeSnippets.map(({ testCase }) => testCase).sort(),
  Object.keys(cases).sort(),
  'Every Node snippet must have exactly one execution case.',
);

for (const snippet of nodeSnippets) {
  try {
    await cases[snippet.testCase](compileSnippet(snippet));
    console.log(`PASS ${snippet.heading}`);
  } catch (error) {
    console.error(`FAIL ${snippet.heading} (${snippet.testCase})`);
    throw error;
  }
}

console.log(`Executed ${nodeSnippets.length} documented V2 snippets in the Node contract harness.`);

if (headlessSnippets.length > 0 && process.env.MIGRATION_SNIPPETS_CONTRACT_ONLY !== '1') {
  const sdkPath = resolve(appRoot, '../../packages/sdk/langs/node/dist/index.js');
  const cliPath = resolve(appRoot, '../../apps/cli/dist/index.js');
  const fixturePath = resolve(appRoot, 'public/fixtures/tracked-changes.docx');
  const { SuperDocClient } = await import(sdkPath);
  const client = new SuperDocClient({ env: { SUPERDOC_CLI_BIN: cliPath } });
  const tempRoot = await mkdtemp(resolve(tmpdir(), 'superdoc-migration-snippets-'));

  async function withDocument(run) {
    const doc = await client.open({ doc: fixturePath });
    try {
      return await run(doc);
    } finally {
      await doc.close({ discard: true });
    }
  }

  const headlessCases = {
    'get-text': async ({ readText }) =>
      withDocument(async (doc) => {
        const text = await readText(createHarness(doc));
        assert.match(text, /MUTUAL NON-DISCLOSURE AGREEMENT/);
        return text;
      }),
    'insert-text': async ({ insertText }) => {
      const outputPath = resolve(tempRoot, 'inserted.docx');
      const insertedText = 'Migration snippet insertion';
      const doc = await client.open({ doc: fixturePath });
      try {
        const receipt = await insertText(createHarness(doc), insertedText);
        assert.equal(receipt.receipt?.success ?? receipt.success, true);
        assert.match(await doc.getText({}), new RegExp(insertedText));
        await doc.save({ out: outputPath, force: true });
      } finally {
        await doc.close({ discard: true });
      }

      const reopened = await client.open({ doc: outputPath });
      try {
        assert.match(await reopened.getText({}), new RegExp(insertedText));
      } finally {
        await reopened.close({ discard: true });
      }
    },
    'get-markdown': async ({ markdown }) =>
      withDocument(async (doc) => {
        const result = await markdown(createHarness(doc));
        assert.match(result, /MUTUAL NON-DISCLOSURE AGREEMENT/);
      }),
  };

  assert.deepEqual(
    headlessSnippets.map(({ testCase }) => testCase).sort(),
    Object.keys(headlessCases).sort(),
    'Every headless snippet must have exactly one execution case.',
  );

  try {
    await client.connect();
    for (const snippet of headlessSnippets) {
      try {
        await headlessCases[snippet.testCase](compileSnippet(snippet));
        console.log(`PASS ${snippet.heading} (headless)`);
      } catch (error) {
        console.error(`FAIL ${snippet.heading} (${snippet.testCase}, headless)`);
        throw error;
      }
    }
  } finally {
    await client.dispose();
    await rm(tempRoot, { recursive: true, force: true });
  }

  console.log(`Executed ${headlessSnippets.length} documented V2 snippets against a real DOCX in headless SuperDoc.`);
}
