from __future__ import annotations

import logging
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

from fastapi import FastAPI, Query
from fastapi.responses import FileResponse
from superdoc import SuperDocClient

REPO_ROOT = Path(__file__).resolve().parents[3]
EXAMPLE_ROOT = Path(__file__).resolve().parent

# Hardcoded demo config.
DOC_PATH = EXAMPLE_ROOT / "assets" / "doc-template.docx"
MARKDOWN_PATH = EXAMPLE_ROOT / "assets" / "fake-nda.md"
DOWNLOAD_PATH = EXAMPLE_ROOT / ".superdoc-state" / "download.docx"

COLLAB_PROVIDER = "y-websocket"
COLLAB_URL = "ws://127.0.0.1:8081/v1/collaboration"
COLLAB_DOCUMENT_ID = "superdoc-dev-room"
COLLAB_SYNC_TIMEOUT_MS = 60_000

# Hardcode local CLI + state to keep behavior deterministic for this repo example.
# Using .ts means the SDK will execute via bun.
CLI_BIN = REPO_ROOT / "apps" / "cli" / "src" / "index.ts"
CLI_STATE_DIR = EXAMPLE_ROOT / ".superdoc-state"
CLIENT_ENV = {
    "SUPERDOC_CLI_BIN": str(CLI_BIN),
    "SUPERDOC_CLI_STATE_DIR": str(CLI_STATE_DIR),
}

# Keep open timeout above sync timeout, and watchdog above open timeout.
OPEN_TIMEOUT_MS = 90_000
WATCHDOG_TIMEOUT_MS = 120_000

app = FastAPI(title="SuperDoc FastAPI Collaboration Demo")
logger = logging.getLogger("uvicorn.error")

try:
    SUPERDOC_SDK_VERSION = version("superdoc-sdk")
except PackageNotFoundError:
    SUPERDOC_SDK_VERSION = "not installed"


@app.on_event("startup")
def on_startup() -> None:
    logger.info("superdoc-sdk version: %s", SUPERDOC_SDK_VERSION)

    client = SuperDocClient(
        env=CLIENT_ENV,
        watchdog_timeout_ms=WATCHDOG_TIMEOUT_MS,
    )

    open_result = client.doc.open(
        {
            "doc": str(DOC_PATH),
            "collaboration": {
                "providerType": COLLAB_PROVIDER,
                "url": COLLAB_URL,
                "documentId": COLLAB_DOCUMENT_ID,
                "syncTimeoutMs": COLLAB_SYNC_TIMEOUT_MS,
            },
        },
        timeout_ms=OPEN_TIMEOUT_MS,
    )
    markdown_content = MARKDOWN_PATH.read_text(encoding="utf-8")
    client.doc.insert({"value": markdown_content, "type": "markdown"})

    app.state.client = client
    app.state.open_result = open_result


@app.on_event("shutdown")
def on_shutdown() -> None:
    client = app.state.client
    client.doc.close({})
    client.dispose()


@app.get("/")
def root() -> dict:
    return {
        "ok": True,
        "openResult": app.state.open_result,
        "collab": {
            "providerType": COLLAB_PROVIDER,
            "url": COLLAB_URL,
            "documentId": COLLAB_DOCUMENT_ID,
        },
    }


@app.get("/status")
def status() -> dict:
    return app.state.client.doc.status({})


@app.get("/insert")
def insert(text: str = Query(...)) -> dict:
    return app.state.client.doc.insert({"value": text})


@app.get("/download")
def download() -> FileResponse:
    DOWNLOAD_PATH.parent.mkdir(parents=True, exist_ok=True)
    app.state.client.doc.save({"out": str(DOWNLOAD_PATH), "force": True})
    return FileResponse(
        path=str(DOWNLOAD_PATH),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=DOWNLOAD_PATH.name,
    )
