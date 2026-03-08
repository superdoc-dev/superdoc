# SuperDoc + LangChain

Agentic document editing using a LangGraph ReAct agent.

**Docs:** [Integrations](https://docs.superdoc.dev/document-engine/ai-agents/integrations)

## Prerequisites

- `OPENAI_API_KEY` environment variable (or swap the model)

## Run

### Node.js

```bash
npm install
OPENAI_API_KEY=sk-... npx tsx index.ts contract.docx reviewed.docx
```

### Python

```bash
pip install superdoc-sdk langchain-openai langgraph
OPENAI_API_KEY=sk-... python index.py contract.docx reviewed.docx
```

## Configuration

The example uses OpenAI by default. Swap the model class to use any LangChain-compatible provider:

```python
# OpenAI (default)
from langchain_openai import ChatOpenAI
model = ChatOpenAI(model="gpt-4o")

# Anthropic
from langchain_anthropic import ChatAnthropic
model = ChatAnthropic(model="claude-sonnet-4-6-20250514")

# Google
from langchain_google_genai import ChatGoogleGenerativeAI
model = ChatGoogleGenerativeAI(model="gemini-2.5-pro")
```

## How it works

1. Connects to SuperDoc via the SDK
2. Loads tool definitions in generic format and wraps them as LangChain `StructuredTool` / `DynamicStructuredTool` objects
3. Creates a ReAct agent with `create_react_agent`
4. The agent calls SuperDoc tools to read, query, and edit the document
5. Saves the reviewed document
