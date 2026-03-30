/**
 * Integration test: normalizeFixedWidthTables → remark-gfm AST parsing.
 *
 * Verifies that the normalizer's GFM output is correctly parsed into mdast
 * table nodes by the same remark pipeline used in production.
 */
import { describe, expect, it } from 'vitest';
import { normalizeFixedWidthTables } from './normalizeFixedWidthTables.js';
import { parseMarkdownToAst } from './parseMarkdownAst.js';
import type { Root, Table, TableRow, TableCell } from 'mdast';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findTables(tree: Root): Table[] {
  const tables: Table[] = [];
  function walk(node: any) {
    if (node.type === 'table') tables.push(node);
    if (node.children) node.children.forEach(walk);
  }
  walk(tree);
  return tables;
}

function tableDimensions(table: Table): { rows: number; cols: number } {
  const rows = table.children.length;
  const cols = rows > 0 ? table.children[0].children.length : 0;
  return { rows, cols };
}

function cellText(cell: TableCell): string {
  return cell.children
    .map((c: any) => {
      if (c.type === 'text') return c.value;
      if (c.children) return c.children.map((cc: any) => cc.value ?? '').join('');
      return '';
    })
    .join('');
}

function rowTexts(row: TableRow): string[] {
  return row.children.map(cellText);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('normalizer → remark-gfm AST integration', () => {
  it('produces zero tables from raw ASCII input (baseline)', () => {
    const raw = ['  Clause     Description', '  ---------- -----------', '  Term       Protection'].join('\n');

    const ast = parseMarkdownToAst(raw);
    expect(findTables(ast)).toHaveLength(0);
  });

  it('produces a valid mdast table after normalization', () => {
    const raw = ['  Clause     Description', '  ---------- -----------', '  Term       Protection'].join('\n');

    const normalized = normalizeFixedWidthTables(raw);
    const ast = parseMarkdownToAst(normalized);
    const tables = findTables(ast);

    expect(tables).toHaveLength(1);
    expect(tableDimensions(tables[0])).toEqual({ rows: 2, cols: 2 }); // header + 1 data
    expect(rowTexts(tables[0].children[0])).toEqual(['Clause', 'Description']);
    expect(rowTexts(tables[0].children[1])).toEqual(['Term', 'Protection']);
  });

  it('does not produce tables from 4-space indented code blocks', () => {
    const raw = ['    Clause     Description', '    ---------- -----------', '    Term       Protection'].join('\n');

    const normalized = normalizeFixedWidthTables(raw);
    const ast = parseMarkdownToAst(normalized);
    expect(findTables(ast)).toHaveLength(0);
    expect(normalized).toBe(raw);
  });

  it('Section 5 table (no borders): 3 columns, 3 data rows', () => {
    const raw = [
      '  Clause                 Description                       Duration',
      '  ---------------------- --------------------------------- -----------',
      '  Confidentiality Term   Protection of confidential info   5 years',
      '  Evaluation Period      Business evaluation timeline      12 months',
      '  Survival Clause        Survives termination              Yes',
    ].join('\n');

    const normalized = normalizeFixedWidthTables(raw);
    const ast = parseMarkdownToAst(normalized);
    const tables = findTables(ast);

    expect(tables).toHaveLength(1);
    expect(tableDimensions(tables[0])).toEqual({ rows: 4, cols: 3 }); // header + 3 data
    expect(rowTexts(tables[0].children[0])).toEqual(['Clause', 'Description', 'Duration']);
    expect(rowTexts(tables[0].children[3])).toEqual(['Survival Clause', 'Survives termination', 'Yes']);
  });

  it('Appendix A table (bordered, continuations): 4 columns, 4 data rows', () => {
    const raw = [
      '  -------------------------------------------------------------------------',
      '  Classification      Description     Example      Required Controls',
      '  ------------------- --------------- ------------ ------------------------',
      '  Public              No restrictions Press        None',
      '                                      release      ',
      '',
      '  Internal            Limited         Internal     Access controls',
      '                      distribution    memo         ',
      '',
      '  Confidential        Sensitive       Financial    Encryption + MFA',
      '                      business data   reports      ',
      '',
      '  Restricted          Highly          Source code  Strict access + logging',
      '                      sensitive                    ',
      '  -------------------------------------------------------------------------',
    ].join('\n');

    const normalized = normalizeFixedWidthTables(raw);
    const ast = parseMarkdownToAst(normalized);
    const tables = findTables(ast);

    expect(tables).toHaveLength(1);
    expect(tableDimensions(tables[0])).toEqual({ rows: 5, cols: 4 }); // header + 4 data

    // Verify continuation lines merged correctly
    expect(rowTexts(tables[0].children[1])).toEqual(['Public', 'No restrictions', 'Press release', 'None']);
    expect(rowTexts(tables[0].children[4])).toEqual([
      'Restricted',
      'Highly sensitive',
      'Source code',
      'Strict access + logging',
    ]);
  });

  it('Signatures table (no borders, form fields): 2 columns, 4 data rows', () => {
    const raw = [
      '  Disclosing Party              Receiving Party',
      '  ----------------------------- -----------------------------',
      '  Name: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_    Name: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_',
      '  Title: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_   Title: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_',
      '  Signature: \\_\\_\\_\\_\\_\\_       Signature: \\_\\_\\_\\_\\_\\_',
      '  Date: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_    Date: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_',
    ].join('\n');

    const normalized = normalizeFixedWidthTables(raw);
    const ast = parseMarkdownToAst(normalized);
    const tables = findTables(ast);

    expect(tables).toHaveLength(1);
    expect(tableDimensions(tables[0])).toEqual({ rows: 5, cols: 2 }); // header + 4 data
    expect(rowTexts(tables[0].children[0])).toEqual(['Disclosing Party', 'Receiving Party']);
  });

  it('does not produce table from indent-mismatched lines', () => {
    const raw = ['Header1    Header2', '  -------- --------', '  Data1    Data2'].join('\n');

    const normalized = normalizeFixedWidthTables(raw);
    const ast = parseMarkdownToAst(normalized);
    expect(findTables(ast)).toHaveLength(0);
  });

  it('preserves prose when false bottom border is rejected', () => {
    const raw = [
      '  -------------------------------------------------------------------------',
      '  Classification      Description     Example',
      '  ------------------- --------------- ------------',
      '  Public              No restrictions Press',
      '',
      'This should not be a table row.',
      '',
      '---',
    ].join('\n');

    const normalized = normalizeFixedWidthTables(raw);
    const ast = parseMarkdownToAst(normalized);
    const tables = findTables(ast);

    // Should produce exactly 1 table (the real one), not swallow the prose.
    expect(tables).toHaveLength(1);
    expect(tableDimensions(tables[0])).toEqual({ rows: 2, cols: 3 }); // header + 1 data row
    // The prose and thematic break should remain as non-table content.
    expect(normalized).toContain('This should not be a table row.');
  });

  it('full NDA fixture produces 3 mdast tables', () => {
    const raw = [
      '## Term and Termination',
      '',
      '  Clause                 Description                       Duration',
      '  ---------------------- --------------------------------- -----------',
      '  Confidentiality Term   Protection of confidential info   5 years',
      '  Evaluation Period      Business evaluation timeline      12 months',
      '  Survival Clause        Survives termination              Yes',
      '',
      '---',
      '',
      '## Appendix A',
      '',
      '  -------------------------------------------------------------------------',
      '  Classification      Description     Example      Required Controls',
      '  ------------------- --------------- ------------ ------------------------',
      '  Public              No restrictions Press        None',
      '                                      release      ',
      '',
      '  Internal            Limited         Internal     Access controls',
      '                      distribution    memo         ',
      '',
      '  Confidential        Sensitive       Financial    Encryption + MFA',
      '                      business data   reports      ',
      '',
      '  Restricted          Highly          Source code  Strict access + logging',
      '                      sensitive                    ',
      '  -------------------------------------------------------------------------',
      '',
      '---',
      '',
      '## Signatures',
      '',
      '  Disclosing Party              Receiving Party',
      '  ----------------------------- -----------------------------',
      '  Name: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_    Name: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_',
      '  Title: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_   Title: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_',
      '  Signature: \\_\\_\\_\\_\\_\\_       Signature: \\_\\_\\_\\_\\_\\_',
      '  Date: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_    Date: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_',
    ].join('\n');

    const normalized = normalizeFixedWidthTables(raw);
    const ast = parseMarkdownToAst(normalized);
    const tables = findTables(ast);

    expect(tables).toHaveLength(3);
    expect(tableDimensions(tables[0])).toEqual({ rows: 4, cols: 3 }); // Section 5
    expect(tableDimensions(tables[1])).toEqual({ rows: 5, cols: 4 }); // Appendix A
    expect(tableDimensions(tables[2])).toEqual({ rows: 5, cols: 2 }); // Signatures
  });
});
