"""
SuperDoc + AWS Bedrock

Minimal agentic loop: Claude on Bedrock uses SuperDoc tools
to review and edit a Word document.

Usage: python index.py [input.docx] [output.docx]

Requires:
  - pip install superdoc-sdk boto3
  - AWS credentials configured (aws configure, env vars, or IAM role)
"""

import sys
import os
import json
import boto3
from superdoc import SuperDocClient, choose_tools, dispatch_superdoc_tool

MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "amazon.nova-pro-v1:0")
REGION = os.environ.get("AWS_REGION", "us-east-1")


def to_bedrock_tools(anthropic_tools):
    """Convert SuperDoc Anthropic-format tools to Bedrock toolSpec shape."""
    return [
        {
            "toolSpec": {
                "name": t["name"],
                "description": t["description"],
                "inputSchema": {"json": t["input_schema"]},
            }
        }
        for t in anthropic_tools
    ]


def main():
    args = sys.argv[1:]
    input_path = args[0] if args else "contract.docx"
    output_path = args[1] if len(args) > 1 else "reviewed.docx"

    # 1. Connect to SuperDoc
    client = SuperDocClient()
    client.connect()
    client.doc.open(doc=input_path)

    # 2. Get tools in Anthropic format (Bedrock-compatible)
    result = choose_tools(provider="anthropic")
    tool_config = {"tools": to_bedrock_tools(result["tools"])}

    # 3. Agentic loop
    bedrock = boto3.client("bedrock-runtime", region_name=REGION)
    messages = [
        {"role": "user", "content": [{"text": "Review this contract. Fix vague language and one-sided terms."}]}
    ]

    for _ in range(20):
        response = bedrock.converse(
            modelId=MODEL_ID,
            messages=messages,
            system=[{"text": "You edit .docx files using SuperDoc tools. Use tracked changes for all edits."}],
            toolConfig=tool_config,
        )

        output = response["output"]["message"]
        messages.append(output)

        tool_uses = [b for b in output.get("content", []) if "toolUse" in b]
        if not tool_uses:
            # Print final response
            for b in output.get("content", []):
                if "text" in b:
                    print(b["text"])
            break

        tool_results = []
        for block in tool_uses:
            tool_use = block["toolUse"]
            name = tool_use["name"]
            print(f"  Tool: {name}")

            try:
                result = dispatch_superdoc_tool(client, name, tool_use.get("input", {}))

                # discover_tools returns new tools — merge them
                if name == "discover_tools" and "tools" in result:
                    tool_config["tools"].extend(to_bedrock_tools(result["tools"]))

                # Bedrock requires json content to be a plain dict
                json_result = result if isinstance(result, dict) else {"result": result}
                tool_results.append(
                    {"toolResult": {"toolUseId": tool_use["toolUseId"], "content": [{"json": json_result}]}}
                )
            except Exception as e:
                tool_results.append(
                    {"toolResult": {"toolUseId": tool_use["toolUseId"], "content": [{"text": f"Error: {e}"}], "status": "error"}}
                )

        messages.append({"role": "user", "content": tool_results})

    # 4. Save
    client.doc.save(doc=output_path)
    client.dispose()
    print(f"\nSaved to {output_path}")


if __name__ == "__main__":
    main()
