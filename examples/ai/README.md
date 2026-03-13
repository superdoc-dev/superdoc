# AI Integration Examples

Give LLMs structured access to document operations. Each example connects SuperDoc's Document Engine to a cloud AI platform or agent framework — open a doc, let the model review and edit it with tools, save the result.

**Docs:** [Integrations](https://docs.superdoc.dev/document-engine/ai-agents/integrations) · [LLM Tools](https://docs.superdoc.dev/document-engine/ai-agents/llm-tools)

## Cloud platforms

You write the agentic loop and control the conversation directly.

| Platform | Node.js | Python | Auth |
|----------|---------|--------|------|
| [AWS Bedrock](./bedrock) | `index.ts` | `index.py` | AWS credentials (`aws configure`) |

## Run

```bash
# Node.js
cd bedrock
npm install
npx tsx index.ts contract.docx reviewed.docx

# Python
cd bedrock
python -m venv venv && source venv/bin/activate
pip install superdoc-sdk boto3
python index.py contract.docx reviewed.docx
```

Each integration needs different dependencies — see the README in each directory.
