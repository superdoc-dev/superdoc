import { test, expect } from '../../fixtures/superdoc.js';
import {
  selectionScope,
  contentControlLifecycle,
  caretLocation,
  bodyMutation,
  type InlineSdtSnapshot,
  type InlineSdtRange,
} from '../../helpers/sdt.js';

/**
 * Pure unit tests for the parity axis helpers - no browser. Synthetic
 * snapshots exercise each axis value so the consumer specs can rely on these
 * one-liners instead of re-deriving from/to math (which is where the
 * edge-direction bug crept in earlier).
 */

// Inline SDT at pos 8: node [8,24), content [9,23). " After" follows.
const RANGE: InlineSdtRange = { id: '1', pos: 8, start: 9, end: 23, nodeEnd: 24, content: 'inline value' };

function snap(p: Partial<InlineSdtSnapshot>): InlineSdtSnapshot {
  return {
    from: 0,
    to: 0,
    empty: true,
    nodeType: null,
    sdtExists: true,
    sdtContent: 'inline value',
    sdtPos: 8,
    docText: 'Before inline value After',
    docSize: 33,
    paragraphCount: 1,
    ...p,
  };
}

test.describe('selectionScope', () => {
  test('collapsed', () => {
    expect(selectionScope(snap({ from: 12, to: 12, empty: true }), RANGE)).toBe('collapsed');
  });
  test('cc-content (exact content range)', () => {
    expect(selectionScope(snap({ from: 9, to: 23, empty: false }), RANGE)).toBe('cc-content');
  });
  test('whole-content-control (node incl boundaries)', () => {
    expect(selectionScope(snap({ from: 8, to: 24, empty: false }), RANGE)).toBe('whole-content-control');
  });
  test('within-cc (sub-range of content)', () => {
    expect(selectionScope(snap({ from: 10, to: 14, empty: false }), RANGE)).toBe('within-cc');
  });
  test('cc-and-beyond (overlaps and spills out)', () => {
    expect(selectionScope(snap({ from: 12, to: 28, empty: false }), RANGE)).toBe('cc-and-beyond');
  });
  test('whole-document', () => {
    expect(selectionScope(snap({ from: 0, to: 33, empty: false, docSize: 33 }), RANGE)).toBe('whole-document');
  });
  test('outside-cc', () => {
    expect(selectionScope(snap({ from: 1, to: 5, empty: false }), RANGE)).toBe('outside-cc');
  });
});

test.describe('contentControlLifecycle', () => {
  test('preserved (present, content unchanged)', () => {
    expect(contentControlLifecycle(snap({}), snap({}))).toBe('preserved');
  });
  test('preserved (present, content changed but not emptied)', () => {
    expect(contentControlLifecycle(snap({ sdtContent: 'inline value' }), snap({ sdtContent: 'inline valu' }))).toBe(
      'preserved',
    );
  });
  test('emptied (non-empty to empty, still present)', () => {
    expect(contentControlLifecycle(snap({ sdtContent: 'inline value' }), snap({ sdtContent: '' }))).toBe('emptied');
  });
  test('deleted (present to absent)', () => {
    expect(contentControlLifecycle(snap({ sdtExists: true }), snap({ sdtExists: false, sdtContent: null }))).toBe(
      'deleted',
    );
  });
  test('created (absent to present)', () => {
    expect(contentControlLifecycle(snap({ sdtExists: false, sdtContent: null }), snap({ sdtExists: true }))).toBe(
      'created',
    );
  });
  test('none (absent throughout)', () => {
    expect(
      contentControlLifecycle(
        snap({ sdtExists: false, sdtContent: null }),
        snap({ sdtExists: false, sdtContent: null }),
      ),
    ).toBe('none');
  });
});

test.describe('caretLocation', () => {
  test('inside-cc', () => {
    expect(caretLocation(snap({ from: 15, to: 15, empty: true }), RANGE)).toBe('inside-cc');
  });
  test('before-cc', () => {
    expect(caretLocation(snap({ from: 8, to: 8, empty: true }), RANGE)).toBe('before-cc');
  });
  test('after-cc', () => {
    expect(caretLocation(snap({ from: 24, to: 24, empty: true }), RANGE)).toBe('after-cc');
  });
  test('null for a range selection', () => {
    expect(caretLocation(snap({ from: 9, to: 23, empty: false }), RANGE)).toBeNull();
  });
});

test.describe('bodyMutation', () => {
  test('none', () => {
    expect(bodyMutation(snap({}), snap({}))).toBe('none');
  });
  test('text-changed', () => {
    expect(
      bodyMutation(snap({ docText: 'Before inline value After' }), snap({ docText: 'Before inline valu After' })),
    ).toBe('text-changed');
  });
  test('structure-changed (paragraph count differs)', () => {
    expect(bodyMutation(snap({ paragraphCount: 1 }), snap({ paragraphCount: 2 }))).toBe('structure-changed');
  });
});
