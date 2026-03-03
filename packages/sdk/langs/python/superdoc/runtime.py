"""SuperDoc runtime — thin layer over host transport.

Resolves the CLI binary, holds a transport instance, and delegates invoke().
All protocol, process lifecycle, and I/O logic lives in transport.py and
protocol.py. The default_change_mode is passed to the transport, which applies
it during argv construction.
"""

from __future__ import annotations

import os
from typing import Any, Dict, Optional

from .embedded_cli import resolve_embedded_cli_path
from .generated.contract import OPERATION_INDEX
from .protocol import normalize_default_change_mode
from .transport import AsyncHostTransport, SyncHostTransport


class SuperDocSyncRuntime:
    """Synchronous runtime backed by a persistent host transport."""

    def __init__(
        self,
        *,
        env: Optional[Dict[str, str]] = None,
        startup_timeout_ms: int = 5_000,
        shutdown_timeout_ms: int = 5_000,
        request_timeout_ms: Optional[int] = None,
        watchdog_timeout_ms: int = 30_000,
        default_change_mode: Optional[str] = None,
        user: Optional[Dict[str, str]] = None,
    ) -> None:
        self._env = dict(env or {})
        cli_bin = self._env.get('SUPERDOC_CLI_BIN') or os.environ.get('SUPERDOC_CLI_BIN') or resolve_embedded_cli_path()
        self._default_change_mode = normalize_default_change_mode(default_change_mode)
        self._transport = SyncHostTransport(
            cli_bin,
            env=self._env,
            startup_timeout_ms=startup_timeout_ms,
            shutdown_timeout_ms=shutdown_timeout_ms,
            request_timeout_ms=request_timeout_ms,
            watchdog_timeout_ms=watchdog_timeout_ms,
            default_change_mode=self._default_change_mode,
            user=user,
        )

    def connect(self) -> None:
        self._transport.connect()

    def dispose(self) -> None:
        self._transport.dispose()

    def invoke(
        self,
        operation_id: str,
        params: Optional[Dict[str, Any]] = None,
        *,
        timeout_ms: Optional[int] = None,
        stdin_bytes: Optional[bytes] = None,
    ) -> Dict[str, Any]:
        operation = OPERATION_INDEX[operation_id]
        return self._transport.invoke(
            operation, params or {},
            timeout_ms=timeout_ms,
            stdin_bytes=stdin_bytes,
        )


class SuperDocAsyncRuntime:
    """Asynchronous runtime backed by a persistent host transport."""

    def __init__(
        self,
        *,
        env: Optional[Dict[str, str]] = None,
        startup_timeout_ms: int = 5_000,
        shutdown_timeout_ms: int = 5_000,
        request_timeout_ms: Optional[int] = None,
        watchdog_timeout_ms: int = 30_000,
        max_queue_depth: int = 100,
        default_change_mode: Optional[str] = None,
        user: Optional[Dict[str, str]] = None,
    ) -> None:
        self._env = dict(env or {})
        cli_bin = self._env.get('SUPERDOC_CLI_BIN') or os.environ.get('SUPERDOC_CLI_BIN') or resolve_embedded_cli_path()
        self._default_change_mode = normalize_default_change_mode(default_change_mode)
        self._transport = AsyncHostTransport(
            cli_bin,
            env=self._env,
            startup_timeout_ms=startup_timeout_ms,
            shutdown_timeout_ms=shutdown_timeout_ms,
            request_timeout_ms=request_timeout_ms,
            watchdog_timeout_ms=watchdog_timeout_ms,
            max_queue_depth=max_queue_depth,
            default_change_mode=self._default_change_mode,
            user=user,
        )

    async def connect(self) -> None:
        await self._transport.connect()

    async def dispose(self) -> None:
        await self._transport.dispose()

    async def invoke(
        self,
        operation_id: str,
        params: Optional[Dict[str, Any]] = None,
        *,
        timeout_ms: Optional[int] = None,
        stdin_bytes: Optional[bytes] = None,
    ) -> Dict[str, Any]:
        operation = OPERATION_INDEX[operation_id]
        return await self._transport.invoke(
            operation, params or {},
            timeout_ms=timeout_ms,
            stdin_bytes=stdin_bytes,
        )
