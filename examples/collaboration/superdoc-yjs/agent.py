"""
SuperDoc Document API Agent (Python)

Connects to the collaboration server using the Document API SDK.
Demonstrates how an AI agent can join a collaboration session and use LLM tools.

Usage: python agent.py [documentId]

Requirements:
    pip install superdoc-sdk openai>=1.0.0 python-dotenv
"""

from __future__ import annotations

import asyncio
import json
import signal
import sys
import time
import traceback
from typing import Any, Callable

from dotenv import load_dotenv

# Requires openai>=1.0.0 for AsyncOpenAI
try:
    from openai import AsyncOpenAI
except ImportError:
    print("[Agent] ERROR: openai>=1.0.0 is required. Please run:")
    print("    pip install 'openai>=1.0.0'")
    sys.exit(1)

from superdoc import (
    AsyncSuperDocClient,
    choose_tools,
    dispatch_superdoc_tool_async,
)

load_dotenv()


def log(message: str) -> None:
    """Log a message with timestamp."""
    timestamp = time.strftime("%H:%M:%S")
    print(f"[{timestamp}] [Agent] {message}")

COLLAB_URL = "ws://localhost:3050/collaboration"
DEFAULT_DOC_ID = "superdoc-demo"
DEBOUNCE_MS = 1000
POLL_INTERVAL_MS = 500

# Flag to prevent infinite loop - ignore updates while agent is writing
is_agent_writing = False

# Buffer to track last seen content - only prompt if there's new human content
last_seen_content = ""

# Tools to exclude from LLM tool set:
# - discover_tools: v3 meta-tool, not dispatchable via SDK
# - *_mutations: invalid "type": "json" in schemas, OpenAI rejects
# - *_setPageBorders, *_setValue, etc.: same schema issue
EXCLUDED_TOOLS = [
    "discover_tools",
    "apply_mutations",
    "preview_mutations",
    "doc_mutations_apply",
    "doc_mutations_preview",
    "doc_lists_setLevelRestart",
    "doc_lists_setValue",
    "doc_sections_setPageBorders",
    "set_list_level_restart",
    "set_list_value",
    "set_section_page_borders",
]


async def connect_to_superdoc() -> AsyncSuperDocClient:
    """Create and connect to the SuperDoc host process."""
    log("Creating SuperDoc client...")
    client = AsyncSuperDocClient()
    log("Connecting to SuperDoc host process...")
    await client.connect()
    log("Connected to SuperDoc host")
    return client


async def join_collaboration(client: AsyncSuperDocClient, document_id: str) -> None:
    """Join a collaboration room via SDK."""
    log(f"Joining collaboration room: {document_id}")
    log(f"  URL: {COLLAB_URL}")
    log(f"  Provider: y-websocket")
    await client.doc.open(
        {
            "collaboration": {
                # providerType must be specified when using collaboration object.
                "providerType": "y-websocket",
                "url": COLLAB_URL,
                "documentId": document_id,
            },
        }
    )
    log("Successfully joined collaboration!")


class DebouncedHandler:
    """Create a debounced handler with abort support."""

    def __init__(
        self,
        handler: Callable[[], Any],
        delay_ms: int,
    ):
        self.handler = handler
        self.delay_ms = delay_ms
        self.delay_seconds = delay_ms / 1000.0
        self._task: asyncio.Task[None] | None = None
        self._cancelled = False

    def trigger(self) -> None:
        """Trigger the debounced handler."""
        if self._task is not None:
            log(f"Debounce reset - waiting {self.delay_ms}ms for user to stop typing...")
        self.cancel()
        self._cancelled = False
        self._task = asyncio.create_task(self._run())

    def cancel(self) -> None:
        """Cancel any pending operation."""
        self._cancelled = True
        if self._task is not None:
            self._task.cancel()
            self._task = None

    async def _run(self) -> None:
        """Run the handler after the debounce delay."""
        try:
            await asyncio.sleep(self.delay_seconds)
            if not self._cancelled:
                log("Debounce complete - processing document...")
                await self.handler()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            log(f"Handler error: {e}")


async def read_and_continue_writing(
    client: AsyncSuperDocClient,
    openai_client: AsyncOpenAI,
    tools: list[dict[str, Any]],
) -> None:
    """Read document and continue writing with LLM."""
    global is_agent_writing, last_seen_content

    log("Reading document content...")

    try:
        document_text = await client.doc.get_text({})
        current_content = str(document_text) if document_text else ""

        log(f"Document length: {len(current_content)} chars")
        log("-" * 50)
        # Show first/last parts of document for context
        if len(current_content) > 200:
            log(f"Content preview: {current_content[:100]}...")
            log(f"...{current_content[-100:]}")
        else:
            log(f"Content: {current_content}")
        log("-" * 50)

        # Skip if document is empty or too short
        if len(current_content.strip()) < 10:
            log("Document too short (<10 chars), waiting for more content...")
            return

        # Skip if no new content since last check
        if current_content == last_seen_content:
            log("No new content since last check, skipping...")
            return

        # Check if there's actually new human content (not just whitespace changes)
        new_content = current_content[len(last_seen_content) :].strip()
        if len(new_content) == 0 and current_content.startswith(last_seen_content):
            log("Only whitespace changes detected, skipping...")
            return

        preview = new_content[:50] + ("..." if len(new_content) > 50 else "")
        log(f'New content detected ({len(new_content)} chars): "{preview}"')

        # Match TS prompt exactly
        system_prompt = """You are a creative writing assistant. Your job is to continue the user's writing in a natural, engaging way.

IMPORTANT: A document session is already open. Do NOT pass "doc" or "sessionId" parameters.

To append content, use insert_content with markdown formatting:
{ "value": "your content here", "type": "markdown" }

You can use markdown syntax in your value:
- # Heading 1, ## Heading 2, ### Heading 3
- **bold**, *italic*
- Regular paragraph text

Rules:
- Continue the story/text naturally from where it left off
- Match the tone and style of the existing writing
- Add 1-2 sentences OR a new section heading when appropriate
- Occasionally add a heading (# or ##) to start a new chapter or section
- Do NOT repeat what's already written
- Do NOT add meta-commentary, just continue the narrative"""

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"Here is the current document. Continue writing from where it ends:\n\n{document_text}",
            },
        ]

        log("Sending request to OpenAI (gpt-4o)...")
        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=messages,  # type: ignore[arg-type]
            tools=tools,  # type: ignore[arg-type]
            tool_choice="required",
        )
        log("Received response from OpenAI")

        message = response.choices[0].message

        if message.tool_calls:
            log(f"LLM requested {len(message.tool_calls)} tool call(s)")
            for i, call in enumerate(message.tool_calls):
                args = json.loads(call.function.arguments)
                log(f"Tool call {i + 1}: {call.function.name}")
                log(f"  Arguments: {json.dumps(args, indent=2)}")
                try:
                    # Set flag to ignore our own updates
                    is_agent_writing = True
                    log("Executing tool...")
                    result = await dispatch_superdoc_tool_async(client, call.function.name, args)
                    log(f"Tool executed successfully!")
                    if result:
                        log(f"  Result: {json.dumps(result)[:200]}...")

                    # Update buffer with new content (including what we just wrote)
                    updated_text = await client.doc.get_text({})
                    last_seen_content = str(updated_text) if updated_text else ""
                    log(f"Content buffer updated ({len(last_seen_content)} chars)")
                except Exception as e:
                    log(f"Tool error: {e}")
                finally:
                    # Small delay to let Yjs sync propagate, then re-enable listening
                    log("Waiting 500ms for sync propagation...")
                    await asyncio.sleep(0.5)
                    is_agent_writing = False
                    log("Ready for next update")
        else:
            log(f"LLM did not use a tool. Response: {message.content}")

    except Exception as e:
        log(f"Error in read_and_continue_writing: {e}")
        traceback.print_exc()


async def init_llm_tools() -> tuple[list[dict[str, Any]], AsyncOpenAI]:
    """Initialize LLM tools for document editing."""
    log("Initializing LLM tools...")

    # Needs documentation: v3 policy issues with choose_tools:
    # 1. Returns hardcoded "essential" tools + discover_tools meta-tool
    # 2. `phase` and `forceExclude` are ignored - v3 uses different selection model
    # 3. `forceInclude` adds tools but discover_tools is injected separately
    # 4. discover_tools is not dispatchable (SDK returns "Unknown SuperDoc tool")
    # 5. Manual post-filtering required to remove discover_tools from tool set
    result = choose_tools(
        {
            "provider": "openai",
            "taskContext": {"phase": "mutate"},
            "policy": {
                "allowMutatingTools": True,
                "forceExclude": EXCLUDED_TOOLS,
            },
        }
    )

    tools = result.get("tools", [])
    selected = result.get("selected", [])

    tool_names = [t.get("toolName", "") for t in selected]
    log(f"Available tools: {', '.join(tool_names)}")
    log(f"Loaded {len(tools)} tools for LLM")

    # Debug: show actual tool names being sent to OpenAI
    openai_tool_names = []
    for t in tools:
        fn = t.get("function", {})
        name = fn.get("name", "unknown")
        openai_tool_names.append(name)
    log(f"OpenAI tool names: {', '.join(openai_tool_names)}")

    openai_client = AsyncOpenAI()
    return tools, openai_client


async def run_agent_loop(
    client: AsyncSuperDocClient,
    openai_client: AsyncOpenAI,
    tools: list[dict[str, Any]],
    user_prompt: str,
) -> str | None:
    """Run the agentic loop - send messages to LLM and execute tool calls."""
    system_prompt = """You are a document editing assistant. You MUST use the provided tools to make changes to the document.

IMPORTANT: A document session is already open. Do NOT pass "doc" or "sessionId" parameters.

To insert text at the end of the document, use insert_content with just the value parameter:
{ "value": "your text here" }

That's it - no target needed for appending to the end."""

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    log("Starting agent loop...")
    log(f"User prompt: {user_prompt[:100]}...")

    iteration = 0
    is_first_call = True
    while True:
        iteration += 1
        log(f"Agent loop iteration {iteration}")
        log(f"  Sending to OpenAI (tool_choice={'required' if is_first_call else 'auto'})...")

        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=messages,  # type: ignore[arg-type]
            tools=tools,  # type: ignore[arg-type]
            tool_choice="required" if is_first_call else "auto",
        )
        is_first_call = False

        message = response.choices[0].message
        # Use raw response like TS does - model_dump() converts Pydantic to dict
        messages.append(message.model_dump())

        if not message.tool_calls:
            log(f"Agent loop complete - LLM response: {message.content}")
            return message.content

        log(f"  LLM requested {len(message.tool_calls)} tool call(s)")
        for call in message.tool_calls:
            args = json.loads(call.function.arguments)
            log(f"  Executing: {call.function.name}")
            log(f"    Args: {json.dumps(args)}")
            try:
                result = await dispatch_superdoc_tool_async(client, call.function.name, args)
                log(f"    Result: {json.dumps(result)[:100]}...")
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.id,
                        "content": json.dumps(result),
                    }
                )
            except Exception as e:
                log(f"    Tool error: {e}")
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.id,
                        "content": json.dumps({"error": str(e)}),
                    }
                )

        if len(messages) > 50:
            log("Too many iterations (>50 messages), stopping agent loop")
            break

    return None


async def poll_for_changes(
    client: AsyncSuperDocClient,
    debouncer: DebouncedHandler,
    shutdown_event: asyncio.Event,
) -> None:
    """Poll for document changes via SDK."""
    global last_seen_content, is_agent_writing

    poll_interval = POLL_INTERVAL_MS / 1000.0
    log(f"Starting document polling (interval: {POLL_INTERVAL_MS}ms)")

    # Track content separately for change detection vs. LLM prompting
    last_polled_content = ""

    # Initialize with current content
    try:
        initial_text = await client.doc.get_text({})
        last_polled_content = str(initial_text) if initial_text else ""
        last_seen_content = last_polled_content
        log(f"Initial document content: {len(last_polled_content)} chars")
    except Exception as e:
        log(f"Error getting initial content: {e}")

    poll_count = 0
    while not shutdown_event.is_set():
        try:
            await asyncio.sleep(poll_interval)
            poll_count += 1

            if is_agent_writing:
                continue

            current_text = await client.doc.get_text({})
            current_content = str(current_text) if current_text else ""

            if current_content != last_polled_content:
                change_size = len(current_content) - len(last_polled_content)
                log(f"Document changed! (delta: {change_size:+d} chars)")
                # Update polled content immediately to avoid repeat triggers
                last_polled_content = current_content
                log(f"Triggering debouncer...")
                debouncer.trigger()

        except asyncio.CancelledError:
            log("Polling cancelled")
            break
        except Exception as e:
            log(f"Poll error: {e}")
            await asyncio.sleep(1)  # Back off on error

    log(f"Polling stopped after {poll_count} polls")


async def main() -> None:
    """Main entry point."""
    global is_agent_writing

    document_id = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DOC_ID

    print()
    log("=" * 50)
    log("SuperDoc Document API Agent (Python)")
    log("=" * 50)
    log(f"Document ID: {document_id}")
    log(f"Collaboration URL: {COLLAB_URL}")
    log(f"Debounce delay: {DEBOUNCE_MS}ms")
    log(f"Poll interval: {POLL_INTERVAL_MS}ms")
    log("=" * 50)
    print()

    client = await connect_to_superdoc()
    shutdown_event = asyncio.Event()

    def signal_handler() -> None:
        log("Received shutdown signal")
        shutdown_event.set()

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, signal_handler)

    try:
        await join_collaboration(client, document_id)

        # Initialize LLM tools
        tools, openai_client = await init_llm_tools()

        # Set up debounced creative writer
        async def on_debounced_update() -> None:
            await read_and_continue_writing(client, openai_client, tools)

        debouncer = DebouncedHandler(on_debounced_update, DEBOUNCE_MS)

        # Start polling for changes
        print()
        log("=" * 50)
        log("Agent ready! Listening for document changes...")
        log("Press Ctrl+C to exit")
        log("=" * 50)
        print()

        poll_task = asyncio.create_task(poll_for_changes(client, debouncer, shutdown_event))

        # Wait for shutdown
        await shutdown_event.wait()

        print()
        log("Shutting down...")

        # Cleanup
        log("Cancelling poll task...")
        poll_task.cancel()
        try:
            await poll_task
        except asyncio.CancelledError:
            pass

        log("Cancelling debouncer...")
        debouncer.cancel()

        log("Closing document session...")
        await client.doc.close({})
        log("Document session closed")

    except Exception as e:
        log(f"Error: {e}")
        traceback.print_exc()
        sys.exit(1)
    finally:
        log("Disposing client...")
        await client.dispose()
        log("Disconnected")
        log("Goodbye!")


if __name__ == "__main__":
    asyncio.run(main())
