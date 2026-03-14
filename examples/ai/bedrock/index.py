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
import shutil
from pathlib import Path
import boto3
from superdoc import (
    SuperDocClient,
    choose_tools,
    dispatch_superdoc_tool,
)

MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-6")
REGION = os.environ.get("AWS_REGION", "us-east-1")


def to_bedrock_tools(tools):
    """Convert Anthropic-format tools to Bedrock toolSpec shape."""
    return [
        {
            "toolSpec": {
                "name": t["name"],
                "description": t["description"],
                "inputSchema": {"json": t.get("input_schema", t.get("parameters", {}))},
            }
        }
        for t in tools
    ]


def bedrock_tool_result(tool_use_id, result):
    """Wrap a tool result in Bedrock's expected format."""
    json_result = result if isinstance(result, dict) else {"result": result}
    return {"toolResult": {"toolUseId": tool_use_id, "content": [{"json": json_result}]}}


def bedrock_tool_error(tool_use_id, error):
    """Wrap a tool error in Bedrock's expected format."""
    return {
        "toolResult": {
            "toolUseId": tool_use_id,
            "content": [{"text": f"Error: {error}"}],
            "status": "error",
        }
    }


def main():
    args = sys.argv[1:]
    input_path = str(Path(args[0] if args else "contract.docx").resolve())
    output_path = str(Path(args[1] if len(args) > 1 else "reviewed.docx").resolve())

    # 1. Connect to SuperDoc — copy to output path so the original is preserved
    shutil.copy2(input_path, output_path)
    client = SuperDocClient()
    client.connect()
    client.doc.open({"doc": output_path})

    # 2. Get tools in Anthropic format and convert to Bedrock toolSpec shape
    sd_tools = choose_tools({"provider": "anthropic"})
    tool_config = {"tools": to_bedrock_tools(sd_tools["tools"])}

    # Track tool names to avoid duplicates when merging discover_tools results
    known_tools = {t["toolSpec"]["name"] for t in tool_config["tools"]}

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
                if name == "discover_tools":
                    # discover_tools is a meta-tool — handle client-side via choose_tools
                    groups = tool_use.get("input", {}).get("groups")
                    discovered = choose_tools({"provider": "anthropic", "groups": groups})
                    # Merge new tools into tool_config, skipping duplicates
                    for t in discovered.get("tools", []):
                        if t["name"] in known_tools:
                            continue
                        known_tools.add(t["name"])
                        tool_config["tools"].extend(to_bedrock_tools([t]))
                    result = discovered
                else:
                    result = dispatch_superdoc_tool(client, name, tool_use.get("input", {}))

                tool_results.append(bedrock_tool_result(tool_use["toolUseId"], result))
            except Exception as e:
                tool_results.append(bedrock_tool_error(tool_use["toolUseId"], e))

        messages.append({"role": "user", "content": tool_results})

    # 4. Save (in-place to the copy)
    client.doc.save()
    client.dispose()
    print(f"\nSaved to {output_path}")


if __name__ == "__main__":
    main()
