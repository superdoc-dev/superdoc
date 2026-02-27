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

        elif action == 'isSessionBound':
            from superdoc.runtime import _SESSION_BOUND_OPERATION_IDS
            operation_id = command['operationId']
            result = operation_id in _SESSION_BOUND_OPERATION_IDS
            print(json.dumps({'ok': True, 'result': result}))

        elif action == 'assertCollabRejection':
            import os
            import tempfile
            from superdoc.runtime import _reject_python_collaboration
            from superdoc.errors import SuperDocError

            operation_id = command['operationId']
            session_id = command['sessionId']

            # Create a temp state dir with a collab metadata.json
            with tempfile.TemporaryDirectory() as tmpdir:
                ctx_dir = os.path.join(tmpdir, 'contexts', session_id)
                os.makedirs(ctx_dir, exist_ok=True)
                meta_path = os.path.join(ctx_dir, 'metadata.json')
                with open(meta_path, 'w') as f:
                    json.dump({'sessionType': 'collab'}, f)

                env = {'SUPERDOC_CLI_STATE_DIR': tmpdir}
                params = {'sessionId': session_id}
                try:
                    _reject_python_collaboration(operation_id, params, env)
                    print(json.dumps({'ok': True, 'result': {'rejected': False}}))
                except SuperDocError as exc:
                    print(json.dumps({'ok': True, 'result': {'rejected': True, 'code': exc.code}}))

        else:
            print(json.dumps({'ok': False, 'error': f'Unknown action: {action}'}))

    except Exception:
        print(json.dumps({'ok': False, 'error': traceback.format_exc()}))


if __name__ == '__main__':
    main()
