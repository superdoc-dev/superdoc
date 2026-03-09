# AI Integration Examples

Give LLMs structured access to document operations. Each example connects SuperDoc's Document Engine to a cloud AI platform or agent framework — open a doc, let the model review and edit it with tools, save the result.

**Docs:** [Integrations](https://docs.superdoc.dev/document-engine/ai-agents/integrations) · [LLM Tools](https://docs.superdoc.dev/document-engine/ai-agents/llm-tools)

## Cloud platforms

You write the agentic loop and control the conversation directly.

| Platform | Node.js | Python | Auth |
|----------|---------|--------|------|
| [AWS Bedrock](./bedrock) | `index.ts` | `index.py` | AWS credentials (`aws configure`) |
| [Google Vertex AI](./vertex) | `index.ts` | `index.py` | Google Cloud credentials (`gcloud auth application-default login`) |

## Agent frameworks

The framework manages the agentic loop — you configure tools and let it run.

| Framework | Node.js | Python | Auth |
|-----------|---------|--------|------|
| [Vercel AI SDK](./vercel-ai) | `index.ts` | — | `OPENAI_API_KEY` |
| [LangChain](./langchain) | `index.ts` | `index.py` | `OPENAI_API_KEY` |

## Full demo

| Example | Description | Docs |
|---------|-------------|------|
| [contract-review](./contract-review) | AI-powered contract review with agentic and headless patterns | [AI Agents](https://docs.superdoc.dev/getting-started/ai-agents) |

## Run

```bash
# Node.js
cd bedrock
npm install
npx tsx index.ts contract.docx reviewed.docx

# Python
cd bedrock
pip install superdoc-sdk boto3
python index.py contract.docx reviewed.docx
```

Each integration needs different dependencies — see the README in each directory.
