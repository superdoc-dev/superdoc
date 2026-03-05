from __future__ import annotations

import inspect
import json
import re
from importlib import resources
from typing import Any, Dict, List, Literal, Mapping, Optional, TypedDict, cast

from .errors import SuperDocError
from .generated.contract import OPERATION_INDEX

ToolProvider = Literal['openai', 'anthropic', 'vercel', 'generic']
ToolGroup = Literal[
    'core', 'format', 'create', 'tables', 'sections',
    'lists', 'comments', 'trackChanges', 'toc', 'images', 'history', 'session',
]
ToolChooserMode = Literal['essential', 'all']


class ToolChooserInput(TypedDict, total=False):
    provider: ToolProvider
    groups: List[ToolGroup]
    mode: ToolChooserMode
    includeDiscoverTool: bool


# Policy is loaded from the generated tools-policy.json artifact.
_policy_cache: Optional[Dict[str, Any]] = None


def _load_policy() -> Dict[str, Any]:
    global _policy_cache
    if _policy_cache is not None:
        return _policy_cache
    _policy_cache = _read_json_asset('tools-policy.json')
    return _policy_cache

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


def resolve_tool_operation(tool_name: str) -> Optional[str]:
    mapping = _read_json_asset('tool-name-map.json')
    value = mapping.get(tool_name)
    return value if isinstance(value, str) else None


def get_available_groups() -> List[str]:
    policy = _load_policy()
    return list(policy.get('groups', []))


def _extract_provider_tool_name(tool: Dict[str, Any]) -> Optional[str]:
    """Extract tool name from provider-specific format.

    Anthropic / Generic: top-level ``name``.
    OpenAI / Vercel: nested under ``function.name``.
    """
    name = tool.get('name')
    if isinstance(name, str):
        return name
    fn = tool.get('function')
    if isinstance(fn, dict):
        fn_name = fn.get('name')
        if isinstance(fn_name, str):
            return fn_name
    return None


def choose_tools(input: ToolChooserInput) -> Dict[str, Any]:
    """Select tools for a specific provider.

    **mode='essential'** (default): Returns only essential tools + discover_tools.
    Pass ``groups`` to additionally load all tools from those categories.

    **mode='all'**: Returns all tools from requested groups (or all groups if
    ``groups`` is omitted). No discover_tools included by default.

    Example::

        # Default: essential tools + discover_tools
        result = choose_tools({'provider': 'openai'})

        # Essential + all comment tools
        result = choose_tools({'provider': 'openai', 'groups': ['comments']})

        # All tools (old behavior)
        result = choose_tools({'provider': 'openai', 'mode': 'all'})
    """
    provider = input.get('provider')
    if provider not in ('openai', 'anthropic', 'vercel', 'generic'):
        raise SuperDocError('provider is required.', code='INVALID_ARGUMENT', details={'provider': provider})

    catalog = _read_json_asset('catalog.json')
    tools_policy = _load_policy()

    catalog_tools = catalog.get('tools')
    if not isinstance(catalog_tools, list):
        raise SuperDocError('Catalog tools are invalid.', code='TOOLS_ASSET_INVALID')

    default_mode = tools_policy.get('defaults', {}).get('mode', 'essential')
    mode = input.get('mode', default_mode)
    include_discover_raw = input.get('includeDiscoverTool')
    include_discover = include_discover_raw if include_discover_raw is not None else (mode == 'essential')

    if mode == 'essential':
        # Essential tools + any explicitly requested groups
        essential_names = set(tools_policy.get('essentialTools', []))
        requested_groups = set(input.get('groups', [])) if input.get('groups') is not None else None

        selected = [
            tool for tool in catalog_tools
            if isinstance(tool, dict) and (
                str(tool.get('toolName', '')) in essential_names
                or (requested_groups is not None and str(tool.get('category', '')) in requested_groups)
            )
        ]
    else:
        # mode='all': original behavior — filter by groups
        always_include = set(tools_policy.get('defaults', {}).get('alwaysInclude', ['core']))
        requested_groups_list = input.get('groups')
        if requested_groups_list is not None:
            groups = set(list(requested_groups_list) + list(always_include))
        else:
            groups = set(tools_policy.get('groups', []))

        selected = [
            tool for tool in catalog_tools
            if isinstance(tool, dict) and str(tool.get('category', '')) in groups
        ]

    # Build provider-formatted tools from the provider bundle
    provider_bundle = _read_json_asset(PROVIDER_FILE[provider])
    provider_tools_raw = provider_bundle.get('tools') if isinstance(provider_bundle.get('tools'), list) else []
    provider_index: Dict[str, Dict[str, Any]] = {}
    for tool in provider_tools_raw:
        if not isinstance(tool, dict):
            continue
        name = _extract_provider_tool_name(tool)
        if name is not None:
            provider_index[name] = tool

    selected_provider_tools = [
        provider_index[name]
        for name in [str(tool.get('toolName')) for tool in selected]
        if name in provider_index
    ]

    # Append discover_tools if requested
    if include_discover:
        discover_tool = provider_index.get('discover_tools')
        if discover_tool is not None:
            selected_provider_tools.append(discover_tool)

    resolved_groups: List[str] = (
        list(input.get('groups', []) if input.get('groups') is not None else [])
        if mode == 'essential'
        else list(input.get('groups') if input.get('groups') is not None else tools_policy.get('groups', []))
    )

    return {
        'tools': selected_provider_tools,
        'selected': [
            {
                'operationId': str(tool.get('operationId')),
                'toolName': str(tool.get('toolName')),
                'category': str(tool.get('category')),
                'mutates': bool(tool.get('mutates')),
            }
            for tool in selected
        ],
        'meta': {
            'provider': provider,
            'mode': mode,
            'groups': sorted(resolved_groups),
            'selectedCount': len(selected_provider_tools),
        },
    }


def _validate_dispatch_args(operation_id: str, args: Dict[str, Any]) -> None:
    operation = OPERATION_INDEX.get(operation_id)
    if not isinstance(operation, dict):
        raise SuperDocError('Unknown operation id.', code='INVALID_ARGUMENT', details={'operationId': operation_id})

    params = operation.get('params')
    if not isinstance(params, list):
        raise SuperDocError('Operation params are invalid.', code='INVALID_ARGUMENT', details={'operationId': operation_id})

    # Unknown-param rejection
    allowed = {param.get('name') for param in params if isinstance(param, dict) and isinstance(param.get('name'), str)}
    for key in args.keys():
        if key not in allowed:
            raise SuperDocError(
                f'Unexpected parameter {key} for {operation_id}.',
                code='INVALID_ARGUMENT',
                details={'operationId': operation_id, 'param': key},
            )

    # Required-param enforcement
    for param in params:
        if not isinstance(param, dict):
            continue
        name = param.get('name')
        if not isinstance(name, str):
            continue
        if bool(param.get('required')) and args.get(name) is None:
            raise SuperDocError(
                f'Missing required parameter {name} for {operation_id}.',
                code='INVALID_ARGUMENT',
                details={'operationId': operation_id, 'param': name},
            )

    # Constraint validation (CLI handles schema-level type validation authoritatively)
    constraints = operation.get('constraints') if isinstance(operation.get('constraints'), dict) else None
    if constraints is None:
        return

    def _is_present(val: Any) -> bool:
        if val is None:
            return False
        if isinstance(val, list):
            return len(val) > 0
        return True

    mutually_exclusive = constraints.get('mutuallyExclusive') if isinstance(constraints.get('mutuallyExclusive'), list) else []
    requires_one_of = constraints.get('requiresOneOf') if isinstance(constraints.get('requiresOneOf'), list) else []
    required_when = constraints.get('requiredWhen') if isinstance(constraints.get('requiredWhen'), list) else []

    for group in mutually_exclusive:
        if not isinstance(group, list):
            continue
        present = [name for name in group if _is_present(args.get(name))]
        if len(present) > 1:
            raise SuperDocError(
                f'Arguments are mutually exclusive for {operation_id}: {", ".join(group)}',
                code='INVALID_ARGUMENT',
                details={'operationId': operation_id, 'group': group},
            )

    for group in requires_one_of:
        if not isinstance(group, list):
            continue
        has_any = any(_is_present(args.get(name)) for name in group)
        if not has_any:
            raise SuperDocError(
                f'One of the following arguments is required for {operation_id}: {", ".join(group)}',
                code='INVALID_ARGUMENT',
                details={'operationId': operation_id, 'group': group},
            )

    for rule in required_when:
        if not isinstance(rule, dict):
            continue
        when_param = rule.get('whenParam')
        when_value = args.get(when_param) if isinstance(when_param, str) else None
        should_require = False
        if 'equals' in rule:
            should_require = when_value == rule['equals']
        elif 'present' in rule:
            if rule['present'] is True:
                should_require = _is_present(when_value)
            else:
                should_require = not _is_present(when_value)
        else:
            should_require = _is_present(when_value)

        param_name = rule.get('param')
        if should_require and isinstance(param_name, str) and not _is_present(args.get(param_name)):
            raise SuperDocError(
                f'Argument {param_name} is required by constraints for {operation_id}.',
                code='INVALID_ARGUMENT',
                details={'operationId': operation_id, 'rule': rule},
            )


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
    operation_id = resolve_tool_operation(tool_name)
    if operation_id is None:
        raise SuperDocError('Unknown SuperDoc tool.', code='TOOL_NOT_FOUND', details={'toolName': tool_name})

    payload = args or {}
    if not isinstance(payload, dict):
        raise SuperDocError('Tool arguments must be an object.', code='INVALID_ARGUMENT', details={'toolName': tool_name})

    _validate_dispatch_args(operation_id, payload)
    method = _resolve_doc_method(client, operation_id)

    if inspect.iscoroutinefunction(method):
        raise SuperDocError(
            'dispatch_superdoc_tool cannot call async methods. Use dispatch_superdoc_tool_async.',
            code='INVALID_ARGUMENT',
            details={'toolName': tool_name, 'operationId': operation_id},
        )

    kwargs = dict(invoke_options or {})
    return method(payload, **kwargs)


async def dispatch_superdoc_tool_async(
    client: Any,
    tool_name: str,
    args: Optional[Dict[str, Any]] = None,
    invoke_options: Optional[Dict[str, Any]] = None,
) -> Any:
    operation_id = resolve_tool_operation(tool_name)
    if operation_id is None:
        raise SuperDocError('Unknown SuperDoc tool.', code='TOOL_NOT_FOUND', details={'toolName': tool_name})

    payload = args or {}
    if not isinstance(payload, dict):
        raise SuperDocError('Tool arguments must be an object.', code='INVALID_ARGUMENT', details={'toolName': tool_name})

    _validate_dispatch_args(operation_id, payload)
    method = _resolve_doc_method(client, operation_id)
    kwargs = dict(invoke_options or {})

    result = method(payload, **kwargs)
    if inspect.isawaitable(result):
        return await result

    return result
