"""ACME's in-house custom actions for SuperDoc agents.

Two tiers demonstrated:
  - `steps` (declarative): compose built-in core actions — inherits target
    resolution, placement handling, receipts, and verification.
  - `run` (native): a Python function against the typed doc handle, for things
    the built-in actions can't express.

Every module in this directory that exposes an ``ACTIONS`` list is loaded by
app.py and merged into the agent's tool surface.
"""

from superdoc import define_action

stamp_confidential = define_action(
    name='superdoc.stamp_confidential',
    description=(
        'Insert a confidentiality banner paragraph at the very top of the document '
        'and flag it with a review comment for the distribution team.'
    ),
    input_schema={
        'type': 'object',
        'properties': {
            'label': {'type': 'string', 'default': 'CONFIDENTIAL', 'description': 'Banner text'},
        },
        'required': [],
    },
    steps=[
        {
            'action': 'insert_paragraphs',
            'args': {'texts': ['{{label}}'], 'placement': {'at': 'document_start'}},
        },
        {
            'action': 'add_comments',
            'args': {
                'selectors': [{'kind': 'textSearch', 'terms': ['{{label}}'], 'occurrence': 1}],
                'commentText': 'Auto-stamped by ACME policy. Verify the distribution list before sending.',
            },
        },
    ],
)


def _doc_stats(doc, args):
    """Cross-domain read the built-in actions can't express as one verb."""
    blocks = doc.blocks.list()
    comments = doc.comments.list({})
    rows = blocks['blocks']
    comment_items = comments.get('comments') or comments.get('items') or []
    return {
        'blocks': blocks['total'],
        'emptyBlocks': sum(1 for b in rows if b.get('isEmpty')),
        'tables': sum(1 for b in rows if b.get('nodeType') == 'table'),
        'comments': len(comment_items),
    }


doc_stats = define_action(
    name='superdoc.doc_stats',
    description='Report document structure statistics: block/table/comment counts and empty-block count.',
    input_schema={'type': 'object', 'properties': {}, 'required': []},
    run=_doc_stats,
)

ACTIONS = [stamp_confidential, doc_stats]
