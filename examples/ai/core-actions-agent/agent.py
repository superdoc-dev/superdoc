"""Core-preset agent (Python twin of agent.mjs).

    python agent.py <input.docx> "<instruction>" [--tracked] [--out <output.docx>]

Demonstrates the `core` LLM-tools preset from the Python SDK via
create_agent_toolkit — one call returning tools, the evaluated system prompt,
and a dispatcher pre-bound to the preset (receipts with verification).

Requires: pip install superdoc-sdk openai  (import name is `superdoc`).
"""

from __future__ import annotations

import json
import os
import sys

from openai import OpenAI
from superdoc import SuperDocClient, create_agent_toolkit

MODEL = os.environ.get("OPENAI_MODEL", "gpt-5.4")
MAX_TURNS = 16


def parse_args(argv: list[str]) -> tuple[str, str, bool, str]:
    tracked = "--tracked" in argv
    out_path = "out.docx"
    if "--out" in argv:
        out_path = argv[argv.index("--out") + 1]
    positional = [
        a for i, a in enumerate(argv)
        if not a.startswith("--") and (i == 0 or argv[i - 1] != "--out")
    ]
    if len(positional) < 2:
        print('Usage: python agent.py <input.docx> "<instruction>" [--tracked] [--out <output.docx>]')
        sys.exit(1)
    return positional[0], positional[1], tracked, out_path


def main() -> None:
    input_path, instruction, tracked, out_path = parse_args(sys.argv[1:])

    # One call — tools, system prompt, and a pre-bound dispatcher that are
    # guaranteed to agree on preset (and excludeActions, if you narrow).
    kit = create_agent_toolkit({"provider": "openai", "preset": "core"})
    tools, system_prompt, dispatch = kit["tools"], kit["system_prompt"], kit["dispatch"]

    if tracked:
        instruction += (
            '\n\nMake every edit as a tracked change (changeMode: "tracked") '
            "so a reviewer can accept or reject it."
        )

    llm = OpenAI()

    with SuperDocClient() as client:
        doc = client.open({"doc": input_path})
        # Everything after open() runs inside try/finally so an API error or a
        # malformed tool call never leaks the session (mirrors agent.mjs).
        try:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": instruction},
            ]

            for _turn in range(MAX_TURNS):
                response = llm.chat.completions.create(model=MODEL, messages=messages, tools=tools)
                message = response.choices[0].message
                messages.append(message)

                if not message.tool_calls:
                    print(f"\n{message.content or '(no final message)'}")
                    break

                for call in message.tool_calls:
                    try:
                        # Malformed tool-call arguments become an error receipt
                        # the model can read and correct, instead of a crash.
                        call_args = json.loads(call.function.arguments)
                        print(f"  -> {call_args.get('action', call.function.name)} ... ", end="", flush=True)
                        receipt = dispatch(doc, call.function.name, call_args)
                        status = receipt.get("status", "ok") if isinstance(receipt, dict) else "ok"
                        verified = receipt.get("verificationPassed") if isinstance(receipt, dict) else None
                        print(status + (" (verification failed)" if verified is False else ""))
                    except Exception as error:
                        # SuperDocError carries a structured .code — keep the
                        # receipt shape identical to agent.mjs.
                        receipt = {
                            "status": "failed",
                            "error": {"code": getattr(error, "code", None), "message": str(error)},
                        }
                        print(f"error: {getattr(error, 'code', None) or error}")

                    messages.append({
                        "role": "tool",
                        "tool_call_id": call.id,
                        # Receipts can contain non-JSON-serializable values.
                        "content": json.dumps(receipt, default=str),
                    })

            doc.save({"out": out_path, "force": True})
            print(f"\nSaved: {out_path}")
        finally:
            doc.close({"discard": True})


if __name__ == "__main__":
    main()
