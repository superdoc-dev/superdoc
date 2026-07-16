#!/usr/bin/env node
/**
 * AI-docs snippet gate: every code block on the core-preset / agents pages
 * must work against the REAL SDK surface.
 *
 * What it checks, per fence language:
 *   - jsonc/json  — parsed (comments stripped). Blocks with an "action" key
 *                   are validated against the live core-preset catalog: the
 *                   action must exist in the superdoc_perform_action enum and
 *                   every top-level arg key must be a declared schema
 *                   property. Inspect-shaped blocks validate against the
 *                   superdoc_inspect schema. Selector/placement fragments
 *                   validate their `kind`/`at` vocabulary.
 *   - typescript  — every `import {...} from '@superdoc-dev/sdk'` symbol must
 *                   exist on the built SDK; snippets are also compiled with
 *                   tsc against the dist types (fragments get ambient decls).
 *   - python      — compiled with ast.parse; every `from superdoc import ...`
 *                   symbol must exist in the python package's __all__.
 *   - bash        — CLI invocations are replayed against the real CLI. Any
 *                   non-zero exit fails the block, except session/document
 *                   preconditions a bare checkout can't satisfy.
 *
 * Requires built SDK dist (pnpm --prefix packages/sdk/langs/node build)
 * and built CLI dist (pnpm --prefix apps/cli build).
 * Run: node scripts/validate-ai-snippets.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(DOCS, '../..');
const SDK_DIST = join(REPO, 'packages/sdk/langs/node/dist/index.js');
const PAGES = [
  'ai/agents/core-preset.mdx',
  'ai/agents/llm-tools.mdx',
  'ai/agents/legacy-preset.mdx',
  'ai/agents/architecture.mdx',
  'ai/agents/integrations.mdx',
  'ai/agents/best-practices.mdx',
  'ai/agents/debugging.mdx',
  'ai/agents/custom-actions.mdx',
];

if (!existsSync(SDK_DIST)) {
  console.error('validate-ai-snippets: SDK dist missing — run: pnpm --prefix packages/sdk/langs/node build');
  process.exit(2);
}
if (!existsSync(join(REPO, 'apps/cli/dist/index.js'))) {
  console.error('validate-ai-snippets: CLI dist missing — run: pnpm --prefix apps/cli build');
  process.exit(2);
}

const sdk = await import(SDK_DIST);
const catalog = await sdk.getPreset('core').getCatalog();
const perform = catalog.tools.find((t) => t.toolName === 'superdoc_perform_action');
const inspect = catalog.tools.find((t) => t.toolName === 'superdoc_inspect');
if (!perform || !inspect) {
  console.error('validate-ai-snippets: core catalog is missing superdoc_perform_action/superdoc_inspect — rebuild the SDK dist.');
  process.exit(2);
}
const ACTION_ENUM = new Set(perform.inputSchema.properties.action.enum);
const legacyCatalog = await sdk.getPreset('legacy').getCatalog();
const LEGACY_ACTIONS = new Set(
  legacyCatalog.tools.flatMap((t) => t.inputSchema?.properties?.action?.enum ?? []),
);
const PERFORM_KEYS = new Set(Object.keys(perform.inputSchema.properties));
const INSPECT_KEYS = new Set(Object.keys(inspect.inputSchema.properties));
const SELECTOR_KINDS = new Set(['nodeId', 'ordinal', 'textSearch', 'tableCell', 'placement', 'relative']);
const PLACEMENT_AT = new Set(['document_end', 'document_start', 'after', 'before']);

let failures = 0;
const fail = (page, idx, lang, msg) => {
  failures += 1;
  console.error(`  ✗ ${page} block[${idx}] (${lang}): ${msg}`);
};

function stripJsonc(text) {
  const lines = text.split('\n').map((line) => {
    let inString = false;
    for (let i = 0; i < line.length; i += 1) {
      if (line[i] === '"' && line[i - 1] !== '\\') inString = !inString;
      if (!inString && line[i] === '/' && line[i + 1] === '/') return line.slice(0, i).trimEnd();
    }
    return line;
  });
  return lines.join('\n').replace(/,\s*([}\]])/g, '$1');
}

function checkJsonBlock(page, idx, code) {
  // A jsonc block may contain several standalone objects (one per line-group).
  const objects = [];
  const chunks = code.split(/\n(?=\{)/).map((c) => stripJsonc(c).trim()).filter(Boolean);
  for (const chunk of chunks) {
    try {
      objects.push(JSON.parse(chunk));
    } catch (e) {
      fail(page, idx, 'jsonc', `does not parse: ${e.message} :: ${chunk.slice(0, 60)}`);
      return;
    }
  }
  for (const obj of objects) {
    if (typeof obj.action === 'string') {
      if (ACTION_ENUM.has(obj.action)) {
        for (const key of Object.keys(obj)) {
          if (!PERFORM_KEYS.has(key)) fail(page, idx, 'jsonc', `arg "${key}" not in superdoc_perform_action schema`);
        }
      } else if (!LEGACY_ACTIONS.has(obj.action)) {
        fail(page, idx, 'jsonc', `action "${obj.action}" exists in neither the core enum nor any legacy tool`);
      }
    } else if (typeof obj.kind === 'string') {
      if (!SELECTOR_KINDS.has(obj.kind)) fail(page, idx, 'jsonc', `unknown selector kind "${obj.kind}"`);
    } else if (typeof obj.at === 'string') {
      if (!PLACEMENT_AT.has(obj.at)) fail(page, idx, 'jsonc', `unknown placement at "${obj.at}"`);
    } else if (Object.keys(obj).some((k) => INSPECT_KEYS.has(k))) {
      for (const key of Object.keys(obj)) {
        if (!INSPECT_KEYS.has(key)) fail(page, idx, 'jsonc', `arg "${key}" not in superdoc_inspect schema`);
      }
    }
  }
}

function checkTsImports(page, idx, code) {
  const m = code.match(/import\s*\{([^}]+)\}\s*from\s*'@superdoc-dev\/sdk'/g) ?? [];
  for (const imp of m) {
    const names = imp
      .replace(/import\s*\{|\}\s*from.*/g, '')
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    for (const name of names) {
      if (name.startsWith('type ')) continue; // type-only: validated by the tsc pass
      const exported = name.split(/\s+as\s+/)[0].trim();
      if (!(exported in sdk)) fail(page, idx, 'ts', `'${exported}' is not exported by @superdoc-dev/sdk`);
    }
  }
}

function checkPython(page, idx, code, pyInfo) {
  const { execFileSync } = pyInfo;
  const tmp = join(pyInfo.dir, `snippet_${idx}.py`);
  writeFileSync(tmp, code);
  try {
    execFileSync('python3', ['-c', `import ast,sys; ast.parse(open(${JSON.stringify(tmp)}).read())`]);
  } catch (e) {
    fail(page, idx, 'python', `syntax error: ${String(e.stderr ?? e.message).slice(0, 120)}`);
    return;
  }
  const m = code.match(/from superdoc import ([^\n]+)/g) ?? [];
  for (const imp of m) {
    const names = imp.replace('from superdoc import ', '').split(',').map((n) => n.trim().split(' ')[0]);
    for (const name of names) {
      if (!pyInfo.exports.has(name)) fail(page, idx, 'python', `'${name}' not exported by the superdoc package`);
    }
  }
}

const CLI_DIST = join(REPO, 'apps/cli/dist/index.js');
// Snippet preconditions a bare checkout can't satisfy (no live session, no
// sample document). Everything else that exits non-zero is a real failure —
// pattern-matching only known-bad output proved too easy to slip past.
const TOLERATED_PRECONDITIONS = /SESSION_NOT_FOUND|session .{0,40}not found|DOC(UMENT)?_NOT_FOUND|no such file|ENOENT/i;

function checkBash(page, idx, code) {
  for (const rawLine of code.split(/\\\n/).join(' ').split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('superdoc ')) continue;
    const args = line.replace(/^superdoc\s+/, '').match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
    try {
      // Run the real invocation — appending --help would short-circuit before
      // flag validation and mask unknown-option errors (it did once).
      execFileSync('node', [CLI_DIST, ...args.map((a) => a.replace(/^['"]|['"]$/g, ''))], {
        stdio: 'pipe',
        timeout: 30_000,
      });
    } catch (e) {
      const out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
      const flagError = /unknown option|unknown flag|INVALID_ARGUMENT|MISSING_REQUIRED/i.test(out);
      // Fail on any non-zero exit unless it's ONLY a missing-session/document
      // precondition. Flag/validation errors fail even alongside one.
      if (flagError || !TOLERATED_PRECONDITIONS.test(out)) {
        fail(page, idx, 'bash', `CLI rejected (exit ${e.status ?? '?'}): ${line.slice(0, 80)} :: ${out.slice(0, 160) || e.message.slice(0, 160)}`);
      }
    }
  }
}

// python package exports
const pyDir = mkdtempSync(join(tmpdir(), 'ai-snippets-'));
const pyExportsRaw = execFileSync('python3', ['-c', `
import sys; sys.path.insert(0, ${JSON.stringify(join(REPO, 'packages/sdk/langs/python'))})
import superdoc; print(','.join(superdoc.__all__))
`]).toString();
const pyExports = new Set(pyExportsRaw.trim().split(','));
const pyInfo = { dir: pyDir, exports: pyExports, execFileSync };

// TS compile pass setup — ambient names are injected per snippet, and only
// when the snippet USES the name without declaring or importing it (docs
// fragments legitimately assume surrounding context like `doc` or `messages`).
const tsDir = mkdtempSync(join(tmpdir(), 'ai-snippets-ts-'));
const AMBIENT_DECLS = {
  doc: "declare const doc: import('@superdoc-dev/sdk').BoundDocApi;",
  call: 'declare const call: { id: string; function: { name: string; arguments: string } };',
  toolCall: 'declare const toolCall: any;',
  message: 'declare const message: any;',
  response: 'declare const response: any;',
  choice: 'declare const choice: any;',
  messages: 'declare const messages: any[];',
  args: 'declare const args: Record<string, any>;',
  name: 'declare const name: string;',
  toolName: 'declare const toolName: string;',
  openai: 'declare const openai: any;',
  anthropic: 'declare const anthropic: any;',
  model: 'declare const model: string;',
  finalText: 'declare const finalText: string;',
  receipt: 'declare const receipt: any;',
  kit: 'declare const kit: any;',
  tools: 'declare const tools: any[];',
  sdkTools: 'declare const sdkTools: any[];',
  systemPrompt: 'declare const systemPrompt: string;',
  dispatch: 'declare const dispatch: (...a: any[]) => Promise<any>;',
  client: 'declare const client: any;',
  send: 'declare function send(event: unknown): void;',
  hyperlinkTool: 'declare const hyperlinkTool: any;',
  dispatchToolCall: 'declare function dispatchToolCall(doc: any, toolName: string, args: any): Promise<any>;',
  streamFromServer: 'declare function streamFromServer(prompt: string, opts: any): AsyncIterable<string>;',
  signal: 'declare const signal: AbortSignal;',
  buffer: 'declare let buffer: string;',
  pendingFlush: 'declare let pendingFlush: any;',
  editor: 'declare const editor: any;',
  activeEditor: 'declare const activeEditor: any;',
  superdoc: 'declare const superdoc: any;',
  prompt: 'declare const prompt: string;',
  res: 'declare const res: any;',
  chooseTools: "declare const chooseTools: typeof import('@superdoc-dev/sdk').chooseTools;",
  getSystemPrompt: "declare const getSystemPrompt: typeof import('@superdoc-dev/sdk').getSystemPrompt;",
  dispatchSuperDocTool: "declare const dispatchSuperDocTool: typeof import('@superdoc-dev/sdk').dispatchSuperDocTool;",
  createAgentToolkit: "declare const createAgentToolkit: typeof import('@superdoc-dev/sdk').createAgentToolkit;",
  listTools: "declare const listTools: typeof import('@superdoc-dev/sdk').listTools;",
  getToolCatalog: "declare const getToolCatalog: typeof import('@superdoc-dev/sdk').getToolCatalog;",
};
function ambientFor(code) {
  const out = [];
  for (const [name, decl] of Object.entries(AMBIENT_DECLS)) {
    const used = new RegExp(`\\b${name}\\b`).test(code);
    if (!used) continue;
    const declared = new RegExp(`\\b(const|let|var|function|class)\\s+(\\{[^}]*\\b${name}\\b[^}]*\\}|${name}\\b)`).test(code)
      || new RegExp(`\\{[^}]*\\b${name}\\b[^}]*\\}\\s*=`).test(code)
      || new RegExp(`import[^;]*\\b${name}\\b[^;]*from`).test(code);
    if (!declared) out.push(decl);
  }
  return out.join('\n');
}
const tsFiles = [];

function dedent(code) {
  const lines = code.split('\n');
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(cut)).join('\n');
}

let blockTotal = 0;
for (const page of PAGES) {
  const text = readFileSync(join(DOCS, page), 'utf8');
  const blocks = [...text.matchAll(/```(\w+)[^\n]*\n(.*?)```/gs)].map((m) => ({ lang: m[1], code: dedent(m[2]) }));
  blocks.forEach(({ lang, code }, idx) => {
    blockTotal += 1;
    if (lang === 'jsonc' || lang === 'json') checkJsonBlock(page, idx, code);
    else if (lang === 'typescript' || lang === 'ts') {
      checkTsImports(page, idx, code);
      const file = join(tsDir, `${page.replace(/[^a-z0-9]+/gi, '_')}_${idx}.ts`);
      writeFileSync(file, `export {};\n${ambientFor(code)}\n${code}`);
      tsFiles.push(file);
    } else if (lang === 'python') checkPython(page, idx, code, pyInfo);
    else if (lang === 'bash') checkBash(page, idx, code);
  });
}

// Single tsc pass over all TS snippets against the dist types.
writeFileSync(join(tsDir, 'tsconfig.json'), JSON.stringify({
  compilerOptions: {
    strict: false,
    noEmit: true,
    skipLibCheck: true,
    module: 'esnext',
    target: 'es2022',
    moduleResolution: 'bundler',
    paths: {
      '@superdoc-dev/sdk': [join(REPO, 'packages/sdk/langs/node/dist/index.d.ts')],
      'openai': [join(tsDir, 'openai-stub.d.ts')],
      'openai/resources/chat/completions': [join(tsDir, 'openai-cc-stub.d.ts')],
      '@anthropic-ai/sdk': [join(tsDir, 'anthropic-stub.d.ts')],
      'ai': [join(tsDir, 'ai-stub.d.ts')],
      '@ai-sdk/openai': [join(tsDir, 'ai-sdk-openai-stub.d.ts')],
      '@aws-sdk/client-bedrock-runtime': [join(tsDir, 'bedrock-stub.d.ts')],
    },
  },
  include: ['*.ts'],
}, null, 2));
writeFileSync(join(tsDir, 'anthropic-stub.d.ts'), `
declare class Anthropic { constructor(...a: any[]); messages: any; }
declare namespace Anthropic { type MessageParam = any; type ToolResultBlockParam = any; }
export default Anthropic;`);
writeFileSync(join(tsDir, 'openai-stub.d.ts'), `
declare class OpenAI { constructor(...a: any[]); chat: any; }
declare namespace OpenAI { namespace Chat { namespace Completions { type ChatCompletionMessageParam = any; } type ChatCompletionMessageParam = any; } }
export default OpenAI;`);
writeFileSync(join(tsDir, 'openai-cc-stub.d.ts'), 'export type ChatCompletionTool = any;');
writeFileSync(join(tsDir, 'ai-stub.d.ts'), `
export declare function generateText(o: any): Promise<any>;
export declare function jsonSchema<T = any>(s: any): any;
export declare function stepCountIs(n: number): any;
export declare function tool<T = any>(d: any): any;`);
writeFileSync(join(tsDir, 'ai-sdk-openai-stub.d.ts'), 'export declare const openai: ((model: string) => any) & { chat(model: string): any };');
writeFileSync(join(tsDir, 'bedrock-stub.d.ts'), `
export declare class BedrockRuntimeClient { constructor(...a: any[]); send(c: any): Promise<any>; }
export declare class ConverseCommand { constructor(...a: any[]); }`);
try {
  execFileSync('npx', ['tsc', '-p', tsDir], { cwd: join(REPO, 'apps/docs'), stdio: 'pipe', timeout: 180_000 });
  console.log(`  ✓ ${tsFiles.length} TypeScript snippets compile against the SDK dist types`);
} catch (e) {
  const out = `${e.stdout ?? ''}`;
  for (const line of out.split('\n')) {
    if (line.includes('error TS')) { fail('(tsc)', '-', 'ts', line.trim().replace(/^.*ai-snippets-ts-[^/]+\//, '').slice(0, 220)); }
  }
}

rmSync(pyDir, { recursive: true, force: true });
rmSync(tsDir, { recursive: true, force: true });

console.log(`\nai-snippets: ${blockTotal} blocks checked across ${PAGES.length} pages, ${failures} failure(s)`);
process.exit(failures > 0 ? 1 : 0);
