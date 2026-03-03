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
from superdoc.transport import AsyncHostTransport, SyncHostTransport

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
            with pytest.raises(SuperDocError) as exc_info:
                await transport.invoke(_TEST_OP, {'query': 'test'})
            assert exc_info.value.code in (HOST_DISCONNECTED, HOST_TIMEOUT)
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
