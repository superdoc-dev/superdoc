import { describe, expect, it } from 'vitest';
import { Doc as YDoc, XmlElement, XmlText } from 'yjs';
import { normalizeYjsFragmentEventsForSchema, normalizeYjsFragmentForSchema } from './normalize-yjs-fragment.js';

const NORMALIZE_ORIGIN = Symbol.for('superdoc/yjs-fragment-normalize');

describe('normalizeYjsFragmentForSchema', () => {
  it('ignores non-Yjs fragment test doubles', () => {
    expect(normalizeYjsFragmentForSchema({ fragment: true })).toBe(false);
  });

  it('normalizes changed event target subtrees without walking the fallback fragment', () => {
    const ydoc = new YDoc();
    const root = ydoc.getXmlFragment('supereditor');
    const crossReference = new XmlElement('crossReference');
    crossReference.insert(0, [new XmlElement('run')]);
    root.insert(0, [crossReference]);
    const fallbackFragment = {
      toArray() {
        throw new Error('Expected event-scoped normalization to avoid full fragment traversal.');
      },
    };

    try {
      expect(normalizeYjsFragmentEventsForSchema([{ target: crossReference }], fallbackFragment)).toBe(true);
      expect(crossReference.length).toBe(0);
    } finally {
      ydoc.destroy();
    }
  });

  it('normalizes nested crossReference children during a full fragment walk', () => {
    const ydoc = new YDoc();
    const root = ydoc.getXmlFragment('supereditor');
    const paragraph = new XmlElement('paragraph');
    const crossReference = new XmlElement('crossReference');
    crossReference.insert(0, [new XmlElement('run')]);
    paragraph.insert(0, [crossReference]);
    root.insert(0, [paragraph]);

    try {
      expect(normalizeYjsFragmentForSchema(root)).toBe(true);
      expect(crossReference.length).toBe(0);
    } finally {
      ydoc.destroy();
    }
  });

  it('normalizes an ancestor crossReference when the changed event target is nested text', () => {
    const ydoc = new YDoc();
    const root = ydoc.getXmlFragment('supereditor');
    const crossReference = new XmlElement('crossReference');
    const run = new XmlElement('run');
    const text = new XmlText();
    text.insert(0, '1');
    run.insert(0, [text]);
    crossReference.insert(0, [run]);
    root.insert(0, [crossReference]);

    try {
      expect(normalizeYjsFragmentEventsForSchema([{ target: text }], root)).toBe(true);
      expect(crossReference.length).toBe(0);
    } finally {
      ydoc.destroy();
    }
  });

  it('normalizes an ancestor citation when the changed event target is nested text', () => {
    const ydoc = new YDoc();
    const root = ydoc.getXmlFragment('supereditor');
    const citation = new XmlElement('citation');
    const run = new XmlElement('run');
    const text = new XmlText();
    text.insert(0, '(Smith, 2024)');
    run.insert(0, [text]);
    citation.insert(0, [run]);
    root.insert(0, [citation]);

    try {
      expect(normalizeYjsFragmentEventsForSchema([{ target: text }], root)).toBe(true);
      expect(citation.length).toBe(0);
    } finally {
      ydoc.destroy();
    }
  });

  it('ignores events emitted by its own normalization transaction', () => {
    const ydoc = new YDoc();
    const root = ydoc.getXmlFragment('supereditor');
    const crossReference = new XmlElement('crossReference');
    crossReference.insert(0, [new XmlElement('run')]);
    root.insert(0, [crossReference]);

    try {
      expect(
        normalizeYjsFragmentEventsForSchema(
          [{ target: crossReference, transaction: { origin: NORMALIZE_ORIGIN } }],
          root,
        ),
      ).toBe(false);
      expect(crossReference.length).toBe(1);
    } finally {
      ydoc.destroy();
    }
  });

  it('wraps event-triggered normalization in a Yjs transaction with a stable origin', () => {
    const ydoc = new YDoc();
    const root = ydoc.getXmlFragment('supereditor');
    const crossReference = new XmlElement('crossReference');
    crossReference.insert(0, [new XmlElement('run')]);
    root.insert(0, [crossReference]);
    const origins = [];
    root.observeDeep((_events, transaction) => {
      origins.push(transaction.origin);
    });

    try {
      expect(normalizeYjsFragmentEventsForSchema([{ target: crossReference }], root)).toBe(true);
      expect(origins).toEqual([NORMALIZE_ORIGIN]);
    } finally {
      ydoc.destroy();
    }
  });
});
