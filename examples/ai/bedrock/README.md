# SuperDoc + AWS Bedrock

Agentic document editing using the Bedrock Converse API.

**Docs:** [Integrations](https://docs.superdoc.dev/document-engine/ai-agents/integrations)

## Prerequisites

- AWS credentials configured (`aws configure` or environment variables)
- Bedrock model access enabled in the [AWS console](https://console.aws.amazon.com/bedrock/)

## Run

### Node.js

```bash
npm install
npx tsx index.ts contract.docx reviewed.docx
```

### Python

```bash
python -m venv venv && source venv/bin/activate
pip install superdoc-sdk boto3
python index.py contract.docx reviewed.docx
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `AWS_REGION` | `us-east-1` | AWS region with Bedrock access |
| `BEDROCK_MODEL_ID` | `us.anthropic.claude-sonnet-4-6` | Any Bedrock model that supports tool use |

## How it works

1. Connects to SuperDoc via the SDK
2. Loads tool definitions in Anthropic format — the same format Bedrock's Converse API expects
3. Converts to Bedrock's `toolSpec` shape (3-line mapping)
4. Runs an agentic loop: the model calls SuperDoc tools to read, query, and edit the document
5. Saves the reviewed document
