from __future__ import annotations

import asyncio
import hashlib
import json
import os
import subprocess
from typing import Any, Dict, Literal, Mapping, Optional, Tuple

from .embedded_cli import resolve_embedded_cli_path
from .errors import SuperDocError
from .generated.contract import CONTRACT, OPERATION_INDEX

ChangeMode = Literal['direct', 'tracked']


def _resolve_invocation(cli_bin: str) -> Tuple[str, list]:
    lower = cli_bin.lower()
    if lower.endswith('.js'):
        return 'node', [cli_bin]
    if lower.endswith('.ts'):
        return 'bun', [cli_bin]
    return cli_bin, []


def _encode_param(args: list, spec: Dict[str, Any], value: Any) -> None:
    if value is None:
        if spec.get('required'):
            raise SuperDocError(f"Missing required parameter: {spec['name']}", code='INVALID_ARGUMENT')
        return

    kind = spec['kind']
    param_type = spec['type']

    if kind == 'doc':
        args.append(str(value))
        return

    flag = f"--{spec.get('flag') or spec['name']}"

    if param_type == 'boolean':
        # Explicit true/false — matches current CLI operation-executor.ts.
        args.extend([flag, 'true' if value else 'false'])
        return

    if param_type == 'string[]':
        if not isinstance(value, list):
            raise SuperDocError(f"Parameter {spec['name']} must be a list.", code='INVALID_ARGUMENT')
        for item in value:
            args.extend([flag, str(item)])
        return

    if param_type == 'json':
        args.extend([flag, json.dumps(value)])
        return

    args.extend([flag, str(value)])


def _normalize_default_change_mode(default_change_mode: Optional[str]) -> Optional[ChangeMode]:
    if default_change_mode is None:
        return None
    if default_change_mode in ('direct', 'tracked'):
        return default_change_mode
    raise SuperDocError(
        'default_change_mode must be "direct" or "tracked".',
        code='INVALID_ARGUMENT',
        details={'defaultChangeMode': default_change_mode},
    )


def _apply_default_change_mode(
    operation: Dict[str, Any], payload: Dict[str, Any], default_change_mode: Optional[ChangeMode]
) -> Dict[str, Any]:
    if default_change_mode is None:
        return payload

    if payload.get('changeMode') is not None:
        return payload

    supports_change_mode = any(spec.get('name') == 'changeMode' for spec in operation.get('params', []))
    if not supports_change_mode:
        return payload

    return {**payload, 'changeMode': default_change_mode}


def _parse_envelope(stdout: str, stderr: str) -> Dict[str, Any]:
    payload = stdout or stderr
    if not payload.strip():
        raise SuperDocError('CLI returned no JSON envelope.', code='COMMAND_FAILED', details={'stdout': stdout, 'stderr': stderr})

    attempts: list = [payload.strip()]
    lines = payload.splitlines()
    for index, line in enumerate(lines):
        if not line.strip().startswith('{'):
            continue
        attempts.append('\n'.join(lines[index:]).strip())

    for candidate in attempts:
        if not candidate:
            continue
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict) and 'ok' in parsed:
                return parsed
        except Exception:
            continue

    raise SuperDocError(
        'CLI returned invalid JSON envelope.',
        code='JSON_PARSE_ERROR',
        details={'stdout': stdout, 'stderr': stderr, 'message': 'Failed to parse envelope JSON.'},
    )


# Explicit exception set — these ops have sessionId but are NOT auto-targeted.
# doc.open: requires explicit doc+session coordination, never auto-resolves session.
_SESSION_BOUND_EXCEPTIONS = {'doc.open'}


def _derive_session_bound_ids():
    ops = CONTRACT.get('operations', {})
    return {
        op_id for op_id, op in ops.items()
        if op_id not in _SESSION_BOUND_EXCEPTIONS
        and any(
            isinstance(p, dict) and p.get('name') == 'sessionId'
            for p in op.get('params', [])
        )
    }


_SESSION_BOUND_OPERATION_IDS = _derive_session_bound_ids()


def _normalized_version(version: str) -> Optional[Tuple[int, int, int]]:
    if not isinstance(version, str):
        return None

    core = version.split('-', 1)[0]
    parts = core.split('.')
    if len(parts) < 3:
        return None

    try:
        return int(parts[0]), int(parts[1]), int(parts[2])
    except Exception:
        return None


def _ensure_cli_version_compatible(envelope: Dict[str, Any]) -> None:
    cli = CONTRACT.get('cli', {})
    min_version = cli.get('minVersion')
    if not isinstance(min_version, str):
        return

    meta = envelope.get('meta')
    if not isinstance(meta, dict):
        return

    cli_version = meta.get('version')
    if not isinstance(cli_version, str):
        return
    if cli_version == '0.0.0':
        return

    parsed_cli = _normalized_version(cli_version)
    parsed_min = _normalized_version(min_version)
    if not parsed_cli or not parsed_min:
        return

    if parsed_cli < parsed_min:
        raise SuperDocError(
            f"CLI version {cli_version} is older than minimum required {min_version}.",
            code='CLI_VERSION_UNSUPPORTED',
            details={'cliVersion': cli_version, 'minVersion': min_version},
        )


def _get_state_root(env: Mapping[str, str]) -> str:
    override = env.get('SUPERDOC_CLI_STATE_DIR') or os.environ.get('SUPERDOC_CLI_STATE_DIR')
    if override:
        return os.path.abspath(override)
    return os.path.join(os.path.expanduser('~'), '.superdoc-cli', 'state', 'v1')


def _read_text(path: str) -> Optional[str]:
    try:
        with open(path, 'r', encoding='utf-8') as handle:
            return handle.read()
    except Exception:
        return None


def _read_json(path: str) -> Optional[Dict[str, Any]]:
    raw = _read_text(path)
    if raw is None:
        return None

    try:
        parsed = json.loads(raw)
    except Exception:
        return None

    if not isinstance(parsed, dict):
        return None
    return parsed


def _resolve_active_session_id(env: Mapping[str, str]) -> Optional[str]:
    project_root = os.path.abspath(os.getcwd())
    project_hash = hashlib.sha256(project_root.encode('utf-8')).hexdigest()[:16]
    active_path = os.path.join(_get_state_root(env), 'projects', project_hash, 'active-session')
    raw = _read_text(active_path)
    if not raw:
        return None
    session_id = raw.strip()
    return session_id or None


def _is_collab_session(session_id: str, env: Mapping[str, str]) -> bool:
    metadata_path = os.path.join(_get_state_root(env), 'contexts', session_id, 'metadata.json')
    metadata = _read_json(metadata_path)
    if not metadata:
        return False
    return metadata.get('sessionType') == 'collab'


def _target_session_id(operation_id: str, params: Dict[str, Any], env: Mapping[str, str]) -> Optional[str]:
    if operation_id == 'doc.session.close':
        value = params.get('sessionId')
        if isinstance(value, str) and value:
            return value
        return None

    if operation_id not in _SESSION_BOUND_OPERATION_IDS:
        return None

    if params.get('doc') is not None:
        return None

    value = params.get('sessionId')
    if isinstance(value, str) and value:
        return value
    return _resolve_active_session_id(env)


def _reject_python_collaboration(operation_id: str, params: Dict[str, Any], env: Mapping[str, str]) -> None:
    if operation_id == 'doc.open':
        for field in ('collaboration', 'collabUrl', 'collabDocumentId'):
            if params.get(field) is not None:
                raise SuperDocError(
                    'Collaboration is not supported in the Python SDK.',
                    code='NOT_SUPPORTED',
                    details={'operation': operation_id, 'field': field},
                )
        return

    session_id = _target_session_id(operation_id, params, env)
    if not session_id:
        return

    if _is_collab_session(session_id, env):
        raise SuperDocError(
            'Collaboration sessions are not supported in the Python SDK.',
            code='NOT_SUPPORTED',
            details={'operation': operation_id, 'sessionId': session_id},
        )


class SuperDocSyncRuntime:
    def __init__(self, *, env: Optional[Mapping[str, str]] = None, default_change_mode: Optional[str] = None):
        self._env = dict(env or {})
        self._cli_bin = self._env.get('SUPERDOC_CLI_BIN') or os.environ.get('SUPERDOC_CLI_BIN') or resolve_embedded_cli_path()
        self._default_change_mode = _normalize_default_change_mode(default_change_mode)

    def invoke(self, operation_id: str, params: Optional[Dict[str, Any]] = None, *, timeout_ms: Optional[int] = None, stdin_bytes: Optional[bytes] = None) -> Dict[str, Any]:
        operation = OPERATION_INDEX[operation_id]
        command, prefix = _resolve_invocation(self._cli_bin)

        args: list = [*prefix, *operation['commandTokens']]
        payload = _apply_default_change_mode(operation, params or {}, self._default_change_mode)
        _reject_python_collaboration(operation_id, payload, self._env)
        for spec in operation['params']:
            _encode_param(args, spec, payload.get(spec['name']))

        if timeout_ms is not None:
            args.extend(['--timeout-ms', str(timeout_ms)])
        args.extend(['--output', 'json'])

        completed = subprocess.run(
            [command, *args],
            input=stdin_bytes,
            capture_output=True,
            env={**os.environ, **self._env},
            check=False,
        )

        envelope = _parse_envelope(completed.stdout.decode('utf-8', errors='replace'), completed.stderr.decode('utf-8', errors='replace'))
        _ensure_cli_version_compatible(envelope)
        if envelope.get('ok'):
            return envelope['data']

        error = envelope.get('error', {})
        raise SuperDocError(
            error.get('message', 'Unknown CLI error'),
            code=error.get('code', 'COMMAND_FAILED'),
            details=error.get('details'),
            exit_code=completed.returncode,
        )


class SuperDocAsyncRuntime:
    def __init__(self, *, env: Optional[Mapping[str, str]] = None, default_change_mode: Optional[str] = None):
        self._env = dict(env or {})
        self._cli_bin = self._env.get('SUPERDOC_CLI_BIN') or os.environ.get('SUPERDOC_CLI_BIN') or resolve_embedded_cli_path()
        self._default_change_mode = _normalize_default_change_mode(default_change_mode)

    async def invoke(self, operation_id: str, params: Optional[Dict[str, Any]] = None, *, timeout_ms: Optional[int] = None, stdin_bytes: Optional[bytes] = None) -> Dict[str, Any]:
        operation = OPERATION_INDEX[operation_id]
        command, prefix = _resolve_invocation(self._cli_bin)

        args: list = [*prefix, *operation['commandTokens']]
        payload = _apply_default_change_mode(operation, params or {}, self._default_change_mode)
        _reject_python_collaboration(operation_id, payload, self._env)
        for spec in operation['params']:
            _encode_param(args, spec, payload.get(spec['name']))

        if timeout_ms is not None:
            args.extend(['--timeout-ms', str(timeout_ms)])
        args.extend(['--output', 'json'])

        process = await asyncio.create_subprocess_exec(
            command,
            *args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ, **self._env},
        )

        stdout, stderr = await process.communicate(stdin_bytes)
        envelope = _parse_envelope(stdout.decode('utf-8', errors='replace'), stderr.decode('utf-8', errors='replace'))
        _ensure_cli_version_compatible(envelope)
        if envelope.get('ok'):
            return envelope['data']

        error = envelope.get('error', {})
        raise SuperDocError(
            error.get('message', 'Unknown CLI error'),
            code=error.get('code', 'COMMAND_FAILED'),
            details=error.get('details'),
            exit_code=process.returncode,
        )
