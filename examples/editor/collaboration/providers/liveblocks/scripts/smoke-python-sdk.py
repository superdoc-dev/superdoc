#!/usr/bin/env python3
"""Manual Liveblocks smoke test for the local Python SDK.

This script verifies the repo-local Python SDK and repo-local CLI build against
an existing Liveblocks room:

1. Open two SDK clients against the same room.
2. Insert one unique line from each client.
3. Verify each client can read the other client's line from plain document text.
4. Save the final document to a local `.docx` for inspection.

The script is intentionally small and manual. It is meant to be easy to read,
easy to run, and easy to modify when collaboration behavior changes.
"""

from __future__ import annotations

import asyncio
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
EXAMPLE_ROOT = Path(__file__).resolve().parents[1]
SDK_ROOT = REPO_ROOT / "packages" / "sdk" / "langs" / "python"

if str(SDK_ROOT) not in sys.path:
    sys.path.insert(0, str(SDK_ROOT))

from superdoc import AsyncSuperDocClient  # noqa: E402


DEFAULT_OUTPUT_PATH = EXAMPLE_ROOT / ".superdoc-state" / "python-sdk-liveblocks-smoke.docx"
DEFAULT_SYNC_TIMEOUT_MS = 20_000
DEFAULT_FIND_TIMEOUT_SECONDS = 15.0
DEFAULT_FIND_POLL_SECONDS = 0.5


@dataclass(frozen=True)
class SmokeConfig:
    public_api_key: str
    room_id: str
    cli_bin: Path
    output_path: Path
    sync_timeout_ms: int = DEFAULT_SYNC_TIMEOUT_MS
    find_timeout_seconds: float = DEFAULT_FIND_TIMEOUT_SECONDS
    find_poll_seconds: float = DEFAULT_FIND_POLL_SECONDS


def load_env_file(env_path: Path) -> None:
    """Load simple KEY=VALUE pairs from `.env` without extra dependencies."""

    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")

        if key and key not in os.environ:
            os.environ[key] = value


def require_env(name: str, help_text: str) -> str:
    value = os.environ.get(name, "").strip()
    if value:
        return value
    raise RuntimeError(help_text)


def build_config() -> SmokeConfig:
    load_env_file(EXAMPLE_ROOT / ".env")

    public_api_key = require_env(
        "VITE_LIVEBLOCKS_PUBLIC_KEY",
        "Missing VITE_LIVEBLOCKS_PUBLIC_KEY. Create examples/collaboration/liveblocks/.env first.",
    )
    room_id = require_env(
        "VITE_ROOM_ID",
        "Missing VITE_ROOM_ID. Create examples/collaboration/liveblocks/.env first.",
    )

    cli_bin = Path(os.environ.get("SUPERDOC_CLI_BIN", REPO_ROOT / "apps" / "cli" / "dist" / "superdoc")).resolve()
    if not cli_bin.exists():
        raise RuntimeError(
            "Missing local CLI binary. Run `pnpm --prefix apps/cli run build:native` first, "
            f"or set SUPERDOC_CLI_BIN explicitly. Expected: {cli_bin}"
        )

    output_path = Path(os.environ.get("SMOKE_OUTPUT_DOCX", DEFAULT_OUTPUT_PATH)).resolve()

    return SmokeConfig(
        public_api_key=public_api_key,
        room_id=room_id,
        cli_bin=cli_bin,
        output_path=output_path,
    )


def collaboration_params(config: SmokeConfig) -> dict[str, object]:
    return {
        "providerType": "liveblocks",
        "roomId": config.room_id,
        "publicApiKey": config.public_api_key,
        "syncTimeoutMs": config.sync_timeout_ms,
        "onMissing": "error",
    }


def client_env(config: SmokeConfig) -> dict[str, str]:
    return {"SUPERDOC_CLI_BIN": str(config.cli_bin)}


def marker_line(client_label: str, run_id: str) -> str:
    return f"{client_label} smoke marker {run_id}"


async def open_document(client: AsyncSuperDocClient, config: SmokeConfig):
    return await client.open({"collaboration": collaboration_params(config)})


async def insert_line(doc, line: str) -> None:
    await doc.insert({"value": f"{line}\n", "type": "markdown"})


async def wait_for_text(doc, pattern: str, client_label: str, config: SmokeConfig) -> None:
    deadline = time.monotonic() + config.find_timeout_seconds

    while time.monotonic() < deadline:
        text = await doc.get_text({})
        if pattern in text:
            return

        await asyncio.sleep(config.find_poll_seconds)

    raise RuntimeError(
        f'{client_label} did not observe expected text "{pattern}" within '
        f"{config.find_timeout_seconds:.1f} seconds."
    )


async def save_output(doc, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    await doc.save({"out": str(output_path), "force": True})


async def close_document_if_open(doc) -> None:
    if doc is None:
        return

    # This smoke writes one output artifact, then disposes both temporary
    # document handles. Discard on close avoids cleanup failures when a second
    # collaborative handle still considers the session dirty after synced edits.
    await doc.close({"discard": True})


async def run_smoke(config: SmokeConfig) -> Path:
    run_id = str(int(time.time()))
    writer_marker = marker_line("Writer", run_id=run_id)
    reader_marker = marker_line("Reader", run_id=run_id)

    async with (
        AsyncSuperDocClient(env=client_env(config), user={"name": "Writer Bot", "email": "writer-bot@superdoc.dev"}) as writer_client,
        AsyncSuperDocClient(env=client_env(config), user={"name": "Reader Bot", "email": "reader-bot@superdoc.dev"}) as reader_client,
    ):
        writer_doc = None
        reader_doc = None

        try:
            writer_doc = await open_document(writer_client, config)
            reader_doc = await open_document(reader_client, config)

            await insert_line(writer_doc, writer_marker)
            await insert_line(reader_doc, reader_marker)

            await wait_for_text(writer_doc, reader_marker, "Writer client", config)
            await wait_for_text(reader_doc, writer_marker, "Reader client", config)

            await save_output(writer_doc, config.output_path)
            return config.output_path
        finally:
            await close_document_if_open(reader_doc)
            await close_document_if_open(writer_doc)


async def main() -> None:
    config = build_config()

    print(f"[smoke] Room: {config.room_id}")
    print(f"[smoke] CLI: {config.cli_bin}")
    print(f"[smoke] Output: {config.output_path}")

    output_path = await run_smoke(config)

    print(f"[smoke] Saved DOCX: {output_path}")
    print("[smoke] OK: both clients inserted text and observed each other's changes.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("[smoke] Interrupted")
        raise SystemExit(130)
    except Exception as error:
        print(f"[smoke] Failed: {error}")
        raise SystemExit(1)
