from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

from fastapi import FastAPI, Query
from fastapi.responses import FileResponse
from superdoc import AsyncSuperDocClient

EXAMPLE_ROOT = Path(__file__).resolve().parent

# Hardcoded demo config.
DOC_PATH = EXAMPLE_ROOT / "assets" / "doc-template.docx"
MARKDOWN_PATH = EXAMPLE_ROOT / "assets" / "fake-nda.md"
DOWNLOAD_PATH = EXAMPLE_ROOT / ".superdoc-state" / "download.docx"

COLLAB_PROVIDER = "y-websocket"
COLLAB_URL = "ws://127.0.0.1:8081/v1/collaboration"
COLLAB_DOCUMENT_ID = "superdoc-dev-room"
COLLAB_TOKEN_ENV = "YHUB_AUTH_TOKEN"
COLLAB_TOKEN_DEFAULT = "YOUR_PRIVATE_TOKEN"
COLLAB_SYNC_TIMEOUT_MS = 60_000

# Keep open timeout above sync timeout, and watchdog above open timeout.
OPEN_TIMEOUT_MS = 90_000
WATCHDOG_TIMEOUT_MS = 120_000

logger = logging.getLogger("uvicorn.error")

try:
    SUPERDOC_SDK_VERSION = version("superdoc-sdk")
except PackageNotFoundError:
    SUPERDOC_SDK_VERSION = "not installed"


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("superdoc-sdk version: %s", SUPERDOC_SDK_VERSION)
    os.environ.setdefault(COLLAB_TOKEN_ENV, COLLAB_TOKEN_DEFAULT)
    logger.info("collaboration token env: %s", COLLAB_TOKEN_ENV)

    async with AsyncSuperDocClient(watchdog_timeout_ms=WATCHDOG_TIMEOUT_MS) as client:
        open_result = await client.doc.open(
            {
                "doc": str(DOC_PATH),
                "collaboration": {
                    "providerType": COLLAB_PROVIDER,
                    "url": COLLAB_URL,
                    "documentId": COLLAB_DOCUMENT_ID,
                    "tokenEnv": COLLAB_TOKEN_ENV,
                    "syncTimeoutMs": COLLAB_SYNC_TIMEOUT_MS,
                },
            },
            timeout_ms=OPEN_TIMEOUT_MS,
        )
        markdown_content = MARKDOWN_PATH.read_text(encoding="utf-8")
        await client.doc.insert({"value": markdown_content, "type": "markdown"})

        app.state.client = client
        app.state.open_result = open_result
        try:
            yield
        finally:
            await client.doc.close({})

app = FastAPI(title="SuperDoc FastAPI Collaboration Demo", lifespan=lifespan)

@app.get("/")
def root() -> dict:
    return {
        "ok": True,
        "openResult": app.state.open_result,
        "collab": {
            "providerType": COLLAB_PROVIDER,
            "url": COLLAB_URL,
            "documentId": COLLAB_DOCUMENT_ID,
            "tokenEnv": COLLAB_TOKEN_ENV,
        },
    }


@app.get("/status")
async def status() -> dict:
    return await app.state.client.doc.status({})


@app.get("/insert")
async def insert(text: str = Query(...)) -> dict:
    return await app.state.client.doc.insert({"value": text})


@app.get("/download")
async def download() -> FileResponse:
    DOWNLOAD_PATH.parent.mkdir(parents=True, exist_ok=True)
    await app.state.client.doc.save({"out": str(DOWNLOAD_PATH), "force": True})
    return FileResponse(
        path=str(DOWNLOAD_PATH),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=DOWNLOAD_PATH.name,
    )
