import { describe, expect, it } from 'vitest';
import { normalizeFixedWidthTables } from './normalizeFixedWidthTables.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Trim shared leading indentation from a template literal. */
function dedent(s: string): string {
  const lines = s.split('\n');
  // Drop leading/trailing empty lines from the template literal
  if (lines[0].trim() === '') lines.shift();
  if (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

  const indent = Math.min(...lines.filter((l) => l.trim().length > 0).map((l) => l.match(/^(\s*)/)![1].length));
  return lines.map((l) => l.slice(indent)).join('\n');
}

/** Extract lines matching `| ... |` from the output. */
function extractPipeTable(output: string): string[] {
  return output.split('\n').filter((l) => l.startsWith('|'));
}

// ---------------------------------------------------------------------------
// Section 5 style: unbounded table (no top/bottom borders)
// ---------------------------------------------------------------------------

describe('normalizeFixedWidthTables', () => {
  describe('unbounded tables (no borders)', () => {
    it('converts a simple 3-column table without borders', () => {
      const input = dedent(`
        Clause                 Description                       Duration
        ---------------------- --------------------------------- -----------
        Confidentiality Term   Protection of confidential info   5 years
        Evaluation Period      Business evaluation timeline      12 months
        Survival Clause        Survives termination              Yes
      `);

      const output = normalizeFixedWidthTables(input);
      const table = extractPipeTable(output);

      expect(table).toEqual([
        '| Clause | Description | Duration |',
        '| --- | --- | --- |',
        '| Confidentiality Term | Protection of confidential info | 5 years |',
        '| Evaluation Period | Business evaluation timeline | 12 months |',
        '| Survival Clause | Survives termination | Yes |',
      ]);
    });

    it('stops at first blank line for unbounded tables', () => {
      const input = dedent(`
        Name   Age
        ------ ---
        Alice  30

        This is a regular paragraph.
      `);

      const output = normalizeFixedWidthTables(input);

      expect(output).toContain('| Alice | 30 |');
      expect(output).toContain('This is a regular paragraph.');
    });
  });

  // ---------------------------------------------------------------------------
  // Appendix A style: bordered table with continuation lines + blank separators
  // ---------------------------------------------------------------------------

  describe('bordered tables (top + bottom borders)', () => {
    it('converts Appendix A with wrapped continuation lines and blank separators', () => {
      const input = dedent(`
        -------------------------------------------------------------------------
        Classification      Description     Example      Required Controls
        ------------------- --------------- ------------ ------------------------
        Public              No restrictions Press        None
                                            release

        Internal            Limited         Internal     Access controls
                            distribution    memo

        Confidential        Sensitive       Financial    Encryption + MFA
                            business data   reports

        Restricted          Highly          Source code  Strict access + logging
                            sensitive
        -------------------------------------------------------------------------
      `);

      const output = normalizeFixedWidthTables(input);
      const table = extractPipeTable(output);

      expect(table).toEqual([
        '| Classification | Description | Example | Required Controls |',
        '| --- | --- | --- | --- |',
        '| Public | No restrictions | Press release | None |',
        '| Internal | Limited distribution | Internal memo | Access controls |',
        '| Confidential | Sensitive business data | Financial reports | Encryption + MFA |',
        '| Restricted | Highly sensitive | Source code | Strict access + logging |',
      ]);
    });

    it('consumes top and bottom border lines', () => {
      const input = dedent(`
        before
        --------------------
        A     B
        ----- -----
        1     2
        --------------------
        after
      `);

      const output = normalizeFixedWidthTables(input);

      expect(output).not.toContain('----');
      expect(output).toContain('before');
      expect(output).toContain('after');
      expect(output).toContain('| A | B |');
      expect(output).toContain('| 1 | 2 |');
    });
  });

  // ---------------------------------------------------------------------------
  // Signatures style: form-field content with escaped underscores
  // ---------------------------------------------------------------------------

  describe('signature/form tables', () => {
    it('converts a two-column table with escaped underscores', () => {
      const input = dedent(`
        Disclosing Party              Receiving Party
        ----------------------------- -----------------------------
        Name: \\_\\_\\_\\_\\_         Name: \\_\\_\\_\\_\\_
        Title: \\_\\_\\_\\_\\_        Title: \\_\\_\\_\\_\\_
        Signature: \\_\\_\\_          Signature: \\_\\_\\_
        Date: \\_\\_\\_\\_\\_         Date: \\_\\_\\_\\_\\_
      `);

      const output = normalizeFixedWidthTables(input);
      const table = extractPipeTable(output);

      expect(table[0]).toBe('| Disclosing Party | Receiving Party |');
      expect(table[1]).toBe('| --- | --- |');
      expect(table).toHaveLength(6); // header + separator + 4 data rows
    });
  });

  // ---------------------------------------------------------------------------
  // Leading indentation
  // ---------------------------------------------------------------------------

  describe('indentation handling', () => {
    it('handles 2-space indented tables (as in the NDA fixture)', () => {
      const input = [
        '  Clause     Description',
        '  ---------- -----------',
        '  Term       Protection',
        '  Period     Evaluation',
      ].join('\n');

      const output = normalizeFixedWidthTables(input);

      expect(output).toContain('| Clause | Description |');
      expect(output).toContain('| Term | Protection |');
      expect(output).toContain('| Period | Evaluation |');
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases and safety
  // ---------------------------------------------------------------------------

  describe('pass-through (no transformation)', () => {
    it('passes through text with no tables', () => {
      const input = '# Hello\n\nThis is a paragraph.\n\n- item 1\n- item 2';
      expect(normalizeFixedWidthTables(input)).toBe(input);
    });

    it('passes through GFM pipe tables unchanged', () => {
      const input = '| A | B |\n| --- | --- |\n| 1 | 2 |';
      expect(normalizeFixedWidthTables(input)).toBe(input);
    });

    it('passes through thematic breaks (--- lines) without matching', () => {
      const input = dedent(`
        # Section 1

        Some text.

        ---

        # Section 2

        More text.

        ---
      `);

      const output = normalizeFixedWidthTables(input);

      // No pipe tables should be produced
      expect(extractPipeTable(output)).toHaveLength(0);
      // Content preserved
      expect(output).toContain('# Section 1');
      expect(output).toContain('# Section 2');
    });

    it('does not match a single dash group (thematic break)', () => {
      const input = '------------------------------------------------------------------------';
      expect(normalizeFixedWidthTables(input)).toBe(input);
    });

    it('preserves malformed partial table structures', () => {
      const input = dedent(`
        Header only, no data
        ------ ------
      `);

      // Guide row exists but no data rows → no transformation
      const output = normalizeFixedWidthTables(input);
      expect(extractPipeTable(output)).toHaveLength(0);
    });
  });

  describe('fenced code blocks', () => {
    it('does not transform tables inside fenced code blocks', () => {
      const input = dedent(`
        \`\`\`
        Name   Age
        ------ ---
        Alice  30
        \`\`\`
      `);

      const output = normalizeFixedWidthTables(input);

      // Should NOT produce pipe table
      expect(extractPipeTable(output)).toHaveLength(0);
      // Original content preserved
      expect(output).toContain('Alice  30');
    });

    it('does not transform tables inside tilde-fenced code blocks', () => {
      const input = dedent(`
        ~~~
        Name   Age
        ------ ---
        Alice  30
        ~~~
      `);

      const output = normalizeFixedWidthTables(input);
      expect(extractPipeTable(output)).toHaveLength(0);
    });

    it('transforms tables before and after fenced code blocks', () => {
      const input = dedent(`
        A     B
        ----- -----
        1     2

        \`\`\`
        C     D
        ----- -----
        3     4
        \`\`\`

        E     F
        ----- -----
        5     6
      `);

      const output = normalizeFixedWidthTables(input);
      const tables = extractPipeTable(output);

      // Two tables converted (before and after fence), one preserved inside fence
      expect(tables.filter((l) => l.startsWith('| A'))).toHaveLength(1);
      expect(tables.filter((l) => l.startsWith('| E'))).toHaveLength(1);
      expect(output).toContain('C     D');
    });
  });

  describe('indented code blocks', () => {
    it('does not transform tables inside 4-space indented code blocks', () => {
      const input = ['    Name   Age', '    ------ ---', '    Alice  30'].join('\n');

      const output = normalizeFixedWidthTables(input);

      expect(extractPipeTable(output)).toHaveLength(0);
      expect(output).toBe(input);
    });

    it('transforms tables before and after 4-space indented code blocks', () => {
      const input = [
        'A     B',
        '----- -----',
        '1     2',
        '',
        '    C     D',
        '    ----- -----',
        '    3     4',
        '',
        'E     F',
        '----- -----',
        '5     6',
      ].join('\n');

      const output = normalizeFixedWidthTables(input);
      const tables = extractPipeTable(output);

      expect(tables.filter((l) => l.startsWith('| A'))).toHaveLength(1);
      expect(tables.filter((l) => l.startsWith('| E'))).toHaveLength(1);
      expect(output).toContain('    C     D');
    });
  });

  // ---------------------------------------------------------------------------
  // Regression: indent mismatch must not corrupt cell text (Bug #1)
  // ---------------------------------------------------------------------------

  describe('indent mismatch rejection', () => {
    it('rejects table when header indent differs from guide indent', () => {
      // Header at column 0, guide indented 2 spaces → mismatch → no table.
      const input = ['Header1    Header2', '  -------- --------', '  Data1    Data2'].join('\n');

      const output = normalizeFixedWidthTables(input);

      // No pipe table should be produced — the candidate is rejected.
      expect(extractPipeTable(output)).toHaveLength(0);
      expect(output).toContain('Header1    Header2');
    });

    it('rejects bordered table when header indent differs from guide indent', () => {
      const input = [
        '  --------------------',
        'Header1    Header2',
        '  -------- --------',
        '  Data1    Data2',
        '  --------------------',
      ].join('\n');

      const output = normalizeFixedWidthTables(input);
      expect(extractPipeTable(output)).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Regression: non-final column overflow must not corrupt cells
  // ---------------------------------------------------------------------------

  describe('non-final column overflow rejection', () => {
    it('rejects table when first data row overflows a non-final column', () => {
      const input = ['A     B     C', '----- ----- -----', '1stcol_is_very_long  bbb   ccc'].join('\n');

      const output = normalizeFixedWidthTables(input);

      // No pipe table — the guide doesn't match the data layout.
      expect(extractPipeTable(output)).toHaveLength(0);
      expect(output).toContain('1stcol_is_very_long');
    });

    it('skips a later overflowing row and its continuation lines', () => {
      const input = [
        'A     B     C',
        '----- ----- -----',
        'aaa   bbb   ccc',
        'overflow_row_here  long  zzz',
        '      cont  yyy',
        'ddd   eee   fff',
      ].join('\n');

      const output = normalizeFixedWidthTables(input);
      const table = extractPipeTable(output);

      // Valid rows preserved, overflowing row + its continuation skipped.
      expect(table).toContainEqual('| aaa | bbb | ccc |');
      expect(table).toContainEqual('| ddd | eee | fff |');
      expect(table).not.toContainEqual(expect.stringContaining('overflow'));
      expect(table).not.toContainEqual(expect.stringContaining('cont'));
      expect(table).not.toContainEqual(expect.stringContaining('yyy'));
    });

    it('rejects multi-word overflow in a non-final column', () => {
      const input = ['A     B', '----- -----', 'ab cdef zzz'].join('\n');

      const output = normalizeFixedWidthTables(input);

      // "ab cdef" crosses column A boundary → reject entire table.
      expect(extractPipeTable(output)).toHaveLength(0);
      expect(output).toContain('ab cdef');
    });

    it('rejects overflow with leading padding in a non-final column', () => {
      const input = ['A     B', '----- -----', ' abcdef   zzz'].join('\n');

      const output = normalizeFixedWidthTables(input);

      // Leading space + overflowing value → reject entire table.
      expect(extractPipeTable(output)).toHaveLength(0);
      expect(output).toContain('abcdef');
    });

    it('allows overflow in the last column (reads to end of line)', () => {
      const input = ['A     B', '----- -----', 'aaa   this value is very long and exceeds the column width'].join('\n');

      const output = normalizeFixedWidthTables(input);
      const table = extractPipeTable(output);

      expect(table).toContainEqual('| aaa | this value is very long and exceeds the column width |');
    });
  });

  // ---------------------------------------------------------------------------
  // Regression: false bottom border must not swallow prose (Bug #2)
  // ---------------------------------------------------------------------------

  describe('false bottom border rejection', () => {
    it('does not swallow prose between table and unrelated thematic break', () => {
      const input = [
        '  -------------------------------------------------------------------------',
        '  Classification      Description     Example',
        '  ------------------- --------------- ------------',
        '  Public              No restrictions Press',
        '',
        'This should not be a table row.',
        'Some other content that has nothing to do with the table.',
        '',
        '---',
      ].join('\n');

      const output = normalizeFixedWidthTables(input);

      // The table should still be converted (1 data row).
      expect(output).toContain('| Classification | Description | Example |');
      expect(output).toContain('| Public | No restrictions | Press |');

      // Prose must be preserved as-is, not absorbed into the table.
      expect(output).toContain('This should not be a table row.');
      expect(output).toContain('Some other content that has nothing to do with the table.');

      // The thematic break must be preserved.
      expect(output.split('\n').filter((l) => l.trim() === '---')).toHaveLength(1);
    });

    it('accepts bordered table when cell text exceeds guide width', () => {
      const input = [
        '  -----------------------',
        '  A     B',
        '  ----- -----',
        '  1     This is a very very long value that exceeds column width',
        '',
        '  2     ok',
        '  -----------------------',
      ].join('\n');

      const output = normalizeFixedWidthTables(input);
      const table = extractPipeTable(output);

      // Both data rows must be present with full cell text preserved.
      expect(table).toEqual([
        '| A | B |',
        '| --- | --- |',
        '| 1 | This is a very very long value that exceeds column width |',
        '| 2 | ok |',
      ]);
    });

    it('does not swallow prose when bottom border is missing entirely', () => {
      const input = [
        '  -------------------------------------------------------------------------',
        '  A     B',
        '  ----- -----',
        '  1     2',
        '',
        'Regular paragraph here.',
        '',
        '## Next Section',
      ].join('\n');

      const output = normalizeFixedWidthTables(input);

      expect(output).toContain('| A | B |');
      expect(output).toContain('| 1 | 2 |');
      expect(output).toContain('Regular paragraph here.');
      expect(output).toContain('## Next Section');
    });
  });

  // ---------------------------------------------------------------------------
  // Full NDA fixture regression
  // ---------------------------------------------------------------------------

  describe('full NDA fixture', () => {
    it('converts all three tables from the NDA fixture', () => {
      // Exact content from multi-page-nda-test-document.md (relevant sections)
      const input = [
        '## Term and Termination',
        '',
        '  Clause                 Description                       Duration',
        '  ---------------------- --------------------------------- -----------',
        '  Confidentiality Term   Protection of confidential info   5 years',
        '  Evaluation Period      Business evaluation timeline      12 months',
        '  Survival Clause        Survives termination              Yes',
        '',
        'This Agreement remains in effect.',
        '',
        '---',
        '',
        '## Appendix A -- Data Classification Table',
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

      const output = normalizeFixedWidthTables(input);
      const tables = extractPipeTable(output);

      // Table 1: Term and Termination (3 cols, 3 data rows)
      expect(tables).toContainEqual('| Clause | Description | Duration |');
      expect(tables).toContainEqual('| Confidentiality Term | Protection of confidential info | 5 years |');
      expect(tables).toContainEqual('| Evaluation Period | Business evaluation timeline | 12 months |');

      // Table 2: Appendix A (4 cols, 4 data rows with merged continuations)
      expect(tables).toContainEqual('| Classification | Description | Example | Required Controls |');
      expect(tables).toContainEqual('| Public | No restrictions | Press release | None |');
      expect(tables).toContainEqual('| Restricted | Highly sensitive | Source code | Strict access + logging |');

      // Table 3: Signatures (2 cols)
      expect(tables).toContainEqual('| Disclosing Party | Receiving Party |');

      // Non-table content preserved
      expect(output).toContain('## Term and Termination');
      expect(output).toContain('This Agreement remains in effect.');
      expect(output).toContain('## Appendix A -- Data Classification Table');
      expect(output).toContain('## Signatures');

      // Thematic breaks preserved
      expect(output.split('\n').filter((l) => l.trim() === '---')).toHaveLength(2);
    });
  });
});
