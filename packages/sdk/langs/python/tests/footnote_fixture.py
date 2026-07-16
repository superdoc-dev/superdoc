"""Footnote actions — the shared test fixture for custom actions (Python).

Five namespaced ``run``-tier custom actions over the typed ``doc.footnotes.*``
Document API. They run in the caller's process against the session-bound
handle — the tier a customer reaches for when the built-in actions don't cover
their domain.

Test fixture only: it is NOT part of the shipped package and lives under
``tests/`` so it never ships in the wheel. Both the unit tests (against a fake
base) and the smoke test (against the real CLI host) import it.
"""

from typing import Any, Dict

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from superdoc.presets.custom import define_action  # noqa: E402


def _add(doc: Any, args: Dict[str, Any]) -> Any:
    return doc.footnotes.insert({
        'at': args['at'],
        'type': args.get('type', 'footnote'),
        'content': args['content'],
    })


def _list(doc: Any, args: Dict[str, Any]) -> Any:
    return doc.footnotes.list({'type': args['type']} if args.get('type') else {})


def _edit(doc: Any, args: Dict[str, Any]) -> Any:
    return doc.footnotes.update({
        'target': {'kind': 'entity', 'entityType': 'footnote', 'noteId': args['noteId']},
        'patch': {'content': args['content']},
    })


def _remove(doc: Any, args: Dict[str, Any]) -> Any:
    return doc.footnotes.remove({
        'target': {'kind': 'entity', 'entityType': 'footnote', 'noteId': args['noteId']},
    })


def _renumber(doc: Any, args: Dict[str, Any]) -> Any:
    numbering: Dict[str, Any] = {}
    if args.get('format'):
        numbering['format'] = args['format']
    if args.get('start') is not None:
        numbering['start'] = args['start']
    return doc.footnotes.configure({
        'type': args.get('type', 'footnote'),
        'scope': {'kind': 'document'},
        'numbering': numbering,
    })


footnote_add = define_action(
    name='footnotes.add',
    description=(
        "Insert a footnote (or endnote) at a text target. args: { at: TextTarget "
        "{kind:'text',segments:[{blockId,range:{start,end}}]}, content: string, type?: 'footnote'|'endnote' }."
    ),
    input_schema={
        'type': 'object', 'additionalProperties': False, 'required': ['at', 'content'],
        'properties': {
            'at': {'type': 'object'},
            'content': {'type': 'string'},
            'type': {'type': 'string', 'enum': ['footnote', 'endnote']},
        },
    },
    run=_add,
)

footnote_list = define_action(
    name='footnotes.list',
    description="List footnotes (or endnotes). args: { type?: 'footnote'|'endnote' }.",
    input_schema={
        'type': 'object', 'additionalProperties': False,
        'properties': {'type': {'type': 'string', 'enum': ['footnote', 'endnote']}},
    },
    run=_list,
)

footnote_edit = define_action(
    name='footnotes.edit',
    description="Edit a footnote's content by noteId. args: { noteId: string, content: string }.",
    input_schema={
        'type': 'object', 'additionalProperties': False, 'required': ['noteId', 'content'],
        'properties': {'noteId': {'type': 'string'}, 'content': {'type': 'string'}},
    },
    run=_edit,
)

footnote_remove = define_action(
    name='footnotes.remove',
    description='Remove a footnote by noteId. args: { noteId: string }.',
    input_schema={
        'type': 'object', 'additionalProperties': False, 'required': ['noteId'],
        'properties': {'noteId': {'type': 'string'}},
    },
    run=_remove,
)

footnote_renumber = define_action(
    name='footnotes.renumber',
    description=(
        "Reconfigure footnote numbering for the whole document. "
        "args: { type?: 'footnote'|'endnote', format?: string, start?: number }."
    ),
    input_schema={
        'type': 'object', 'additionalProperties': False,
        'properties': {
            'type': {'type': 'string', 'enum': ['footnote', 'endnote']},
            'format': {'type': 'string',
                       'enum': ['decimal', 'lowerRoman', 'upperRoman', 'lowerLetter', 'upperLetter', 'symbol']},
            'start': {'type': 'number'},
        },
    },
    run=_renumber,
)

footnote_actions = [footnote_add, footnote_list, footnote_edit, footnote_remove, footnote_renumber]
