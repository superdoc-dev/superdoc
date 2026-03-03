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

        elif action == 'validateDispatchArgs':
            from superdoc.tools_api import _validate_dispatch_args
            try:
                _validate_dispatch_args(command['operationId'], command['args'])
                print(json.dumps({'ok': True, 'result': 'passed'}))
            except Exception as exc:
                code = getattr(exc, 'code', None) or 'UNKNOWN'
                print(json.dumps({'ok': True, 'result': {'rejected': True, 'code': code, 'message': str(exc)}}))

        elif action == 'resolveToolOperation':
            from superdoc.tools_api import resolve_tool_operation
            result = resolve_tool_operation(command['toolName'])
            print(json.dumps({'ok': True, 'result': result}))

        elif action == 'inferDocumentFeatures':
            from superdoc.tools_api import infer_document_features
            result = infer_document_features(command['infoResult'])
            print(json.dumps({'ok': True, 'result': result}))

        elif action == 'assertCollabAccepted':
            # Verify collab params pass through to the runtime without
            # SDK-level rejection. We build the argv from the operation spec
            # to confirm nothing throws.
            from superdoc.protocol import build_operation_argv
            from superdoc.generated.contract import OPERATION_INDEX

            operation_id = command['operationId']
            params = command.get('params', {})
            operation = OPERATION_INDEX[operation_id]
            try:
                argv = build_operation_argv(operation, params)
                # Verify collab param values survived into argv.
                # Flag names are kebab-case (--collab-url), so check values.
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
