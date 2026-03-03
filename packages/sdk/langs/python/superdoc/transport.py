"""Host transport layer — persistent CLI process over JSON-RPC 2.0 stdio.

Contains SyncHostTransport and AsyncHostTransport. Both spawn `superdoc host --stdio`
as a long-lived child process and communicate via newline-delimited JSON-RPC.

Process lifecycle, stdin/stdout I/O, pending request tracking, and timeouts live here.
Protocol encoding/decoding and error mapping are delegated to protocol.py.
"""

from __future__ import annotations

import asyncio
import enum
import logging
import os
import subprocess
import threading
from typing import Any, Dict, List, Optional

from .errors import (
    HOST_DISCONNECTED,
    HOST_HANDSHAKE_FAILED,
    HOST_PROTOCOL_ERROR,
    HOST_QUEUE_FULL,
    HOST_TIMEOUT,
    SuperDocError,
)
from .protocol import (
    ChangeMode,
    InvalidFrame,
    JsonRpcError,
    JsonRpcNotification,
    JsonRpcResponse,
    build_cli_invoke_payload,
    build_operation_argv,
    encode_jsonrpc_request,
    map_jsonrpc_error,
    parse_jsonrpc_line,
    resolve_invocation,
    resolve_watchdog_timeout,
    validate_capabilities,
)

logger = logging.getLogger('superdoc.transport')

# Opt-in debug logging via SUPERDOC_DEBUG=1 or SUPERDOC_LOG_LEVEL=debug.
# Only configures the named logger — never mutates root logging config.
_log_level = os.environ.get('SUPERDOC_LOG_LEVEL', '').lower()
if os.environ.get('SUPERDOC_DEBUG') == '1' or _log_level == 'debug':
    logger.setLevel(logging.DEBUG)
    if not logger.handlers:
        _handler = logging.StreamHandler()
        _handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(name)s: %(message)s'))
        logger.addHandler(_handler)


class _State(enum.Enum):
    DISCONNECTED = 'DISCONNECTED'
    CONNECTING = 'CONNECTING'
    CONNECTED = 'CONNECTED'
    DISPOSING = 'DISPOSING'


# ---------------------------------------------------------------------------
# SyncHostTransport
# ---------------------------------------------------------------------------

class SyncHostTransport:
    """Synchronous blocking host transport.

    Writes one JSON-RPC request to stdin, then reads stdout lines one at a time
    (skipping notifications and invalid frames) until the matching response ID
    is found. Uses a threading.Timer kill-switch for watchdog timeout.

    Thread-safety: a threading.Lock serializes concurrent invoke() calls.
    """

    def __init__(
        self,
        cli_bin: str,
        *,
        env: Optional[Dict[str, str]] = None,
        startup_timeout_ms: int = 5_000,
        shutdown_timeout_ms: int = 5_000,
        request_timeout_ms: Optional[int] = None,
        watchdog_timeout_ms: int = 30_000,
        default_change_mode: Optional[ChangeMode] = None,
        user: Optional[Dict[str, str]] = None,
    ) -> None:
        self._cli_bin = cli_bin
        self._env = env or {}
        self._startup_timeout_ms = startup_timeout_ms
        self._shutdown_timeout_ms = shutdown_timeout_ms
        self._request_timeout_ms = request_timeout_ms
        self._watchdog_timeout_ms = watchdog_timeout_ms
        self._default_change_mode = default_change_mode
        self._user = user

        self._process: Optional[subprocess.Popen] = None
        self._state = _State.DISCONNECTED
        self._next_request_id = 1
        self._lock = threading.Lock()

    # -- Lifecycle -----------------------------------------------------------

    def connect(self) -> None:
        """Ensure the host process is running and handshake is complete."""
        with self._lock:
            self._ensure_connected()

    def dispose(self) -> None:
        """Gracefully shut down the host process."""
        with self._lock:
            if self._state == _State.DISCONNECTED or self._state == _State.DISPOSING:
                return
            self._state = _State.DISPOSING

            process = self._process
            if process is None:
                self._state = _State.DISCONNECTED
                return

            # Send host.shutdown request (best-effort).
            try:
                self._write_request('host.shutdown', {})
            except Exception:
                pass

            # Wait for graceful exit.
            try:
                process.wait(timeout=self._shutdown_timeout_ms / 1000)
                logger.debug('Host exited gracefully (pid=%s).', process.pid)
            except subprocess.TimeoutExpired:
                process.kill()
                try:
                    process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    pass
                logger.debug('Host force-killed after shutdown timeout (pid=%s).', process.pid)

            self._cleanup()

    @property
    def state(self) -> str:
        return self._state.value

    # -- Invocation ----------------------------------------------------------

    def invoke(
        self,
        operation: Dict[str, Any],
        params: Dict[str, Any],
        *,
        timeout_ms: Optional[int] = None,
        stdin_bytes: Optional[bytes] = None,
    ) -> Any:
        """Invoke a CLI operation over the host transport."""
        with self._lock:
            if self._state == _State.DISPOSING:
                raise SuperDocError(
                    'Host is disposing.',
                    code=HOST_DISCONNECTED,
                )
            self._ensure_connected()

            argv = build_operation_argv(
                operation, params,
                timeout_ms=timeout_ms,
                default_change_mode=self._default_change_mode,
                user=self._user,
            )
            payload = build_cli_invoke_payload(argv, stdin_bytes)
            watchdog = resolve_watchdog_timeout(
                self._watchdog_timeout_ms, timeout_ms, self._request_timeout_ms,
            )

            result = self._send_request('cli.invoke', payload, watchdog)

            if not isinstance(result, dict):
                raise SuperDocError(
                    'Host returned invalid cli.invoke result.',
                    code=HOST_PROTOCOL_ERROR,
                    details={'result': result},
                )

            return result.get('data')

    # -- Internal ------------------------------------------------------------

    def _ensure_connected(self) -> None:
        """Spawn and handshake if not already connected. Must be called under lock."""
        if self._state == _State.CONNECTED and self._process and self._process.poll() is None:
            return
        if self._state == _State.CONNECTING:
            return
        self._start_host()

    def _start_host(self) -> None:
        """Spawn the host process and perform capability handshake."""
        self._state = _State.CONNECTING

        command, prefix_args = resolve_invocation(self._cli_bin)
        args = [command, *prefix_args, 'host', '--stdio']

        try:
            self._process = subprocess.Popen(
                args,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                env={**os.environ, **self._env},
            )
            logger.debug('Host spawned (pid=%s, bin=%s).', self._process.pid, self._cli_bin)
        except Exception as exc:
            self._state = _State.DISCONNECTED
            raise SuperDocError(
                f'Failed to start host process: {exc}',
                code=HOST_HANDSHAKE_FAILED,
                details={'message': str(exc)},
            ) from exc

        # Handshake.
        try:
            capabilities = self._send_request(
                'host.capabilities', {}, self._startup_timeout_ms,
            )
            validate_capabilities(capabilities)
            logger.debug(
                'Handshake complete (version=%s, features=%s).',
                capabilities.get('protocolVersion') if isinstance(capabilities, dict) else '?',
                capabilities.get('features') if isinstance(capabilities, dict) else '?',
            )
        except SuperDocError:
            self._kill_and_reset()
            raise
        except Exception as exc:
            self._kill_and_reset()
            raise SuperDocError(
                'Host handshake failed.',
                code=HOST_HANDSHAKE_FAILED,
                details={'message': str(exc)},
            ) from exc

        self._state = _State.CONNECTED

    def _send_request(self, method: str, params: Any, watchdog_ms: int) -> Any:
        """Write a JSON-RPC request and block-read until matching response."""
        process = self._process
        if not process or not process.stdin or not process.stdout:
            raise SuperDocError('Host process is not available.', code=HOST_DISCONNECTED)

        request_id = self._next_request_id
        self._next_request_id += 1

        line = encode_jsonrpc_request(request_id, method, params)
        logger.debug('Request #%d: method=%s', request_id, method)

        # Watchdog kill-switch: a background timer kills the process if readline blocks too long.
        timed_out = threading.Event()

        def _watchdog_fire():
            timed_out.set()
            try:
                process.kill()
            except Exception:
                pass

        timer = threading.Timer(watchdog_ms / 1000, _watchdog_fire)
        timer.daemon = True
        timer.start()

        try:
            process.stdin.write(line.encode('utf-8'))
            process.stdin.flush()
        except Exception as exc:
            timer.cancel()
            self._kill_and_reset()
            raise SuperDocError(
                'Failed to write request to host process.',
                code=HOST_DISCONNECTED,
                details={'method': method},
            ) from exc

        # Blocking read loop — skip notifications and invalid frames until matching response.
        try:
            while True:
                raw = process.stdout.readline()
                if not raw:
                    # EOF — process died.
                    timer.cancel()
                    if timed_out.is_set():
                        self._kill_and_reset()
                        raise SuperDocError(
                            f'Host watchdog timed out waiting for {method}.',
                            code=HOST_TIMEOUT,
                            details={'method': method, 'timeout_ms': watchdog_ms},
                        )
                    exit_code = process.poll()
                    self._kill_and_reset()
                    raise SuperDocError(
                        'Host process disconnected.',
                        code=HOST_DISCONNECTED,
                        details={'exit_code': exit_code, 'signal': None},
                    )

                decoded = raw.decode('utf-8', errors='replace')
                msg = parse_jsonrpc_line(decoded)

                if isinstance(msg, JsonRpcNotification):
                    logger.debug('Notification received: method=%s', msg.method)
                    continue

                if isinstance(msg, InvalidFrame):
                    continue

                if isinstance(msg, JsonRpcError) and msg.id == request_id:
                    timer.cancel()
                    logger.debug('Response #%d: error', request_id)
                    raise map_jsonrpc_error(msg.error)

                if isinstance(msg, JsonRpcResponse) and msg.id == request_id:
                    timer.cancel()
                    logger.debug('Response #%d: ok', request_id)
                    return msg.result

                # Response for a different ID — should not happen in sync transport.
                # Skip it.
                continue

        except SuperDocError:
            raise
        except Exception as exc:
            timer.cancel()
            if timed_out.is_set():
                self._kill_and_reset()
                raise SuperDocError(
                    f'Host watchdog timed out waiting for {method}.',
                    code=HOST_TIMEOUT,
                    details={'method': method, 'timeout_ms': watchdog_ms},
                ) from exc
            self._kill_and_reset()
            raise SuperDocError(
                'Host process disconnected.',
                code=HOST_DISCONNECTED,
                details={'message': str(exc)},
            ) from exc

    def _write_request(self, method: str, params: Any) -> int:
        """Write a JSON-RPC request without waiting for a response."""
        process = self._process
        if not process or not process.stdin:
            raise SuperDocError('Host process is not available.', code=HOST_DISCONNECTED)
        request_id = self._next_request_id
        self._next_request_id += 1
        line = encode_jsonrpc_request(request_id, method, params)
        process.stdin.write(line.encode('utf-8'))
        process.stdin.flush()
        return request_id

    def _kill_and_reset(self) -> None:
        """Kill the host process and reset to DISCONNECTED."""
        process = self._process
        if process:
            try:
                process.kill()
            except Exception:
                pass
            try:
                process.wait(timeout=2)
            except Exception:
                pass
        self._cleanup()

    def _cleanup(self) -> None:
        """Clear all process state. Transition to DISCONNECTED."""
        self._process = None
        self._state = _State.DISCONNECTED


# ---------------------------------------------------------------------------
# AsyncHostTransport
# ---------------------------------------------------------------------------

class AsyncHostTransport:
    """Asynchronous host transport with a background reader task.

    Maintains a dict[int, asyncio.Future] of pending requests. A background
    asyncio.Task reads stdout lines and dispatches each response to its matching
    future by request ID.
    """

    def __init__(
        self,
        cli_bin: str,
        *,
        env: Optional[Dict[str, str]] = None,
        startup_timeout_ms: int = 5_000,
        shutdown_timeout_ms: int = 5_000,
        request_timeout_ms: Optional[int] = None,
        watchdog_timeout_ms: int = 30_000,
        max_queue_depth: int = 100,
        default_change_mode: Optional[ChangeMode] = None,
        user: Optional[Dict[str, str]] = None,
    ) -> None:
        self._cli_bin = cli_bin
        self._env = env or {}
        self._startup_timeout_ms = startup_timeout_ms
        self._shutdown_timeout_ms = shutdown_timeout_ms
        self._request_timeout_ms = request_timeout_ms
        self._watchdog_timeout_ms = watchdog_timeout_ms
        self._max_queue_depth = max_queue_depth
        self._default_change_mode = default_change_mode
        self._user = user

        self._process: Optional[asyncio.subprocess.Process] = None
        self._reader_task: Optional[asyncio.Task] = None
        self._pending: Dict[int, asyncio.Future] = {}
        self._state = _State.DISCONNECTED
        self._next_request_id = 1
        self._connecting: Optional[asyncio.Future] = None
        self._stopping = False

    # -- Lifecycle -----------------------------------------------------------

    async def connect(self) -> None:
        """Ensure the host process is running and handshake is complete."""
        await self._ensure_connected()

    async def dispose(self) -> None:
        """Gracefully shut down the host process."""
        if self._state == _State.DISCONNECTED or self._state == _State.DISPOSING:
            return

        self._stopping = True
        self._state = _State.DISPOSING

        process = self._process
        if process is None:
            self._state = _State.DISCONNECTED
            self._stopping = False
            return

        # Send host.shutdown (best-effort).
        try:
            await self._send_request('host.shutdown', {}, self._shutdown_timeout_ms)
        except Exception:
            pass

        # Wait for process exit with timeout.
        try:
            await asyncio.wait_for(process.wait(), timeout=self._shutdown_timeout_ms / 1000)
            logger.debug('Host exited gracefully (pid=%s).', process.pid)
        except asyncio.TimeoutError:
            process.kill()
            try:
                await asyncio.wait_for(process.wait(), timeout=2)
            except asyncio.TimeoutError:
                pass
            logger.debug('Host force-killed after shutdown timeout (pid=%s).', process.pid)

        await self._cleanup(None)
        self._stopping = False

    @property
    def state(self) -> str:
        return self._state.value

    # -- Invocation ----------------------------------------------------------

    async def invoke(
        self,
        operation: Dict[str, Any],
        params: Dict[str, Any],
        *,
        timeout_ms: Optional[int] = None,
        stdin_bytes: Optional[bytes] = None,
    ) -> Any:
        """Invoke a CLI operation over the host transport."""
        if self._state == _State.DISPOSING:
            raise SuperDocError('Host is disposing.', code=HOST_DISCONNECTED)

        await self._ensure_connected()

        argv = build_operation_argv(
            operation, params,
            timeout_ms=timeout_ms,
            default_change_mode=self._default_change_mode,
            user=self._user,
        )
        payload = build_cli_invoke_payload(argv, stdin_bytes)
        watchdog = resolve_watchdog_timeout(
            self._watchdog_timeout_ms, timeout_ms, self._request_timeout_ms,
        )

        result = await self._send_request('cli.invoke', payload, watchdog)

        if not isinstance(result, dict):
            raise SuperDocError(
                'Host returned invalid cli.invoke result.',
                code=HOST_PROTOCOL_ERROR,
                details={'result': result},
            )

        return result.get('data')

    # -- Internal ------------------------------------------------------------

    async def _ensure_connected(self) -> None:
        """Lazy connect: spawn and handshake if not already connected."""
        if self._state == _State.CONNECTED and self._process and self._process.returncode is None:
            return

        if self._connecting is not None:
            await self._connecting
            return

        # Use a Task for single-flight connect. All concurrent callers await
        # the same task, so the exception is always consumed — no "Future
        # exception was never retrieved" noise.
        self._connecting = asyncio.ensure_future(self._start_host())
        try:
            await self._connecting
        finally:
            self._connecting = None

    async def _start_host(self) -> None:
        """Spawn the host process and perform capability handshake."""
        self._state = _State.CONNECTING

        command, prefix_args = resolve_invocation(self._cli_bin)
        args = [*prefix_args, 'host', '--stdio']

        try:
            self._process = await asyncio.create_subprocess_exec(
                command, *args,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
                env={**os.environ, **self._env},
            )
            logger.debug('Host spawned (pid=%s, bin=%s).', self._process.pid, self._cli_bin)
        except Exception as exc:
            self._state = _State.DISCONNECTED
            raise SuperDocError(
                f'Failed to start host process: {exc}',
                code=HOST_HANDSHAKE_FAILED,
                details={'message': str(exc)},
            ) from exc

        # Start background reader task.
        self._reader_task = asyncio.ensure_future(self._reader_loop())

        # Handshake.
        try:
            capabilities = await self._send_request(
                'host.capabilities', {}, self._startup_timeout_ms,
            )
            validate_capabilities(capabilities)
            logger.debug(
                'Handshake complete (version=%s, features=%s).',
                capabilities.get('protocolVersion') if isinstance(capabilities, dict) else '?',
                capabilities.get('features') if isinstance(capabilities, dict) else '?',
            )
        except SuperDocError:
            await self._kill_and_reset()
            raise
        except Exception as exc:
            await self._kill_and_reset()
            raise SuperDocError(
                'Host handshake failed.',
                code=HOST_HANDSHAKE_FAILED,
                details={'message': str(exc)},
            ) from exc

        self._state = _State.CONNECTED

    async def _reader_loop(self) -> None:
        """Background task: read stdout lines and dispatch to pending futures."""
        process = self._process
        if not process or not process.stdout:
            return

        try:
            while True:
                raw = await process.stdout.readline()
                if not raw:
                    # EOF — process died.
                    break

                decoded = raw.decode('utf-8', errors='replace')
                msg = parse_jsonrpc_line(decoded)

                if isinstance(msg, JsonRpcNotification):
                    logger.debug('Notification received: method=%s', msg.method)
                    continue

                if isinstance(msg, InvalidFrame):
                    continue

                if isinstance(msg, JsonRpcError):
                    future = self._pending.pop(msg.id, None)
                    if future and not future.done():
                        future.set_exception(map_jsonrpc_error(msg.error))
                    continue

                if isinstance(msg, JsonRpcResponse):
                    future = self._pending.pop(msg.id, None)
                    if future and not future.done():
                        future.set_result(msg.result)
                    continue

        except asyncio.CancelledError:
            return
        except Exception as exc:
            logger.debug('Reader loop error: %s', exc)

        # Reader exited (EOF or error) — reject all pending futures.
        if not self._stopping:
            exit_code = process.returncode
            error = SuperDocError(
                'Host process disconnected.',
                code=HOST_DISCONNECTED,
                details={'exit_code': exit_code, 'signal': None},
            )
            self._reject_all_pending(error)
            self._state = _State.DISCONNECTED

    async def _send_request(self, method: str, params: Any, watchdog_ms: int) -> Any:
        """Send a JSON-RPC request and await the matching response future."""
        process = self._process
        if not process or not process.stdin:
            raise SuperDocError('Host process is not available.', code=HOST_DISCONNECTED)

        if len(self._pending) >= self._max_queue_depth:
            raise SuperDocError(
                'Host request queue is full.',
                code=HOST_QUEUE_FULL,
                details={'max_queue_depth': self._max_queue_depth},
            )

        request_id = self._next_request_id
        self._next_request_id += 1

        line = encode_jsonrpc_request(request_id, method, params)
        logger.debug('Request #%d: method=%s', request_id, method)

        loop = asyncio.get_running_loop()
        future: asyncio.Future = loop.create_future()
        self._pending[request_id] = future

        try:
            process.stdin.write(line.encode('utf-8'))
            await process.stdin.drain()
        except Exception as exc:
            self._pending.pop(request_id, None)
            if not future.done():
                future.cancel()
            await self._kill_and_reset()
            raise SuperDocError(
                'Failed to write request to host process.',
                code=HOST_DISCONNECTED,
                details={'method': method},
            ) from exc

        # Await response with watchdog timeout.
        try:
            result = await asyncio.wait_for(future, timeout=watchdog_ms / 1000)
            logger.debug('Response #%d: ok', request_id)
            return result
        except asyncio.TimeoutError:
            self._pending.pop(request_id, None)
            logger.debug('Timeout #%d: method=%s, timeout_ms=%d', request_id, method, watchdog_ms)
            # Kill the process — all other pending requests will fail via reader EOF.
            await self._kill_and_reset()
            raise SuperDocError(
                f'Host watchdog timed out waiting for {method}.',
                code=HOST_TIMEOUT,
                details={'method': method, 'timeout_ms': watchdog_ms},
            )

    def _reject_all_pending(self, error: SuperDocError) -> None:
        """Reject all pending futures with the given error."""
        pending = list(self._pending.values())
        self._pending.clear()
        for future in pending:
            if not future.done():
                future.set_exception(error)

    async def _kill_and_reset(self) -> None:
        """Kill the host process and reset to DISCONNECTED."""
        await self._cleanup(
            SuperDocError('Host process disconnected.', code=HOST_DISCONNECTED),
        )

    async def _cleanup(self, error: Optional[SuperDocError]) -> None:
        """Cancel reader, kill process, reject pending, reset state."""
        if self._reader_task and not self._reader_task.done():
            self._reader_task.cancel()
            try:
                await self._reader_task
            except (asyncio.CancelledError, Exception):
                pass
        self._reader_task = None

        process = self._process
        if process:
            try:
                process.kill()
            except Exception:
                pass
            try:
                await asyncio.wait_for(process.wait(), timeout=2)
            except (asyncio.TimeoutError, Exception):
                pass
        self._process = None

        if error:
            self._reject_all_pending(error)
        else:
            # Dispose path — reject remaining with generic disconnect.
            self._reject_all_pending(
                SuperDocError('Host process was disposed.', code=HOST_DISCONNECTED),
            )

        self._state = _State.DISCONNECTED
