"""Transport reliability tests using the mock host fixture.

Tests spawn the mock_host.py script instead of a real CLI binary to exercise
handshake, timeout, disconnect, reconnect, and notification interleaving scenarios.
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest

from superdoc.errors import (
    HOST_DISCONNECTED,
    HOST_HANDSHAKE_FAILED,
    HOST_PROTOCOL_ERROR,
    HOST_QUEUE_FULL,
    HOST_TIMEOUT,
    SuperDocError,
)
from superdoc.transport import (
    DEFAULT_STDOUT_BUFFER_LIMIT_BYTES,
    AsyncHostTransport,
    SyncHostTransport,
)

MOCK_HOST = os.path.join(os.path.dirname(__file__), 'mock_host.py')

# A minimal operation spec for testing.
_TEST_OP = {
    'commandTokens': ['doc', 'find'],
    'params': [{'name': 'query', 'kind': 'flag', 'type': 'string'}],
}


def _mock_cli_bin(scenario: dict) -> str:
    """Create a wrapper script that the transport invokes as if it were the CLI binary.

    The transport calls `<cli_bin> host --stdio`. The wrapper ignores those args
    and runs mock_host.py with the base64-encoded scenario instead.
    """
    # Encode scenario as base64.
    scenario_b64 = base64.b64encode(json.dumps(scenario).encode()).decode()
    # Create a temporary wrapper script.
    import tempfile
    wrapper = tempfile.NamedTemporaryFile(mode='w', suffix='.sh', delete=False, prefix='mock_cli_')
    wrapper.write(f'#!/bin/sh\nexec python3 {MOCK_HOST} {scenario_b64}\n')
    wrapper.close()
    os.chmod(wrapper.name, 0o755)
    return wrapper.name


def _cleanup_wrapper(path: str) -> None:
    try:
        os.unlink(path)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Sync transport tests
# ---------------------------------------------------------------------------

class TestSyncHandshake:
    def test_handshake_success(self):
        cli = _mock_cli_bin({'handshake': 'ok'})
        try:
            transport = SyncHostTransport(cli, startup_timeout_ms=5_000)
            transport.connect()
            assert transport.state == 'CONNECTED'
            transport.dispose()
        finally:
            _cleanup_wrapper(cli)

    def test_handshake_bad_version(self):
        cli = _mock_cli_bin({'handshake': 'bad_version'})
        try:
            transport = SyncHostTransport(cli, startup_timeout_ms=5_000)
            with pytest.raises(SuperDocError) as exc_info:
                transport.connect()
            assert exc_info.value.code == HOST_HANDSHAKE_FAILED
            assert transport.state == 'DISCONNECTED'
        finally:
            _cleanup_wrapper(cli)

    def test_handshake_missing_features(self):
        cli = _mock_cli_bin({'handshake': 'missing_features'})
        try:
            transport = SyncHostTransport(cli, startup_timeout_ms=5_000)
            with pytest.raises(SuperDocError) as exc_info:
                transport.connect()
            assert exc_info.value.code == HOST_HANDSHAKE_FAILED
        finally:
            _cleanup_wrapper(cli)


class TestSyncInvoke:
    def test_normal_request_response(self):
        cli = _mock_cli_bin({
            'handshake': 'ok',
            'responses': [{'data': {'items': [1, 2, 3]}}],
        })
        try:
            transport = SyncHostTransport(cli, startup_timeout_ms=5_000)
            transport.connect()
            result = transport.invoke(_TEST_OP, {'query': 'test'})
            assert result == {'items': [1, 2, 3]}
            transport.dispose()
        finally:
            _cleanup_wrapper(cli)

    def test_cli_error_passthrough(self):
        cli = _mock_cli_bin({
            'handshake': 'ok',
            'responses': [{
                'error': {
                    'code': -32000,
                    'message': 'File not found',
                    'data': {'cliCode': 'FILE_NOT_FOUND', 'message': 'Not found'},
                },
            }],
        })
        try:
            transport = SyncHostTransport(cli, startup_timeout_ms=5_000)
            transport.connect()
            with pytest.raises(SuperDocError) as exc_info:
                transport.invoke(_TEST_OP, {'query': 'test'})
            assert exc_info.value.code == 'FILE_NOT_FOUND'
            transport.dispose()
        finally:
            _cleanup_wrapper(cli)

    def test_notification_interleaving(self):
        """Mock sends a notification before the real response — verify correct routing."""
        cli = _mock_cli_bin({
            'handshake': 'ok',
            'responses': [{
                'notification': {'method': 'event.remoteChange', 'params': {'doc': 'x'}},
                'data': {'found': True},
            }],
        })
        try:
            transport = SyncHostTransport(cli, startup_timeout_ms=5_000)
            transport.connect()
            result = transport.invoke(_TEST_OP, {'query': 'test'})
            assert result == {'found': True}
            transport.dispose()
        finally:
            _cleanup_wrapper(cli)

    def test_malformed_frame_skipped(self):
        """Mock sends malformed JSON before the real response — verify it's skipped."""
        cli = _mock_cli_bin({
            'handshake': 'ok',
            'responses': [{
                'malformed': True,
                'data': {'ok': True},
            }],
        })
        try:
            transport = SyncHostTransport(cli, startup_timeout_ms=5_000)
            transport.connect()
            result = transport.invoke(_TEST_OP, {'query': 'test'})
            assert result == {'ok': True}
            transport.dispose()
        finally:
            _cleanup_wrapper(cli)


class TestSyncTimeout:
    def test_watchdog_timeout(self):
        """Mock delays past watchdog — verify HOST_TIMEOUT."""
        cli = _mock_cli_bin({
            'handshake': 'ok',
            'responses': [{'delay_ms': 5000, 'data': 'too late'}],
        })
        try:
            transport = SyncHostTransport(cli, startup_timeout_ms=5_000, watchdog_timeout_ms=500)
            transport.connect()
            with pytest.raises(SuperDocError) as exc_info:
                transport.invoke(_TEST_OP, {'query': 'test'})
            assert exc_info.value.code == HOST_TIMEOUT
            assert transport.state == 'DISCONNECTED'
        finally:
            _cleanup_wrapper(cli)


class TestSyncDisconnect:
    def test_host_crash_mid_request(self):
        """Mock crashes during request — verify HOST_DISCONNECTED."""
        cli = _mock_cli_bin({
            'handshake': 'ok',
            'responses': [{'crash': True}],
        })
        try:
            transport = SyncHostTransport(cli, startup_timeout_ms=5_000)
            transport.connect()
            with pytest.raises(SuperDocError) as exc_info:
                transport.invoke(_TEST_OP, {'query': 'test'})
            assert exc_info.value.code == HOST_DISCONNECTED
            assert transport.state == 'DISCONNECTED'
        finally:
            _cleanup_wrapper(cli)

    def test_reconnect_after_failure(self):
        """After a crash, the next invoke() should re-spawn and succeed."""
        # First scenario: crash on first invoke.
        cli1 = _mock_cli_bin({
            'handshake': 'ok',
            'responses': [{'crash': True}],
        })
        try:
            transport = SyncHostTransport(cli1, startup_timeout_ms=5_000)
            transport.connect()
            with pytest.raises(SuperDocError):
                transport.invoke(_TEST_OP, {'query': 'test'})
            assert transport.state == 'DISCONNECTED'
        finally:
            _cleanup_wrapper(cli1)

        # Swap to a working mock for reconnect.
        cli2 = _mock_cli_bin({
            'handshake': 'ok',
            'responses': [{'data': {'reconnected': True}}],
        })
        try:
            transport._cli_bin = cli2
            result = transport.invoke(_TEST_OP, {'query': 'test'})
            assert result == {'reconnected': True}
            assert transport.state == 'CONNECTED'
            transport.dispose()
        finally:
            _cleanup_wrapper(cli2)


class TestSyncDispose:
    def test_graceful_dispose(self):
        cli = _mock_cli_bin({'handshake': 'ok'})
        try:
            transport = SyncHostTransport(cli, startup_timeout_ms=5_000)
            transport.connect()
            assert transport.state == 'CONNECTED'
            transport.dispose()
            assert transport.state == 'DISCONNECTED'
        finally:
            _cleanup_wrapper(cli)

    def test_dispose_idempotent(self):
        cli = _mock_cli_bin({'handshake': 'ok'})
        try:
            transport = SyncHostTransport(cli, startup_timeout_ms=5_000)
            transport.connect()
            transport.dispose()
            transport.dispose()  # Should be no-op.
            assert transport.state == 'DISCONNECTED'
        finally:
            _cleanup_wrapper(cli)

    def test_reuse_after_dispose(self):
        """Call dispose(), then invoke() — verify lazy reconnect works."""
        cli = _mock_cli_bin({
            'handshake': 'ok',
            'responses': [{'data': {'first': True}}, {'data': {'second': True}}],
        })
        try:
            transport = SyncHostTransport(cli, startup_timeout_ms=5_000)
            transport.connect()
            r1 = transport.invoke(_TEST_OP, {'query': 'a'})
            assert r1 == {'first': True}
            transport.dispose()
            assert transport.state == 'DISCONNECTED'
        finally:
            _cleanup_wrapper(cli)

        # After dispose, swap to a fresh mock and invoke again.
        cli2 = _mock_cli_bin({
            'handshake': 'ok',
            'responses': [{'data': {'reused': True}}],
        })
        try:
            transport._cli_bin = cli2
            r2 = transport.invoke(_TEST_OP, {'query': 'b'})
            assert r2 == {'reused': True}
            transport.dispose()
        finally:
            _cleanup_wrapper(cli2)


class TestSyncPartialLine:
    def test_partial_line_buffering(self):
        """Mock writes response in two chunks — verify readline buffers correctly."""
        cli = _mock_cli_bin({
            'handshake': 'ok',
            'responses': [{'partial': True, 'data': {'buffered': True}}],
        })
        try:
            transport = SyncHostTransport(cli, startup_timeout_ms=5_000)
            transport.connect()
            result = transport.invoke(_TEST_OP, {'query': 'test'})
            assert result == {'buffered': True}
            transport.dispose()
        finally:
            _cleanup_wrapper(cli)


class TestSyncLifecycle:
    def test_connect_invoke_dispose(self):
        """Verify the full connect → invoke → dispose cycle leaves state DISCONNECTED."""
        cli = _mock_cli_bin({
            'handshake': 'ok',
            'responses': [{'data': {'x': 1}}],
        })
        try:
            transport = SyncHostTransport(cli, startup_timeout_ms=5_000)
            transport.connect()
            result = transport.invoke(_TEST_OP, {'query': 'q'})
            assert result == {'x': 1}
            transport.dispose()
            assert transport.state == 'DISCONNECTED'
        finally:
            _cleanup_wrapper(cli)


# ---------------------------------------------------------------------------
# Async transport tests
# ---------------------------------------------------------------------------

class TestAsyncHandshake:
    @pytest.mark.asyncio
    async def test_handshake_success(self):
        cli = _mock_cli_bin({'handshake': 'ok'})
        try:
            transport = AsyncHostTransport(cli, startup_timeout_ms=5_000)
            await transport.connect()
            assert transport.state == 'CONNECTED'
            await transport.dispose()
        finally:
            _cleanup_wrapper(cli)

    @pytest.mark.asyncio
    async def test_handshake_bad_version(self):
        cli = _mock_cli_bin({'handshake': 'bad_version'})
        try:
            transport = AsyncHostTransport(cli, startup_timeout_ms=5_000)
            with pytest.raises(SuperDocError) as exc_info:
                await transport.connect()
            assert exc_info.value.code == HOST_HANDSHAKE_FAILED
            assert transport.state == 'DISCONNECTED'
        finally:
            _cleanup_wrapper(cli)


class TestAsyncInvoke:
    @pytest.mark.asyncio
    async def test_normal_request_response(self):
        cli = _mock_cli_bin({
            'handshake': 'ok',
            'responses': [{'data': {'items': [4, 5, 6]}}],
        })
        try:
            transport = AsyncHostTransport(cli, startup_timeout_ms=5_000)
            await transport.connect()
            result = await transport.invoke(_TEST_OP, {'query': 'test'})
            assert result == {'items': [4, 5, 6]}
            await transport.dispose()
        finally:
            _cleanup_wrapper(cli)

    @pytest.mark.asyncio
    async def test_notification_interleaving(self):
        cli = _mock_cli_bin({
            'handshake': 'ok',
            'responses': [{
                'notification': {'method': 'event.test'},
                'data': {'async_ok': True},
            }],
        })
        try:
            transport = AsyncHostTransport(cli, startup_timeout_ms=5_000)
            await transport.connect()
            result = await transport.invoke(_TEST_OP, {'query': 'test'})
            assert result == {'async_ok': True}
            await transport.dispose()
        finally:
            _cleanup_wrapper(cli)


class TestAsyncTimeout:
    @pytest.mark.asyncio
    async def test_watchdog_timeout(self):
        cli = _mock_cli_bin({
            'handshake': 'ok',
            'responses': [{'delay_ms': 5000, 'data': 'too late'}],
        })
        try:
            transport = AsyncHostTransport(cli, startup_timeout_ms=5_000, watchdog_timeout_ms=500)
            await transport.connect()
            with pytest.raises(SuperDocError) as exc_info:
                await transport.invoke(_TEST_OP, {'query': 'test'})
            assert exc_info.value.code == HOST_TIMEOUT
            assert transport.state == 'DISCONNECTED'
        finally:
            _cleanup_wrapper(cli)


class TestAsyncQueueDepth:
    @pytest.mark.asyncio
    async def test_queue_full(self):
        cli = _mock_cli_bin({
            'handshake': 'ok',
            'responses': [{'delay_ms': 5000, 'data': 'slow'}] * 5,
        })
        try:
            transport = AsyncHostTransport(cli, startup_timeout_ms=5_000, max_queue_depth=2, watchdog_timeout_ms=10_000)
            await transport.connect()

            # Fill the queue with slow requests.
            tasks = [
                asyncio.ensure_future(transport.invoke(_TEST_OP, {'query': f'q{i}'}))
                for i in range(2)
            ]
            # Give the event loop a chance to start the requests.
            await asyncio.sleep(0.1)

            # The third should be rejected.
            with pytest.raises(SuperDocError) as exc_info:
                await transport.invoke(_TEST_OP, {'query': 'overflow'})
            assert exc_info.value.code == HOST_QUEUE_FULL

            # Clean up.
            for t in tasks:
                t.cancel()
            await transport.dispose()
        finally:
            _cleanup_wrapper(cli)


class TestAsyncDisconnect:
    @pytest.mark.asyncio
    async def test_host_crash(self):
        cli = _mock_cli_bin({
            'handshake': 'ok',
            'responses': [{'crash': True}],
        })
        try:
            transport = AsyncHostTransport(cli, startup_timeout_ms=5_000)
            await transport.connect()
            process = transport._process
            assert process is not None
            with pytest.raises(SuperDocError) as exc_info:
                await transport.invoke(_TEST_OP, {'query': 'test'})
            # The reader-loop EOF branch now goes through _schedule_cleanup,
            # which rejects the pending future synchronously enough that the
            # invoke() never has to fall back to the watchdog timeout.
            assert exc_info.value.code == HOST_DISCONNECTED

            # Cleanup must tear the process down — pre-fix, the inline
            # _reject_all_pending + state flip left the process orphaned.
            cleanup_task = transport._cleanup_task
            if cleanup_task is not None:
                await cleanup_task
            assert transport._process is None
            assert transport.state == 'DISCONNECTED'
            await process.wait()
            assert process.returncode is not None
        finally:
            _cleanup_wrapper(cli)


class TestAsyncDispose:
    @pytest.mark.asyncio
    async def test_graceful_dispose(self):
        cli = _mock_cli_bin({'handshake': 'ok'})
        try:
            transport = AsyncHostTransport(cli, startup_timeout_ms=5_000)
            await transport.connect()
            assert transport.state == 'CONNECTED'
            await transport.dispose()
            assert transport.state == 'DISCONNECTED'
        finally:
            _cleanup_wrapper(cli)

    @pytest.mark.asyncio
    async def test_reuse_after_dispose(self):
        cli = _mock_cli_bin({
            'handshake': 'ok',
            'responses': [{'data': {'v': 1}}],
        })
        try:
            transport = AsyncHostTransport(cli, startup_timeout_ms=5_000)
            await transport.connect()
            r1 = await transport.invoke(_TEST_OP, {'query': 'a'})
            assert r1 == {'v': 1}
            await transport.dispose()
        finally:
            _cleanup_wrapper(cli)

        cli2 = _mock_cli_bin({
            'handshake': 'ok',
            'responses': [{'data': {'v': 2}}],
        })
        try:
            transport._cli_bin = cli2
            r2 = await transport.invoke(_TEST_OP, {'query': 'b'})
            assert r2 == {'v': 2}
            await transport.dispose()
        finally:
            _cleanup_wrapper(cli2)


class TestAsyncLargeResponse:
    """Responses larger than the StreamReader buffer must not crash the reader."""

    @pytest.mark.asyncio
    async def test_response_above_asyncio_default_streamreader_limit(self):
        big_payload = 'x' * (200 * 1024)
        cli = _mock_cli_bin({
            'handshake': 'ok',
            'responses': [{'data': {'content': big_payload}}],
        })
        try:
            transport = AsyncHostTransport(cli, startup_timeout_ms=5_000)
            await transport.connect()
            result = await transport.invoke(_TEST_OP, {'query': 'big'})
            assert result == {'content': big_payload}
            assert transport.state == 'CONNECTED'
            await transport.dispose()
        finally:
            _cleanup_wrapper(cli)

    @pytest.mark.asyncio
    async def test_response_above_custom_buffer_limit_raises_protocol_error(self):
        # Setting stdout_buffer_limit_bytes below the response size should
        # surface HOST_PROTOCOL_ERROR (actionable) rather than
        # HOST_DISCONNECTED (misleading — the host is still alive), and the
        # error should carry a hint to raise the buffer limit.
        from superdoc.errors import HOST_PROTOCOL_ERROR

        big_payload = 'x' * (200 * 1024)
        cli = _mock_cli_bin({
            'handshake': 'ok',
            'responses': [{'data': {'content': big_payload}}],
        })
        try:
            transport = AsyncHostTransport(
                cli,
                startup_timeout_ms=5_000,
                stdout_buffer_limit_bytes=64 * 1024,
            )
            await transport.connect()
            process = transport._process
            assert process is not None
            with pytest.raises(SuperDocError) as exc_info:
                await transport.invoke(_TEST_OP, {'query': 'big'})
            assert exc_info.value.code == HOST_PROTOCOL_ERROR
            assert 'stdout_buffer_limit_bytes' in str(exc_info.value)

            # The host process must be torn down — not just the transport
            # state flipped to DISCONNECTED. Otherwise dispose() short-circuits
            # and leaves an orphaned host running.
            cleanup_task = transport._cleanup_task
            if cleanup_task is not None:
                await cleanup_task
            assert transport._process is None
            assert transport.state == 'DISCONNECTED'
            # The captured handle should be reaped by _cleanup; await wait()
            # rather than reading returncode to avoid a CI-timing flake if the
            # 2 s wait inside _cleanup didn't finish reaping in time.
            await process.wait()
            assert process.returncode is not None

            # dispose() after an overflow must be a safe no-op: state and
            # process stay as cleanup left them, no exception is raised, and
            # a second dispose() is also safe.
            await transport.dispose()
            assert transport.state == 'DISCONNECTED'
            assert transport._process is None
            await transport.dispose()
            assert transport.state == 'DISCONNECTED'
        finally:
            _cleanup_wrapper(cli)

    @pytest.mark.asyncio
    async def test_client_threads_stdout_buffer_limit_to_transport(self):
        # End-to-end wiring check: the public AsyncSuperDocClient constructor
        # must thread stdout_buffer_limit_bytes through SuperDocAsyncRuntime
        # into AsyncHostTransport. Without this, a silent drop in client.py
        # or runtime.py would leave the existing overflow test passing while
        # the public API reverts to the asyncio 64 KiB default.
        from superdoc.client import AsyncSuperDocClient

        cli = _mock_cli_bin({'handshake': 'ok'})
        try:
            client = AsyncSuperDocClient(
                env={'SUPERDOC_CLI_BIN': cli},
                stdout_buffer_limit_bytes=64 * 1024,
            )
            transport = client._runtime._transport
            assert transport._stdout_buffer_limit_bytes == 64 * 1024
        finally:
            _cleanup_wrapper(cli)


class TestAsyncCleanupLifecycle:
    """Lock down the cleanup-task slot so its load-bearing invariants don't
    silently regress: the dedupe guard, the _stopping suppression branch,
    the _kill_and_reset coordination with reader-triggered cleanup, and the
    _ensure_connected drain that prevents stale cleanup from killing a
    freshly-spawned host.
    """

    @pytest.mark.asyncio
    async def test_schedule_cleanup_dedupe_guard_drops_reentrant_call(self):
        # If a cleanup task is already in flight, a second _schedule_cleanup
        # must NOT replace it — that would cancel the in-flight teardown
        # mid-flight and could leak the host process.
        cli = _mock_cli_bin({'handshake': 'ok'})
        try:
            transport = AsyncHostTransport(cli, startup_timeout_ms=5_000)
            await transport.connect()

            slow = asyncio.create_task(asyncio.sleep(0.5))
            transport._cleanup_task = slow

            transport._schedule_cleanup(
                SuperDocError('second', code=HOST_DISCONNECTED),
            )
            # Slot must still point at the original task — second call dropped.
            assert transport._cleanup_task is slow

            slow.cancel()
            try:
                await slow
            except (asyncio.CancelledError, Exception):
                pass
            transport._cleanup_task = None
            await transport.dispose()
        finally:
            _cleanup_wrapper(cli)

    @pytest.mark.asyncio
    async def test_schedule_cleanup_skipped_when_stopping(self):
        # When `dispose()` is in progress, `_stopping` is set; the production
        # guard inside `_schedule_cleanup` must short-circuit so a reader
        # overflow doesn't race the graceful teardown. (Earlier iterations
        # of this test were tautological because the test re-checked
        # `_stopping` before calling `_schedule_cleanup`. This version calls
        # it unconditionally and asserts the production guard fires.)
        cli = _mock_cli_bin({'handshake': 'ok'})
        try:
            transport = AsyncHostTransport(cli, startup_timeout_ms=5_000)
            await transport.connect()
            transport._stopping = True
            assert transport._cleanup_task is None

            transport._schedule_cleanup(
                SuperDocError('overflow', code=HOST_PROTOCOL_ERROR),
            )
            assert transport._cleanup_task is None
            assert transport.state == 'CONNECTED'

            transport._stopping = False
            await transport.dispose()
        finally:
            _cleanup_wrapper(cli)

    @pytest.mark.asyncio
    async def test_kill_and_reset_awaits_in_flight_cleanup(self):
        # If a reader-triggered cleanup is already running, _kill_and_reset
        # must await it rather than spin up a parallel _cleanup that would
        # race on _reject_all_pending and process.kill.
        cli = _mock_cli_bin({'handshake': 'ok'})
        try:
            transport = AsyncHostTransport(cli, startup_timeout_ms=5_000)
            await transport.connect()

            # Replace _cleanup with a tracking stub so we can count entries
            # and verify the second call observes the first task instead of
            # creating a fresh one. Use Events for deterministic ordering
            # rather than asyncio.sleep(0) (which is implementation-defined
            # under uvloop / Python scheduling changes).
            entry_count = 0
            started = asyncio.Event()
            release = asyncio.Event()
            real_cleanup = transport._cleanup

            async def tracking_cleanup(error):
                nonlocal entry_count
                entry_count += 1
                started.set()
                # First entry blocks until the test releases it; subsequent
                # entries (if any) would race past — failure mode for the bug.
                await release.wait()
                await real_cleanup(error)

            transport._cleanup = tracking_cleanup  # type: ignore[assignment]

            transport._schedule_cleanup(
                SuperDocError('reader-overflow', code=HOST_PROTOCOL_ERROR),
            )
            await asyncio.wait_for(started.wait(), timeout=2.0)
            assert entry_count == 1
            assert transport._cleanup_task is not None
            assert not transport._cleanup_task.done()

            kill_task = asyncio.create_task(transport._kill_and_reset())
            # Give kill_task a chance to enter — but it must NOT start a
            # second _cleanup (which would re-fire `started`).
            await asyncio.sleep(0.05)
            assert entry_count == 1
            assert not kill_task.done()

            release.set()
            await kill_task
            assert entry_count == 1
            assert transport.state == 'DISCONNECTED'
            assert transport._cleanup_task is None
        finally:
            _cleanup_wrapper(cli)

    @pytest.mark.asyncio
    async def test_dispose_waits_for_in_flight_cleanup(self):
        # `dispose()` called while a reader-triggered cleanup is in flight
        # must wait for it to finish, so the caller observes "fully torn
        # down" by the time dispose returns.
        cli = _mock_cli_bin({'handshake': 'ok'})
        try:
            transport = AsyncHostTransport(cli, startup_timeout_ms=5_000)
            await transport.connect()

            started = asyncio.Event()
            release = asyncio.Event()
            real_cleanup = transport._cleanup

            async def slow_cleanup(error):
                started.set()
                await release.wait()
                await real_cleanup(error)

            transport._cleanup = slow_cleanup  # type: ignore[assignment]

            transport._schedule_cleanup(
                SuperDocError('reader-overflow', code=HOST_PROTOCOL_ERROR),
            )
            await asyncio.wait_for(started.wait(), timeout=2.0)
            assert transport.state == 'DISPOSING'

            dispose_task = asyncio.create_task(transport.dispose())
            await asyncio.sleep(0.05)
            # dispose must still be waiting on the cleanup task.
            assert not dispose_task.done()

            release.set()
            await dispose_task
            assert transport.state == 'DISCONNECTED'
            assert transport._process is None
            assert transport._cleanup_task is None
        finally:
            _cleanup_wrapper(cli)

    @pytest.mark.asyncio
    async def test_dispose_waits_for_cleanup_after_state_flips_disconnected(self):
        # `_cleanup()` flips state to DISCONNECTED before awaiting
        # `process.wait()`. dispose() must still wait for that cleanup task
        # instead of short-circuiting and returning while teardown is in
        # flight.
        cli = _mock_cli_bin({'handshake': 'ok'})
        try:
            transport = AsyncHostTransport(cli, startup_timeout_ms=5_000)
            await transport.connect()
            process = transport._process
            assert process is not None

            wait_started = asyncio.Event()
            release = asyncio.Event()
            real_wait = process.wait

            async def slow_wait():
                wait_started.set()
                await release.wait()
                return await real_wait()

            process.wait = slow_wait  # type: ignore[assignment]

            transport._schedule_cleanup(
                SuperDocError('reader-overflow', code=HOST_PROTOCOL_ERROR),
            )
            cleanup_task = transport._cleanup_task
            assert cleanup_task is not None

            await asyncio.wait_for(wait_started.wait(), timeout=2.0)
            assert transport.state == 'DISCONNECTED'
            assert transport._process is None
            assert not cleanup_task.done()

            dispose_task = asyncio.create_task(transport.dispose())
            await asyncio.sleep(0.05)
            assert not dispose_task.done()

            release.set()
            await dispose_task
            assert transport.state == 'DISCONNECTED'
            assert transport._cleanup_task is None
            await process.wait()
            assert process.returncode is not None
        finally:
            _cleanup_wrapper(cli)

    @pytest.mark.asyncio
    async def test_ensure_connected_drains_in_flight_cleanup_before_spawn(self):
        # Round-3 regression: without this drain, `_start_host` reassigns
        # `self._process` while a stale `_cleanup` task is still scheduled;
        # the cleanup then kills the freshly-spawned process.
        cli = _mock_cli_bin({'handshake': 'ok'})
        try:
            transport = AsyncHostTransport(cli, startup_timeout_ms=5_000)
            await transport.connect()
            old_process = transport._process
            assert old_process is not None

            started = asyncio.Event()
            release = asyncio.Event()
            real_cleanup = transport._cleanup

            async def slow_cleanup(error):
                started.set()
                await release.wait()
                await real_cleanup(error)

            transport._cleanup = slow_cleanup  # type: ignore[assignment]

            transport._schedule_cleanup(
                SuperDocError('reader-overflow', code=HOST_PROTOCOL_ERROR),
            )
            await asyncio.wait_for(started.wait(), timeout=2.0)

            connect_task = asyncio.create_task(transport.connect())
            await asyncio.sleep(0.05)
            # connect() must be blocked on the in-flight cleanup, not racing
            # ahead to spawn a fresh process the cleanup would then kill.
            assert not connect_task.done()

            release.set()
            await connect_task
            new_process = transport._process
            assert new_process is not None
            assert new_process is not old_process
            # The fresh process must NOT have been killed by the stale cleanup.
            assert new_process.returncode is None
            assert transport.state == 'CONNECTED'
            await transport.dispose()
        finally:
            _cleanup_wrapper(cli)

    @pytest.mark.asyncio
    async def test_kill_and_reset_caller_cancellation_does_not_cancel_cleanup(self):
        # Round-3 regression: without `asyncio.shield`, cancelling the
        # awaiter of `_kill_and_reset` propagates into the cleanup task,
        # interrupting it mid-flight before `_process` is fully reaped and
        # leaving state wedged in DISPOSING.
        cli = _mock_cli_bin({'handshake': 'ok'})
        try:
            transport = AsyncHostTransport(cli, startup_timeout_ms=5_000)
            await transport.connect()

            started = asyncio.Event()
            release = asyncio.Event()
            real_cleanup = transport._cleanup

            async def slow_cleanup(error):
                started.set()
                try:
                    await release.wait()
                except asyncio.CancelledError:
                    # If shield works, this should NOT fire. Re-raise so the
                    # test's assertion catches the regression.
                    raise
                await real_cleanup(error)

            transport._cleanup = slow_cleanup  # type: ignore[assignment]

            kill_task = asyncio.create_task(transport._kill_and_reset())
            await asyncio.wait_for(started.wait(), timeout=2.0)

            kill_task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await kill_task

            # Cleanup must keep running despite kill_task being cancelled.
            assert transport._cleanup_task is not None
            assert not transport._cleanup_task.done()

            release.set()
            await transport._cleanup_task
            assert transport.state == 'DISCONNECTED'
            assert transport._process is None
            assert transport._cleanup_task is None
        finally:
            _cleanup_wrapper(cli)


class TestAsyncOverflowConcurrency:
    """Concurrency scenarios for the buffer-overflow path."""

    @pytest.mark.asyncio
    async def test_overflow_rejects_all_pending_invokes(self):
        # Codex/Opus round-3 gap: every pending future must be rejected with
        # HOST_PROTOCOL_ERROR — not just the one whose response overflowed.
        # A regression where _reject_all_pending only rejects pending[msg.id]
        # would silently leave concurrent callers hanging until watchdog.
        big_payload = 'x' * (200 * 1024)
        cli = _mock_cli_bin({
            'handshake': 'ok',
            'responses': [
                {'data': {'content': big_payload}},
                {'data': {'v': 2}},
                {'data': {'v': 3}},
            ],
        })
        try:
            transport = AsyncHostTransport(
                cli,
                startup_timeout_ms=5_000,
                stdout_buffer_limit_bytes=64 * 1024,
                watchdog_timeout_ms=10_000,
            )
            await transport.connect()
            tasks = [
                asyncio.ensure_future(transport.invoke(_TEST_OP, {'query': f'q{i}'}))
                for i in range(3)
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            assert all(isinstance(r, SuperDocError) for r in results), results
            assert all(r.code == HOST_PROTOCOL_ERROR for r in results)
            # Every error must carry the actionable hint, not just the first.
            assert all('stdout_buffer_limit_bytes' in str(r) for r in results)
            assert transport._pending == {}
            assert transport.state == 'DISCONNECTED'
            await transport.dispose()
        finally:
            _cleanup_wrapper(cli)

    @pytest.mark.asyncio
    async def test_reconnect_after_buffer_overflow(self):
        # Sync transport has test_reconnect_after_failure; async previously
        # only had reconnect-after-explicit-dispose. After reader-triggered
        # cleanup the transport must be reusable for a fresh invoke without
        # leaving _cleanup_task / _connecting / _process in a wedged state.
        cli1 = _mock_cli_bin({
            'handshake': 'ok',
            'responses': [{'data': {'content': 'x' * (200 * 1024)}}],
        })
        transport = None
        try:
            transport = AsyncHostTransport(
                cli1,
                startup_timeout_ms=5_000,
                stdout_buffer_limit_bytes=64 * 1024,
            )
            await transport.connect()
            with pytest.raises(SuperDocError) as exc_info:
                await transport.invoke(_TEST_OP, {'query': 'big'})
            assert exc_info.value.code == HOST_PROTOCOL_ERROR
            cleanup_task = transport._cleanup_task
            if cleanup_task is not None:
                await cleanup_task
            assert transport.state == 'DISCONNECTED'
            assert transport._cleanup_task is None
        finally:
            _cleanup_wrapper(cli1)

        cli2 = _mock_cli_bin({
            'handshake': 'ok',
            'responses': [{'data': {'v': 'reconnected'}}],
        })
        try:
            # Reuse the transport — point at a healthy host with default buffer.
            transport._cli_bin = cli2
            transport._stdout_buffer_limit_bytes = DEFAULT_STDOUT_BUFFER_LIMIT_BYTES
            result = await transport.invoke(_TEST_OP, {'query': 'again'})
            assert result == {'v': 'reconnected'}
            assert transport.state == 'CONNECTED'
            await transport.dispose()
        finally:
            _cleanup_wrapper(cli2)
