/**
 * Round-trip merge gate.
 *
 * Each fixture imports a synthesized OOXML body twice and asserts the
 * resulting canonical FieldInstance snapshots are equal. A regression
 * anywhere in the substrate's import path — dropped fields, lost
 * dirty/locked flags, broken family attribution, mis-attached nesting —
 * fails one of these.
 *
 * Real DOCX fixtures will be added incrementally as specific issues
 * surface; for the substrate's invariants we run on synthesized OOXML
 * because it is cheaper and the parsing pipeline is byte-identical.
 */

import { describe, expect, it } from 'vitest';
import { snapshotFromXml, type FieldSnapshot } from './field-snapshot-harness.js';
import { canonicalizeFieldInstance } from './canonicalize-field-instance.js';
import { buildFieldInstanceFromImport } from './build-field-instance.js';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const fldChar = (kind: 'begin' | 'separate' | 'end', extra?: Record<string, string>) => ({
  name: 'w:r',
  elements: [{ name: 'w:fldChar', attributes: { 'w:fldCharType': kind, ...(extra ?? {}) } }],
});

const instrText = (text: string) => ({
  name: 'w:r',
  elements: [{ name: 'w:instrText', elements: [{ type: 'text', text }] }],
});

const resultText = (text: string) => ({
  name: 'w:r',
  elements: [{ name: 'w:t', elements: [{ type: 'text', text }] }],
});

const complexField = (instruction: string, result: string, beginExtra?: Record<string, string>): unknown => ({
  name: 'w:p',
  elements: [
    fldChar('begin', beginExtra),
    instrText(instruction),
    fldChar('separate'),
    resultText(result),
    fldChar('end'),
  ],
});

const simpleField = (instruction: string, result: string, attrs?: Record<string, string>): unknown => ({
  name: 'w:p',
  elements: [
    {
      name: 'w:fldSimple',
      attributes: { 'w:instr': instruction, ...(attrs ?? {}) },
      elements: [resultText(result)],
    },
  ],
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Fixture = {
  name: string;
  /** Build a fresh body each time so each call gets independent objects. */
  body: () => unknown[];
  /** Coarse expectations on the resulting snapshots, beyond round-trip equality. */
  expect: (snapshots: FieldSnapshot[]) => void;
};

const FIXTURES: Fixture[] = [
  {
    name: 'unknown complex field → rawField with passthrough payload',
    body: () => [complexField('CUSTOMFIELD foo', 'cached value')],
    expect: (s) => {
      expect(s).toHaveLength(1);
      expect(s[0].pmType).toBe('rawField');
      expect(s[0].fieldInstance.family).toBe('CUSTOMFIELD');
      expect(s[0].fieldInstance.representation).toBe('complex');
      expect(s[0].fieldInstance.rawInstruction).toBe('CUSTOMFIELD foo');
    },
  },
  {
    name: 'unknown fldSimple → rawField',
    body: () => [simpleField('CUSTOMSIMPLE arg', 'cached')],
    expect: (s) => {
      expect(s).toHaveLength(1);
      expect(s[0].pmType).toBe('rawField');
      expect(s[0].fieldInstance.family).toBe('CUSTOMSIMPLE');
      expect(s[0].fieldInstance.representation).toBe('simple');
    },
  },
  {
    name: 'PAGE complex field → page-number with FieldInstance',
    body: () => [complexField('PAGE', '5')],
    expect: (s) => {
      expect(s).toHaveLength(1);
      expect(s[0].pmType).toBe('page-number');
      expect(s[0].fieldInstance.family).toBe('PAGE');
    },
  },
  {
    name: 'NUMPAGES complex field → total-page-number with FieldInstance',
    body: () => [complexField('NUMPAGES', '10')],
    expect: (s) => {
      expect(s).toHaveLength(1);
      expect(s[0].pmType).toBe('total-page-number');
      expect(s[0].fieldInstance.family).toBe('NUMPAGES');
    },
  },
  {
    name: 'NUMWORDS fldSimple → documentStatField',
    body: () => [simpleField('NUMWORDS', '42')],
    expect: (s) => {
      expect(s).toHaveLength(1);
      expect(s[0].pmType).toBe('documentStatField');
      expect(s[0].fieldInstance.family).toBe('NUMWORDS');
    },
  },
  {
    name: 'SEQ complex field → sequenceField with FieldInstance',
    body: () => [complexField('SEQ Figure \\* ARABIC', '1')],
    expect: (s) => {
      expect(s).toHaveLength(1);
      expect(s[0].pmType).toBe('sequenceField');
      expect(s[0].fieldInstance.family).toBe('SEQ');
      const switches = s[0].fieldInstance.parsedArgs.switches;
      expect(switches).toEqual([{ flag: '*', arg: { kind: 'identifier', text: 'ARABIC' } }]);
    },
  },
  {
    name: 'TOC complex field → tableOfContents with FieldInstance',
    body: () => [complexField('TOC \\o "1-3"', 'Chapter 1')],
    expect: (s) => {
      expect(s).toHaveLength(1);
      expect(s[0].pmType).toBe('tableOfContents');
      expect(s[0].fieldInstance.family).toBe('TOC');
    },
  },
  {
    name: 'REF complex field → crossReference with FieldInstance',
    body: () => [complexField('REF _Ref123 \\h', 'See section 1')],
    expect: (s) => {
      expect(s).toHaveLength(1);
      expect(s[0].pmType).toBe('crossReference');
      expect(s[0].fieldInstance.family).toBe('REF');
    },
  },
  {
    name: 'dirty + locked attributes survive import',
    body: () => [complexField('PAGE', '1', { 'w:dirty': '1', 'w:fldLock': '1' })],
    expect: (s) => {
      expect(s).toHaveLength(1);
      expect(s[0].fieldInstance.dirty).toBe(true);
      expect(s[0].fieldInstance.locked).toBe(true);
    },
  },
  {
    name: 'fldSimple dirty + locked attributes survive import',
    body: () => [simpleField('CUSTOMSIMPLE foo', 'value', { 'w:dirty': '1', 'w:fldLock': '1' })],
    expect: (s) => {
      expect(s).toHaveLength(1);
      expect(s[0].fieldInstance.dirty).toBe(true);
      expect(s[0].fieldInstance.locked).toBe(true);
    },
  },
  {
    name: 'multiple fields preserve document order',
    body: () => [complexField('PAGE', '5'), complexField('NUMPAGES', '10'), simpleField('NUMWORDS', '42')],
    expect: (s) => {
      expect(s.map((x) => x.fieldInstance.family)).toEqual(['PAGE', 'NUMPAGES', 'NUMWORDS']);
    },
  },
  {
    name: 'HYPERLINK wrapping PAGEREF — child gets PAGEREF, not the parent HYPERLINK',
    body: () => [
      {
        name: 'w:p',
        elements: [
          fldChar('begin'),
          instrText('HYPERLINK \\l "bookmark"'),
          fldChar('separate'),
          resultText('See page '),
          fldChar('begin'),
          instrText('PAGEREF bookmark'),
          fldChar('separate'),
          resultText('5'),
          fldChar('end'),
          fldChar('end'),
        ],
      },
    ],
    expect: (s) => {
      // The outer HYPERLINK is lowered to a w:hyperlink wrapper (no
      // FieldInstance attached because w:hyperlink isn't a field-bearing
      // PM type at this layer); the inner PAGEREF surfaces as
      // pageReference with its own FieldInstance.
      const families = s.map((x) => x.fieldInstance.family);
      expect(families).toContain('PAGEREF');
      expect(families).not.toContain('HYPERLINK');
    },
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('round-trip harness — canonical FieldInstance snapshots', () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.name}: snapshot is stable across re-import`, () => {
      const a = snapshotFromXml(fixture.body());
      const b = snapshotFromXml(fixture.body());
      expect(b).toEqual(a);
      fixture.expect(a);
    });
  }
});

describe('canonicalizeFieldInstance — strips session-local fields', () => {
  it('strips id, source.importIndex, source.originalXml, and mutation', () => {
    const fi = buildFieldInstanceFromImport({
      representation: 'complex',
      instructionText: 'PAGE',
      resultFragments: [],
      originalXml: { name: 'w:r', elements: [] },
      dirty: false,
      locked: false,
      part: 'body',
      importIndex: 17,
    });
    const c = canonicalizeFieldInstance(fi);
    expect(c).not.toHaveProperty('id');
    expect(c).not.toHaveProperty('mutation');
    expect(c).not.toHaveProperty('source');
    expect(c.sourcePart).toBe('body');
    // sanity: preserved fields are still there
    expect(c.family).toBe('PAGE');
    expect(c.rawInstruction).toBe('PAGE');
  });

  it('preserves dirty / locked across canonicalization', () => {
    const fi = buildFieldInstanceFromImport({
      representation: 'simple',
      instructionText: 'CUSTOMFIELD foo',
      resultFragments: [],
      originalXml: { name: 'w:fldSimple' },
      dirty: true,
      locked: true,
      part: 'body',
      importIndex: 0,
    });
    const c = canonicalizeFieldInstance(fi);
    expect(c.dirty).toBe(true);
    expect(c.locked).toBe(true);
  });

  it('canonicalizes nested-field tokens via the resolver callback', () => {
    const child = buildFieldInstanceFromImport({
      representation: 'complex',
      instructionText: 'PAGEREF bookmark',
      resultFragments: [],
      originalXml: [],
      dirty: false,
      locked: false,
      part: 'body',
      importIndex: 1,
    });
    const parent = buildFieldInstanceFromImport({
      representation: 'complex',
      instructionText: 'IF',
      resultFragments: [],
      originalXml: [],
      dirty: false,
      locked: false,
      part: 'body',
      importIndex: 0,
    });
    parent.instructionTokens.push({ kind: 'nestedField', childFieldId: child.id });
    const c = canonicalizeFieldInstance(parent, (id) => (id === child.id ? child : null));
    const nested = c.instructionTokens.find((t) => t.kind === 'nestedField');
    expect(nested).toBeDefined();
    expect(nested && 'child' in nested && nested.child?.family).toBe('PAGEREF');
  });

  it('falls back to null for nested-field tokens when no resolver is supplied', () => {
    const parent = buildFieldInstanceFromImport({
      representation: 'complex',
      instructionText: 'IF',
      resultFragments: [],
      originalXml: [],
      dirty: false,
      locked: false,
      part: 'body',
      importIndex: 0,
    });
    parent.instructionTokens.push({ kind: 'nestedField', childFieldId: 'missing-child' });
    const c = canonicalizeFieldInstance(parent);
    const nested = c.instructionTokens.find((t) => t.kind === 'nestedField');
    expect(nested).toEqual({ kind: 'nestedField', child: null });
  });

  it('collapses whitespace tokens to a no-text canonical form', () => {
    const fi = buildFieldInstanceFromImport({
      representation: 'complex',
      instructionText: 'A   B',
      resultFragments: [],
      originalXml: [],
      dirty: false,
      locked: false,
      part: 'body',
      importIndex: 0,
    });
    const c = canonicalizeFieldInstance(fi);
    const ws = c.instructionTokens.filter((t) => t.kind === 'whitespace');
    expect(ws).toHaveLength(1);
    expect(ws[0]).toEqual({ kind: 'whitespace' });
  });
});
