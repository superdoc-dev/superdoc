#!/usr/bin/env python3
"""Mock host process for transport tests.

Speaks JSON-RPC 2.0 over stdio. Behavior is configured via a JSON `scenario`
object passed as the first CLI argument (base64-encoded).

Scenario fields:
  handshake: "ok" | "bad_version" | "missing_features" | "invalid" | "timeout"
  responses: list of response configs for sequential cli.invoke calls:
    - {"data": ...}           → success response
    - {"error": {...}}        → JSON-RPC error response
    - {"delay_ms": N, ...}    → delay before responding
    - {"crash": true}         → exit immediately (simulates crash)
    - {"notification": {...}} → send a notification before the real response
    - {"malformed": true}     → send invalid JSON before the real response
    - {"partial": true, ...}  → write response in two chunks with a small delay
"""

from __future__ import annotations

import base64
import json
import sys
import time


def main() -> None:
    scenario_b64 = sys.argv[1] if len(sys.argv) > 1 else ''
    scenario = json.loads(base64.b64decode(scenario_b64)) if scenario_b64 else {}

    handshake_mode = scenario.get('handshake', 'ok')
    responses = list(scenario.get('responses', []))
    response_index = 0

    while True:
        raw = sys.stdin.readline()
        if not raw:
            break

        try:
            request = json.loads(raw.strip())
        except (json.JSONDecodeError, ValueError):
            continue

        request_id = request.get('id')
        method = request.get('method')

        if method == 'host.capabilities':
            if handshake_mode == 'ok':
                _send_response(request_id, {
                    'protocolVersion': '1.0',
                    'features': ['cli.invoke', 'host.shutdown', 'host.describe'],
                })
            elif handshake_mode == 'bad_version':
                _send_response(request_id, {
                    'protocolVersion': '2.0',
                    'features': ['cli.invoke', 'host.shutdown'],
                })
            elif handshake_mode == 'missing_features':
                _send_response(request_id, {
                    'protocolVersion': '1.0',
                    'features': ['host.describe'],
                })
            elif handshake_mode == 'invalid':
                _send_response(request_id, 'not-an-object')
            elif handshake_mode == 'timeout':
                # Just don't respond — let the transport timeout.
                time.sleep(30)
                sys.exit(0)
            continue

        if method == 'host.shutdown':
            _send_response(request_id, {})
            sys.exit(0)

        if method == 'cli.invoke':
            if response_index >= len(responses):
                _send_response(request_id, {'data': None})
                continue

            config = responses[response_index]
            response_index += 1

            if config.get('crash'):
                sys.exit(1)

            delay_ms = config.get('delay_ms', 0)
            if delay_ms > 0:
                time.sleep(delay_ms / 1000)

            if config.get('notification'):
                notif = {
                    'jsonrpc': '2.0',
                    'method': config['notification'].get('method', 'event.test'),
                    'params': config['notification'].get('params', {}),
                }
                sys.stdout.write(json.dumps(notif) + '\n')
                sys.stdout.flush()

            if config.get('malformed'):
                sys.stdout.write('this is not json{{{\n')
                sys.stdout.flush()

            if 'error' in config:
                _send_error(request_id, config['error'])
            elif config.get('partial'):
                # Write response in two chunks to test line-buffering.
                result = config.get('data', None)
                full = json.dumps({
                    'jsonrpc': '2.0', 'id': request_id, 'result': {'data': result},
                })
                mid = len(full) // 2
                sys.stdout.write(full[:mid])
                sys.stdout.flush()
                time.sleep(0.05)
                sys.stdout.write(full[mid:] + '\n')
                sys.stdout.flush()
            else:
                _send_response(request_id, {'data': config.get('data', None)})
            continue

        # Unknown method — respond with error.
        _send_error(request_id, {'code': -32601, 'message': f'Method not found: {method}'})


def _send_response(request_id: int, result) -> None:
    msg = json.dumps({'jsonrpc': '2.0', 'id': request_id, 'result': result})
    sys.stdout.write(msg + '\n')
    sys.stdout.flush()


def _send_error(request_id: int, error: dict) -> None:
    msg = json.dumps({'jsonrpc': '2.0', 'id': request_id, 'error': error})
    sys.stdout.write(msg + '\n')
    sys.stdout.flush()


if __name__ == '__main__':
    main()
