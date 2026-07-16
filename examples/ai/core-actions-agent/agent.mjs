/**
 * Core-preset agent: edit a .docx from a natural-language instruction.
 *
 *   node agent.mjs <input.docx> "<instruction>" [--tracked] [--out <output.docx>]
 *
 * Demonstrates the `core` LLM-tools preset end to end via createAgentToolkit:
 *   - tools        → 2 tools (superdoc_inspect, superdoc_perform_action)
 *   - systemPrompt → the prompt the action surface is evaluated with
 *   - dispatch     → pre-bound to the preset; returns receipts with verification
 *
 * Each tool call is printed as a status line — the same shape you would
 * stream to a chat UI (see the "Streaming status to your UI" docs section).
 */
import 'dotenv/config';
import OpenAI from 'openai';
import { createSuperDocClient, createAgentToolkit } from '@superdoc-dev/sdk';

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-5.4';
const MAX_TURNS = 16;

// ---------------------------------------------------------------------------
// CLI arguments
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const tracked = args.includes('--tracked');
const outFlag = args.indexOf('--out');
if (outFlag >= 0 && (args[outFlag + 1] == null || args[outFlag + 1].startsWith('--'))) {
  console.error('--out requires a path argument');
  process.exit(1);
}
const outPath = outFlag >= 0 ? args[outFlag + 1] : 'out.docx';
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
const [inputPath, instruction] = positional;

if (!inputPath || !instruction) {
  console.error('Usage: node agent.mjs <input.docx> "<instruction>" [--tracked] [--out <output.docx>]');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// SuperDoc session + core-preset tool surface
// ---------------------------------------------------------------------------
const client = createSuperDocClient();
await client.connect();
const doc = await client.open({ doc: inputPath });

// Everything after open() runs inside try/finally so an API error or a
// malformed response never leaks the session or (in dev checkouts) the
// locally spawned CLI process.
try {

  // One call — tools, system prompt, and a pre-bound dispatcher that are
  // guaranteed to agree on preset (and excludeActions, if you narrow).
  const { tools, systemPrompt, dispatch } = await createAgentToolkit({ provider: 'openai', preset: 'core' });

  const userInstruction = tracked
    ? `${instruction}\n\nMake every edit as a tracked change (changeMode: "tracked") so a reviewer can accept or reject it.`
    : instruction;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userInstruction },
  ];

  // ---------------------------------------------------------------------------
  // Agent loop
  // ---------------------------------------------------------------------------
  const openai = new OpenAI();

  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    const response = await openai.chat.completions.create({ model: MODEL, messages, tools });
    const message = response.choices[0].message;
    messages.push(message);

    if (!message.tool_calls?.length) {
      console.log(`\n${message.content ?? '(no final message)'}`);
      break;
    }

    for (const call of message.tool_calls) {
      let receipt;
      try {
        // Malformed tool-call arguments become an error receipt the model can
        // read and correct, instead of crashing the run.
        const callArgs = JSON.parse(call.function.arguments);
        process.stdout.write(`  → ${callArgs.action ?? call.function.name} … `);
        receipt = await dispatch(doc, call.function.name, callArgs);
        const status = receipt?.status ?? 'ok';
        const verified = receipt?.verificationPassed;
        console.log(status + (verified === false ? ' (verification failed)' : ''));
      } catch (error) {
        receipt = { status: 'failed', error: { code: error.code, message: error.message } };
        console.log(`error: ${error.code ?? error.message}`);
      }

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(receipt),
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------
  await doc.save({ out: outPath, force: true });
  console.log(`\nSaved: ${outPath}`);

} finally {
  await doc.close({ discard: true }).catch(() => {});
  await client.dispose();
}
