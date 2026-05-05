/**
 * Headless AI Redlining
 *
 * Open a DOCX, send its text to an LLM for review, insert tracked changes,
 * and export the redlined document — all server-side, no browser needed.
 *
 * Usage: npx tsx src/index.ts [input.docx] [output.docx]
 */

import { readFile, writeFile } from 'node:fs/promises';
import { Editor } from 'superdoc/super-editor';

type Suggestion = { find: string; replace: string; comment: string };

async function main() {
  const args = process.argv.slice(2);
  const inputPath = args[0] || 'sample.docx';
  const outputPath = args[1] || 'redlined.docx';

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Set OPENAI_API_KEY in .env — see .env.example');
    process.exit(1);
  }

  // 1. Open the document headlessly (no element = headless mode)
  console.log(`Opening ${inputPath}...`);
  const docx = await readFile(inputPath);
  const editor = await Editor.open(docx, { documentMode: 'suggesting' });

  // 2. Extract text and send to LLM
  const text = editor.state.doc.textContent;
  console.log(`Document has ${text.length} characters. Sending to LLM...`);
  const suggestions = await callLLM(apiKey, text);
  console.log(`Got ${suggestions.length} suggestions.`);

  // 3. Apply each suggestion as a tracked change
  for (const s of suggestions) {
    const matches = editor.commands.search(s.find, { highlight: false });
    if (!matches.length) {
      console.log(`  Skipped (not found): "${s.find.slice(0, 40)}..."`);
      continue;
    }

    editor.commands.insertTrackedChange({
      from: matches[0].from,
      to: matches[0].to,
      text: s.replace,
      user: { name: 'AI Assistant', email: 'ai@superdoc.dev' },
      comment: s.comment,
    });
    console.log(`  Applied: "${s.find.slice(0, 40)}..." → "${s.replace.slice(0, 40)}..."`);
  }

  // 4. Export the redlined document (headless mode returns a Buffer/Uint8Array)
  const result = await editor.exportDocx();
  await writeFile(outputPath, Buffer.from(result as any));
  console.log(`Redlined document saved to ${outputPath}`);

  editor.destroy();
}

/**
 * Call OpenAI to get redlining suggestions for the document text.
 * WARNING: This is a demo only. In production, use proper secret management.
 */
async function callLLM(apiKey: string, text: string): Promise<Suggestion[]> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a legal document reviewer. Given document text, return a JSON object with a "suggestions" array. Each suggestion has:
- "find": the exact text to replace (must match the document verbatim)
- "replace": the improved text
- "comment": a brief explanation of the change

Return 3-5 suggestions max. Focus on clarity, precision, and legal best practices.`,
        },
        { role: 'user', content: text.slice(0, 8000) },
      ],
    }),
  });

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '{}';
  return JSON.parse(content).suggestions ?? [];
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
