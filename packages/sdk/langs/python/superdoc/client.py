"""SuperDoc client and document handle classes.

The client manages transport lifecycle and acts as a document factory.
Document handles bind a single open session and expose all document operations.

    client = AsyncSuperDocClient(user={"name": "bot"})
    await client.connect()
    doc = await client.open({"doc": "path/to/file.docx"})
    markdown = await doc.get_markdown()
    await doc.close()
    await client.dispose()
"""

from __future__ import annotations

from typing import Any, Dict, Literal, Optional

from .errors import SuperDocError
from .generated.client import (
    _AsyncDocApi, _SyncDocApi, _AsyncBoundDocApi, _SyncBoundDocApi,
    DocOpenParams as GeneratedDocOpenParams,
    DocOpenResult as GeneratedDocOpenResult,
)
from .runtime import SuperDocAsyncRuntime, SuperDocSyncRuntime

UserIdentity = Dict[str, str]


# ---------------------------------------------------------------------------
# Session-bound runtime wrapper
# ---------------------------------------------------------------------------

class _BoundSyncRuntime:
    """Wraps a raw runtime and injects a fixed sessionId into every invoke call."""

    def __init__(self, runtime: SuperDocSyncRuntime, session_id: str) -> None:
        self._runtime = runtime
        self._session_id = session_id
        self._closed = False

    def invoke(
        self,
        operation_id: str,
        params: Optional[Dict[str, Any]] = None,
        *,
        timeout_ms: Optional[int] = None,
        stdin_bytes: Optional[bytes] = None,
    ) -> Dict[str, Any]:
        if self._closed:
            raise SuperDocError(
                'Document handle is closed.',
                code='DOCUMENT_CLOSED',
                details={'sessionId': self._session_id},
            )
        merged = {**(params or {}), 'sessionId': self._session_id}
        return self._runtime.invoke(operation_id, merged, timeout_ms=timeout_ms, stdin_bytes=stdin_bytes)

    def mark_closed(self) -> None:
        self._closed = True


class _BoundAsyncRuntime:
    """Async version of _BoundSyncRuntime."""

    def __init__(self, runtime: SuperDocAsyncRuntime, session_id: str) -> None:
        self._runtime = runtime
        self._session_id = session_id
        self._closed = False

    async def invoke(
        self,
        operation_id: str,
        params: Optional[Dict[str, Any]] = None,
        *,
        timeout_ms: Optional[int] = None,
        stdin_bytes: Optional[bytes] = None,
    ) -> Dict[str, Any]:
        if self._closed:
            raise SuperDocError(
                'Document handle is closed.',
                code='DOCUMENT_CLOSED',
                details={'sessionId': self._session_id},
            )
        merged = {**(params or {}), 'sessionId': self._session_id}
        return await self._runtime.invoke(operation_id, merged, timeout_ms=timeout_ms, stdin_bytes=stdin_bytes)

    def mark_closed(self) -> None:
        self._closed = True


# ---------------------------------------------------------------------------
# Document handles
# ---------------------------------------------------------------------------

class SuperDocDocument:
    """Bound document handle for synchronous workflows.

    All document operations are available as methods on this handle.
    The handle injects its session id automatically — callers never pass
    doc or sessionId.
    """

    def __init__(
        self,
        bound_runtime: _BoundSyncRuntime,
        session_id: str,
        open_result: GeneratedDocOpenResult,
        client: SuperDocClient,
    ) -> None:
        self._bound_runtime = bound_runtime
        self._session_id = session_id
        self._open_result = open_result
        self._client = client
        self._api = _SyncBoundDocApi(bound_runtime)

    @property
    def session_id(self) -> str:
        return self._session_id

    @property
    def open_result(self) -> GeneratedDocOpenResult:
        """Read-only snapshot of the initial doc.open response metadata."""
        return self._open_result

    def __getattr__(self, name: str) -> Any:
        return getattr(self._api, name)

    def close(
        self,
        params: Optional[Dict[str, Any]] = None,
        *,
        timeout_ms: Optional[int] = None,
        stdin_bytes: Optional[bytes] = None,
    ) -> Any:
        result = self._bound_runtime.invoke(
            'doc.close', params or {}, timeout_ms=timeout_ms, stdin_bytes=stdin_bytes,
        )
        self._bound_runtime.mark_closed()
        self._client._remove_handle(self._session_id)
        return result

    def save(
        self,
        params: Optional[Dict[str, Any]] = None,
        *,
        timeout_ms: Optional[int] = None,
        stdin_bytes: Optional[bytes] = None,
    ) -> Any:
        return self._bound_runtime.invoke(
            'doc.save', params or {}, timeout_ms=timeout_ms, stdin_bytes=stdin_bytes,
        )

    def mark_closed(self) -> None:
        """Mark this handle as closed. Called by client.dispose()."""
        self._bound_runtime.mark_closed()


class AsyncSuperDocDocument:
    """Bound document handle for asynchronous workflows.

    All document operations are available as methods on this handle.
    The handle injects its session id automatically — callers never pass
    doc or sessionId.
    """

    def __init__(
        self,
        bound_runtime: _BoundAsyncRuntime,
        session_id: str,
        open_result: GeneratedDocOpenResult,
        client: AsyncSuperDocClient,
    ) -> None:
        self._bound_runtime = bound_runtime
        self._session_id = session_id
        self._open_result = open_result
        self._client = client
        self._api = _AsyncBoundDocApi(bound_runtime)

    @property
    def session_id(self) -> str:
        return self._session_id

    @property
    def open_result(self) -> GeneratedDocOpenResult:
        """Read-only snapshot of the initial doc.open response metadata."""
        return self._open_result

    def __getattr__(self, name: str) -> Any:
        return getattr(self._api, name)

    async def close(
        self,
        params: Optional[Dict[str, Any]] = None,
        *,
        timeout_ms: Optional[int] = None,
        stdin_bytes: Optional[bytes] = None,
    ) -> Any:
        result = await self._bound_runtime.invoke(
            'doc.close', params or {}, timeout_ms=timeout_ms, stdin_bytes=stdin_bytes,
        )
        self._bound_runtime.mark_closed()
        self._client._remove_handle(self._session_id)
        return result

    async def save(
        self,
        params: Optional[Dict[str, Any]] = None,
        *,
        timeout_ms: Optional[int] = None,
        stdin_bytes: Optional[bytes] = None,
    ) -> Any:
        return await self._bound_runtime.invoke(
            'doc.save', params or {}, timeout_ms=timeout_ms, stdin_bytes=stdin_bytes,
        )

    def mark_closed(self) -> None:
        """Mark this handle as closed. Called by client.dispose()."""
        self._bound_runtime.mark_closed()


# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------

class SuperDocClient:
    """Synchronous SuperDoc client — transport manager and document factory.

    Use client.open() to get bound document handles. Each handle is
    independently session-scoped and safe for concurrent use.
    """

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
        self._raw_api = _SyncDocApi(self._runtime)
        self._handles: Dict[str, SuperDocDocument] = {}

    def connect(self) -> None:
        """Explicitly connect to the host process.

        Optional — the first invoke() call will auto-connect if needed.
        """
        self._runtime.connect()

    def open(
        self,
        params: GeneratedDocOpenParams,
        *,
        timeout_ms: Optional[int] = None,
        stdin_bytes: Optional[bytes] = None,
    ) -> SuperDocDocument:
        """Open a document and return a bound document handle.

        The returned handle injects its session id into every operation
        automatically. The same file can be opened multiple times with
        different session ids (useful for diff workflows).
        """
        explicit_session_id = params.get('sessionId')
        if explicit_session_id and explicit_session_id in self._handles:
            raise SuperDocError(
                f'Session id already open in this client: {explicit_session_id}',
                code='SESSION_ALREADY_OPEN',
                details={'sessionId': explicit_session_id},
            )

        result = self._raw_api.open(params, timeout_ms=timeout_ms, stdin_bytes=stdin_bytes)
        context_id = result.get('contextId', '')

        bound = _BoundSyncRuntime(self._runtime, context_id)
        handle = SuperDocDocument(bound, context_id, result, self)
        self._handles[context_id] = handle
        return handle

    def describe(
        self,
        params: Dict[str, Any] | None = None,
        *,
        timeout_ms: Optional[int] = None,
        stdin_bytes: Optional[bytes] = None,
    ) -> Any:
        return self._raw_api.describe(params, timeout_ms=timeout_ms, stdin_bytes=stdin_bytes)

    def describe_command(
        self,
        params: Dict[str, Any] | None = None,
        *,
        timeout_ms: Optional[int] = None,
        stdin_bytes: Optional[bytes] = None,
    ) -> Any:
        return self._raw_api.describe_command(params, timeout_ms=timeout_ms, stdin_bytes=stdin_bytes)

    def dispose(self) -> None:
        """Gracefully shut down the host process and invalidate all open handles."""
        for handle in self._handles.values():
            handle.mark_closed()
        self._handles.clear()
        self._runtime.dispose()

    def _remove_handle(self, session_id: str) -> None:
        self._handles.pop(session_id, None)

    def __enter__(self) -> SuperDocClient:
        self.connect()
        return self

    def __exit__(self, *exc: object) -> None:
        self.dispose()


class AsyncSuperDocClient:
    """Asynchronous SuperDoc client — transport manager and document factory.

    Use client.open() to get bound document handles. Each handle is
    independently session-scoped and safe for concurrent use.
    """

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
        self._raw_api = _AsyncDocApi(self._runtime)
        self._handles: Dict[str, AsyncSuperDocDocument] = {}

    async def connect(self) -> None:
        """Explicitly connect to the host process.

        Optional — the first invoke() call will auto-connect if needed.
        """
        await self._runtime.connect()

    async def open(
        self,
        params: GeneratedDocOpenParams,
        *,
        timeout_ms: Optional[int] = None,
        stdin_bytes: Optional[bytes] = None,
    ) -> AsyncSuperDocDocument:
        """Open a document and return a bound document handle.

        The returned handle injects its session id into every operation
        automatically. The same file can be opened multiple times with
        different session ids (useful for diff workflows).
        """
        explicit_session_id = params.get('sessionId')
        if explicit_session_id and explicit_session_id in self._handles:
            raise SuperDocError(
                f'Session id already open in this client: {explicit_session_id}',
                code='SESSION_ALREADY_OPEN',
                details={'sessionId': explicit_session_id},
            )

        result = await self._raw_api.open(params, timeout_ms=timeout_ms, stdin_bytes=stdin_bytes)
        context_id = result.get('contextId', '')

        bound = _BoundAsyncRuntime(self._runtime, context_id)
        handle = AsyncSuperDocDocument(bound, context_id, result, self)
        self._handles[context_id] = handle
        return handle

    async def describe(
        self,
        params: Dict[str, Any] | None = None,
        *,
        timeout_ms: Optional[int] = None,
        stdin_bytes: Optional[bytes] = None,
    ) -> Any:
        return await self._raw_api.describe(params, timeout_ms=timeout_ms, stdin_bytes=stdin_bytes)

    async def describe_command(
        self,
        params: Dict[str, Any] | None = None,
        *,
        timeout_ms: Optional[int] = None,
        stdin_bytes: Optional[bytes] = None,
    ) -> Any:
        return await self._raw_api.describe_command(params, timeout_ms=timeout_ms, stdin_bytes=stdin_bytes)

    async def dispose(self) -> None:
        """Gracefully shut down the host process and invalidate all open handles."""
        for handle in self._handles.values():
            handle.mark_closed()
        self._handles.clear()
        await self._runtime.dispose()

    def _remove_handle(self, session_id: str) -> None:
        self._handles.pop(session_id, None)

    async def __aenter__(self) -> AsyncSuperDocClient:
        await self.connect()
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.dispose()
