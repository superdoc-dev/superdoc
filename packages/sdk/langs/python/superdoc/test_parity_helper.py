#!/usr/bin/env python3
"""
Parity test helper — reads JSON commands from stdin, executes Python SDK
functions, and writes JSON results to stdout.

Used by cross-lang-parity.test.ts to compare Node and Python behavior.
"""

from __future__ import annotations

import json
import sys
import traceback


def main() -> None:
    raw = sys.stdin.read()
    command = json.loads(raw)
    action = command.get('action')

    try:
        if action == 'chooseTools':
            from superdoc.tools_api import choose_tools
            result = choose_tools(command['input'])
            # Strip non-comparable fields (provider tools depend on JSON ordering)
            result.pop('tools', None)
            print(json.dumps({'ok': True, 'result': result}))

        elif action == 'resolveIntentDispatch':
            from superdoc.tools.intent_dispatch_generated import dispatch_intent_tool
            tool_name = command['toolName']
            args = command.get('args', {})

            # Use a mock execute that captures the operationId
            captured = {}
            def mock_execute(operation_id, input_args):
                captured['operationId'] = operation_id
                return None

            try:
                dispatch_intent_tool(tool_name, args, mock_execute)
                print(json.dumps({'ok': True, 'result': captured}))
            except Exception as exc:
                print(json.dumps({'ok': True, 'result': {'error': str(exc)}}))

        elif action == 'assertCollabAccepted':
            # Verify collab params pass through to the runtime without
            # SDK-level rejection.
            from superdoc.protocol import build_operation_argv
            from superdoc.generated.contract import OPERATION_INDEX

            operation_id = command['operationId']
            params = command.get('params', {})
            operation = OPERATION_INDEX[operation_id]
            try:
                argv = build_operation_argv(operation, params)
                argv_str = ' '.join(argv)
                collab_params_present = any(
                    str(params[key]) in argv_str
                    for key in ('collabUrl', 'collabDocumentId')
                    if params.get(key) is not None
                )
                print(json.dumps({'ok': True, 'result': {'accepted': True, 'collabParamsPresent': collab_params_present}}))
            except Exception as exc:
                code = getattr(exc, 'code', None) or 'UNKNOWN'
                print(json.dumps({'ok': True, 'result': {'accepted': False, 'code': code, 'message': str(exc)}}))

        else:
            print(json.dumps({'ok': False, 'error': f'Unknown action: {action}'}))

    except Exception:
        print(json.dumps({'ok': False, 'error': traceback.format_exc()}))


if __name__ == '__main__':
    main()
