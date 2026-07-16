"""ACME custom actions: footnotes + page headers (both `run` tier).

Why run tier (SKILL.md §1 tier rule): neither domain is covered by the 40
built-in core actions — the `superdoc_perform_action` enum has no footnote or
header/footer verbs — and the built-in `insert_paragraphs` placement cannot
target a header/footer story. So these are native Python functions against the
typed doc handle.

Discovery notes (probed live, not guessed — SKILL.md §3):
  - `doc.footnotes.insert({at, type, content})` anchors a note at a TextTarget;
    a zero-width range `{start: N, end: N}` puts the reference marker right
    after the anchor text (verified in word/document.xml + word/footnotes.xml).
  - `doc.headerFooters.parts.create({kind})` creates an EMPTY part and returns
    `{refId, partPath}`. It has NO content parameter — unknown params are
    silently ignored (a `content` arg "succeeds" but writes nothing).
  - Header text is written by `doc.create.paragraph({text, in: <StoryLocator>})`
    with `in = {kind:'story', storyType:'headerFooterPart', refId}`, then the
    section slot is wired with `doc.headerFooters.refs.set({target, refId})`
    where target is `{kind:'headerFooterSlot', section, headerFooterKind,
    variant}`. Creating a fresh part per call gives true SET/replace semantics.
  - `doc.blocks.list({'in': <story>})` validates the story locator but does NOT
    honor it (returns body blocks), so header read-back uses
    `doc.headerFooters.get` (refId + isExplicit) in-session; text-level
    evidence requires save + zip inspection (done in tests).
"""

from superdoc import define_action

_PAGE = 200


def _iter_text_blocks(doc):
    """Paginate body blocks with full text, by stable nodeId."""
    offset = 0
    total = None
    while total is None or offset < total:
        page = doc.blocks.list({'offset': offset, 'limit': _PAGE, 'includeText': True})
        total = page['total']
        blocks = page.get('blocks') or []
        if not blocks:
            break
        yield from blocks
        offset += len(blocks)


def _find_anchor(doc, anchor_text, occurrence, case_sensitive):
    """Locate the Nth non-overlapping occurrence of anchor_text in reading
    order. Returns (block_nodeId, offset_after_match, matches_seen)."""
    needle = anchor_text if case_sensitive else anchor_text.lower()
    seen = 0
    for block in _iter_text_blocks(doc):
        text = block.get('text') or ''
        hay = text if case_sensitive else text.lower()
        start = 0
        while True:
            idx = hay.find(needle, start)
            if idx == -1:
                break
            seen += 1
            if seen == occurrence:
                return block['nodeId'], idx + len(anchor_text), seen
            start = idx + len(needle)
    return None, None, seen


# ---------------------------------------------------------------------------
# superdoc.add_footnote — run tier
# ---------------------------------------------------------------------------

def _add_footnote(doc, args):
    anchor_text = str(args.get('anchorText') or '')
    content = str(args.get('content') or '')
    if not anchor_text.strip():
        raise ValueError('superdoc.add_footnote: "anchorText" must be a non-empty string.')
    if not content.strip():
        raise ValueError('superdoc.add_footnote: "content" must be a non-empty string.')
    raw_occurrence = args.get('occurrence')
    occurrence = 1 if raw_occurrence is None else int(raw_occurrence)
    if occurrence < 1:
        raise ValueError('superdoc.add_footnote: "occurrence" must be >= 1.')
    note_type = args.get('type') or 'footnote'
    case_sensitive = args.get('caseSensitive') is True

    block_id, end_offset, seen = _find_anchor(doc, anchor_text, occurrence, case_sensitive)
    if block_id is None:
        raise ValueError(
            f'superdoc.add_footnote: anchor text {anchor_text!r} occurrence {occurrence} '
            f'not found in the document body (found {seen} match(es)).'
        )

    before = doc.footnotes.list({'type': note_type})
    before_count = before['total']

    receipt = doc.footnotes.insert({
        # Zero-width target = insertion point immediately AFTER the anchor text,
        # which is where Word places a footnote reference marker.
        'at': {'kind': 'text', 'segments': [{'blockId': block_id, 'range': {'start': end_offset, 'end': end_offset}}]},
        'type': note_type,
        'content': content,
    })
    note = (receipt or {}).get('footnote') or {}
    note_id = note.get('noteId')
    if not (isinstance(receipt, dict) and receipt.get('success') and note_id is not None):
        raise RuntimeError(f'superdoc.add_footnote: footnotes.insert did not return a note id: {receipt!r}')

    # Read-back verification (SKILL.md §4): the note count grew by exactly one
    # and the created note carries our content. Never trust the insert receipt.
    after = doc.footnotes.list({'type': note_type})
    if after['total'] != before_count + 1:
        raise RuntimeError(
            f'superdoc.add_footnote: verification failed — expected {note_type} count '
            f'{before_count + 1}, read back {after["total"]}.'
        )
    created = next((item for item in after.get('items', []) if item.get('noteId') == note_id), None)
    if created is None or created.get('content') != content:
        raise RuntimeError(
            f'superdoc.add_footnote: verification failed — note {note_id} content mismatch '
            f'(read back {created!r}).'
        )

    return {
        'noteId': note_id,
        'displayNumber': created.get('displayNumber'),
        'type': note_type,
        'anchorBlockId': block_id,
        'anchorOffset': end_offset,
        'notesOfTypeAfter': after['total'],
    }


add_footnote = define_action(
    name='superdoc.add_footnote',
    description=(
        'Insert a footnote (or endnote) whose reference marker lands immediately after the Nth '
        'occurrence of a body text snippet. Use when a citation, source, or clarification must be '
        'attached to specific wording. args: {anchorText, content, occurrence?, type?, caseSensitive?}.'
    ),
    input_schema={
        'type': 'object',
        'properties': {
            'anchorText': {
                'type': 'string',
                'description': 'Body text to anchor on; the note marker is placed right after this text.',
            },
            'content': {'type': 'string', 'description': 'The note body text.'},
            'occurrence': {
                'type': 'number',
                'default': 1,
                'description': '1-based occurrence of anchorText to anchor on (reading order).',
            },
            'type': {'type': 'string', 'enum': ['footnote', 'endnote'], 'default': 'footnote'},
            # `caseSensitive` is also a built-in arg (bare boolean); to reuse the
            # name we keep the schema identical except for the description (a
            # differing default/enum/limit would be a real conflict). The run
            # body applies the false default itself.
            'caseSensitive': {
                'type': 'boolean',
                'description': 'Match anchorText case-sensitively. Defaults to false.',
            },
        },
        'required': ['anchorText', 'content'],
    },
    run=_add_footnote,
)


# ---------------------------------------------------------------------------
# superdoc.set_page_header — run tier
# ---------------------------------------------------------------------------

_VARIANTS = ('default', 'first', 'even')


def _set_page_header(doc, args):
    text = str(args.get('text') or '')
    if not text.strip():
        raise ValueError('superdoc.set_page_header: "text" must be a non-empty string.')
    variant = args.get('variant') or 'default'
    if variant not in _VARIANTS:
        raise ValueError(f'superdoc.set_page_header: "variant" must be one of {list(_VARIANTS)}.')

    sections = doc.sections.list({})['items']
    section_index = args.get('sectionIndex')
    if section_index is None:
        targets = sections
    else:
        index = int(section_index)
        if index < 0 or index >= len(sections):
            raise ValueError(
                f'superdoc.set_page_header: sectionIndex {index} out of range '
                f'(document has {len(sections)} section(s)).'
            )
        targets = [sections[index]]

    if variant == 'even':
        # Even-page headers only render when odd/even headers are enabled.
        doc.sections.set_odd_even_headers_footers({'enabled': True})

    slots = []
    for section in targets:
        section_id = section['id']
        part = doc.header_footers.parts.create({'kind': 'header'})
        ref_id = part.get('refId') if isinstance(part, dict) else None
        if not (isinstance(part, dict) and part.get('success') and ref_id):
            raise RuntimeError(f'superdoc.set_page_header: parts.create failed: {part!r}')

        # Write the header text into the FRESH part's story. parts.create has no
        # content parameter (probed: unknown params are silently ignored), so the
        # paragraph must be created inside the part story explicitly.
        para = doc.create.paragraph({
            'text': text,
            'in': {'kind': 'story', 'storyType': 'headerFooterPart', 'refId': ref_id},
        })
        if not (isinstance(para, dict) and para.get('success')):
            raise RuntimeError(f'superdoc.set_page_header: create.paragraph failed for part {ref_id}: {para!r}')

        # Point the section slot at the new part — replaces any previous header.
        slot_target = {
            'kind': 'headerFooterSlot',
            'section': {'kind': 'section', 'sectionId': section_id},
            'headerFooterKind': 'header',
            'variant': variant,
        }
        wired = doc.header_footers.refs.set({'target': slot_target, 'refId': ref_id})
        if not (isinstance(wired, dict) and wired.get('success')):
            raise RuntimeError(f'superdoc.set_page_header: refs.set failed for section {section_id}: {wired!r}')

        if variant == 'first':
            # First-page headers only render when the section has a title page.
            doc.sections.set_title_page({'target': {'kind': 'section', 'sectionId': section_id}, 'enabled': True})

        # Read-back verification (SKILL.md §4): the slot must now explicitly
        # reference OUR part. (Header text itself is not readable in-session —
        # blocks.list story scoping is not honored — so tests additionally save
        # and inspect the .docx part XML.)
        read_back = doc.header_footers.get({'target': slot_target})
        if not (isinstance(read_back, dict) and read_back.get('isExplicit') and read_back.get('refId') == ref_id):
            raise RuntimeError(
                f'superdoc.set_page_header: verification failed for section {section_id} — '
                f'slot reads {read_back!r}, expected explicit refId {ref_id}.'
            )
        slots.append({'sectionId': section_id, 'refId': ref_id, 'partPath': part.get('partPath')})

    return {'text': text, 'variant': variant, 'sectionsUpdated': len(slots), 'slots': slots}


set_page_header = define_action(
    name='superdoc.set_page_header',
    description=(
        'Set (replace) the page header text for every section, or one section via sectionIndex. '
        'Creates a fresh header part, writes the text into it, and wires the section header slot '
        'to it; variant "first"/"even" also enables the title-page / odd-even setting so the '
        'header actually renders. args: {text, variant?, sectionIndex?}.'
    ),
    input_schema={
        'type': 'object',
        'properties': {
            'text': {'type': 'string', 'description': 'The header paragraph text.'},
            'variant': {
                'type': 'string',
                'enum': list(_VARIANTS),
                'default': 'default',
                'description': 'Which header slot to set: default (all pages), first (first page), even (even pages).',
            },
            'sectionIndex': {
                'type': 'number',
                'description': '0-based section to target. Omit to set the header on every section.',
            },
        },
        'required': ['text'],
    },
    run=_set_page_header,
)

ACTIONS = [add_footnote, set_page_header]
