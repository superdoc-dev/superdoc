from __future__ import annotations

import inspect
import json
from importlib import resources
from typing import Any, Dict, List, Literal, Mapping, Optional, TypedDict, cast

from .errors import SuperDocError
from .generated.contract import OPERATION_INDEX

ToolProvider = Literal['openai', 'anthropic', 'vercel', 'generic']
ToolProfile = Literal['intent', 'operation']
ToolPhase = Literal['read', 'locate', 'mutate', 'review']


class DocumentFeatures(TypedDict):
    hasTables: bool
    hasLists: bool
    hasComments: bool
    hasTrackedChanges: bool
    isEmptyDocument: bool


class ToolChooserPolicy(TypedDict, total=False):
    includeCategories: List[str]
    excludeCategories: List[str]
    allowMutatingTools: bool
    forceInclude: List[str]
    forceExclude: List[str]


class ToolChooserBudget(TypedDict, total=False):
    maxTools: int
    minReadTools: int


class ToolChooserTaskContext(TypedDict, total=False):
    phase: ToolPhase
    previousToolCalls: List[Dict[str, Any]]


class ToolChooserInput(TypedDict, total=False):
    provider: ToolProvider
    profile: ToolProfile
    documentFeatures: DocumentFeatures
    taskContext: ToolChooserTaskContext
    budget: ToolChooserBudget
    policy: ToolChooserPolicy


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


def get_tool_catalog(options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    profile = (options or {}).get('profile')
    catalog = _read_json_asset('catalog.json')
    if profile not in ('intent', 'operation', None):
        raise SuperDocError(
            'profile must be "intent" or "operation".',
            code='INVALID_ARGUMENT',
            details={'profile': profile},
        )

    if profile is None:
        return catalog

    filtered = dict(catalog)
    profiles = catalog.get('profiles') if isinstance(catalog.get('profiles'), dict) else {}
    filtered['profiles'] = {
        'intent': profiles.get('intent') if profile == 'intent' else {'name': 'intent', 'tools': []},
        'operation': profiles.get('operation') if profile == 'operation' else {'name': 'operation', 'tools': []},
    }
    return filtered


def list_tools(provider: ToolProvider, options: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    profile = (options or {}).get('profile', 'intent')
    if profile not in ('intent', 'operation'):
        raise SuperDocError(
            'profile must be "intent" or "operation".',
            code='INVALID_ARGUMENT',
            details={'profile': profile},
        )

    bundle = _read_json_asset(PROVIDER_FILE[provider])
    profiles = bundle.get('profiles')
    if not isinstance(profiles, dict):
        raise SuperDocError('Tool provider artifact is missing profiles.', code='TOOLS_ASSET_INVALID', details={'provider': provider})

    tools = profiles.get(profile)
    if not isinstance(tools, list):
        raise SuperDocError('Tool provider artifact profile is invalid.', code='TOOLS_ASSET_INVALID', details={'provider': provider, 'profile': profile})

    return cast(List[Dict[str, Any]], tools)


def resolve_tool_operation(tool_name: str) -> Optional[str]:
    mapping = _read_json_asset('tool-name-map.json')
    value = mapping.get(tool_name)
    return value if isinstance(value, str) else None


def infer_document_features(info_result: Optional[Mapping[str, Any]]) -> DocumentFeatures:
    if not isinstance(info_result, dict):
        return {
            'hasTables': False,
            'hasLists': False,
            'hasComments': False,
            'hasTrackedChanges': False,
            'isEmptyDocument': False,
        }

    counts: Mapping[str, Any] = {}
    if isinstance(info_result.get('counts'), dict):
        counts = cast(Mapping[str, Any], info_result['counts'])

    words = counts.get('words') if isinstance(counts.get('words'), (int, float)) else 0
    paragraphs = counts.get('paragraphs') if isinstance(counts.get('paragraphs'), (int, float)) else 0
    tables = counts.get('tables') if isinstance(counts.get('tables'), (int, float)) else 0
    comments = counts.get('comments') if isinstance(counts.get('comments'), (int, float)) else 0
    lists = counts.get('lists') if isinstance(counts.get('lists'), (int, float)) else counts.get('listItems', 0)
    tracked = counts.get('trackedChanges') if isinstance(counts.get('trackedChanges'), (int, float)) else counts.get('tracked_changes', 0)

    return {
        'hasTables': bool(tables and tables > 0),
        'hasLists': bool(lists and lists > 0),
        'hasComments': bool(comments and comments > 0),
        'hasTrackedChanges': bool(tracked and tracked > 0),
        'isEmptyDocument': bool(words == 0 and paragraphs <= 1),
    }


def _normalize_features(features: Optional[Mapping[str, Any]]) -> DocumentFeatures:
    return {
        'hasTables': bool(features.get('hasTables')) if features else False,
        'hasLists': bool(features.get('hasLists')) if features else False,
        'hasComments': bool(features.get('hasComments')) if features else False,
        'hasTrackedChanges': bool(features.get('hasTrackedChanges')) if features else False,
        'isEmptyDocument': bool(features.get('isEmptyDocument')) if features else False,
    }


def _priority_sort(tools: List[Dict[str, Any]], priority: List[str]) -> List[Dict[str, Any]]:
    priority_index = {category: index for index, category in enumerate(priority)}
    return sorted(
        tools,
        key=lambda tool: (
            priority_index.get(str(tool.get('category')), 10_000),
            str(tool.get('toolName', '')),
        ),
    )


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
    provider = input.get('provider')
    if provider not in ('openai', 'anthropic', 'vercel', 'generic'):
        raise SuperDocError('provider is required.', code='INVALID_ARGUMENT', details={'provider': provider})

    profile = cast(ToolProfile, input.get('profile', 'intent'))
    if profile not in ('intent', 'operation'):
        raise SuperDocError('profile must be "intent" or "operation".', code='INVALID_ARGUMENT', details={'profile': profile})

    task_context = input.get('taskContext', {})
    phase = cast(ToolPhase, task_context.get('phase', 'read'))
    if phase not in ('read', 'locate', 'mutate', 'review'):
        raise SuperDocError('phase must be read|locate|mutate|review.', code='INVALID_ARGUMENT', details={'phase': phase})

    catalog = _read_json_asset('catalog.json')
    tools_policy = _load_policy()
    profile_tools = (
        catalog.get('profiles', {}).get(profile, {}).get('tools')
        if isinstance(catalog.get('profiles'), dict)
        else []
    )
    if not isinstance(profile_tools, list):
        raise SuperDocError('Catalog profile tools are invalid.', code='TOOLS_ASSET_INVALID', details={'profile': profile})

    policy = input.get('policy', {})
    budget = input.get('budget', {})

    defaults = tools_policy.get('defaults', {})
    max_by_profile = defaults.get('maxToolsByProfile', {})
    max_tools = int(budget.get('maxTools', max_by_profile.get(profile, 12)))
    min_read_tools = int(budget.get('minReadTools', defaults.get('minReadTools', 2)))
    max_tools = max(1, max_tools)
    min_read_tools = max(0, min_read_tools)

    phase_policy = tools_policy.get('phases', {}).get(phase, {'include': [], 'exclude': [], 'priority': []})
    include_categories = set(policy.get('includeCategories') or phase_policy['include'])
    exclude_categories = set((policy.get('excludeCategories') or []) + phase_policy['exclude'])
    allow_mutating_tools = bool(policy.get('allowMutatingTools', phase == 'mutate'))

    features = _normalize_features(input.get('documentFeatures'))
    excluded: List[Dict[str, str]] = []

    def should_include(tool: Dict[str, Any]) -> bool:
        required_caps = tool.get('requiredCapabilities')
        if isinstance(required_caps, list):
            for capability in required_caps:
                if isinstance(capability, str) and capability in features and not features[capability]:
                    excluded.append({'toolName': str(tool.get('toolName')), 'reason': 'missing-required-capability'})
                    return False

        if not allow_mutating_tools and bool(tool.get('mutates')):
            excluded.append({'toolName': str(tool.get('toolName')), 'reason': 'mutations-disabled'})
            return False

        category = str(tool.get('category', ''))
        if include_categories and category not in include_categories:
            excluded.append({'toolName': str(tool.get('toolName')), 'reason': 'category-not-included'})
            return False

        if category in exclude_categories:
            excluded.append({'toolName': str(tool.get('toolName')), 'reason': 'phase-category-excluded'})
            return False

        return True

    candidates = [tool for tool in profile_tools if isinstance(tool, dict) and should_include(cast(Dict[str, Any], tool))]

    force_exclude = set(policy.get('forceExclude') or [])
    filtered: List[Dict[str, Any]] = []
    for tool in candidates:
        name = str(tool.get('toolName'))
        if name in force_exclude:
            excluded.append({'toolName': name, 'reason': 'force-excluded'})
            continue
        filtered.append(tool)

    index_by_name = {str(tool.get('toolName')): tool for tool in profile_tools if isinstance(tool, dict)}
    for forced_name in policy.get('forceInclude') or []:
        forced = index_by_name.get(str(forced_name))
        if forced is None:
            excluded.append({'toolName': str(forced_name), 'reason': 'not-in-profile'})
            continue
        filtered.append(forced)

    deduped: Dict[str, Dict[str, Any]] = {}
    for tool in filtered:
        deduped[str(tool.get('toolName'))] = tool
    candidates = list(deduped.values())

    selected: List[Dict[str, Any]] = []
    foundational_ids = set(defaults.get('foundationalOperationIds', []))
    foundational = [tool for tool in candidates if str(tool.get('operationId')) in foundational_ids]
    for tool in foundational:
        if len(selected) >= min_read_tools or len(selected) >= max_tools:
            break
        selected.append(tool)

    remaining = [tool for tool in _priority_sort(candidates, phase_policy['priority']) if str(tool.get('toolName')) not in {str(item.get('toolName')) for item in selected}]

    for tool in remaining:
        if len(selected) >= max_tools:
            excluded.append({'toolName': str(tool.get('toolName')), 'reason': 'budget-trim'})
            continue
        selected.append(tool)

    provider_bundle = _read_json_asset(PROVIDER_FILE[provider])
    provider_profiles = provider_bundle.get('profiles') if isinstance(provider_bundle.get('profiles'), dict) else {}
    provider_tools = provider_profiles.get(profile) if isinstance(provider_profiles, dict) else []
    provider_index: Dict[str, Dict[str, Any]] = {}
    for tool in provider_tools:
        if not isinstance(tool, dict):
            continue
        name = _extract_provider_tool_name(tool)
        if name is not None:
            provider_index[name] = tool

    selected_provider_tools = [provider_index[name] for name in [str(tool.get('toolName')) for tool in selected] if name in provider_index]

    return {
        'tools': selected_provider_tools,
        'selected': [
            {
                'operationId': str(tool.get('operationId')),
                'toolName': str(tool.get('toolName')),
                'category': str(tool.get('category')),
                'mutates': bool(tool.get('mutates')),
                'profile': str(tool.get('profile')),
            }
            for tool in selected
        ],
        'excluded': excluded,
        'selectionMeta': {
            'profile': profile,
            'phase': phase,
            'maxTools': max_tools,
            'minReadTools': min_read_tools,
            'selectedCount': len(selected),
            'decisionVersion': defaults.get('chooserDecisionVersion', 'v1'),
            'provider': provider,
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

    cursor = doc
    for token in operation_id.split('.')[1:]:
        if not hasattr(cursor, token):
            raise SuperDocError(
                'No SDK doc method found for operation.',
                code='TOOL_DISPATCH_NOT_FOUND',
                details={'operationId': operation_id, 'token': token},
            )
        cursor = getattr(cursor, token)

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
