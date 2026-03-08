"""
SuperDoc + Google Vertex AI

Minimal agentic loop: Gemini on Vertex AI uses SuperDoc tools
to review and edit a Word document.

Usage: python index.py [input.docx] [output.docx]

Requires:
  - pip install superdoc-sdk google-cloud-aiplatform
  - Google Cloud credentials (gcloud auth application-default login)
"""

import sys
import os
from vertexai.generative_models import GenerativeModel, Tool, FunctionDeclaration, Part
import vertexai
from superdoc import SuperDocClient, choose_tools, dispatch_superdoc_tool

PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "your-project-id")
LOCATION = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
MODEL = os.environ.get("VERTEX_MODEL", "gemini-2.5-pro")


def sanitize_schema(obj):
    """Recursively strip JSON Schema keywords unsupported by Vertex AI (e.g. `const`)."""
    if isinstance(obj, list):
        return [sanitize_schema(item) for item in obj]
    if isinstance(obj, dict):
        return {k: sanitize_schema(v) for k, v in obj.items() if k != "const"}
    return obj


def to_vertex_tools(generic_tools):
    """Convert SuperDoc generic-format tools to Vertex AI function declarations."""
    declarations = [
        FunctionDeclaration(
            name=t["name"],
            description=t["description"],
            parameters=sanitize_schema(t["parameters"]),
        )
        for t in generic_tools
    ]
    return [Tool(function_declarations=declarations)]


def main():
    args = sys.argv[1:]
    input_path = args[0] if args else "contract.docx"
    output_path = args[1] if len(args) > 1 else "reviewed.docx"

    # 1. Connect to SuperDoc
    client = SuperDocClient()
    client.connect()
    client.doc.open(doc=input_path)

    # 2. Get tools in generic format and convert to Vertex shape
    result = choose_tools(provider="generic")
    vertex_tools = to_vertex_tools(result["tools"])

    # 3. Set up Vertex AI
    vertexai.init(project=PROJECT, location=LOCATION)
    model = GenerativeModel(
        MODEL,
        tools=vertex_tools,
        system_instruction="You edit .docx files using SuperDoc tools. Use tracked changes for all edits.",
    )
    chat = model.start_chat()

    # 4. Agentic loop
    response = chat.send_message("Review this contract. Fix vague language and one-sided terms.")

    for _ in range(20):
        function_calls = [
            part for part in response.candidates[0].content.parts if part.function_call.name
        ]

        if not function_calls:
            # Print final response
            for part in response.candidates[0].content.parts:
                if part.text:
                    print(part.text)
            break

        function_responses = []
        for part in function_calls:
            name = part.function_call.name
            args = dict(part.function_call.args) if part.function_call.args else {}
            print(f"  Tool: {name}")

            try:
                result = dispatch_superdoc_tool(client, name, args)

                # discover_tools returns new tools — merge them
                if name == "discover_tools" and "tools" in result:
                    for t in result["tools"]:
                        vertex_tools[0].function_declarations.append(
                            FunctionDeclaration(
                                name=t["name"],
                                description=t["description"],
                                parameters=sanitize_schema(t["parameters"]),
                            )
                        )

                function_responses.append(
                    Part.from_function_response(name=name, response=result)
                )
            except Exception as e:
                function_responses.append(
                    Part.from_function_response(name=name, response={"error": str(e)})
                )

        response = chat.send_message(function_responses)

    # 5. Save
    client.doc.save(doc=output_path)
    client.dispose()
    print(f"\nSaved to {output_path}")


if __name__ == "__main__":
    main()
