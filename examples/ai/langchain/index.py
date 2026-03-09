"""
SuperDoc + LangChain

Minimal agentic loop: any LangChain-compatible model uses SuperDoc tools
to review and edit a Word document.

Usage: OPENAI_API_KEY=sk-... python index.py [input.docx] [output.docx]

Requires:
  - pip install superdoc-sdk langchain-openai langgraph
  - OPENAI_API_KEY (or swap ChatOpenAI for ChatAnthropic, ChatGoogleGenerativeAI, etc.)
"""

import sys
import json
import shutil
from pathlib import Path
from langchain_openai import ChatOpenAI
from langchain_core.tools import StructuredTool
from langgraph.prebuilt import create_react_agent
from langchain_core.messages import HumanMessage
from superdoc import SuperDocClient, choose_tools, dispatch_superdoc_tool


def make_superdoc_tool(client, tool_def):
    """Wrap a SuperDoc tool definition as a LangChain StructuredTool."""

    def invoke(**kwargs) -> str:
        print(f"  Tool: {tool_def['name']}")
        result = dispatch_superdoc_tool(client, tool_def["name"], kwargs)
        return json.dumps(result)

    return StructuredTool.from_function(
        func=invoke,
        name=tool_def["name"],
        description=tool_def["description"],
        infer_schema=False,
    )


def main():
    args = sys.argv[1:]
    input_path = str(Path(args[0] if args else "contract.docx").resolve())
    output_path = str(Path(args[1] if len(args) > 1 else "reviewed.docx").resolve())

    # 1. Connect to SuperDoc — copy to output path so the original is preserved
    shutil.copy2(input_path, output_path)
    client = SuperDocClient()
    client.connect()
    client.doc.open(doc=output_path)

    # 2. Get tools in generic format and wrap as LangChain tools
    # Use mode="all" — no discover_tools since the framework manages a fixed tool set
    result = choose_tools(provider="generic", mode="all")
    tools = [make_superdoc_tool(client, t) for t in result["tools"]]

    # 3. Create a ReAct agent
    model = ChatOpenAI(model="gpt-4o")
    agent = create_react_agent(
        model=model,
        tools=tools,
        prompt="You edit .docx files using SuperDoc tools. Use tracked changes for all edits.",
    )

    # 4. Run the agent
    result = agent.invoke(
        {"messages": [HumanMessage(content="Review this contract. Fix vague language and one-sided terms.")]}
    )

    last_message = result["messages"][-1]
    print(last_message.content)

    # 5. Save (in-place to the copy)
    client.doc.save()
    client.dispose()
    print(f"\nSaved to {output_path}")


if __name__ == "__main__":
    main()
