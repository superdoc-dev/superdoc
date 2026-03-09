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
    format_tool_result,
    format_tool_error,
    merge_discovered_tools,
)

MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "amazon.nova-pro-v1:0")
REGION = os.environ.get("AWS_REGION", "us-east-1")


def main():
    args = sys.argv[1:]
    input_path = str(Path(args[0] if args else "contract.docx").resolve())
    output_path = str(Path(args[1] if len(args) > 1 else "reviewed.docx").resolve())

    # 1. Connect to SuperDoc — copy to output path so the original is preserved
    shutil.copy2(input_path, output_path)
    client = SuperDocClient()
    client.connect()
    client.doc.open(doc=output_path)

    # 2. Get tools in Anthropic format and convert to Bedrock toolSpec shape
    sd_tools = choose_tools(provider="anthropic")
    tool_config = {"tools": []}
    merge_discovered_tools(tool_config, sd_tools, provider="anthropic", target="bedrock")

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
                    discovered = choose_tools(provider="anthropic", groups=groups)
                    merge_discovered_tools(tool_config, discovered, provider="anthropic", target="bedrock")
                    result = discovered
                else:
                    result = dispatch_superdoc_tool(client, name, tool_use.get("input", {}))

                tool_results.append(
                    format_tool_result(result, target="bedrock", tool_use_id=tool_use["toolUseId"])
                )
            except Exception as e:
                tool_results.append(
                    format_tool_error(e, target="bedrock", tool_use_id=tool_use["toolUseId"])
                )

        messages.append({"role": "user", "content": tool_results})

    # 4. Save (in-place to the copy)
    client.doc.save()
    client.dispose()
    print(f"\nSaved to {output_path}")


if __name__ == "__main__":
    main()
