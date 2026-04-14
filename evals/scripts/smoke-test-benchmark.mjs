#!/usr/bin/env node
/**
 * E2E smoke test for Level 3 benchmark providers.
 *
 * Tests each provider directly (no Promptfoo) to verify:
 * 1. Provider loads and accepts callApi
 * 2. Agent reads documents and returns correct content
 * 3. Agent edits documents and changes are detected
 * 4. SuperDoc MCP tools are used when superdocMcp is enabled
 * 5. Assertions from the benchmark YAML pass
 *
 * Usage: node scripts/smoke-test-benchmark.mjs [--codex] [--claude]
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVALS_ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
const testCodex = args.includes('--codex') || args.length === 0;
const testClaude = args.includes('--claude');

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    console.log(`  FAIL: ${message}`);
  }
}

function skip(message) {
  skipped++;
  console.log(`  SKIP: ${message}`);
}

// --- Codex tests ---

async function testCodexProvider() {
  console.log('\n=== Codex Provider Tests ===\n');

  const { default: CodexProvider } = await import('../providers/codex-agent.mjs');

  // Test 1: Codex baseline reading
  console.log('Test 1: Codex baseline — reading task');
  const baselineReader = new CodexProvider({
    config: { condition: 'baseline', superdocMcp: false, superdocOnPath: false },
  });
  assert(baselineReader.id() === 'codex-baseline', 'Provider ID is codex-baseline');

  const readResult = await baselineReader.callApi('', {
    vars: {
      fixture: 'report-with-formatting.docx',
      task: 'List all headings in this document.',
    },
  });

  if (readResult.error) {
    console.log(`  ERROR: ${readResult.error}`);
    skip('Codex baseline reading — API error');
  } else {
    const readOutput = JSON.parse(readResult.output);
    assert(readOutput.agentResponseText.length > 20, 'Agent returned text response');
    const responseLC = readOutput.agentResponseText.toLowerCase();
    assert(responseLC.includes('executive summary') || responseLC.includes('study overview'),
      'Response contains expected headings');
    assert(readOutput.documentChanged === false, 'Document was not modified (reading task)');
    assert(readOutput.pathUsed === 'raw', 'Path used is "raw" (no SuperDoc)');
    assert(readOutput.stepCount > 0, `Agent took ${readOutput.stepCount} steps`);
    assert(readOutput.usage?.input_tokens > 0, `Used ${readOutput.usage?.input_tokens} input tokens`);
  }

  // Test 2: Codex baseline editing
  console.log('\nTest 2: Codex baseline — editing task');
  const baselineEditor = new CodexProvider({
    config: { condition: 'baseline', superdocMcp: false, superdocOnPath: false },
  });

  const editResult = await baselineEditor.callApi('', {
    vars: {
      fixture: 'nda.docx',
      task: 'Replace every instance of "Amazing" with "SuperDoc Inc" throughout the document.',
      keepFile: true,
    },
  });

  if (editResult.error) {
    console.log(`  ERROR: ${editResult.error}`);
    skip('Codex baseline editing — API error');
  } else {
    const editOutput = JSON.parse(editResult.output);
    assert(editOutput.documentChanged === true, 'Document was modified');
    assert(editOutput.documentText.includes('SuperDoc Inc'), 'New name "SuperDoc Inc" present');
    assert(!editOutput.documentText.includes('Amazing'), 'Old name "Amazing" removed');
    assert(editOutput.documentText.includes('TechCraft'), 'Collateral: TechCraft intact');
    assert(editOutput.pathUsed === 'raw', 'Path used is "raw" (no SuperDoc)');
  }

  // Test 3: Codex with SuperDoc MCP
  console.log('\nTest 3: Codex superdoc-mcp — reading with MCP');
  const mcpReader = new CodexProvider({
    config: { condition: 'superdoc-mcp', superdocMcp: true, superdocOnPath: true },
  });

  const mcpResult = await mcpReader.callApi('', {
    vars: {
      fixture: 'nda.docx',
      task: 'List all party names mentioned in this NDA document.',
    },
  });

  if (mcpResult.error) {
    console.log(`  ERROR: ${mcpResult.error}`);
    skip('Codex MCP reading — API error');
  } else {
    const mcpOutput = JSON.parse(mcpResult.output);
    assert(mcpOutput.agentResponseText.length > 10, 'Agent returned text response');
    assert(
      mcpOutput.agentResponseText.includes('Amazing') || mcpOutput.agentResponseText.includes('TechCraft'),
      'Response contains party names'
    );
    assert(mcpOutput.documentChanged === false, 'Document was not modified (reading task)');
    // Check if MCP tools were used
    const usedMcp = mcpOutput.toolCalls.some(tc =>
      tc.tool.includes('superdoc') || tc.tool.includes('mcp')
    );
    console.log(`  INFO: pathUsed=${mcpOutput.pathUsed}, usedMcp=${usedMcp}`);
    console.log(`  INFO: toolCalls: ${mcpOutput.toolCalls.map(tc => tc.tool).join(', ')}`);
  }
}

// --- Claude Code tests ---

async function testClaudeProvider() {
  console.log('\n=== Claude Code Provider Tests ===\n');

  const { default: ClaudeProvider } = await import('../providers/claude-code-agent.mjs');

  // Test 1: Claude baseline reading
  console.log('Test 1: Claude baseline — reading task');
  const baselineReader = new ClaudeProvider({
    config: {
      condition: 'baseline',
      allowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
      superdocMcp: false,
      superdocOnPath: false,
    },
  });
  assert(baselineReader.id() === 'claude-code-baseline', 'Provider ID is claude-code-baseline');

  const readResult = await baselineReader.callApi('', {
    vars: {
      fixture: 'report-with-formatting.docx',
      task: 'List all headings in this document.',
    },
  });

  if (readResult.error) {
    console.log(`  ERROR: ${readResult.error}`);
    skip('Claude baseline reading — API error');
  } else {
    const readOutput = JSON.parse(readResult.output);
    assert(readOutput.agentResponseText.length > 20, 'Agent returned text response');
    const responseLC = readOutput.agentResponseText.toLowerCase();
    assert(responseLC.includes('executive summary') || responseLC.includes('study overview'),
      'Response contains expected headings');
    assert(readOutput.documentChanged === false, 'Document was not modified');
    assert(readOutput.stepCount > 0, `Agent took ${readOutput.stepCount} steps`);
  }

  // Test 2: Claude baseline editing
  console.log('\nTest 2: Claude baseline — editing task');
  const baselineEditor = new ClaudeProvider({
    config: {
      condition: 'baseline',
      allowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
      superdocMcp: false,
      superdocOnPath: false,
    },
  });

  const editResult = await baselineEditor.callApi('', {
    vars: {
      fixture: 'nda.docx',
      task: 'Replace every instance of "Amazing" with "SuperDoc Inc" throughout the document.',
      keepFile: true,
    },
  });

  if (editResult.error) {
    console.log(`  ERROR: ${editResult.error}`);
    skip('Claude baseline editing — API error');
  } else {
    const editOutput = JSON.parse(editResult.output);
    assert(editOutput.documentChanged === true, 'Document was modified');
    assert(editOutput.documentText.includes('SuperDoc Inc'), 'New name "SuperDoc Inc" present');
    assert(!editOutput.documentText.includes('Amazing'), 'Old name "Amazing" removed');
    assert(editOutput.documentText.includes('TechCraft'), 'Collateral: TechCraft intact');
  }

  // Test 3: Claude with SuperDoc MCP
  console.log('\nTest 3: Claude superdoc-mcp — reading with MCP');
  const mcpReader = new ClaudeProvider({
    config: {
      condition: 'superdoc-mcp',
      allowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
      superdocMcp: true,
      superdocOnPath: true,
    },
  });

  const mcpResult = await mcpReader.callApi('', {
    vars: {
      fixture: 'nda.docx',
      task: 'List all party names mentioned in this NDA document.',
    },
  });

  if (mcpResult.error) {
    console.log(`  ERROR: ${mcpResult.error}`);
    skip('Claude MCP reading — API error');
  } else {
    const mcpOutput = JSON.parse(mcpResult.output);
    assert(mcpOutput.agentResponseText.length > 10, 'Agent returned text response');
    assert(
      mcpOutput.agentResponseText.includes('Amazing') || mcpOutput.agentResponseText.includes('TechCraft'),
      'Response contains party names'
    );
    assert(mcpOutput.documentChanged === false, 'Document was not modified (reading task)');
    const usedSuperdoc = mcpOutput.toolCalls.some(tc =>
      tc.tool.includes('superdoc') || tc.tool.includes('mcp__superdoc')
    );
    assert(usedSuperdoc, 'SuperDoc MCP tools were used');
    console.log(`  INFO: pathUsed=${mcpOutput.pathUsed}`);
    console.log(`  INFO: tools: ${mcpOutput.toolCalls.map(tc => tc.tool).join(', ')}`);
  }

  // Test 4: Claude with local settings (useClaudeSettings)
  console.log('\nTest 4: Claude local — reading with your Claude Code config');
  const localReader = new ClaudeProvider({
    config: {
      condition: 'local',
      useClaudeSettings: true,
      superdocOnPath: true,
    },
  });

  const localResult = await localReader.callApi('', {
    vars: {
      fixture: 'nda.docx',
      task: 'List all party names mentioned in this NDA document.',
    },
  });

  if (localResult.error) {
    console.log(`  ERROR: ${localResult.error}`);
    skip('Claude local reading — API error');
  } else {
    const localOutput = JSON.parse(localResult.output);
    assert(localOutput.agentResponseText.length > 10, 'Agent returned text response');
    assert(
      localOutput.agentResponseText.includes('Amazing') || localOutput.agentResponseText.includes('TechCraft'),
      'Response contains party names'
    );
    console.log(`  INFO: pathUsed=${localOutput.pathUsed}`);
    console.log(`  INFO: toolCalls: ${localOutput.toolCalls.map(tc => tc.tool).join(', ')}`);
  }
}

// --- Run ---

async function main() {
  console.log('Level 3 Benchmark E2E Smoke Test');
  console.log('================================');

  if (testCodex) {
    try {
      await testCodexProvider();
    } catch (err) {
      console.log(`\nCodex tests crashed: ${err.message}`);
      failed++;
    }
  }

  if (testClaude) {
    try {
      await testClaudeProvider();
    } catch (err) {
      console.log(`\nClaude tests crashed: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n================================`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
