#!/usr/bin/env node
/**
 * Test: Create an NDA from scratch using Claude + SuperDoc MCP.
 *
 * This demonstrates SuperDoc's unique advantage: creating a fully formatted
 * DOCX document from scratch with headings, bold, colors, and structure.
 * Raw XML manipulation (unzip + sed) cannot do this.
 *
 * Usage: node evals/scripts/test-nda-creation.mjs
 * Output: evals/fixtures/docs/claude-orlov-gs-nda.docx
 */

import { copyFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVALS_ROOT = resolve(__dirname, '..');
const OUTPUT = resolve(EVALS_ROOT, 'fixtures/docs/claude-orlov-gs-nda.docx');

async function main() {
  const { default: Provider } = await import(resolve(EVALS_ROOT, 'providers/claude-code-agent.mjs'));

  const provider = new Provider({
    config: {
      condition: 'superdoc-mcp',
      allowedTools: ['Read', 'Glob', 'Grep'],
      superdocMcp: true,
      superdocOnPath: true,
      maxTurns: 100,
    },
  });

  console.log('Creating NDA: Andrii Orlov × Golden State Warriors');
  console.log('Using: Claude Code + SuperDoc MCP');
  console.log('');

  const result = await provider.callApi('', {
    vars: {
      blankDocument: true,
      outputName: 'claude-orlov-gs-nda.docx',
      keepFile: true,
      task: `Create an NDA between Andrii Orlov and Golden State Warriors Inc. Include sections: Definitions, Obligations, NBA Draft Requirements (list: age 19+, declare by deadline, Draft Combine, work visa), Salary (leave amount as $__________), Governing Law, Signatures. Make headings red and centered. Make the salary paragraph bold. IMPORTANT: After creating all content, you MUST call superdoc_save and superdoc_close before finishing.`,
    },
  });

  if (result.error) {
    console.error('ERROR:', result.error);
    process.exit(1);
  }

  const o = JSON.parse(result.output);

  console.log('Steps:', o.stepCount);
  console.log('Cost:', '$' + (o.cost || 0).toFixed(4));
  console.log('Duration:', Math.round(o.duration / 1000) + 's');
  console.log('Path:', o.pathUsed);
  console.log('MCP calls:', o.toolCalls.filter(tc => tc.tool.includes('superdoc')).length);
  console.log('');

  if (!existsSync(o.outputFile)) {
    console.error('Output file not found:', o.outputFile);
    console.error('Agent may have run out of turns before saving.');
    process.exit(1);
  }

  // Copy to fixtures
  copyFileSync(o.outputFile, OUTPUT);
  console.log('Output:', OUTPUT);
  console.log('Size:', statSync(OUTPUT).size, 'bytes');
  console.log('');

  // Verify
  const { parseDocx } = await import(resolve(EVALS_ROOT, 'shared/docx-fidelity.mjs'));
  const parsed = await parseDocx(OUTPUT);
  const xml = parsed.documentXml;

  const checks = [
    ['Andrii Orlov', xml.includes('Andrii Orlov')],
    ['Golden State Warriors', xml.includes('Golden State Warriors')],
    ['NDA title', xml.includes('NON-DISCLOSURE')],
    ['Definitions section', xml.includes('Definitions')],
    ['Obligations section', xml.includes('Obligations')],
    ['Draft requirements (19+)', xml.includes('19')],
    ['Work visa', xml.includes('visa') || xml.includes('Visa')],
    ['Salary section', xml.includes('salary') || xml.includes('Salary')],
    ['Salary placeholder', xml.includes('__________')],
    ['Governing Law', xml.includes('California') || xml.includes('Governing')],
    ['Signatures', xml.includes('WITNESS') || xml.includes('_____')],
    ['Heading styles', xml.split('</w:p>').filter(p => p.includes('Heading')).length >= 5],
    ['Bold formatting (w:b)', (xml.match(/<w:b[/ >]/g) || []).length > 0],
    ['Red color (#FF0000)', xml.includes('FF0000') || xml.includes('ff0000')],
  ];

  let passed = 0;
  for (const [label, pass] of checks) {
    console.log(pass ? '  ✓ ' + label : '  ✗ ' + label);
    if (pass) passed++;
  }

  console.log('');
  console.log(`Result: ${passed}/${checks.length} checks passed`);

  if (passed < checks.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
