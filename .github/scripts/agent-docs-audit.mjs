#!/usr/bin/env node
/**
 * Agent-docs semantic audit.
 *
 * Three layers, modeled on risk-assess.mjs:
 *   L1: deterministic scan (sizes, paths, symlinks, broken refs) - free
 *   L2: Haiku triage per doc - needs review? - ~$0.01/doc
 *   L3: Sonnet deep analysis on flagged docs - structured findings - ~$0.10/doc
 *
 * Usage:
 *   node agent-docs-audit.mjs                       # audit all flagged docs (L1+L2+L3)
 *   node agent-docs-audit.mjs --only <relpath>      # audit one specific doc
 *   node agent-docs-audit.mjs --skip-ai             # L1 only, no API calls
 *   node agent-docs-audit.mjs --dry-run             # all layers stubbed
 *
 * Env:
 *   ANTHROPIC_API_KEY     required for L2/L3; if missing the script auto-falls back to L1-only
 *   REPO_ROOT             target repo path (default: cwd)
 *   POLICY_FILE           path to agent-docs-policy.md (default: <REPO_ROOT>/agent-docs-policy.md)
 *
 * Output: Markdown report to stdout, structured JSON to /tmp/agent-docs-audit.json,
 *         L1 markdown to /tmp/agent-docs-audit-l1.md.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runL1Scan, flaggedForReview, renderL1Markdown } from './agent-docs-l1.mjs';

delete process.env.CLAUDECODE;

const REPO_ROOT = resolve(process.env.REPO_ROOT ?? process.cwd());
const POLICY_FILE_DEFAULT = join(REPO_ROOT, 'agent-docs-policy.md');
const POLICY_FILE = process.env.POLICY_FILE ?? POLICY_FILE_DEFAULT;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_AI = args.includes('--skip-ai') || (!DRY_RUN && !process.env.ANTHROPIC_API_KEY);
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

// ── Layer 2: Haiku triage ──

async function haikuTriage(doc, policyText) {
  if (DRY_RUN) return { decision: 'review', reason: 'dry-run forces review', cost: 0 };
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const docContent = readFileSync(join(REPO_ROOT, doc.path), 'utf-8');
  const prompt = `You are triaging an agent-context doc for review.

Doc path: ${doc.path}
Doc size: ${doc.lines} lines
Deterministic flags: ${doc.reasons.join('; ')}

Doc content:
\`\`\`markdown
${docContent}
\`\`\`

Policy excerpt:
${policyText.slice(0, 2000)}

Decide whether this doc needs deep review against the policy. Respond using the triage tool. Bias toward "review" only when the deterministic flags suggest real issues (broken refs likely stale; large size likely contains content that could be trimmed/moved).`;

  const result = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    tools: [{
      name: 'triage',
      description: 'Decide whether the doc needs deep review.',
      input_schema: {
        type: 'object',
        properties: {
          decision: { type: 'string', enum: ['review', 'skip'] },
          reason: { type: 'string', description: 'One sentence' },
        },
        required: ['decision', 'reason'],
      },
    }],
    tool_choice: { type: 'tool', name: 'triage' },
    messages: [{ role: 'user', content: prompt }],
  });
  const toolUse = result.content.find((b) => b.type === 'tool_use');
  const cost = (result.usage.input_tokens * 0.0000008) + (result.usage.output_tokens * 0.000004);
  return { ...toolUse.input, cost };
}

// ── Layer 3: Sonnet deep analysis ──

async function sonnetDeep(doc, policyText) {
  if (DRY_RUN) {
    return { findings: [{ label: 'INVESTIGATE', section: '(dry-run)', claim: '', reason: 'no API call', evidence: '', suggested_action: 'rerun without --dry-run' }], cost: 0, durationMs: 0, toolCalls: [] };
  }
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  const docContent = readFileSync(join(REPO_ROOT, doc.path), 'utf-8');

  const prompt = `You are auditing an agent-context doc against a policy. Identify sections that are stale, incorrect, redundant, or misplaced.

Doc path: ${doc.path}
Doc size: ${doc.lines} lines
Deterministic flags: ${doc.reasons.join('; ')}
Deterministic broken refs (if any): ${doc.brokenRefs.join(', ') || 'none'}

Doc content:
\`\`\`markdown
${docContent}
\`\`\`

Policy:
${policyText}

Scope your investigation tightly:
1. Verify each deterministic broken-ref flag (real miss or just shorthand?). Emit UPDATE or INVESTIGATE.
2. Look at the 2 largest H2 sections. Decide if either is a MOVE candidate per the policy (duplicates content elsewhere, package-specific, etc.). Cite the destination doc.
3. Sample 2-3 specific concrete claims (a command, path, function name). Verify them.

Do not pad the report. Most sections will produce no finding - that is correct. Prefer "drop the hardcoded value" over "update to the current value" when the value is likely to drift.

Limit yourself to 8 tool calls total. Use Grep for identifiers, Read for short files, Glob for existence, Bash sparingly (git log, complex rg).

End your response with this JSON. No markdown fences:

{"findings":[{"label":"KEEP|TRIM|MOVE|UPDATE|INVESTIGATE","section":"H2 or H3 header text","claim":"verbatim excerpt or paraphrase","reason":"why this label","evidence":"what you checked and what you found","suggested_action":"concrete next step"}]}

Only emit KEEP when explaining why a flagged section should remain. The default for verified content is silence.`;

  let resultText = '';
  let cost = 0;
  let durationMs = 0;
  const toolCalls = [];

  for await (const msg of query({
    prompt,
    options: {
      // allowedTools is not a strict allowlist under bypassPermissions; Bash
      // gets through. Listing what we expect to use; relying on the prompt
      // budget ("6-8 tool calls") and maxTurns to constrain cost.
      allowedTools: ['Read', 'Glob', 'Grep', 'Bash'],
      disallowedTools: ['Edit', 'Write', 'Task', 'WebFetch', 'WebSearch', 'mcp__*'],
      permissionMode: 'bypassPermissions',
      maxTurns: 15,
      cwd: REPO_ROOT,
    },
  })) {
    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text') resultText = block.text;
        if (block.type === 'tool_use') {
          toolCalls.push(`${block.name}: ${JSON.stringify(block.input).slice(0, 100)}`);
        }
      }
    }
    if (msg.type === 'result') {
      cost = msg.total_cost_usd ?? 0;
      durationMs = msg.duration_api_ms ?? msg.duration_ms ?? 0;
    }
  }

  const jsonMatch = resultText.match(/\{[\s\S]*"findings"[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Sonnet did not produce findings JSON. Tail: ${resultText.slice(-300)}`);
  const parsed = JSON.parse(jsonMatch[0]);
  return { ...parsed, cost, durationMs, toolCalls };
}

// ── Output ──

function renderMarkdown(report) {
  const lines = [`# Agent docs audit\n`, `Target: \`${REPO_ROOT}\`\n`];
  if (DRY_RUN) lines.push('**DRY RUN** - no API calls were made.\n');
  lines.push(`Total cost: $${report.totalCost.toFixed(4)} (${report.docs.length} docs reviewed)\n`);
  for (const d of report.docs) {
    lines.push(`## \`${d.path}\` (${d.lines} lines)\n`);
    lines.push(`Reasons flagged: ${d.reasons.join('; ')}`);
    lines.push(`Triage: ${d.triage?.decision ?? 'n/a'} - ${d.triage?.reason ?? ''}`);
    if (!d.deep) { lines.push(''); continue; }
    if (d.deep.findings.length === 0) {
      lines.push('No findings.\n');
      continue;
    }
    lines.push('| Label | Section | Reason | Suggested action |');
    lines.push('|---|---|---|---|');
    for (const f of d.deep.findings) {
      lines.push(`| ${f.label} | ${f.section} | ${f.reason} | ${f.suggested_action} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ── Main ──

async function main() {
  // SKIP_AI is set automatically if ANTHROPIC_API_KEY is missing, or via --skip-ai.
  // In that case the script runs L1 only and the workflow uploads an L1-only report.

  const policyText = existsSync(POLICY_FILE)
    ? readFileSync(POLICY_FILE, 'utf-8')
    : '# Default policy\n\n(No policy file found; using built-in defaults: root <= 120 lines, nested <= 200, label findings KEEP/TRIM/MOVE/UPDATE/INVESTIGATE.)';

  console.error('[L1] running deterministic scan...');
  const scan = runL1Scan(REPO_ROOT);
  writeFileSync('/tmp/agent-docs-audit-l1.md', renderL1Markdown(scan));
  let flagged = flaggedForReview(scan).map((f) => ({
    path: f.relPath,
    lines: f.lineCount,
    kind: f.isSymlink ? 'symlink' : 'file',
    brokenRefs: f.brokenPathRefs,
    reasons: f.reasons,
  }));
  if (ONLY) flagged = flagged.filter((d) => d.path === ONLY);
  console.error(`[L1] ${scan.files.length} doc(s) inventoried, ${flagged.length} flagged for review${ONLY ? ` (filtered to --only ${ONLY})` : ''}`);

  if (SKIP_AI) {
    console.error('[L2/L3] skipped (no ANTHROPIC_API_KEY or --skip-ai). Writing L1 report only.');
    const stub = { docs: flagged.map((d) => ({ ...d, triage: null, deep: null })), totalCost: 0, l1Only: true };
    writeFileSync('/tmp/agent-docs-audit.json', JSON.stringify(stub, null, 2));
    console.log(renderL1Markdown(scan));
    return;
  }

  const report = { docs: [], totalCost: 0 };
  for (const doc of flagged) {
    console.error(`[L2] triage: ${doc.path}`);
    const triage = await haikuTriage(doc, policyText);
    report.totalCost += triage.cost;
    const entry = { ...doc, triage, deep: null };
    if (triage.decision === 'review') {
      console.error(`[L3] deep analysis: ${doc.path}`);
      const deep = await sonnetDeep(doc, policyText);
      report.totalCost += deep.cost;
      entry.deep = deep;
    }
    report.docs.push(entry);
  }

  writeFileSync('/tmp/agent-docs-audit.json', JSON.stringify(report, null, 2));
  console.log(renderMarkdown(report));
}

main().catch((err) => {
  console.error(`audit failed: ${err.stack || err.message}`);
  process.exit(1);
});
