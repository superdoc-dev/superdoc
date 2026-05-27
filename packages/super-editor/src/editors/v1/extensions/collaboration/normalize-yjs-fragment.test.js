import { describe, expect, it } from 'vitest';
import { Doc as YDoc, XmlElement, XmlText } from 'yjs';
import { normalizeYjsFragmentEventsForSchema, normalizeYjsFragmentForSchema } from './normalize-yjs-fragment.js';

const NORMALIZE_ORIGIN = Symbol.for('superdoc/yjs-fragment-normalize');

function buildRunWithText(value) {
  const run = new XmlElement('run');
  const text = new XmlText();
  text.insert(0, value);
  run.insert(0, [text]);
  return { run, text };
}

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
    const { run, text } = buildRunWithText('1');
    crossReference.insert(0, [run]);
    root.insert(0, [crossReference]);

    try {
      expect(normalizeYjsFragmentEventsForSchema([{ target: text }], root)).toBe(true);
      expect(crossReference.getAttribute('resolvedText')).toBe('1');
      expect(crossReference.length).toBe(0);
    } finally {
      ydoc.destroy();
    }
  });

  it('normalizes an ancestor citation when the changed event target is nested text', () => {
    const ydoc = new YDoc();
    const root = ydoc.getXmlFragment('supereditor');
    const citation = new XmlElement('citation');
    const { run, text } = buildRunWithText('(Smith, 2024)');
    citation.insert(0, [run]);
    root.insert(0, [citation]);

    try {
      expect(normalizeYjsFragmentEventsForSchema([{ target: text }], root)).toBe(true);
      expect(citation.getAttribute('resolvedText')).toBe('(Smith, 2024)');
      expect(citation.length).toBe(0);
    } finally {
      ydoc.destroy();
    }
  });

  it('backfills empty citation resolvedText from nested cached result text before deleting children', () => {
    const ydoc = new YDoc();
    const root = ydoc.getXmlFragment('supereditor');
    const citation = new XmlElement('citation');
    citation.setAttribute('resolvedText', '');
    const { run } = buildRunWithText(' \u200e(Mor, 2006) ');
    citation.insert(0, [run]);
    root.insert(0, [citation]);

    try {
      expect(normalizeYjsFragmentForSchema(root)).toBe(true);
      expect(citation.getAttribute('resolvedText')).toBe(' \u200e(Mor, 2006) ');
      expect(citation.length).toBe(0);
    } finally {
      ydoc.destroy();
    }
  });

  it('backfills empty crossReference resolvedText from multiple cached result runs before deleting children', () => {
    const ydoc = new YDoc();
    const root = ydoc.getXmlFragment('supereditor');
    const crossReference = new XmlElement('crossReference');
    crossReference.setAttribute('resolvedText', '');
    crossReference.setAttribute('target', '_Ref123');
    const first = buildRunWithText('\u200eTarget ');
    const second = buildRunWithText('Heading');
    crossReference.insert(0, [first.run, second.run]);
    root.insert(0, [crossReference]);

    try {
      expect(normalizeYjsFragmentForSchema(root)).toBe(true);
      expect(crossReference.getAttribute('resolvedText')).toBe('\u200eTarget Heading');
      expect(crossReference.length).toBe(0);
    } finally {
      ydoc.destroy();
    }
  });

  it('backfills plain text from formatted XmlText without leaking Yjs XML tags', () => {
    const ydoc = new YDoc();
    const root = ydoc.getXmlFragment('supereditor');
    const crossReference = new XmlElement('crossReference');
    crossReference.setAttribute('resolvedText', '');
    const { run, text } = buildRunWithText('Target Heading');
    text.format(7, 7, { italic: {} });
    crossReference.insert(0, [run]);
    root.insert(0, [crossReference]);

    try {
      expect(normalizeYjsFragmentForSchema(root)).toBe(true);
      expect(crossReference.getAttribute('resolvedText')).toBe('Target Heading');
      expect(crossReference.getAttribute('resolvedText')).not.toContain('<');
      expect(crossReference.length).toBe(0);
    } finally {
      ydoc.destroy();
    }
  });

  it('does not overwrite non-empty resolvedText when deleting cached children', () => {
    const ydoc = new YDoc();
    const root = ydoc.getXmlFragment('supereditor');
    const citation = new XmlElement('citation');
    citation.setAttribute('resolvedText', '(Canonical, 2024)');
    const { run } = buildRunWithText('(Stale, 2023)');
    citation.insert(0, [run]);
    root.insert(0, [citation]);

    try {
      expect(normalizeYjsFragmentForSchema(root)).toBe(true);
      expect(citation.getAttribute('resolvedText')).toBe('(Canonical, 2024)');
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
