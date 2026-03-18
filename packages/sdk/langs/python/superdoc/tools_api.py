from __future__ import annotations

import inspect
import json
import re
from importlib import resources
from typing import Any, Dict, List, Literal, Optional, TypedDict, cast

from .errors import SuperDocError
from .tools.intent_dispatch_generated import dispatch_intent_tool

ToolProvider = Literal['openai', 'anthropic', 'vercel', 'generic']


class ToolChooserInput(TypedDict, total=False):
    provider: ToolProvider


PROVIDER_FILE: Dict[ToolProvider, str] = {
    'openai': 'tools.openai.json',
    'anthropic': 'tools.anthropic.json',
    'vercel': 'tools.vercel.json',
    'generic': 'tools.generic.json',
}


def _read_json_asset(name: str) -> Dict[str, Any]:
    resource = resources.files('superdoc').joinpath('tools', name)
    try:
        raw = resource.read_text(encoding='utf-8')
    except FileNotFoundError as error:
        raise SuperDocError(
            'Unable to load packaged tool artifact.',
            code='TOOLS_ASSET_NOT_FOUND',
            details={'file': name},
        ) from error
    except Exception as error:
        raise SuperDocError(
            'Unable to read packaged tool artifact.',
            code='TOOLS_ASSET_NOT_FOUND',
            details={'file': name, 'message': str(error)},
        ) from error

    try:
        parsed = json.loads(raw)
    except Exception as error:
        raise SuperDocError(
            'Packaged tool artifact is invalid JSON.',
            code='TOOLS_ASSET_INVALID',
            details={'file': name, 'message': str(error)},
        ) from error

    if not isinstance(parsed, dict):
        raise SuperDocError(
            'Packaged tool artifact root must be an object.',
            code='TOOLS_ASSET_INVALID',
            details={'file': name},
        )

    return cast(Dict[str, Any], parsed)


def get_tool_catalog() -> Dict[str, Any]:
    return _read_json_asset('catalog.json')


def list_tools(provider: ToolProvider) -> List[Dict[str, Any]]:
    bundle = _read_json_asset(PROVIDER_FILE[provider])
    tools = bundle.get('tools')
    if not isinstance(tools, list):
        raise SuperDocError(
            'Tool provider bundle is missing tools array.',
            code='TOOLS_ASSET_INVALID',
            details={'provider': provider},
        )
    return cast(List[Dict[str, Any]], tools)


def choose_tools(input: ToolChooserInput) -> Dict[str, Any]:
    """Select all intent tools for a specific provider.

    Returns all intent tools in the requested provider format.

    Example::

        result = choose_tools({'provider': 'openai'})
    """
    provider = input.get('provider')
    if provider not in ('openai', 'anthropic', 'vercel', 'generic'):
        raise SuperDocError('provider is required.', code='INVALID_ARGUMENT', details={'provider': provider})

    bundle = _read_json_asset(PROVIDER_FILE[provider])
    tools = bundle.get('tools') if isinstance(bundle.get('tools'), list) else []

    return {
        'tools': tools,
        'meta': {
            'provider': provider,
            'toolCount': len(tools),
        },
    }


def _resolve_doc_method(client: Any, operation_id: str) -> Any:
    doc = getattr(client, 'doc', None)
    if doc is None:
        raise SuperDocError('Client has no doc API.', code='TOOL_DISPATCH_NOT_FOUND', details={'operationId': operation_id})

    def _snake_case(token: str) -> str:
        token = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1_\2', token)
        token = re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', token)
        return token.replace('-', '_').lower()

    cursor = doc
    for token in operation_id.split('.')[1:]:
        candidates = [token]
        snake_token = _snake_case(token)
        if snake_token != token:
            candidates.append(snake_token)

        resolved = None
        for candidate in candidates:
            if hasattr(cursor, candidate):
                resolved = getattr(cursor, candidate)
                break

        if resolved is None:
            raise SuperDocError(
                'No SDK doc method found for operation.',
                code='TOOL_DISPATCH_NOT_FOUND',
                details={'operationId': operation_id, 'token': token},
            )
        cursor = resolved

    if not callable(cursor):
        raise SuperDocError(
            'Resolved SDK doc member is not callable.',
            code='TOOL_DISPATCH_NOT_FOUND',
            details={'operationId': operation_id},
        )

    return cursor


def dispatch_superdoc_tool(
    client: Any,
    tool_name: str,
    args: Optional[Dict[str, Any]] = None,
    invoke_options: Optional[Dict[str, Any]] = None,
) -> Any:
    payload = args or {}
    if not isinstance(payload, dict):
        raise SuperDocError('Tool arguments must be an object.', code='INVALID_ARGUMENT', details={'toolName': tool_name})

    # Strip doc/sessionId — the SDK client manages session targeting after doc.open().
    payload = {k: v for k, v in payload.items() if k not in ('doc', 'sessionId')}

    def execute(operation_id: str, input_args: Dict[str, Any]) -> Any:
        method = _resolve_doc_method(client, operation_id)
        if inspect.iscoroutinefunction(method):
            raise SuperDocError(
                'dispatch_superdoc_tool cannot call async methods. Use dispatch_superdoc_tool_async.',
                code='INVALID_ARGUMENT',
                details={'toolName': tool_name, 'operationId': operation_id},
            )
        kwargs = dict(invoke_options or {})
        return method(input_args, **kwargs)

    return dispatch_intent_tool(tool_name, payload, execute)


async def dispatch_superdoc_tool_async(
    client: Any,
    tool_name: str,
    args: Optional[Dict[str, Any]] = None,
    invoke_options: Optional[Dict[str, Any]] = None,
) -> Any:
    payload = args or {}
    if not isinstance(payload, dict):
        raise SuperDocError('Tool arguments must be an object.', code='INVALID_ARGUMENT', details={'toolName': tool_name})

    # Strip doc/sessionId — same as sync version above.
    payload = {k: v for k, v in payload.items() if k not in ('doc', 'sessionId')}

    def execute(operation_id: str, input_args: Dict[str, Any]) -> Any:
        method = _resolve_doc_method(client, operation_id)
        kwargs = dict(invoke_options or {})
        return method(input_args, **kwargs)

    result = dispatch_intent_tool(tool_name, payload, execute)
    if inspect.isawaitable(result):
        return await result
    return result


def get_system_prompt() -> str:
    """Read the bundled system prompt for intent tools."""
    resource = resources.files('superdoc').joinpath('tools', 'system-prompt.md')
    try:
        return resource.read_text(encoding='utf-8')
    except FileNotFoundError as error:
        raise SuperDocError(
            'System prompt not found.',
            code='TOOLS_ASSET_NOT_FOUND',
            details={'file': 'system-prompt.md'},
        ) from error
