"""Customer-extensible **custom actions** (Python mirror of the Node SDK kit).

The canonical ActionSpec has exactly ONE execution tier:

- ``steps`` — declarative composition of built-in core actions with ``{{arg}}``
  templating; dispatches through the base preset and inherits its target
  resolution, receipts, and verification.
- ``run``   — a native Python callable executed in YOUR process against the
  typed doc handle, with synthesized truth-telling receipts (pre/post
  revision, partialMutation). Async callables require the async dispatcher.

(A third, in-host tier lands with the code-act execution path; see the Node
``define.ts`` module header for the rationale.)

``extend_preset``/``compose_preset`` merge custom actions into the
superdoc_perform_action enum, tool description, system prompt, and dispatch
COHERENTLY — including ``exclude_actions``, which may name built-in actions
(forwarded to the base) or custom ones (handled by the wrapper).

Cross-runtime contract: templating semantics, input-schema defaults, and
receipt shapes are identical to the Node kit
(``langs/node/src/actions/define.ts``) for any JSON-serializable tool input.

Author flow::

    add = define_action(
        name='superdoc.add_footnote',
        description='Insert a footnote right after the anchor text.',
        input_schema={'type': 'object', 'properties': {...}, 'required': ['anchorText', 'content']},
        run=_add_footnote,
    )
    acme = extend_preset('core', id='acme', actions=[add])
    register_preset(acme)
    choose_tools({'provider': 'openai', 'preset': 'acme'})
    dispatch_superdoc_tool(handle, 'superdoc_perform_action', {'action': 'superdoc.add_footnote', ...}, preset='acme')
"""

from __future__ import annotations

import inspect
import json
import re
from dataclasses import dataclass
from typing import Any, Awaitable, Dict, List, Optional, Sequence

from ..errors import SuperDocError
from . import ToolProvider, get_preset

# ---------------------------------------------------------------------------
# Built-in core action names. MUST stay in sync with ACTION_NAMES_LIST in
# node/src/agent/actions.ts (source of truth). Collision checks compare against
# this set. (core's getCatalog lists the 3 tools, not the 35 action names, so a
# shared constant is the safest cross-runtime source (40 names). A unit test
# asserts the exact set so any drift from Node fails loudly.
# ---------------------------------------------------------------------------

BUILTIN_ACTION_NAMES: frozenset = frozenset(
    {
        'insert_paragraphs',
        'insert_heading',
        'replace_text',
        'delete_text',
        'append_list',
        'create_table',
        'comment_paragraphs',
        'add_comments',
        'resolve_comments',
        'reply_to_comment',
        'rewrite_block',
        'accept_tracked_changes',
        'reject_tracked_changes',
        'normalize_body_font_size',
        'set_font_family',
        'apply_letter_spacing',
        'fill_placeholders',
        'move_range',
        'insert_toc',
        'insert_table_row',
        'insert_table_column',
        'delete_table_row',
        'delete_table_column',
        'split_table',
        'convert_list',
        'split_list',
        'undo_changes',
        'redo_changes',
        'attach_numbering',
        'add_list_items',
        'format_text',
        'apply_style',
        'format_paragraph',
        'move_text',
        'style_table',
        'move_table',
        'delete_table',
        'set_paragraph_spacing',
        'insert_page_break',
        'add_hyperlink',
    }
)


# ---------------------------------------------------------------------------
# define_action — author a ActionSpec (a plain dict)
# ---------------------------------------------------------------------------


def define_action(
    name: str,
    description: str,
    input_schema: Optional[Dict[str, Any]] = None,
    steps: Optional[Sequence[Dict[str, Any]]] = None,
    run: Optional[Any] = None,
) -> Dict[str, Any]:
    """Author an ActionSpec dict — the canonical custom-action type.

    ``input_schema`` is a JSON Schema object describing the action's flat args
    (NOT the ``action`` discriminator). Exactly ONE execution tier is given:

    - ``steps`` — DECLARATIVE (recommended): a list of built-in core actions
      ``{'action': <name>, 'args': {...}}`` with ``{{arg}}`` templating. Runs
      through the base preset, inheriting target resolution, placement,
      receipts, and verification. Pure data — identical semantics from Node.
    - ``run`` — NATIVE escape hatch: a Python callable ``run(doc, args)``
      executed in YOUR process against the typed doc handle.
    """
    if not isinstance(name, str) or not name:
        raise SuperDocError('define_action requires a non-empty name.', code='INVALID_ARGUMENT')
    if not isinstance(description, str):
        raise SuperDocError(
            f'define_action "{name}" requires a string description.',
            code='INVALID_ARGUMENT',
            details={'name': name},
        )
    tiers = []
    if steps is not None:
        tiers.append('steps')
    if run is not None:
        tiers.append('run')
    if len(tiers) != 1:
        raise SuperDocError(
            f'define_action "{name}" requires exactly one of steps or run '
            f"(got {'none' if not tiers else ' + '.join(tiers)}).",
            code='INVALID_ARGUMENT',
            details={'name': name, 'tiers': tiers},
        )
    if input_schema is None:
        schema: Dict[str, Any] = {'type': 'object', 'properties': {}, 'additionalProperties': True}
    elif isinstance(input_schema, dict):
        # A proper JSON Schema object passes through; a bare properties bag is
        # wrapped (matches Node's coerceInputSchema).
        schema = (
            input_schema
            if input_schema.get('type') == 'object'
            else {'type': 'object', 'properties': input_schema, 'additionalProperties': True}
        )
    else:
        # Reject Zod/Pydantic/other schema objects clearly rather than silently
        # dropping them for an empty schema.
        raise SuperDocError(
            f'define_action "{name}": input_schema must be a JSON Schema dict, not a '
            f'{type(input_schema).__name__}. Convert a Zod/Pydantic/other schema to a JSON '
            'Schema dict first (e.g. Model.model_json_schema()).',
            code='INVALID_ARGUMENT',
            details={'name': name},
        )
    spec: Dict[str, Any] = {
        'name': name,
        'description': description,
        'inputSchema': schema,
    }
    if tiers[0] == 'steps':
        if not isinstance(steps, (list, tuple)) or len(steps) == 0:
            raise SuperDocError(
                f'define_action "{name}": steps must be a non-empty list.',
                code='INVALID_ARGUMENT',
                details={'name': name},
            )
        normalized = []
        for index, step in enumerate(steps):
            action_name = step.get('action') if isinstance(step, dict) else None
            if not isinstance(action_name, str) or not action_name:
                raise SuperDocError(
                    f'define_action "{name}": steps[{index}] needs a non-empty "action" string.',
                    code='INVALID_ARGUMENT',
                    details={'name': name, 'index': index},
                )
            if action_name not in BUILTIN_ACTION_NAMES:
                raise SuperDocError(
                    f'define_action "{name}": steps[{index}].action "{action_name}" is not a built-in '
                    'core action. Steps compose built-in actions only; use run for anything else.',
                    code='INVALID_ARGUMENT',
                    details={'name': name, 'index': index, 'action': action_name},
                )
            step_args = step.get('args')
            if step_args is not None and not isinstance(step_args, dict):
                raise SuperDocError(
                    f'define_action "{name}": steps[{index}].args must be an object.',
                    code='INVALID_ARGUMENT',
                    details={'name': name, 'index': index},
                )
            normalized.append({'action': action_name, 'args': dict(step_args or {})})
        spec['steps'] = normalized
    elif tiers[0] == 'run':
        if not callable(run):
            raise SuperDocError(
                f'define_action "{name}": run must be callable.',
                code='INVALID_ARGUMENT',
                details={'name': name},
            )
        spec['run'] = run
    return spec


def execution_kind_of(spec: Dict[str, Any]) -> str:
    """Which execution tier a spec uses: 'steps' | 'run'."""
    return 'steps' if isinstance(spec.get('steps'), (list, tuple)) else 'run'


# ---------------------------------------------------------------------------
# Codegen — identical to the Node template for JSON-serializable tool inputs
# (the only values a tool call can carry; NaN/Infinity/lone-surrogates are out
# of scope and serialize differently across Node and Python).
# ---------------------------------------------------------------------------




# ---------------------------------------------------------------------------
# Collision / duplicate validation
# ---------------------------------------------------------------------------


# Provider tool-name rule. OpenAI/Anthropic require tool names to match
# ^[A-Za-z0-9_-]{1,64}$ — dots are invalid. This only matters in STANDALONE
# mode, where the action name becomes a tool name; in MERGED mode the name is
# an enum VALUE (dots are fine).
_PROVIDER_SAFE_TOOL_NAME = re.compile(r'^[A-Za-z0-9_-]{1,64}$')

# Tool names of the agent surface itself — a custom action must never shadow
# one (MUST stay in sync with AGENT_TOOL_NAMES in node/src/agent/catalog.ts).
_RESERVED_TOOL_NAMES = frozenset({
    'superdoc_inspect',
    'superdoc_perform_action',
    'superdoc_execute_code',
    'agent_apply',
    'agent_verify',
    'agent_operation',
})


def _assert_actions_valid(
    actions: Sequence[Dict[str, Any]], preset_id: str, standalone: bool = False
) -> None:
    seen = set()
    for action in actions:
        name = action.get('name')
        # Raw spec dicts can bypass define_action — re-validate the tier shape
        # here so a hand-rolled {'steps': []} can't fabricate succeeded receipts.
        tiers = [t for t, present in (
            ('steps', isinstance(action.get('steps'), (list, tuple))),
            ('run', callable(action.get('run'))),
        ) if present]
        if len(tiers) != 1:
            raise SuperDocError(
                f'Custom action "{name}" must have exactly one of steps/run '
                f"(got {'none' if not tiers else ' + '.join(tiers)}).",
                code='INVALID_ARGUMENT',
                details={'presetId': preset_id, 'name': name, 'tiers': tiers},
            )
        if isinstance(action.get('steps'), (list, tuple)):
            steps = action['steps']
            if len(steps) == 0:
                raise SuperDocError(
                    f'Custom action "{name}": steps must be non-empty.',
                    code='INVALID_ARGUMENT',
                    details={'presetId': preset_id, 'name': name},
                )
            for index, step in enumerate(steps):
                step_action = step.get('action') if isinstance(step, dict) else None
                if not isinstance(step_action, str) or step_action not in BUILTIN_ACTION_NAMES:
                    raise SuperDocError(
                        f'Custom action "{name}": steps[{index}].action must be a built-in core action.',
                        code='INVALID_ARGUMENT',
                        details={'presetId': preset_id, 'name': name, 'index': index},
                    )
        if name in BUILTIN_ACTION_NAMES:
            raise SuperDocError(
                f'Custom action "{name}" collides with a built-in core action name. '
                f'Use a namespaced name like "<ns>.{name}".',
                code='INVALID_ARGUMENT',
                details={'presetId': preset_id, 'name': name},
            )
        if name in _RESERVED_TOOL_NAMES:
            raise SuperDocError(
                f'Custom action "{name}" collides with a reserved tool name — it would shadow the agent surface itself.',
                code='INVALID_ARGUMENT',
                details={'presetId': preset_id, 'name': name},
            )
        if name in seen:
            raise SuperDocError(
                f'Duplicate custom action name "{name}" in preset "{preset_id}".',
                code='INVALID_ARGUMENT',
                details={'presetId': preset_id, 'name': name},
            )
        # In standalone mode the action name becomes a provider tool name, which
        # OpenAI/Anthropic reject unless it matches ^[A-Za-z0-9_-]{1,64}$ (dotted
        # namespaced names are only valid as merged enum VALUES).
        if standalone and not _PROVIDER_SAFE_TOOL_NAME.match(name or ''):
            raise SuperDocError(
                f'standalone action names must match ^[A-Za-z0-9_-]{{1,64}}$; '
                f'"{name}" has invalid characters — use merged mode for dotted names.',
                code='INVALID_ARGUMENT',
                details={'presetId': preset_id, 'name': name},
            )
        seen.add(name)


# ---------------------------------------------------------------------------
# Tool-list merging — mirror provider shapes from agent/catalog.ts
# ---------------------------------------------------------------------------


def _tool_name(tool: Any) -> str:
    if not isinstance(tool, dict):
        return ''
    fn = tool.get('function')
    if isinstance(fn, dict) and isinstance(fn.get('name'), str):
        return fn['name']
    return tool.get('name', '') if isinstance(tool.get('name'), str) else ''


def _custom_actions_description(actions: Sequence[Dict[str, Any]]) -> str:
    body = '; '.join(f"{r['name']} ({r['description']})" for r in actions)
    return f' Custom actions: {body}.'


def _perform_action_shape(tools: Sequence[Any]) -> tuple:
    """Read the (description, JSON-schema) of the superdoc_perform_action tool
    from a get_tools result, across provider shapes (function-wrapped or flat,
    input_schema/inputSchema/parameters). Returns (None, None) when the tool is
    absent — e.g. every built-in excluded, where the host drops it."""
    for tool in tools:
        if _tool_name(tool) != 'superdoc_perform_action' or not isinstance(tool, dict):
            continue
        fn = tool.get('function') if isinstance(tool.get('function'), dict) else None
        container = fn if fn is not None else tool
        schema_key = ('input_schema' if 'input_schema' in container
                      else 'inputSchema' if 'inputSchema' in container else 'parameters')
        schema = container.get(schema_key)
        desc = container.get('description') if isinstance(container.get('description'), str) else None
        return desc, (dict(schema) if isinstance(schema, dict) else None)
    return None, None


_METADATA_SCHEMA_KEYS = {'description', 'title', 'examples', '$comment'}


def _structural_schema(value: Any) -> Any:
    """Drop doc-only keys (recursively) so only the structural shape is compared."""
    if isinstance(value, dict):
        return {k: _structural_schema(v) for k, v in value.items() if k not in _METADATA_SCHEMA_KEYS}
    if isinstance(value, list):
        return [_structural_schema(v) for v in value]
    return value


def _arg_schemas_conflict(a: Any, b: Any) -> bool:
    """Two arg schemas CONFLICT when they differ in any way EXCEPT documentation
    (description/title/examples/$comment). Reusing a built-in arg name with your
    own description is fine, but a different type, enum (incl. one-sided),
    default, limit, pattern, or nested shape is a real conflict."""
    return json.dumps(_structural_schema(a), sort_keys=True) != json.dumps(_structural_schema(b), sort_keys=True)


def _assert_no_arg_conflict(properties: Dict[str, Any], key: str, value: Any, action_name: str) -> None:
    """Reject a custom arg whose name collides with an existing arg (built-in or
    an earlier custom action) of an INCOMPATIBLE type/enum. A shared name with a
    compatible type but extra metadata (description/default) is allowed."""
    if key in properties and _arg_schemas_conflict(properties[key], value):
        raise SuperDocError(
            f'Custom action "{action_name}" declares argument "{key}" with a schema that conflicts with an '
            'existing argument of the same name on the superdoc_perform_action surface. Rename the argument, '
            'or align its type.',
            code='INVALID_ARGUMENT',
            details={'action': action_name, 'arg': key},
        )


def _merge_into_superdoc_perform_action(tools: List[Any], actions: Sequence[Dict[str, Any]]) -> List[Any]:
    out: List[Any] = []
    for tool in tools:
        if _tool_name(tool) != 'superdoc_perform_action' or not isinstance(tool, dict):
            out.append(tool)
            continue
        t = dict(tool)
        fn = t.get('function') if isinstance(t.get('function'), dict) else None
        container = dict(fn) if fn is not None else t
        schema_key = ('input_schema' if 'input_schema' in container
                      else 'inputSchema' if 'inputSchema' in container else 'parameters')
        schema = dict(container.get(schema_key) or {})
        properties = dict(schema.get('properties') or {})
        action_prop = dict(properties.get('action') or {})
        enum_values = list(action_prop.get('enum') or [])
        for action in actions:
            if action['name'] not in enum_values:
                enum_values.append(action['name'])
            for key, value in (action.get('inputSchema', {}).get('properties') or {}).items():
                _assert_no_arg_conflict(properties, key, value, action['name'])
                if key not in properties:
                    properties[key] = value
        action_prop['enum'] = enum_values
        properties['action'] = action_prop
        schema['properties'] = properties
        base_desc = container.get('description') if isinstance(container.get('description'), str) else ''
        container['description'] = base_desc + _custom_actions_description(actions)
        container[schema_key] = schema
        if fn is not None:
            t['function'] = container
            out.append(t)
        else:
            out.append(container)
    return out


def _synthesize_perform_action(provider: ToolProvider, actions: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    """When the base dropped superdoc_perform_action entirely (all built-ins
    excluded / an empty allowlist), active custom actions would be advertised
    in the prompt and dispatchable — but carried by NO tool. Synthesize a
    custom-only definition so a curated custom-only preset stays callable."""
    properties: Dict[str, Any] = {
        'action': {'type': 'string', 'enum': [r['name'] for r in actions]},
    }
    for action in actions:
        for key, value in (action.get('inputSchema', {}).get('properties') or {}).items():
            _assert_no_arg_conflict(properties, key, value, action['name'])
            properties.setdefault(key, value)
    schema = {'type': 'object', 'additionalProperties': True, 'required': ['action'], 'properties': properties}
    description = (
        "Perform one of this preset's custom document actions. Pick an action and pass its flat arguments."
        + _custom_actions_description(actions)
    )
    if provider == 'anthropic':
        return {'name': 'superdoc_perform_action', 'description': description, 'input_schema': schema}
    if provider == 'vercel':
        return {'name': 'superdoc_perform_action', 'description': description, 'inputSchema': schema}
    if provider == 'openai':
        return {'type': 'function',
                'function': {'name': 'superdoc_perform_action', 'description': description, 'parameters': schema}}
    return {'name': 'superdoc_perform_action', 'description': description, 'parameters': schema}


def _merge_or_synthesize_perform_action(tools: List[Any], actions: Sequence[Dict[str, Any]],
                                        provider: ToolProvider) -> List[Any]:
    if any(_tool_name(t) == 'superdoc_perform_action' for t in tools):
        return _merge_into_superdoc_perform_action(tools, actions)
    return tools + [_synthesize_perform_action(provider, actions)]


def _standalone_tool(provider: ToolProvider, action: Dict[str, Any]) -> Dict[str, Any]:
    if provider == 'anthropic':
        return {'name': action['name'], 'description': action['description'], 'input_schema': action['inputSchema']}
    # The core agent dialect for vercel is FLAT {name, description, inputSchema}
    # (agent/catalog.ts toVercelTool) — not the OpenAI nested function shape.
    if provider == 'vercel':
        return {'name': action['name'], 'description': action['description'], 'inputSchema': action['inputSchema']}
    if provider == 'openai':
        return {
            'type': 'function',
            'function': {
                'name': action['name'],
                'description': action['description'],
                'parameters': action['inputSchema'],
            },
        }
    # generic
    return {'name': action['name'], 'description': action['description'], 'parameters': action['inputSchema']}


def _renormalize_anthropic_cache_marker(
    tools: List[Any], provider: ToolProvider, cache_requested: bool
) -> List[Any]:
    """Re-apply the Anthropic prompt-cache marker after the tool list was
    mutated. Mirrors Node's ``renormalizeAnthropicCacheMarker``: the base places
    ``cache_control`` on the LAST tool; appending/removing tools can leave it
    mid-list or drop it, so strip any existing markers and re-apply to the final
    last tool. No-op for other providers / when not requested / empty list.
    """
    if provider != 'anthropic' or not cache_requested or not tools:
        return tools
    stripped: List[Any] = []
    for tool in tools:
        if isinstance(tool, dict) and 'cache_control' in tool:
            stripped.append({k: v for k, v in tool.items() if k != 'cache_control'})
        else:
            stripped.append(tool)
    last = stripped[-1]
    if isinstance(last, dict):
        stripped[-1] = {**last, 'cache_control': {'type': 'ephemeral'}}
    return stripped


# ---------------------------------------------------------------------------
# runCustomAction — validate, codegen, dispatch via superdoc_execute_code, map receipt
# ---------------------------------------------------------------------------


# Kit-level args every custom action accepts without declaring them.
_IMPLICIT_ACTION_ARGS = frozenset({'changeMode', 'rationale'})


def _validate_against_schema(action: Dict[str, Any], args: Dict[str, Any]) -> None:
    schema = action.get('inputSchema', {})
    required = schema.get('required') or []
    missing = [key for key in required if args.get(key) is None]
    if missing:
        raise SuperDocError(
            f"Missing required argument(s) for {action['name']}: {', '.join(missing)}",
            code='INVALID_ARGUMENT',
            details={'action': action['name'], 'missingKeys': missing},
        )
    properties = schema.get('properties') if isinstance(schema.get('properties'), dict) else {}
    if schema.get('additionalProperties') is False:
        unknown = [k for k in args if k not in properties and k not in _IMPLICIT_ACTION_ARGS]
        if unknown:
            raise SuperDocError(
                f"Unknown argument(s) for {action['name']}: {', '.join(unknown)}",
                code='INVALID_ARGUMENT',
                details={'action': action['name'], 'unknownKeys': unknown, 'knownKeys': list(properties)},
            )
    for key, prop in properties.items():
        if key not in args:
            continue
        value = args[key]
        # Validate whenever the key is PRESENT — an explicit None is a value,
        # not an absence (Node parity: null !== undefined). Letting None
        # through would also bypass schema defaults, which only fill missing
        # keys, so the action would receive a live None.
        if isinstance(prop, dict) and isinstance(prop.get('enum'), list) and value not in prop['enum']:
            raise SuperDocError(
                f"Invalid value for {action['name']}.{key}: {value!r} (allowed: {prop['enum']})",
                code='INVALID_ARGUMENT',
                details={'action': action['name'], 'key': key, 'allowed': prop['enum']},
            )


# ---------------------------------------------------------------------------
# steps tier — templating + interpreter (identical semantics to Node)
# ---------------------------------------------------------------------------

_WHOLE_TEMPLATE = re.compile(r'^\{\{(\w+)\}\}$')


def _apply_input_defaults(action: Dict[str, Any], args: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(args)
    for key, prop in (action.get('inputSchema', {}).get('properties') or {}).items():
        if key not in out and isinstance(prop, dict) and 'default' in prop:
            out[key] = prop['default']
    return out


def _substitute_templates(node: Any, arg_values: Dict[str, Any]) -> Any:
    """Whole-string ``"{{x}}"`` yields the RAW value; partial templates
    interpolate as text; keys resolving to None-from-missing are dropped by the
    dict branch (so optional args don't inject nulls into step args)."""
    if isinstance(node, str):
        whole = _WHOLE_TEMPLATE.match(node)
        if whole:
            return arg_values.get(whole.group(1), _MISSING)
        def _text(value: Any) -> str:
            # Byte-identical with Node: strings verbatim, None -> '', everything
            # else compact JSON (true/[1,2]/{"a":1}) — NOT str(), whose bool/
            # list/dict forms differ from JS String().
            if value is None:
                return ''
            if isinstance(value, str):
                return value
            return json.dumps(value, separators=(',', ':'), ensure_ascii=False)
        return re.sub(r'\{\{(\w+)\}\}', lambda m: _text(arg_values.get(m.group(1))), node)
    if isinstance(node, list):
        # Whole-string templates for ABSENT args are dropped from arrays too —
        # the sentinel must never leak into a transport payload.
        return [item for item in (_substitute_templates(entry, arg_values) for entry in node) if item is not _MISSING]
    if isinstance(node, dict):
        out = {}
        for key, value in node.items():
            substituted = _substitute_templates(value, arg_values)
            if substituted is not _MISSING:
                out[key] = substituted
        return out
    return node


class _MissingType:
    def __repr__(self) -> str:  # pragma: no cover
        return '<missing>'


_MISSING = _MissingType()


def _step_args_for(action: Dict[str, Any], step: Dict[str, Any], arg_values: Dict[str, Any]) -> Dict[str, Any]:
    step_args = _substitute_templates(step.get('args') or {}, arg_values)
    if step_args is _MISSING or not isinstance(step_args, dict):
        step_args = {}
    # changeMode pass-through: a caller-level changeMode reaches every step
    # that doesn't pin its own.
    if isinstance(arg_values.get('changeMode'), str) and 'changeMode' not in step_args:
        step_args = {**step_args, 'changeMode': arg_values['changeMode']}
    return step_args


def _steps_row(index: int, step: Dict[str, Any], receipt: Dict[str, Any]) -> Dict[str, Any]:
    row = {'step': index, 'action': step['action'], 'status': receipt.get('status')}
    if 'verificationPassed' in receipt:
        row['verificationPassed'] = receipt['verificationPassed']
    return row


def _steps_aggregate(action: Dict[str, Any], rows: List[Dict[str, Any]], failed_at: Optional[int] = None,
                     failed_receipt: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if failed_at is None:
        return {'status': 'succeeded', 'action': action['name'], 'steps': rows}
    any_landed = any(row['status'] != 'failed' for row in rows)
    return {
        'status': 'partial' if any_landed else 'failed',
        'action': action['name'],
        'steps': rows,
        'failedStep': {'index': failed_at, 'receipt': failed_receipt},
    }


def _run_steps_action(base: Any, action: Dict[str, Any], document_handle: Any,
                      args: Dict[str, Any], invoke_options: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    arg_values = args  # defaults already applied by the router
    rows: List[Dict[str, Any]] = []
    for index, step in enumerate(action['steps']):
        step_args = _step_args_for(action, step, arg_values)
        try:
            # Steps are the author's curated composition, not model calls — so
            # surface exclude_actions (already enforced at the top-level
            # dispatch) must not refuse a built-in this action composes.
            dispatched = base.dispatch(
                document_handle, 'superdoc_perform_action', {'action': step['action'], **step_args},
                invoke_options
            )
            receipt = dispatched if isinstance(dispatched, dict) else {'status': 'ok', 'result': dispatched}
        except Exception as error:  # noqa: BLE001 — validation errors throw; normalize
            receipt = {'status': 'failed', 'errors': [{'code': getattr(error, 'code', None), 'message': str(error)}]}
        rows.append(_steps_row(index, step, receipt))
        if receipt.get('status') == 'failed':
            return _steps_aggregate(action, rows, index, receipt)
        # Truthfulness: a partially-landed step (or failed verification) must
        # not roll up into a clean succeeded — stop and report partial.
        if receipt.get('status') == 'partial' or receipt.get('verificationPassed') is False:
            return {
                'status': 'partial',
                'action': action['name'],
                'steps': rows,
                'failedStep': {'index': index, 'receipt': receipt},
            }
    return _steps_aggregate(action, rows)


async def _run_steps_action_async(base: Any, action: Dict[str, Any], document_handle: Any,
                                  args: Dict[str, Any], invoke_options: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    arg_values = args  # defaults already applied by the router
    rows: List[Dict[str, Any]] = []
    for index, step in enumerate(action['steps']):
        step_args = _step_args_for(action, step, arg_values)
        try:
            # Steps are the author's curated composition, not model calls — so
            # surface exclude_actions (already enforced at the top-level
            # dispatch) must not refuse a built-in this action composes.
            dispatched = await base.dispatch_async(
                document_handle, 'superdoc_perform_action', {'action': step['action'], **step_args},
                invoke_options
            )
            receipt = dispatched if isinstance(dispatched, dict) else {'status': 'ok', 'result': dispatched}
        except Exception as error:  # noqa: BLE001
            receipt = {'status': 'failed', 'errors': [{'code': getattr(error, 'code', None), 'message': str(error)}]}
        rows.append(_steps_row(index, step, receipt))
        if receipt.get('status') == 'failed':
            return _steps_aggregate(action, rows, index, receipt)
        # Truthfulness: a partially-landed step (or failed verification) must
        # not roll up into a clean succeeded — stop and report partial.
        if receipt.get('status') == 'partial' or receipt.get('verificationPassed') is False:
            return {
                'status': 'partial',
                'action': action['name'],
                'steps': rows,
                'failedStep': {'index': index, 'receipt': receipt},
            }
    return _steps_aggregate(action, rows)


# ---------------------------------------------------------------------------
# run tier — native Python callable with a synthesized truth-telling receipt
# ---------------------------------------------------------------------------


def _read_revision(document_handle: Any) -> Optional[str]:
    info = getattr(document_handle, 'info', None)
    if not callable(info):
        return None
    try:
        result = info({})
        revision = result.get('revision') if isinstance(result, dict) else None
        return None if revision is None else str(revision)
    except Exception:  # noqa: BLE001 — revision evidence is best-effort
        return None


def _native_receipt(action: Dict[str, Any], pre: Optional[str], post: Optional[str],
                    result: Any = None, error: Optional[Exception] = None) -> Dict[str, Any]:
    if error is None:
        return {'status': 'succeeded', 'action': action['name'], 'result': result,
                'preRevision': pre, 'postRevision': post}
    partial = pre is not None and post is not None and pre != post
    return {
        'status': 'failed',
        'action': action['name'],
        'errors': [{'code': getattr(error, 'code', None), 'message': str(error)}],
        'preRevision': pre,
        'postRevision': post,
        'partialMutation': partial,
        'recovery': {'kind': 'revert', 'call': 'superdoc_perform_action {action:"undo_changes"}'}
        if partial else {'kind': 'retry'},
    }


def _run_native_action(action: Dict[str, Any], document_handle: Any, args: Dict[str, Any]) -> Dict[str, Any]:
    arg_values = args  # defaults already applied by the router
    pre = _read_revision(document_handle)
    try:
        result = action['run'](document_handle, arg_values)
        if inspect.isawaitable(result):
            # An async run function through the SYNC dispatcher would return an
            # un-awaited coroutine as a "successful" result — refuse loudly.
            result.close()
            raise SuperDocError(
                f"{action['name']}: run returned an awaitable from the sync dispatcher — "
                'use dispatch_superdoc_tool_async / dispatch_async for async run functions.',
                code='INVALID_ARGUMENT',
                details={'action': action['name']},
            )
        return _native_receipt(action, pre, _read_revision(document_handle), result=result)
    except Exception as error:  # noqa: BLE001 — becomes a failed receipt
        return _native_receipt(action, pre, _read_revision(document_handle), error=error)


async def _read_revision_async(document_handle: Any) -> Optional[str]:
    info = getattr(document_handle, 'info', None)
    if not callable(info):
        return None
    try:
        result = info({})
        if inspect.isawaitable(result):
            result = await result
        revision = result.get('revision') if isinstance(result, dict) else None
        return None if revision is None else str(revision)
    except Exception:  # noqa: BLE001 — revision evidence is best-effort
        return None


async def _run_native_action_async(action: Dict[str, Any], document_handle: Any, args: Dict[str, Any]) -> Dict[str, Any]:
    arg_values = args  # defaults already applied by the router
    pre = await _read_revision_async(document_handle)
    try:
        result = action['run'](document_handle, arg_values)
        if inspect.isawaitable(result):
            result = await result
        return _native_receipt(action, pre, await _read_revision_async(document_handle), result=result)
    except Exception as error:  # noqa: BLE001
        return _native_receipt(action, pre, await _read_revision_async(document_handle), error=error)


# ---------------------------------------------------------------------------
# tier router — one entry point for both preset wrappers
# ---------------------------------------------------------------------------


def _run_custom_action(base: Any, action: Dict[str, Any], document_handle: Any,
                       raw_args: Optional[Dict[str, Any]], invoke_options: Optional[Dict[str, Any]],
                       from_perform_action: bool = True) -> Dict[str, Any]:
    args = dict(raw_args or {})
    # `action` is the superdoc_perform_action discriminator ONLY on that route;
    # in standalone mode it may be a real declared argument — strip only when
    # it came in as the discriminator.
    if from_perform_action:
        args.pop('action', None)
    # Apply schema defaults BEFORE validation — a required arg with a declared
    # default is satisfiable by the default.
    args = _apply_input_defaults(action, args)
    _validate_against_schema(action, args)
    kind = execution_kind_of(action)
    if kind == 'steps':
        return _run_steps_action(base, action, document_handle, args, invoke_options)
    return _run_native_action(action, document_handle, args)


async def _run_custom_action_async(base: Any, action: Dict[str, Any], document_handle: Any,
                                   raw_args: Optional[Dict[str, Any]],
                                   invoke_options: Optional[Dict[str, Any]],
                                   from_perform_action: bool = True) -> Dict[str, Any]:
    args = dict(raw_args or {})
    if from_perform_action:
        args.pop('action', None)
    args = _apply_input_defaults(action, args)
    _validate_against_schema(action, args)
    kind = execution_kind_of(action)
    if kind == 'steps':
        return await _run_steps_action_async(base, action, document_handle, args, invoke_options)
    return await _run_native_action_async(action, document_handle, args)


def _split_exclusions(by_name: dict, exclude_actions: Optional[list]) -> tuple:
    """excludeActions may name BUILT-IN actions (forwarded to the base, which
    validates them) or CUSTOM actions (handled by the wrapper — the base would
    reject names it doesn't know). Returns (custom_excluded_set, builtin_list_or_None)."""
    if not exclude_actions:
        return frozenset(), None
    custom = {name for name in exclude_actions if name in by_name}
    builtin = [name for name in exclude_actions if name not in by_name]
    return frozenset(custom), (builtin or None)


# ---------------------------------------------------------------------------
# extend_preset — wrap a base preset with custom actions
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _ExtendedPreset:
    id: str
    description: str
    supports_cache_control: bool
    _base: Any
    _actions: tuple
    _by_name: dict
    _standalone: bool
    _system_prompt_extra: Optional[str] = None

    # --- tool surface ---
    def get_tools(self, provider: ToolProvider, *, cache: bool = False,
                  exclude_actions: Optional[list] = None) -> Dict[str, Any]:
        custom_excluded, builtin_excluded = _split_exclusions(self._by_name, exclude_actions)
        base_kwargs = {'exclude_actions': builtin_excluded} if builtin_excluded else {}
        result = self._base.get_tools(provider, cache=cache, **base_kwargs)
        active = [r for r in self._actions if r['name'] not in custom_excluded]
        if not active:
            return result
        tools = list(result.get('tools') or [])
        if self._standalone:
            tools = tools + [_standalone_tool(provider, r) for r in active]
        else:
            tools = _merge_or_synthesize_perform_action(tools, active, provider)
        tools = _renormalize_anthropic_cache_marker(
            tools, provider, bool(cache) and result.get('cacheStrategy') != 'disabled')
        return {**result, 'tools': tools}

    def get_catalog(self) -> Dict[str, Any]:
        catalog = self._base.get_catalog()
        rows = list(catalog.get('tools') or [])
        rows = rows + [
            {
                'toolName': r['name'],
                'description': r['description'],
                'inputSchema': r['inputSchema'],
                'mutates': True,
                'operations': [],
            }
            for r in self._actions
        ]
        return {**catalog, 'toolCount': len(rows), 'tools': rows}

    def _prompt_extra(self, custom_excluded: frozenset = frozenset()) -> str:
        if self._system_prompt_extra is not None:
            return self._system_prompt_extra
        active = [r for r in self._actions if r['name'] not in custom_excluded]
        if not active:
            return ''
        bullets = '\n'.join(f"- {r['name']} — {r['description']}" for r in active)
        return f'\n\n## Custom actions\n{bullets}'

    def get_system_prompt(self, *, exclude_actions: Optional[list] = None) -> str:
        custom_excluded, builtin_excluded = _split_exclusions(self._by_name, exclude_actions)
        base_kwargs = {'exclude_actions': builtin_excluded} if builtin_excluded else {}
        return self._base.get_system_prompt(**base_kwargs) + self._prompt_extra(custom_excluded)

    def get_mcp_prompt(self) -> str:
        return self._base.get_mcp_prompt() + self._prompt_extra()

    # --- dispatch ---
    def dispatch(
        self,
        document_handle: Any,
        tool_name: str,
        args: Optional[Dict[str, Any]] = None,
        invoke_options: Optional[Dict[str, Any]] = None,
        *,
        exclude_actions: Optional[list] = None,
    ) -> Any:
        action = self._resolve_custom(tool_name, args)
        if action is not None:
            # Defense-in-depth parity with core: an excluded CUSTOM action is
            # refused before it runs (the base can only refuse built-ins).
            if exclude_actions and action['name'] in exclude_actions:
                raise SuperDocError(
                    f"Action {action['name']} is excluded by configuration.",
                    code='INVALID_ARGUMENT',
                    details={'toolName': tool_name, 'action': action['name'], 'excluded': True},
                )
            return _run_custom_action(self._base, action, document_handle, args, invoke_options,
                                      from_perform_action=tool_name == 'superdoc_perform_action')
        return self._base.dispatch(document_handle, tool_name, args, invoke_options, exclude_actions=exclude_actions)

    async def dispatch_async(
        self,
        document_handle: Any,
        tool_name: str,
        args: Optional[Dict[str, Any]] = None,
        invoke_options: Optional[Dict[str, Any]] = None,
        *,
        exclude_actions: Optional[list] = None,
    ) -> Any:
        action = self._resolve_custom(tool_name, args)
        if action is not None:
            if exclude_actions and action['name'] in exclude_actions:
                raise SuperDocError(
                    f"Action {action['name']} is excluded by configuration.",
                    code='INVALID_ARGUMENT',
                    details={'toolName': tool_name, 'action': action['name'], 'excluded': True},
                )
            return await _run_custom_action_async(self._base, action, document_handle, args, invoke_options,
                                                  from_perform_action=tool_name == 'superdoc_perform_action')
        return await self._base.dispatch_async(document_handle, tool_name, args, invoke_options, exclude_actions=exclude_actions)

    def _resolve_custom(self, tool_name: str, args: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        # Advertised surface == dispatchable surface: in standalone mode custom
        # actions are advertised as their own tools, so the (unadvertised)
        # perform_action route must not execute them — the call falls through
        # to the base, which rejects the unknown action name.
        if (not self._standalone and tool_name == 'superdoc_perform_action'
                and isinstance(args, dict) and isinstance(args.get('action'), str)):
            action = self._by_name.get(args['action'])
            if action is not None:
                return action
        if self._standalone and tool_name in self._by_name:
            return self._by_name[tool_name]
        return None


def extend_preset(
    base_id: str,
    id: str,
    actions: Sequence[Dict[str, Any]],
    system_prompt_extra: Optional[str] = None,
    standalone: bool = False,
    description: Optional[str] = None,
) -> _ExtendedPreset:
    """Wrap ``get_preset(base_id)`` with custom actions (Python mirror of
    Node's ``extendPreset``)."""
    base = get_preset(base_id)
    action_list = list(actions or [])
    _assert_actions_valid(action_list, id, bool(standalone))
    return _ExtendedPreset(
        id=id,
        description=description or f'{base.description} + {len(action_list)} custom action(s).',
        supports_cache_control=getattr(base, 'supports_cache_control', True),
        _base=base,
        _actions=tuple(action_list),
        _by_name={r['name']: r for r in action_list},
        _standalone=bool(standalone),
        _system_prompt_extra=system_prompt_extra,
    )


# ---------------------------------------------------------------------------
# compose_preset — build a preset over core, filtering its surface
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _ComposedPreset:
    id: str
    description: str
    supports_cache_control: bool
    _base: Any
    _base_id: str
    _actions: tuple
    _by_name: dict
    _include_core: Optional[frozenset]
    _drop_superdoc_execute_code: bool
    _system_prompt: Optional[str]

    def get_tools(self, provider: ToolProvider, *, cache: bool = False,
                  exclude_actions: Optional[list] = None) -> Dict[str, Any]:
        custom_excluded, builtin_excluded = _split_exclusions(self._by_name, exclude_actions)
        # The allowlist is implemented as a DERIVED exclusion forwarded to the
        # base, so core narrows the enum, the grouped description, AND the
        # advertised argument properties natively — no hand-rebuilt schemas
        # here (a second implementation of that narrowing is what drifts).
        derived = sorted(BUILTIN_ACTION_NAMES - self._include_core) if self._include_core is not None else []
        merged_excludes = sorted({*derived, *(builtin_excluded or [])})
        base_kwargs = {'exclude_actions': merged_excludes} if merged_excludes else {}
        result = self._base.get_tools(provider, cache=cache, **base_kwargs)
        tools = list(result.get('tools') or [])
        if self._drop_superdoc_execute_code:
            tools = [t for t in tools if _tool_name(t) != 'superdoc_execute_code']
        active = [r for r in self._actions if r['name'] not in custom_excluded]
        if active:
            tools = _merge_or_synthesize_perform_action(tools, active, provider)
        # Dropping superdoc_execute_code can strip the marker off the (former) last tool;
        # re-normalize so the anthropic cached prefix is still correct.
        tools = _renormalize_anthropic_cache_marker(
            tools, provider, bool(cache) and result.get('cacheStrategy') != 'disabled')
        return {**result, 'tools': tools}

    def get_catalog(self) -> Dict[str, Any]:
        catalog = self._base.get_catalog()
        rows = list(catalog.get('tools') or [])
        if self._drop_superdoc_execute_code:
            rows = [r for r in rows if r.get('toolName') != 'superdoc_execute_code']
        # Advertised == dispatchable, catalog included: when include_core
        # narrows the surface, the catalog's superdoc_perform_action row must
        # narrow WITH it — enum, description, AND argument properties — or
        # get_tool_catalog() still advertises inputs for actions the preset
        # refuses. Source the narrowed row from the base's own get_tools (the
        # same host builder that narrows get_tools natively), so there is one
        # narrowing implementation, not a second that drifts.
        if self._include_core is not None:
            derived = sorted(BUILTIN_ACTION_NAMES - self._include_core)
            narrowed_tools = (self._base.get_tools('anthropic', exclude_actions=derived) or {}).get('tools') or []
            desc, schema = _perform_action_shape(narrowed_tools)
            updated = []
            for row in rows:
                if row.get('toolName') != 'superdoc_perform_action':
                    updated.append(row)
                    continue
                # No built-in tool from the host means every built-in was
                # excluded; drop the row rather than keep advertising built-ins
                # (custom actions still appear as their own rows below).
                if schema is None:
                    continue
                row = {**row, 'inputSchema': schema}
                if desc is not None:
                    row['description'] = desc
                updated.append(row)
            rows = updated
        rows = rows + [
            {
                'toolName': r['name'],
                'description': r['description'],
                'inputSchema': r['inputSchema'],
                'mutates': True,
                'operations': [],
            }
            for r in self._actions
        ]
        return {**catalog, 'toolCount': len(rows), 'tools': rows}

    def _prompt(self, base_prompt: str, custom_excluded: frozenset = frozenset()) -> str:
        if self._system_prompt is not None:
            return self._system_prompt
        active = [r for r in self._actions if r['name'] not in custom_excluded]
        if not active:
            return base_prompt
        bullets = '\n'.join(f"- {r['name']} — {r['description']}" for r in active)
        return base_prompt + f'\n\n## Custom actions\n{bullets}'

    def get_system_prompt(self, *, exclude_actions: Optional[list] = None) -> str:
        if self._system_prompt is not None:
            return self._system_prompt
        # include_core narrows the ENUM; the prompt must narrow WITH it — a
        # per-action manual for an uncallable action teaches the model to call it.
        custom_excluded, builtin_requested = _split_exclusions(self._by_name, exclude_actions)
        derived = sorted(BUILTIN_ACTION_NAMES - self._include_core) if self._include_core is not None else []
        merged = sorted({*derived, *(builtin_requested or [])})
        base_kwargs = {'exclude_actions': merged} if merged else {}
        return self._prompt(self._base.get_system_prompt(**base_kwargs), custom_excluded)

    def get_mcp_prompt(self) -> str:
        if self._system_prompt is not None:
            return self._system_prompt
        return self._prompt(self._base.get_mcp_prompt())

    def dispatch(
        self,
        document_handle: Any,
        tool_name: str,
        args: Optional[Dict[str, Any]] = None,
        invoke_options: Optional[Dict[str, Any]] = None,
        *,
        exclude_actions: Optional[list] = None,
    ) -> Any:
        if tool_name == 'superdoc_perform_action' and isinstance(args, dict) and isinstance(args.get('action'), str):
            action = self._by_name.get(args['action'])
            if action is not None:
                if exclude_actions and action['name'] in exclude_actions:
                    raise SuperDocError(
                        f"Action {action['name']} is excluded by configuration.",
                        code='INVALID_ARGUMENT',
                        details={'toolName': tool_name, 'action': action['name'], 'excluded': True},
                    )
                return _run_custom_action(self._base, action, document_handle, args, invoke_options)
            # Composition allowlist is a dispatch boundary too: a built-in
            # outside include_core_actions is not advertised and must not
            # execute on a guessed/stale call.
            if (self._include_core is not None and args['action'] in BUILTIN_ACTION_NAMES
                    and args['action'] not in self._include_core):
                raise SuperDocError(
                    f"Action {args['action']} is excluded by configuration.",
                    code='INVALID_ARGUMENT',
                    details={'toolName': tool_name, 'action': args['action'], 'excluded': True,
                             'excludedBy': 'includeCoreActions'},
                )
        return self._base.dispatch(document_handle, tool_name, args, invoke_options, exclude_actions=exclude_actions)

    async def dispatch_async(
        self,
        document_handle: Any,
        tool_name: str,
        args: Optional[Dict[str, Any]] = None,
        invoke_options: Optional[Dict[str, Any]] = None,
        *,
        exclude_actions: Optional[list] = None,
    ) -> Any:
        if tool_name == 'superdoc_perform_action' and isinstance(args, dict) and isinstance(args.get('action'), str):
            action = self._by_name.get(args['action'])
            if action is not None:
                if exclude_actions and action['name'] in exclude_actions:
                    raise SuperDocError(
                        f"Action {action['name']} is excluded by configuration.",
                        code='INVALID_ARGUMENT',
                        details={'toolName': tool_name, 'action': action['name'], 'excluded': True},
                    )
                return await _run_custom_action_async(self._base, action, document_handle, args, invoke_options)
            if (self._include_core is not None and args['action'] in BUILTIN_ACTION_NAMES
                    and args['action'] not in self._include_core):
                raise SuperDocError(
                    f"Action {args['action']} is excluded by configuration.",
                    code='INVALID_ARGUMENT',
                    details={'toolName': tool_name, 'action': args['action'], 'excluded': True,
                             'excludedBy': 'includeCoreActions'},
                )
        return await self._base.dispatch_async(document_handle, tool_name, args, invoke_options, exclude_actions=exclude_actions)


def compose_preset(
    id: str,
    base_id: str = 'core',
    include_core_actions: Optional[Sequence[str]] = None,
    include_superdoc_execute_code: Optional[bool] = None,
    actions: Optional[Sequence[Dict[str, Any]]] = None,
    system_prompt: Optional[str] = None,
    description: Optional[str] = None,
) -> _ComposedPreset:
    """Compose a preset over ``core`` (Python mirror of Node's
    ``composePreset``)."""
    action_list = list(actions or [])
    _assert_actions_valid(action_list, id)
    if include_core_actions is not None:
        for name in include_core_actions:
            if name not in BUILTIN_ACTION_NAMES:
                raise SuperDocError(
                    f'includeCoreActions: unknown action "{name}".',
                    code='INVALID_ARGUMENT',
                    details={'presetId': id, 'unknownAction': name},
                )
    base = get_preset(base_id)
    return _ComposedPreset(
        id=id,
        description=description or f'Composed over {base_id} with {len(action_list)} custom action(s).',
        supports_cache_control=getattr(base, 'supports_cache_control', True),
        _base=base,
        _base_id=base_id,
        _actions=tuple(action_list),
        _by_name={r['name']: r for r in action_list},
        _include_core=frozenset(include_core_actions) if include_core_actions is not None else None,
        _drop_superdoc_execute_code=(include_superdoc_execute_code is False),
        _system_prompt=system_prompt,
    )
