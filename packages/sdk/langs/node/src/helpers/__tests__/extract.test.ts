import { describe, expect, test } from 'bun:test';
import {
  renderBlockText,
  getTrackedChangeTextParts,
  summarizeTrackedChange,
  getBlocksForTrackedChange,
  type ExtractBlockLike,
  type ExtractResultLike,
  type ExtractTrackedChangeLike,
} from '../extract.js';

// ---------------------------------------------------------------------------
// Fixture builders — keep tests readable and isolated from contract changes.
// ---------------------------------------------------------------------------

function block(nodeId: string, text: string, spans?: ExtractBlockLike['textSpans']): ExtractBlockLike {
  const b: ExtractBlockLike = { nodeId, type: 'paragraph', text };
  if (spans) b.textSpans = spans;
  return b;
}

function tc(entityId: string, type: 'insert' | 'delete' | 'format') {
  return { entityId, type };
}

// ---------------------------------------------------------------------------
// renderBlockText
// ---------------------------------------------------------------------------

describe('renderBlockText', () => {
  test('returns block.text for clean blocks when there is nothing unsafe to escape', () => {
    const b = block('p1', 'plain text only');
    expect(renderBlockText(b)).toBe('plain text only');
    expect(renderBlockText(b, { trackedChanges: 'markdown' })).toBe('plain text only');
    expect(renderBlockText(b, { trackedChanges: 'plain' })).toBe('plain text only');
  });

  test('html: escapes clean-block text containing HTML metacharacters', () => {
    // The common case: a block has no tracked changes (so no textSpans) but
    // its plain text contains characters that would be unsafe to inject into
    // the DOM. The helper must still escape — otherwise consumers following
    // the docs ("html output is safe for direct DOM rendering") would ship
    // an XSS hole on their first untracked block.
    const b = block('p1', 'Use <script>alert(1)</script> & similar tags carefully');
    const out = renderBlockText(b, { trackedChanges: 'html' });
    expect(out).toBe('Use &lt;script&gt;alert(1)&lt;/script&gt; &amp; similar tags carefully');
    expect(out).not.toContain('<script>');
  });

  test('markdown and plain: clean-block text is not escaped', () => {
    // Markdown sources expect raw text; 'plain' is the explicit opt-out.
    const b = block('p1', 'Use <script> tags');
    expect(renderBlockText(b, { trackedChanges: 'markdown' })).toBe('Use <script> tags');
    expect(renderBlockText(b, { trackedChanges: 'plain' })).toBe('Use <script> tags');
  });

  test('html: wraps insert/delete spans with semantic tags and entity ids', () => {
    const b = block('p1', 'The old new word', [
      { text: 'The ' },
      { text: 'old', trackedChanges: [tc('e1', 'delete')] },
      { text: 'new', trackedChanges: [tc('e2', 'insert')] },
      { text: ' word' },
    ]);
    const out = renderBlockText(b, { trackedChanges: 'html' });
    expect(out).toBe('The <del data-tc-id="e1">old</del><ins data-tc-id="e2">new</ins> word');
  });

  test('html: defaults to html when no format option provided', () => {
    const b = block('p1', 'a', [{ text: 'a', trackedChanges: [tc('e1', 'insert')] }]);
    expect(renderBlockText(b)).toBe('<ins data-tc-id="e1">a</ins>');
  });

  test('html: HTML-escapes span text and entity ids in attributes', () => {
    const b = block('p1', '<unsafe> & "quoted" \'apostrophe\'', [
      {
        text: '<unsafe> & "quoted" \'apostrophe\'',
        trackedChanges: [tc('id-with-"quote"', 'insert')],
      },
    ]);
    const out = renderBlockText(b, { trackedChanges: 'html' });
    expect(out).toContain('&lt;unsafe&gt;');
    expect(out).toContain('&amp;');
    expect(out).toContain('&quot;quoted&quot;');
    expect(out).toContain('&#39;apostrophe&#39;');
    expect(out).toContain('data-tc-id="id-with-&quot;quote&quot;"');
    expect(out).not.toContain('<unsafe>');
    expect(out).not.toContain('id-with-"quote"');
  });

  test('html: escapes plain (non-tracked) span text too', () => {
    const b = block('p1', '<plain>', [{ text: '<plain>' }]);
    // Block has no tracked-change spans at all, so falls through to block.text.
    // To exercise the plain-span escape path we need a textSpans array with
    // at least one tracked span — but escaping must still apply to the
    // non-tracked spans alongside it.
    const b2 = block('p1', '<a><b>', [{ text: '<a>' }, { text: '<b>', trackedChanges: [tc('e1', 'insert')] }]);
    const out = renderBlockText(b2, { trackedChanges: 'html' });
    expect(out).toBe('&lt;a&gt;<ins data-tc-id="e1">&lt;b&gt;</ins>');
    void b;
  });

  test('markdown: wraps inserts with {+...+} and deletes with {-...-}', () => {
    const b = block('p1', 'A old new B', [
      { text: 'A ' },
      { text: 'old', trackedChanges: [tc('e1', 'delete')] },
      { text: ' ' },
      { text: 'new', trackedChanges: [tc('e2', 'insert')] },
      { text: ' B' },
    ]);
    const out = renderBlockText(b, { trackedChanges: 'markdown' });
    expect(out).toBe('A {-old-} {+new+} B');
  });

  test('markdown: does not escape — markdown sources expect raw text', () => {
    const b = block('p1', '<x>', [{ text: '<x>', trackedChanges: [tc('e1', 'insert')] }]);
    expect(renderBlockText(b, { trackedChanges: 'markdown' })).toBe('{+<x>+}');
  });

  test('plain: returns block.text unchanged even when spans carry markers', () => {
    const b = block('p1', 'old new', [
      { text: 'old', trackedChanges: [tc('e1', 'delete')] },
      { text: ' new', trackedChanges: [tc('e2', 'insert')] },
    ]);
    expect(renderBlockText(b, { trackedChanges: 'plain' })).toBe('old new');
  });

  test('format-only tracked changes are not rendered as markers', () => {
    // A run that's only `format` (not insert/delete) carries a tracked
    // change but the visible text doesn't change pre/post-edit. Markers
    // would be misleading.
    const b = block('p1', 'bold text', [{ text: 'bold', trackedChanges: [tc('e1', 'format')] }, { text: ' text' }]);
    expect(renderBlockText(b)).toBe('bold text');
  });

  test('overlapping insert + format: insert wins for the marker (renders as <ins>)', () => {
    const b = block('p1', 'inserted-and-bold', [
      {
        text: 'inserted-and-bold',
        trackedChanges: [tc('e-fmt', 'format'), tc('e-ins', 'insert')],
      },
    ]);
    const out = renderBlockText(b, { trackedChanges: 'html' });
    expect(out).toBe('<ins data-tc-id="e-ins">inserted-and-bold</ins>');
  });
});

// ---------------------------------------------------------------------------
// getBlocksForTrackedChange
// ---------------------------------------------------------------------------

describe('getBlocksForTrackedChange', () => {
  test('reads change.blockIds first', () => {
    const b1 = block('p1', 'a', [{ text: 'a', trackedChanges: [tc('e1', 'insert')] }]);
    const b2 = block('p2', 'b', [{ text: 'b', trackedChanges: [tc('e1', 'insert')] }]);
    const b3 = block('p3', 'c');
    const change: ExtractTrackedChangeLike = { entityId: 'e1', type: 'insert', blockIds: ['p1', 'p2'] };
    expect(getBlocksForTrackedChange(change, [b1, b2, b3]).map((b) => b.nodeId)).toEqual(['p1', 'p2']);
  });

  test('falls back to scanning spans when blockIds is empty', () => {
    const b1 = block('p1', 'a');
    const b2 = block('p2', 'b', [{ text: 'b', trackedChanges: [tc('e1', 'insert')] }]);
    const b3 = block('p3', 'c');
    const change: ExtractTrackedChangeLike = { entityId: 'e1', type: 'insert' };
    expect(getBlocksForTrackedChange(change, [b1, b2, b3]).map((b) => b.nodeId)).toEqual(['p2']);
  });

  test('falls back to scanning spans when blockIds is an empty array', () => {
    const b1 = block('p1', 'a', [{ text: 'a', trackedChanges: [tc('e1', 'delete')] }]);
    const change: ExtractTrackedChangeLike = { entityId: 'e1', type: 'delete', blockIds: [] };
    expect(getBlocksForTrackedChange(change, [b1]).map((b) => b.nodeId)).toEqual(['p1']);
  });

  test('returns blocks in input order (matches document order on real responses)', () => {
    const b1 = block('p1', 'a', [{ text: 'a', trackedChanges: [tc('e1', 'insert')] }]);
    const b2 = block('p2', 'b', [{ text: 'b', trackedChanges: [tc('e1', 'insert')] }]);
    const change: ExtractTrackedChangeLike = { entityId: 'e1', type: 'insert', blockIds: ['p2', 'p1'] };
    // blockIds order is metadata; iteration order matches the input array.
    expect(getBlocksForTrackedChange(change, [b1, b2]).map((b) => b.nodeId)).toEqual(['p1', 'p2']);
  });
});

// ---------------------------------------------------------------------------
// getTrackedChangeTextParts / summarizeTrackedChange
// ---------------------------------------------------------------------------

describe('getTrackedChangeTextParts', () => {
  test('paired replacement: surfaces per-half text and a "deleted X, inserted Y" summary', () => {
    // The customer-shape case: one entityId on both halves, no excerpt
    // on the change (paired replacements suppress aggregate excerpt).
    const b = block('p1', 'The Report is gone Captain’s Log', [
      { text: 'The ' },
      { text: 'Report', trackedChanges: [tc('shared', 'delete')] },
      { text: ' is gone ' },
      { text: 'Captain’s Log', trackedChanges: [tc('shared', 'insert')] },
    ]);
    const change: ExtractTrackedChangeLike = {
      entityId: 'shared',
      type: 'insert',
      blockIds: ['p1'],
    };
    const result: ExtractResultLike = { blocks: [b], trackedChanges: [change] };

    const parts = getTrackedChangeTextParts(change, result);
    expect(parts.deleted).toBe('Report');
    expect(parts.inserted).toBe('Captain’s Log');
    expect(parts.formatted).toBe('');
    expect(parts.summary).toBe('deleted "Report", inserted "Captain’s Log"');
  });

  test('in-app paired replacement (no wordRevisionIds): summary still derives from spans', () => {
    // wordRevisionIds is absent for tracked changes created via in-app
    // editing rather than imported OOXML. The helper must not depend on
    // that field.
    const b = block('p1', 'old new', [
      { text: 'old', trackedChanges: [tc('inapp', 'delete')] },
      { text: ' ' },
      { text: 'new', trackedChanges: [tc('inapp', 'insert')] },
    ]);
    const change: ExtractTrackedChangeLike = {
      entityId: 'inapp',
      type: 'insert',
      blockIds: ['p1'],
    };
    const parts = getTrackedChangeTextParts(change, { blocks: [b], trackedChanges: [change] });
    expect(parts.summary).toBe('deleted "old", inserted "new"');
  });

  test('delete-only change: only `deleted` populates', () => {
    const b = block('p1', 'gone', [{ text: 'gone', trackedChanges: [tc('e1', 'delete')] }]);
    const change: ExtractTrackedChangeLike = {
      entityId: 'e1',
      type: 'delete',
      blockIds: ['p1'],
    };
    const parts = getTrackedChangeTextParts(change, { blocks: [b], trackedChanges: [change] });
    expect(parts).toEqual({ inserted: '', deleted: 'gone', formatted: '', summary: 'deleted "gone"' });
  });

  test('insert-only change: only `inserted` populates', () => {
    const b = block('p1', 'new', [{ text: 'new', trackedChanges: [tc('e1', 'insert')] }]);
    const change: ExtractTrackedChangeLike = {
      entityId: 'e1',
      type: 'insert',
      blockIds: ['p1'],
    };
    const parts = getTrackedChangeTextParts(change, { blocks: [b], trackedChanges: [change] });
    expect(parts).toEqual({ inserted: 'new', deleted: '', formatted: '', summary: 'inserted "new"' });
  });

  test('format-only change: only `formatted` populates', () => {
    const b = block('p1', 'bold', [{ text: 'bold', trackedChanges: [tc('e1', 'format')] }]);
    const change: ExtractTrackedChangeLike = {
      entityId: 'e1',
      type: 'format',
      blockIds: ['p1'],
    };
    const parts = getTrackedChangeTextParts(change, { blocks: [b], trackedChanges: [change] });
    expect(parts.formatted).toBe('bold');
    expect(parts.summary).toBe('reformatted "bold"');
  });

  test('cross-block change: collects spans from every block', () => {
    const b1 = block('p1', 'first', [{ text: 'first', trackedChanges: [tc('e1', 'insert')] }]);
    const b2 = block('p2', 'second', [{ text: 'second', trackedChanges: [tc('e1', 'insert')] }]);
    const change: ExtractTrackedChangeLike = {
      entityId: 'e1',
      type: 'insert',
      blockIds: ['p1', 'p2'],
    };
    const parts = getTrackedChangeTextParts(change, { blocks: [b1, b2], trackedChanges: [change] });
    expect(parts.inserted).toBe('firstsecond');
  });

  test('returns empty when no matching blocks/spans are found', () => {
    const change: ExtractTrackedChangeLike = { entityId: 'missing', type: 'insert' };
    const parts = getTrackedChangeTextParts(change, { blocks: [], trackedChanges: [change] });
    expect(parts).toEqual({ inserted: '', deleted: '', formatted: '', summary: '' });
  });
});

describe('summarizeTrackedChange', () => {
  test('prefers SDK-provided excerpt when present', () => {
    const change: ExtractTrackedChangeLike = {
      entityId: 'e1',
      type: 'insert',
      excerpt: 'short excerpt from the API',
    };
    expect(summarizeTrackedChange(change, { blocks: [], trackedChanges: [change] })).toBe('short excerpt from the API');
  });

  test('falls back to derived summary for paired replacements (no excerpt)', () => {
    const b = block('p1', 'a b', [
      { text: 'a', trackedChanges: [tc('e1', 'delete')] },
      { text: ' ' },
      { text: 'b', trackedChanges: [tc('e1', 'insert')] },
    ]);
    const change: ExtractTrackedChangeLike = {
      entityId: 'e1',
      type: 'insert',
      blockIds: ['p1'],
    };
    expect(summarizeTrackedChange(change, { blocks: [b], trackedChanges: [change] })).toBe('deleted "a", inserted "b"');
  });

  test('returns empty string when neither excerpt nor spans yield content', () => {
    const change: ExtractTrackedChangeLike = { entityId: 'orphan', type: 'insert' };
    expect(summarizeTrackedChange(change, { blocks: [], trackedChanges: [change] })).toBe('');
  });
});
