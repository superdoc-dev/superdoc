"""Hand-written SuperDoc client classes with lifecycle and context-manager support.

These classes compose the generated operation tree (_SyncDocApi / _AsyncDocApi)
with explicit connect/dispose lifecycle semantics. The generated code in
generated/client.py contains only TypedDicts and operation methods.
"""

from __future__ import annotations

from typing import Dict, Literal, Optional

from .generated.client import _AsyncDocApi, _SyncDocApi
from .runtime import SuperDocAsyncRuntime, SuperDocSyncRuntime

UserIdentity = Dict[str, str]


class SuperDocClient:
    """Synchronous SuperDoc client with persistent host transport."""

    doc: _SyncDocApi

    def __init__(
        self,
        *,
        env: dict[str, str] | None = None,
        startup_timeout_ms: int = 5_000,
        shutdown_timeout_ms: int = 5_000,
        request_timeout_ms: int | None = None,
        watchdog_timeout_ms: int = 30_000,
        default_change_mode: Literal['direct', 'tracked'] | None = None,
        user: UserIdentity | None = None,
    ) -> None:
        self._runtime = SuperDocSyncRuntime(
            env=env,
            startup_timeout_ms=startup_timeout_ms,
            shutdown_timeout_ms=shutdown_timeout_ms,
            request_timeout_ms=request_timeout_ms,
            watchdog_timeout_ms=watchdog_timeout_ms,
            default_change_mode=default_change_mode,
            user=user,
        )
        self.doc = _SyncDocApi(self._runtime)

    def connect(self) -> None:
        """Explicitly connect to the host process.

        Optional — the first invoke() call will auto-connect if needed.
        """
        self._runtime.connect()

    def dispose(self) -> None:
        """Gracefully shut down the host process."""
        self._runtime.dispose()

    def __enter__(self) -> SuperDocClient:
        self.connect()
        return self

    def __exit__(self, *exc: object) -> None:
        self.dispose()


class AsyncSuperDocClient:
    """Asynchronous SuperDoc client with persistent host transport."""

    doc: _AsyncDocApi

    def __init__(
        self,
        *,
        env: dict[str, str] | None = None,
        startup_timeout_ms: int = 5_000,
        shutdown_timeout_ms: int = 5_000,
        request_timeout_ms: int | None = None,
        watchdog_timeout_ms: int = 30_000,
        max_queue_depth: int = 100,
        default_change_mode: Literal['direct', 'tracked'] | None = None,
        user: UserIdentity | None = None,
    ) -> None:
        self._runtime = SuperDocAsyncRuntime(
            env=env,
            startup_timeout_ms=startup_timeout_ms,
            shutdown_timeout_ms=shutdown_timeout_ms,
            request_timeout_ms=request_timeout_ms,
            watchdog_timeout_ms=watchdog_timeout_ms,
            max_queue_depth=max_queue_depth,
            default_change_mode=default_change_mode,
            user=user,
        )
        self.doc = _AsyncDocApi(self._runtime)

    async def connect(self) -> None:
        """Explicitly connect to the host process.

        Optional — the first invoke() call will auto-connect if needed.
        """
        await self._runtime.connect()

    async def dispose(self) -> None:
        """Gracefully shut down the host process."""
        await self._runtime.dispose()

    async def __aenter__(self) -> AsyncSuperDocClient:
        await self.connect()
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.dispose()
