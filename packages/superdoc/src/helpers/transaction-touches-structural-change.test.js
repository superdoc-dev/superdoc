import { describe, it, expect } from 'vitest';
import { transactionTouchesStructuralChange } from './transaction-touches-structural-change.js';

// Minimal PM-like stubs. We only exercise the docChanged + mapping + nodesBetween
// traversal contract the helper depends on, not a real ProseMirror document.

const makeMapping = (ranges) => ({
  maps: ranges.map(() => ({
    forEach(cb) {
      // Report a single output range per map. Coordinates are arbitrary; the
      // helper maps them through slice().map() which we make identity below.
      cb(0, 0, 0, 100);
    },
  })),
  slice() {
    return { map: (pos) => pos };
  },
});

const makeDoc = (rows) => ({
  content: { size: 1000 },
  nodesBetween(_from, _to, cb) {
    for (const row of rows) {
      const keepGoing = cb(row);
      if (keepGoing === false) break;
    }
  },
});

const tableRow = (trackChangeType) => ({
  type: { name: 'tableRow' },
  attrs: trackChangeType ? { trackChange: { type: trackChangeType } } : {},
});

const paragraph = () => ({ type: { name: 'paragraph' }, attrs: {} });

describe('transactionTouchesStructuralChange', () => {
  it('returns false when the transaction did not change the doc', () => {
    expect(transactionTouchesStructuralChange({ docChanged: false })).toBe(false);
  });

  it('returns false when no tracked table rows are in the touched range', () => {
    const transaction = {
      docChanged: true,
      doc: makeDoc([paragraph(), tableRow(null)]),
      mapping: makeMapping([1]),
    };
    expect(transactionTouchesStructuralChange(transaction)).toBe(false);
  });

  it('returns true when a touched table row carries a rowInsert track change', () => {
    const transaction = {
      docChanged: true,
      doc: makeDoc([paragraph(), tableRow('rowInsert')]),
      mapping: makeMapping([1]),
    };
    expect(transactionTouchesStructuralChange(transaction)).toBe(true);
  });

  it('returns true when a touched table row carries a rowDelete track change', () => {
    const transaction = {
      docChanged: true,
      doc: makeDoc([tableRow('rowDelete')]),
      mapping: makeMapping([1]),
    };
    expect(transactionTouchesStructuralChange(transaction)).toBe(true);
  });
});
