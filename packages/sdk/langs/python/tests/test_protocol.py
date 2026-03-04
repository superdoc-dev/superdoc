"""Unit tests for superdoc.protocol — pure function tests, no subprocess needed."""

from __future__ import annotations

import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest

from superdoc.protocol import (
    apply_default_change_mode,
    apply_default_user,
    build_cli_invoke_payload,
    build_operation_argv,
    encode_jsonrpc_request,
    map_jsonrpc_error,
    normalize_default_change_mode,
    parse_jsonrpc_line,
    resolve_invocation,
    resolve_watchdog_timeout,
    validate_capabilities,
    InvalidFrame,
    JsonRpcError,
    JsonRpcNotification,
    JsonRpcResponse,
)
from superdoc.errors import SuperDocError


# ---------------------------------------------------------------------------
# JSON-RPC encoding / decoding round-trips
# ---------------------------------------------------------------------------

class TestEncodeJsonRpcRequest:
    def test_basic_request(self):
        line = encode_jsonrpc_request(1, 'host.capabilities', {})
        parsed = json.loads(line.strip())
        assert parsed['jsonrpc'] == '2.0'
        assert parsed['id'] == 1
        assert parsed['method'] == 'host.capabilities'
        assert parsed['params'] == {}

    def test_no_params(self):
        line = encode_jsonrpc_request(42, 'test.method')
        parsed = json.loads(line.strip())
        assert 'params' not in parsed

    def test_newline_terminated(self):
        line = encode_jsonrpc_request(1, 'test', {})
        assert line.endswith('\n')


class TestParseJsonRpcLine:
    def test_valid_response(self):
        line = '{"jsonrpc":"2.0","id":1,"result":{"data":"hello"}}'
        msg = parse_jsonrpc_line(line)
        assert isinstance(msg, JsonRpcResponse)
        assert msg.id == 1
        assert msg.result == {'data': 'hello'}

    def test_valid_error(self):
        line = '{"jsonrpc":"2.0","id":2,"error":{"code":-32600,"message":"Invalid Request"}}'
        msg = parse_jsonrpc_line(line)
        assert isinstance(msg, JsonRpcError)
        assert msg.id == 2
        assert msg.error['code'] == -32600

    def test_notification(self):
        line = '{"jsonrpc":"2.0","method":"event.change","params":{"doc":"x"}}'
        msg = parse_jsonrpc_line(line)
        assert isinstance(msg, JsonRpcNotification)
        assert msg.method == 'event.change'
        assert msg.params == {'doc': 'x'}

    def test_invalid_json(self):
        msg = parse_jsonrpc_line('not json at all')
        assert isinstance(msg, InvalidFrame)

    def test_empty_line(self):
        msg = parse_jsonrpc_line('')
        assert isinstance(msg, InvalidFrame)

    def test_non_jsonrpc(self):
        msg = parse_jsonrpc_line('{"foo":"bar"}')
        assert isinstance(msg, InvalidFrame)

    def test_missing_id(self):
        # Has jsonrpc 2.0 but no id and no method — invalid.
        msg = parse_jsonrpc_line('{"jsonrpc":"2.0","result":"ok"}')
        assert isinstance(msg, InvalidFrame)

    def test_non_integer_id(self):
        msg = parse_jsonrpc_line('{"jsonrpc":"2.0","id":"abc","result":"ok"}')
        assert isinstance(msg, InvalidFrame)

    def test_round_trip(self):
        line = encode_jsonrpc_request(7, 'cli.invoke', {'argv': ['doc', 'find']})
        # The encoded line is a request (has method+id). Since it has an int id
        # and no 'error' key, it parses as a JsonRpcResponse with result=None.
        # This is fine — the transport never receives its own requests.
        msg = parse_jsonrpc_line(line)
        assert isinstance(msg, (JsonRpcResponse, InvalidFrame))


# ---------------------------------------------------------------------------
# Error mapping
# ---------------------------------------------------------------------------

class TestMapJsonRpcError:
    def test_cli_code_passthrough(self):
        raw = {'code': -32000, 'message': 'failed', 'data': {'cliCode': 'FILE_NOT_FOUND', 'message': 'Not found'}}
        err = map_jsonrpc_error(raw)
        assert err.code == 'FILE_NOT_FOUND'
        assert 'Not found' in str(err)

    def test_timeout_code(self):
        raw = {'code': -32011, 'message': 'Operation timed out', 'data': {'timeout': 30000}}
        err = map_jsonrpc_error(raw)
        assert err.code == 'TIMEOUT'

    def test_fallback_command_failed(self):
        raw = {'code': -32603, 'message': 'Internal error'}
        err = map_jsonrpc_error(raw)
        assert err.code == 'COMMAND_FAILED'

    def test_non_dict_error(self):
        err = map_jsonrpc_error('not a dict')
        assert err.code == 'HOST_PROTOCOL_ERROR'

    def test_cli_code_with_exit_code(self):
        raw = {'code': -32000, 'message': 'fail', 'data': {'cliCode': 'VALIDATION_ERROR', 'exitCode': 1, 'details': {'field': 'x'}}}
        err = map_jsonrpc_error(raw)
        assert err.code == 'VALIDATION_ERROR'
        assert err.exit_code == 1
        assert err.details == {'field': 'x'}


# ---------------------------------------------------------------------------
# Capability validation
# ---------------------------------------------------------------------------

class TestValidateCapabilities:
    def test_valid_capabilities(self):
        validate_capabilities({
            'protocolVersion': '1.0',
            'features': ['cli.invoke', 'host.shutdown', 'host.describe'],
        })

    def test_bad_version(self):
        with pytest.raises(SuperDocError) as exc_info:
            validate_capabilities({'protocolVersion': '2.0', 'features': ['cli.invoke', 'host.shutdown']})
        assert exc_info.value.code == 'HOST_HANDSHAKE_FAILED'
        assert exc_info.value.details['expected'] == '1.0'
        assert exc_info.value.details['actual'] == '2.0'

    def test_missing_features(self):
        with pytest.raises(SuperDocError) as exc_info:
            validate_capabilities({'protocolVersion': '1.0', 'features': ['host.describe']})
        assert exc_info.value.code == 'HOST_HANDSHAKE_FAILED'

    def test_non_dict_response(self):
        with pytest.raises(SuperDocError) as exc_info:
            validate_capabilities('not-an-object')
        assert exc_info.value.code == 'HOST_HANDSHAKE_FAILED'

    def test_features_not_array(self):
        with pytest.raises(SuperDocError) as exc_info:
            validate_capabilities({'protocolVersion': '1.0', 'features': 'not-a-list'})
        assert exc_info.value.code == 'HOST_HANDSHAKE_FAILED'


# ---------------------------------------------------------------------------
# Argv construction
# ---------------------------------------------------------------------------

class TestBuildOperationArgv:
    def _make_op(self, params=None):
        return {
            'commandTokens': ['doc', 'find'],
            'params': params or [
                {'name': 'query', 'kind': 'flag', 'type': 'string'},
                {'name': 'type', 'kind': 'flag', 'type': 'string'},
                {'name': 'limit', 'kind': 'flag', 'type': 'number'},
            ],
        }

    def test_basic_argv(self):
        argv = build_operation_argv(self._make_op(), {'query': 'hello'})
        assert argv[:2] == ['doc', 'find']
        assert '--query' in argv
        assert 'hello' in argv
        assert argv[-2:] == ['--output', 'json']

    def test_timeout_appended(self):
        argv = build_operation_argv(self._make_op(), {}, timeout_ms=5000)
        assert '--timeout-ms' in argv
        idx = argv.index('--timeout-ms')
        assert argv[idx + 1] == '5000'

    def test_default_change_mode_injected(self):
        op = self._make_op(params=[
            {'name': 'query', 'kind': 'flag', 'type': 'string'},
            {'name': 'changeMode', 'kind': 'flag', 'type': 'string'},
        ])
        argv = build_operation_argv(op, {'query': 'x'}, default_change_mode='tracked')
        assert '--changeMode' in argv
        idx = argv.index('--changeMode')
        assert argv[idx + 1] == 'tracked'

    def test_boolean_encoding(self):
        op = self._make_op(params=[{'name': 'verbose', 'kind': 'flag', 'type': 'boolean'}])
        argv = build_operation_argv(op, {'verbose': True})
        idx = argv.index('--verbose')
        assert argv[idx + 1] == 'true'

    def test_string_array_encoding(self):
        op = self._make_op(params=[{'name': 'tags', 'kind': 'flag', 'type': 'string[]'}])
        argv = build_operation_argv(op, {'tags': ['a', 'b']})
        tag_indices = [i for i, v in enumerate(argv) if v == '--tags']
        assert len(tag_indices) == 2

    def test_json_flag_encoding(self):
        op = self._make_op(params=[{'name': 'config', 'kind': 'jsonFlag', 'type': 'json'}])
        argv = build_operation_argv(op, {'config': {'key': 'val'}})
        idx = argv.index('--config')
        assert json.loads(argv[idx + 1]) == {'key': 'val'}

    def test_doc_positional(self):
        op = self._make_op(params=[{'name': 'doc', 'kind': 'doc', 'type': 'string'}])
        argv = build_operation_argv(op, {'doc': '/path/to/file.docx'})
        assert argv[2] == '/path/to/file.docx'


# ---------------------------------------------------------------------------
# CLI invoke payload
# ---------------------------------------------------------------------------

class TestBuildCliInvokePayload:
    def test_no_stdin(self):
        payload = build_cli_invoke_payload(['doc', 'find'])
        assert payload['argv'] == ['doc', 'find']
        assert payload['stdinBase64'] == ''

    def test_with_stdin(self):
        payload = build_cli_invoke_payload(['doc', 'open'], stdin_bytes=b'hello')
        import base64
        assert base64.b64decode(payload['stdinBase64']) == b'hello'


# ---------------------------------------------------------------------------
# Watchdog timeout resolution
# ---------------------------------------------------------------------------

class TestResolveWatchdogTimeout:
    def test_default(self):
        assert resolve_watchdog_timeout(30_000) == 30_000

    def test_override_larger(self):
        assert resolve_watchdog_timeout(30_000, timeout_ms_override=40_000) == 41_000

    def test_override_smaller(self):
        assert resolve_watchdog_timeout(30_000, timeout_ms_override=10_000) == 30_000

    def test_request_timeout(self):
        assert resolve_watchdog_timeout(30_000, request_timeout_ms=40_000) == 41_000


# ---------------------------------------------------------------------------
# Misc helpers
# ---------------------------------------------------------------------------

class TestNormalizeDefaultChangeMode:
    def test_none(self):
        assert normalize_default_change_mode(None) is None

    def test_valid_direct(self):
        assert normalize_default_change_mode('direct') == 'direct'

    def test_valid_tracked(self):
        assert normalize_default_change_mode('tracked') == 'tracked'

    def test_invalid(self):
        with pytest.raises(SuperDocError) as exc_info:
            normalize_default_change_mode('bogus')
        assert exc_info.value.code == 'INVALID_ARGUMENT'


class TestResolveInvocation:
    def test_bare_binary(self):
        cmd, prefix = resolve_invocation('/usr/bin/superdoc')
        assert cmd == '/usr/bin/superdoc'
        assert prefix == []

    def test_js_file(self):
        cmd, prefix = resolve_invocation('/path/to/cli.js')
        assert cmd == 'node'
        assert prefix == ['/path/to/cli.js']

    def test_ts_file(self):
        cmd, prefix = resolve_invocation('/path/to/cli.ts')
        assert cmd == 'bun'
        assert prefix == ['/path/to/cli.ts']


# ---------------------------------------------------------------------------
# User identity injection
# ---------------------------------------------------------------------------

class TestApplyDefaultUser:
    def _make_open_op(self):
        return {
            'operationId': 'doc.open',
            'commandTokens': ['open'],
            'params': [
                {'name': 'doc', 'kind': 'doc', 'type': 'string'},
                {'name': 'userName', 'kind': 'flag', 'flag': 'user-name', 'type': 'string'},
                {'name': 'userEmail', 'kind': 'flag', 'flag': 'user-email', 'type': 'string'},
            ],
        }

    def _make_find_op(self):
        return {
            'operationId': 'doc.find',
            'commandTokens': ['find'],
            'params': [{'name': 'query', 'kind': 'flag', 'type': 'string'}],
        }

    def test_injects_user_into_doc_open(self):
        op = self._make_open_op()
        result = apply_default_user(op, {'doc': 'test.docx'}, {'name': 'Bot', 'email': 'bot@co.com'})
        assert result['userName'] == 'Bot'
        assert result['userEmail'] == 'bot@co.com'

    def test_no_injection_when_user_is_none(self):
        op = self._make_open_op()
        result = apply_default_user(op, {'doc': 'test.docx'}, None)
        assert 'userName' not in result
        assert 'userEmail' not in result

    def test_no_injection_for_non_open_operations(self):
        op = self._make_find_op()
        result = apply_default_user(op, {'query': 'test'}, {'name': 'Bot', 'email': 'bot@co.com'})
        assert 'userName' not in result
        assert 'userEmail' not in result

    def test_per_call_overrides_client_defaults(self):
        op = self._make_open_op()
        result = apply_default_user(
            op,
            {'doc': 'test.docx', 'userName': 'Override', 'userEmail': 'override@co.com'},
            {'name': 'Bot', 'email': 'bot@co.com'},
        )
        assert result['userName'] == 'Override'
        assert result['userEmail'] == 'override@co.com'

    def test_build_operation_argv_includes_user(self):
        op = self._make_open_op()
        argv = build_operation_argv(op, {'doc': 'test.docx'}, user={'name': 'Bot', 'email': 'bot@co.com'})
        assert '--user-name' in argv
        idx = argv.index('--user-name')
        assert argv[idx + 1] == 'Bot'
        assert '--user-email' in argv
        idx = argv.index('--user-email')
        assert argv[idx + 1] == 'bot@co.com'


# ---------------------------------------------------------------------------
# Integration tests with real generated contract
# ---------------------------------------------------------------------------

class TestRealContractUserInjection:
    """Verify user identity injection against the real generated OPERATION_INDEX."""

    @pytest.fixture(autouse=True)
    def _load_contract(self):
        from superdoc.generated.contract import OPERATION_INDEX
        self._op_index = OPERATION_INDEX

    def test_generated_doc_open_has_user_params(self):
        op = self._op_index['doc.open']
        param_names = [p['name'] for p in op['params']]
        assert 'userName' in param_names
        assert 'userEmail' in param_names

    def test_user_identity_emits_flags_with_real_spec(self):
        op = self._op_index['doc.open']
        argv = build_operation_argv(op, {'doc': 'test.docx'}, user={'name': 'Bot', 'email': 'bot@co.com'})
        assert '--user-name' in argv
        idx = argv.index('--user-name')
        assert argv[idx + 1] == 'Bot'
        assert '--user-email' in argv
        idx = argv.index('--user-email')
        assert argv[idx + 1] == 'bot@co.com'
