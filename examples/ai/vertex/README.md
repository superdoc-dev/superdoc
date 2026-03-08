# SuperDoc + Google Vertex AI

Agentic document editing using Gemini on Vertex AI.

**Docs:** [Integrations](https://docs.superdoc.dev/document-engine/ai-agents/integrations)

## Prerequisites

- Google Cloud credentials (`gcloud auth application-default login` or a service account key)
- A Google Cloud project with Vertex AI API enabled

## Run

### Node.js

```bash
npm install
GOOGLE_CLOUD_PROJECT=your-project npx tsx index.ts contract.docx reviewed.docx
```

### Python

```bash
pip install superdoc-sdk google-cloud-aiplatform
GOOGLE_CLOUD_PROJECT=your-project python index.py contract.docx reviewed.docx
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_CLOUD_PROJECT` | `your-project-id` | Google Cloud project ID |
| `GOOGLE_CLOUD_LOCATION` | `us-central1` | Vertex AI region |
| `VERTEX_MODEL` | `gemini-2.5-pro` | Any Gemini model that supports function calling |

## How it works

1. Connects to SuperDoc via the SDK
2. Loads tool definitions in generic format and converts to Vertex `functionDeclarations`
3. Starts a chat with Gemini
4. Runs an agentic loop: the model calls SuperDoc tools to read, query, and edit the document
5. Saves the reviewed document
