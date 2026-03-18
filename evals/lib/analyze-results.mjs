/**
 * Post-eval visual analysis using Claude Agent SDK.
 *
 * Reads the latest eval results, gives Claude the data + Write tool,
 * and asks it to generate an HTML dashboard with charts and insights.
 * Opens the result in the browser automatically.
 *
 * Usage:
 *   node lib/analyze-results.mjs [results-file]
 *   pnpm run analyze                # analyze latest results
 *   pnpm run eval:analyze           # run eval then analyze
 *
 * Requires: ANTHROPIC_API_KEY environment variable.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVALS_ROOT = resolve(__dirname, '..');
const OUTPUT_HTML = resolve(EVALS_ROOT, 'results/analysis.html');

// ---------------------------------------------------------------------------
// Extract structured data from eval results
// ---------------------------------------------------------------------------

function extractEvalSummary(resultsPath) {
  const data = JSON.parse(readFileSync(resultsPath, 'utf8'));
  const results = data.results?.results || data.results || [];

  const perModel = {};
  const testMatrix = {};
  const failures = [];

  for (const r of results) {
    const desc = r.testCase?.description || 'unknown';
    const task = r.testCase?.vars?.task || '';
    const provider = r.provider?.label || 'unknown';
    const prompt = (r.prompt?.label || r.prompt?.raw || '').includes('minimal') ? 'minimal' : 'agent';
    const key = `${provider}/${prompt}`;

    if (!perModel[key]) perModel[key] = { pass: 0, fail: 0 };
    if (!testMatrix[desc]) testMatrix[desc] = {};
    testMatrix[desc][key] = r.success;

    if (r.success) {
      perModel[key].pass++;
    } else {
      perModel[key].fail++;

      const output = r.response?.output;
      const toolsCalled = Array.isArray(output)
        ? output.map((c) => {
            const name = c.function?.name;
            try {
              return { tool: name, args: JSON.parse(c.function?.arguments || '{}') };
            } catch {
              return { tool: name };
            }
          })
        : [];

      const failReasons = (r.gradingResult?.componentResults || [])
        .filter((cr) => !cr.pass)
        .map((cr) => ({
          type: cr.assertion?.type,
          metric: cr.assertion?.metric,
          reason: cr.reason,
        }));

      failures.push({ test: desc, task, model: key, toolsCalled, failReasons });
    }
  }

  const totalPass = results.filter((r) => r.success).length;
  return {
    totalTests: results.length,
    passed: totalPass,
    failed: results.length - totalPass,
    passRate: Math.round((totalPass / results.length) * 100),
    perModel,
    testMatrix,
    failures,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const resultsPath = process.argv[2] || resolve(EVALS_ROOT, 'results/latest.json');
  if (!existsSync(resultsPath)) {
    console.error(`Results file not found: ${resultsPath}`);
    process.exit(1);
  }

  console.log(`Analyzing: ${resultsPath}`);

  const summary = extractEvalSummary(resultsPath);
  console.log(`Results: ${summary.passed}/${summary.totalTests} passed (${summary.passRate}%), ${summary.failures.length} failures`);

  const toolSchemas = readFileSync(resolve(EVALS_ROOT, 'lib/essential.json'), 'utf8');
  const agentPrompt = readFileSync(resolve(EVALS_ROOT, 'prompts/agent.txt'), 'utf8');
  const testDefs = readFileSync(resolve(EVALS_ROOT, 'tests/tool-quality.yaml'), 'utf8');

  const prompt = `You have eval results from a SuperDoc AI tool quality test suite. Your job: generate a single self-contained HTML file at "${OUTPUT_HTML}" that visualizes the results as a beautiful dark-themed analysis dashboard. Then I will open it.

## Eval Data

${JSON.stringify(summary, null, 2)}

## Tool Schemas (for context on what was tested)
${toolSchemas.substring(0, 3000)}...

## Agent Prompt (for context)
${agentPrompt}

## Test Definitions
${testDefs}

## Requirements for the HTML dashboard

1. **Single self-contained HTML file** — all CSS and JS inline. No external dependencies except Google Fonts.
2. **Dark theme** — background #0a0f1c, accent blue #629be7, text white/gray.
3. **Sections** (scroll-based, not slides):
   - **Hero header**: pass rate as a large number, total tests, date
   - **Model leaderboard**: horizontal bars for each model/prompt combo showing pass rate. Sort best to worst.
   - **Test matrix heatmap**: rows = tests, columns = model/prompt combos. Green = pass, red = fail. Show test names.
   - **Failure patterns**: group failures by root cause pattern with counts and descriptions
   - **Top recommendations**: ranked cards with impact scores
   - **Schema improvements**: before/after diffs for discover_tools, apply_mutations, blocks_list descriptions
4. **Use CSS grid/flexbox for layout**. Responsive. Nice typography (use a Google Font like JetBrains Mono for data, Outfit for headings).
5. **Subtle animations**: fade-in on scroll, counter animation for the hero number, bar chart animations.
6. **All data must come from the eval results above** — hardcode the actual numbers and test names into the HTML.
7. **Professional quality** — this should look like a Vercel/Linear-style analytics dashboard, not a basic report.

Write the file using your Write tool to "${OUTPUT_HTML}". Do not explain — just generate and write the HTML file.`;

  console.log('Generating visual analysis...\n');

  for await (const message of query({
    prompt,
    options: {
      allowedTools: ['Write', 'Read'],
      maxTurns: 5,
      systemPrompt:
        'You are a data visualization expert. Generate a single self-contained HTML dashboard file. ' +
        'Use the Write tool to create the file. Do not ask questions. Do not explain. Just write the HTML.',
    },
  })) {
    if (message.type === 'assistant' && message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === 'text' && block.text.trim()) {
          process.stdout.write(block.text);
        }
      }
    }
  }

  // Open in browser
  if (existsSync(OUTPUT_HTML)) {
    console.log(`\nDashboard written to: ${OUTPUT_HTML}`);
    console.log('Opening in browser...');
    try {
      execSync(`open "${OUTPUT_HTML}"`, { stdio: 'ignore' });
    } catch {
      console.log(`Open manually: file://${OUTPUT_HTML}`);
    }
  } else {
    console.error('Dashboard file was not created. Check Claude Agent SDK output above.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Analysis failed:', err.message);
  process.exit(1);
});
