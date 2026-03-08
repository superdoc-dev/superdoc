/**
 * SuperDoc + Google Vertex AI
 *
 * Minimal agentic loop: Gemini on Vertex AI uses SuperDoc tools
 * to review and edit a Word document.
 *
 * Usage: npx tsx index.ts [input.docx] [output.docx]
 *
 * Requires: Google Cloud credentials configured (gcloud auth application-default login).
 */

import {
  VertexAI,
  type FunctionDeclaration,
  type Tool as VertexTool,
  type Content,
  type Part,
} from '@google-cloud/vertexai';
import {
  createSuperDocClient,
  chooseTools,
  dispatchSuperDocTool,
} from '@superdoc-dev/sdk';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? 'your-project-id';
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1';
const MODEL = process.env.VERTEX_MODEL ?? 'gemini-2.5-pro';

/** Recursively strip JSON Schema keywords unsupported by Vertex AI (e.g. `const`). */
function sanitizeSchema(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sanitizeSchema);
  if (typeof obj !== 'object' || obj === null) return obj;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key === 'const') continue;
    result[key] = sanitizeSchema(value);
  }
  return result;
}

/** Convert SuperDoc generic-format tools to Vertex AI function declarations. */
function toVertexTools(
  sdTools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>,
): VertexTool[] {
  const declarations: FunctionDeclaration[] = sdTools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: sanitizeSchema(t.parameters) as FunctionDeclaration['parameters'],
  }));
  return [{ functionDeclarations: declarations }];
}

async function main() {
  const [inputPath = 'contract.docx', outputPath = 'reviewed.docx'] = process.argv.slice(2);

  // 1. Connect to SuperDoc
  const client = createSuperDocClient();
  await client.connect();
  await client.doc.open({ doc: inputPath });

  // 2. Get tools in generic format and convert to Vertex shape
  const { tools: sdTools } = await chooseTools({ provider: 'generic' });
  const vertexTools = toVertexTools(
    sdTools as Array<{ name: string; description: string; parameters: Record<string, unknown> }>,
  );

  // 3. Set up Vertex AI
  const vertexAI = new VertexAI({ project: PROJECT, location: LOCATION });
  const model = vertexAI.getGenerativeModel({
    model: MODEL,
    tools: vertexTools,
    systemInstruction: { role: 'system', parts: [{ text: 'You edit .docx files using SuperDoc tools. Use tracked changes for all edits.' }] },
  });

  const chat = model.startChat();

  // 4. Agentic loop
  let response = await chat.sendMessage([
    { text: 'Review this contract. Fix vague language and one-sided terms.' },
  ]);

  for (let turn = 0; turn < 20; turn++) {
    const candidate = response.response.candidates?.[0];
    if (!candidate) break;

    const functionCalls = candidate.content.parts.filter((p) => p.functionCall);
    if (!functionCalls.length) {
      // Print final response
      for (const part of candidate.content.parts) {
        if (part.text) console.log(part.text);
      }
      break;
    }

    const functionResponses: Part[] = [];
    for (const part of functionCalls) {
      const { name, args } = part.functionCall!;
      console.log(`  Tool: ${name}`);
      try {
        const result = await dispatchSuperDocTool(client, name, (args ?? {}) as Record<string, unknown>);

        // discover_tools returns new tools — merge them
        if (name === 'discover_tools') {
          const newTools = (result as { tools?: any[] }).tools ?? [];
          vertexTools[0].functionDeclarations!.push(
            ...newTools.map((t: any) => ({
              name: t.name,
              description: t.description,
              parameters: sanitizeSchema(t.parameters),
            })),
          );
        }

        functionResponses.push({
          functionResponse: { name, response: result as object },
        });
      } catch (err) {
        functionResponses.push({
          functionResponse: { name, response: { error: (err as Error).message } },
        });
      }
    }

    response = await chat.sendMessage(functionResponses);
  }

  // 5. Save
  await client.doc.save({ doc: outputPath });
  await client.dispose();
  console.log(`\nSaved to ${outputPath}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
