"""ACME custom action: make a table's borders bold (heavier weight / style).

Tier choice: ``run`` (native Python). No built-in core action exposes border
weight/style — ``style_table`` applies a fixed "professional look" preset and
offers no border control — so this composes the Document API's
``doc.tables.set_borders`` directly.

Probed contract (superdoc-sdk 1.20.0, learned from live validation errors):
  doc.tables.set_borders({
      'mode': 'applyTo',                  # 'applyTo' | 'edges'
      'nodeId': <table nodeId>,           # or a resolved target
      'applyTo': 'all',                   # all|outside|inside|top|bottom|left|right|insideH|insideV
      'border': {'lineStyle': str, 'lineWeightPt': float > 0, 'color': str},  # ALL required
  })
  doc.tables.get_properties({'nodeId': ...})  # -> {'borders': {side: {...}}} once set

NOTE: the host stores ``lineStyle`` verbatim (even nonsense values), so this
action constrains it to known OOXML styles via its input schema.
"""

from superdoc import define_action

# Which border sides each applyTo mode is expected to touch — used to verify
# the mutation actually landed by reading properties back.
_SIDES_FOR_APPLY_TO = {
    'all': ('top', 'bottom', 'left', 'right', 'insideH', 'insideV'),
    'outside': ('top', 'bottom', 'left', 'right'),
    'inside': ('insideH', 'insideV'),
    'top': ('top',),
    'bottom': ('bottom',),
    'left': ('left',),
    'right': ('right',),
    'insideH': ('insideH',),
    'insideV': ('insideV',),
}


def _norm_color(value):
    return str(value or '').lstrip('#').upper()


def _embolden_table_borders(doc, args):
    ordinal = int(args.get('tableOrdinal', 1))
    apply_to = args.get('applyTo', 'all')
    border = {
        'lineStyle': args.get('lineStyle', 'single'),
        'lineWeightPt': args.get('lineWeightPt', 2.25),
        'color': args.get('color', '#000000'),
    }

    tables = [b for b in doc.blocks.list()['blocks'] if b.get('nodeType') == 'table']
    if not tables:
        raise ValueError('No tables in this document.')
    if not 1 <= ordinal <= len(tables):
        raise ValueError(
            f'tableOrdinal {ordinal} is out of range: the document has '
            f'{len(tables)} table(s) (ordinals 1..{len(tables)}).'
        )
    node_id = tables[ordinal - 1]['nodeId']

    before = doc.tables.get_properties({'nodeId': node_id}).get('borders')

    doc.tables.set_borders({
        'mode': 'applyTo',
        'nodeId': node_id,
        'applyTo': apply_to,
        'border': border,
    })

    # Re-inspect: never trust the call's own success flag alone.
    after = doc.tables.get_properties({'nodeId': node_id}).get('borders') or {}
    mismatched = [
        side for side in _SIDES_FOR_APPLY_TO[apply_to]
        if (after.get(side) or {}).get('lineStyle') != border['lineStyle']
        or (after.get(side) or {}).get('lineWeightPt') != border['lineWeightPt']
        or _norm_color((after.get(side) or {}).get('color')) != _norm_color(border['color'])
    ]
    if mismatched:
        raise RuntimeError(
            f'Border update did not land on side(s) {mismatched}: read-back {after!r}.'
        )

    return {
        'tableOrdinal': ordinal,
        'nodeId': node_id,
        'applyTo': apply_to,
        'applied': border,
        'bordersBefore': before,
        'bordersAfter': after,
    }


embolden_table_borders = define_action(
    name='superdoc.embolden_table_borders',
    description=(
        'Make a table\'s borders bold: apply a heavier border weight and/or style to a table. '
        'Use when asked to bold/thicken/emphasize table borders. '
        'args: {tableOrdinal? (1-based, default 1), applyTo? (all|outside|inside|top|bottom|left|right|insideH|insideV, '
        'default all), lineWeightPt? (default 2.25), lineStyle? (default single), color? (hex, default #000000)}.'
    ),
    input_schema={
        'type': 'object',
        'properties': {
            'tableOrdinal': {
                'type': 'number',
                'default': 1,
                'description': '1-based table position in the document (1 = first table).',
            },
            'applyTo': {
                'type': 'string',
                'enum': ['all', 'outside', 'inside', 'top', 'bottom', 'left', 'right', 'insideH', 'insideV'],
                'default': 'all',
                'description': 'Which borders to embolden (default: every border, outer and inner).',
            },
            'lineWeightPt': {
                'type': 'number',
                'exclusiveMinimum': 0,
                'default': 2.25,
                'description': 'Border line weight in points (Word default grid is 0.5pt; 2.25pt reads as bold).',
            },
            'lineStyle': {
                'type': 'string',
                'enum': ['single', 'thick', 'double', 'dashed', 'dotted'],
                'default': 'single',
                'description': 'OOXML border line style.',
            },
            'color': {
                'type': 'string',
                'default': '#000000',
                'description': 'Border color as hex, e.g. #000000.',
            },
        },
        'required': [],
    },
    run=_embolden_table_borders,
)

ACTIONS = [embolden_table_borders]
