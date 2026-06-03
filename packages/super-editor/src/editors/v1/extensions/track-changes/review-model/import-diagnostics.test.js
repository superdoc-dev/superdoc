// @ts-check
import { describe, it, expect } from 'vitest';
import { scanImportDiagnostics, scanTrackedElements } from './import-diagnostics.js';

const makeIns = (id, author = 'Alice', date = '2024-01-01', children = []) => ({
  name: 'w:ins',
  attributes: { 'w:id': id, 'w:author': author, 'w:date': date },
  elements: children,
});

const makeDel = (id, author = 'Alice', date = '2024-01-01', children = []) => ({
  name: 'w:del',
  attributes: { 'w:id': id, 'w:author': author, 'w:date': date },
  elements: children,
});

const makePara = (...children) => ({ name: 'w:p', elements: children });

const makeDoc = (...bodyChildren) => ({
  'word/document.xml': {
    elements: [{ name: 'w:document', elements: bodyChildren }],
  },
});

describe('scanTrackedElements', () => {
  it('returns an empty list for a missing part', () => {
    expect(scanTrackedElements(undefined)).toEqual([]);
  });

  it('records parent-child stacking for nested w:ins / w:del', () => {
    const docx = makeDoc(makePara(makeIns('1', 'Alice', '2024-01-01', [makeDel('2', 'Bob', '2024-01-02')])));
    const records = scanTrackedElements(docx['word/document.xml']);
    expect(records).toHaveLength(2);

    const [outer, inner] = records;
    expect(outer.wordId).toBe('1');
    expect(outer.side).toBe('insertion');
    expect(outer.parentWordId).toBeNull();

    expect(inner.wordId).toBe('2');
    expect(inner.side).toBe('deletion');
    expect(inner.parentWordId).toBe('1');
    expect(inner.parentSide).toBe('insertion');
  });

  it('captures move elements as __move__ placeholders under tracked parents', () => {
    const docx = makeDoc(
      makePara(
        makeIns('1', 'Alice', '2024-01-01', [
          { name: 'w:moveTo', attributes: { 'w:author': 'Alice', 'w:date': '2024-01-01' } },
        ]),
      ),
    );
    const records = scanTrackedElements(docx['word/document.xml']);
    expect(records).toHaveLength(2);
    expect(records[1].wordId).toBe('__move__');
    expect(records[1].parentWordId).toBe('1');
  });
});

describe('scanImportDiagnostics', () => {
  it('flags missing author identity by default', () => {
    const docx = makeDoc(makePara(makeIns('', '', ''))); // missing author + id
    const ctx = scanImportDiagnostics(docx);
    expect(ctx.diagnostics().map((d) => d.code)).toContain('IMPORT_MISSING_AUTHOR_IDENTITY');
  });

  it('flags tracked changes missing w:author', () => {
    const docx = makeDoc(makePara(makeIns('1', '', '2024-01-01')), makePara(makeDel('2', '', '2024-01-01')));
    const ctx = scanImportDiagnostics(docx);
    const codes = ctx.diagnostics().map((d) => d.code);
    expect(codes.filter((c) => c === 'IMPORT_MISSING_AUTHOR_IDENTITY')).toHaveLength(2);
  });

  it('flags imbalanced paired ins+del under paired mode as HEURISTIC_RECONSTRUCTION', () => {
    const docx = makeDoc(
      makePara(
        makeDel('1', 'Alice', '2024-01-01'),
        makeIns('2', 'Alice', '2024-01-01'),
        makeIns('3', 'Alice', '2024-01-01'), // a second insertion: 2 ins vs 1 del
      ),
    );
    const ctx = scanImportDiagnostics(docx, { replacements: 'paired' });
    const diag = ctx.diagnostics().find((d) => d.code === 'IMPORT_HEURISTIC_RECONSTRUCTION');
    expect(diag).toBeDefined();
    expect(diag?.detail).toMatchObject({ insertions: 2, deletions: 1 });
  });

  it('does not flag balanced paired insertions+deletions', () => {
    const docx = makeDoc(makePara(makeDel('1', 'Alice', '2024-01-01'), makeIns('2', 'Alice', '2024-01-01')));
    const ctx = scanImportDiagnostics(docx, { replacements: 'paired' });
    expect(ctx.diagnostics().some((d) => d.code === 'IMPORT_HEURISTIC_RECONSTRUCTION')).toBe(false);
    expect(ctx.diagnostics().some((d) => d.code === 'IMPORT_REPLACEMENT_MISSING_SIDE')).toBe(false);
  });

  it('flags a single-sided revision (only one tracked side in the part) as REPLACEMENT_MISSING_SIDE', () => {
    // A document with only a single deletion and no insertions — Word can
    // produce this for pure deletions, but under paired-replacement
    // reconstruction it is still a missing-side scenario worth surfacing
    // for downstream tooling.
    const docx = makeDoc(makePara(makeDel('1', 'Alice', '2024-01-01')));
    const ctx = scanImportDiagnostics(docx, { replacements: 'paired' });
    const diag = ctx.diagnostics().find((d) => d.code === 'IMPORT_REPLACEMENT_MISSING_SIDE');
    expect(diag).toBeDefined();
    expect(diag?.detail).toMatchObject({ deletions: 1, insertions: 0 });
  });

  it('flags nested children with empty parent w:id as CHILD_MISSING_PARENT', () => {
    // Build a w:ins whose attributes are missing w:id, with a nested w:del child.
    const docx = makeDoc(
      makePara({
        name: 'w:ins',
        attributes: { 'w:id': '', 'w:author': 'Alice', 'w:date': '2024-01-01' },
        elements: [makeDel('99', 'Bob', '2024-02-02')],
      }),
    );
    const ctx = scanImportDiagnostics(docx);
    const diag = ctx.diagnostics().find((d) => d.code === 'IMPORT_CHILD_MISSING_PARENT');
    expect(diag).toBeDefined();
    expect(diag?.sourceId).toBe('99');
  });

  it('flags w:moveTo nested inside w:ins as UNSUPPORTED_STRUCTURAL_OVERLAP', () => {
    const docx = makeDoc(
      makePara(
        makeIns('1', 'Alice', '2024-01-01', [
          { name: 'w:moveTo', attributes: { 'w:author': 'Alice', 'w:date': '2024-01-01' } },
        ]),
      ),
    );
    const ctx = scanImportDiagnostics(docx);
    const diag = ctx.diagnostics().find((d) => d.code === 'IMPORT_UNSUPPORTED_STRUCTURAL_OVERLAP');
    expect(diag).toBeDefined();
    expect(diag?.parentLogicalId).toBe('1');
  });

  it('flags duplicate same-side w:id observations as DUPLICATE_LOGICAL_ID', () => {
    const docx = makeDoc(makePara(makeIns('5', 'Alice', '2024-01-01')), makePara(makeIns('5', 'Alice', '2024-01-01')));
    const ctx = scanImportDiagnostics(docx);
    const diag = ctx.diagnostics().find((d) => d.code === 'IMPORT_DUPLICATE_LOGICAL_ID');
    expect(diag).toBeDefined();
    expect(diag?.sourceId).toBe('5');
    expect(diag?.side).toBe('insertion');
  });

  it('scans header / footer / footnote / endnote parts when present', () => {
    const docx = {
      'word/document.xml': { elements: [{ name: 'w:document', elements: [] }] },
      'word/header1.xml': {
        elements: [{ name: 'w:hdr', elements: [makePara(makeIns('h1', '', ''))] }],
      },
      'word/footer1.xml': {
        elements: [{ name: 'w:ftr', elements: [makePara(makeDel('f1', '', ''))] }],
      },
      'word/footnotes.xml': {
        elements: [{ name: 'w:footnotes', elements: [makePara(makeIns('fn1', '', ''))] }],
      },
      'word/endnotes.xml': {
        elements: [{ name: 'w:endnotes', elements: [makePara(makeDel('en1', '', ''))] }],
      },
    };
    const ctx = scanImportDiagnostics(docx);
    const partPaths = new Set(ctx.diagnostics().map((d) => d.partPath));
    expect(partPaths.has('word/header1.xml')).toBe(true);
    expect(partPaths.has('word/footer1.xml')).toBe(true);
    expect(partPaths.has('word/footnotes.xml')).toBe(true);
    expect(partPaths.has('word/endnotes.xml')).toBe(true);
  });

  it('is a no-op when the docx is empty', () => {
    expect(scanImportDiagnostics(null).diagnostics()).toEqual([]);
    expect(scanImportDiagnostics({}).diagnostics()).toEqual([]);
  });
});
