import { describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { corpusDoc, unwrap, useStoryHarness } from '../harness';

type TableFixture = {
  tableNodeId: string;
  tableTarget: {
    kind: 'block';
    nodeType: 'table';
    nodeId: string;
  };
  cellNodeId: string;
};

const ALL_TABLE_COMMAND_IDS = [
  'create.table',
  'tables.convertFromText',
  'tables.delete',
  'tables.clearContents',
  'tables.move',
  'tables.split',
  'tables.convertToText',
  'tables.setLayout',
  'tables.insertRow',
  'tables.deleteRow',
  'tables.setRowHeight',
  'tables.distributeRows',
  'tables.setRowOptions',
  'tables.insertColumn',
  'tables.deleteColumn',
  'tables.setColumnWidth',
  'tables.distributeColumns',
  'tables.insertCell',
  'tables.deleteCell',
  'tables.mergeCells',
  'tables.unmergeCells',
  'tables.splitCell',
  'tables.setCellProperties',
  'tables.sort',
  'tables.setAltText',
  'tables.setStyle',
  'tables.clearStyle',
  'tables.setStyleOption',
  'tables.setBorder',
  'tables.clearBorder',
  'tables.applyBorderPreset',
  'tables.setShading',
  'tables.clearShading',
  'tables.setTablePadding',
  'tables.setCellPadding',
  'tables.setCellSpacing',
  'tables.clearCellSpacing',
  'tables.get',
  'tables.getCells',
  'tables.getProperties',
] as const;

type TableCommandId = (typeof ALL_TABLE_COMMAND_IDS)[number];

type Scenario = {
  operationId: TableCommandId;
  setup: 'blank' | 'table';
  seedDoc?: string;
  prepare?: (sessionId: string, fixture: TableFixture | null) => Promise<void>;
  run: (sessionId: string, fixture: TableFixture | null) => Promise<any>;
};

describe('document-api story: all table commands', () => {
  const { client, outPath } = useStoryHarness('tables/all-commands', {
    preserveResults: true,
  });

  const api = client as any;
  const readOperationIds = new Set<TableCommandId>(['tables.get', 'tables.getCells', 'tables.getProperties']);
  const clearContentsTableBySession = new Map<string, string>();
  const clearStyleTableBySession = new Map<string, string>();
  const convertToTextTableBySession = new Map<string, string>();
  const insertCellBySession = new Map<string, string>();
  const insertCellTableBySession = new Map<string, string>();
  const insertCellInitialRowsBySession = new Map<string, number>();
  const deleteCellBySession = new Map<string, string>();

  function makeSessionId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function docNameFor(operationId: TableCommandId): string {
    return `${operationId.replace(/\./g, '-')}.docx`;
  }

  function sourceDocNameFor(operationId: TableCommandId): string {
    return `${operationId.replace(/\./g, '-')}-source.docx`;
  }

  function readOutputNameFor(operationId: TableCommandId): string {
    return `${operationId.replace(/\./g, '-')}-read-output.json`;
  }

  async function saveReadOutput(operationId: TableCommandId, result: any) {
    const payload = {
      operationId,
      output: result,
    };
    await writeFile(outPath(readOutputNameFor(operationId)), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  async function saveSource(sessionId: string, operationId: TableCommandId) {
    await api.doc.save({
      sessionId,
      out: outPath(sourceDocNameFor(operationId)),
      force: true,
    });
  }

  async function saveResult(sessionId: string, operationId: TableCommandId) {
    await api.doc.save({
      sessionId,
      out: outPath(docNameFor(operationId)),
      force: true,
    });
  }

  function requireFixture(operationId: TableCommandId, fixture: TableFixture | null): TableFixture {
    if (!fixture) throw new Error(`${operationId} requires a table fixture.`);
    return fixture;
  }

  function assertMutationSuccess(operationId: TableCommandId, result: any) {
    if (result?.success === true || result?.receipt?.success === true) return;
    const code = result?.failure?.code ?? result?.receipt?.failure?.code ?? 'UNKNOWN';
    throw new Error(`${operationId} did not report success (code: ${code}).`);
  }

  function assertReadOutput(operationId: TableCommandId, result: any) {
    if (operationId === 'tables.get') {
      expect(typeof result?.nodeId).toBe('string');
      expect(result?.rows).toBeGreaterThan(0);
      expect(result?.columns).toBeGreaterThan(0);
      return;
    }

    if (operationId === 'tables.getCells') {
      expect(typeof result?.tableNodeId).toBe('string');
      expect(Array.isArray(result?.cells)).toBe(true);
      expect(result.cells.length).toBeGreaterThan(0);
      expect(typeof result.cells[0]?.nodeId).toBe('string');
      return;
    }

    if (operationId === 'tables.getProperties') {
      expect(typeof result?.nodeId).toBe('string');
      return;
    }

    throw new Error(`Unexpected read assertion branch for ${operationId}.`);
  }

  async function firstNodeId(sessionId: string, nodeType: string): Promise<string> {
    const queryResult = unwrap<any>(
      await api.doc.query.match({
        sessionId,
        select: { type: 'node', nodeType },
        require: 'first',
      }),
    );

    const nodeId = queryResult?.items?.[0]?.address?.nodeId;
    if (!nodeId) {
      throw new Error(`Unable to resolve nodeId for nodeType=${nodeType}.`);
    }
    return nodeId;
  }

  async function setupTableFixture(sessionId: string): Promise<TableFixture> {
    await api.doc.open({ sessionId });

    const createResult = unwrap<any>(
      await api.doc.create.table({
        sessionId,
        rows: 3,
        columns: 3,
      }),
    );
    assertMutationSuccess('create.table', createResult);

    const tableNodeId = createResult?.table?.nodeId ?? (await firstNodeId(sessionId, 'table'));
    const tableTarget =
      createResult?.table ??
      ({
        kind: 'block',
        nodeType: 'table',
        nodeId: tableNodeId,
      } as const);

    const cellNodeId = await firstNodeId(sessionId, 'tableCell');

    return { tableNodeId, tableTarget, cellNodeId };
  }

  const scenarios: Scenario[] = [
    {
      operationId: 'create.table',
      setup: 'blank',
      run: async (sessionId) => {
        return unwrap<any>(await api.doc.create.table({ sessionId, rows: 3, columns: 3 }));
      },
    },
    {
      operationId: 'tables.convertFromText',
      setup: 'blank',
      prepare: async (sessionId) => {
        await api.doc.insert({ sessionId, value: 'A\tB\tC' });
      },
      run: async (sessionId) => {
        const paragraphNodeId = await firstNodeId(sessionId, 'paragraph');
        return unwrap<any>(
          await api.doc.tables.convertFromText({
            sessionId,
            nodeId: paragraphNodeId,
            delimiter: 'tab',
          }),
        );
      },
    },
    {
      operationId: 'tables.delete',
      setup: 'table',
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.delete', fixture);
        return unwrap<any>(await api.doc.tables.delete({ sessionId, nodeId: f.tableNodeId }));
      },
    },
    {
      operationId: 'tables.clearContents',
      setup: 'blank',
      prepare: async (sessionId) => {
        await api.doc.insert({
          sessionId,
          value: 'Alpha\tBeta\tGamma',
        });

        const secondParagraphResult = unwrap<any>(
          await api.doc.create.paragraph({
            sessionId,
            at: { kind: 'documentEnd' },
            text: 'Alpha\tBeta\tGamma',
          }),
        );

        if (secondParagraphResult?.success !== true) {
          const code = secondParagraphResult?.failure?.code ?? 'UNKNOWN';
          throw new Error(`tables.clearContents setup failed while creating second paragraph (code: ${code}).`);
        }

        const paragraphNodeId = await firstNodeId(sessionId, 'paragraph');
        const convertResult = unwrap<any>(
          await api.doc.tables.convertFromText({
            sessionId,
            nodeId: paragraphNodeId,
            delimiter: 'tab',
          }),
        );
        assertMutationSuccess('tables.convertFromText', convertResult);

        const firstTableNodeId = convertResult?.table?.nodeId;
        if (!firstTableNodeId) {
          throw new Error('tables.clearContents setup failed: converted table nodeId was not returned.');
        }

        const splitResult = unwrap<any>(
          await api.doc.tables.split({
            sessionId,
            nodeId: firstTableNodeId,
            atRowIndex: 1,
          }),
        );
        assertMutationSuccess('tables.split', splitResult);

        const separatorResult = unwrap<any>(
          await api.doc.create.paragraph({
            sessionId,
            at: {
              kind: 'after',
              target: {
                kind: 'block',
                nodeType: 'table',
                nodeId: firstTableNodeId,
              },
            },
            text: 'Below table is cleared by clearContents',
          }),
        );
        if (separatorResult?.success !== true) {
          const code = separatorResult?.failure?.code ?? 'UNKNOWN';
          throw new Error(`tables.clearContents setup failed while inserting separator paragraph (code: ${code}).`);
        }

        const moveResult = unwrap<any>(
          await api.doc.tables.move({
            sessionId,
            nodeId: firstTableNodeId,
            destination: { kind: 'documentEnd' },
          }),
        );
        assertMutationSuccess('tables.move', moveResult);
        clearContentsTableBySession.set(sessionId, firstTableNodeId);
      },
      run: async (sessionId) => {
        const firstTableNodeId = clearContentsTableBySession.get(sessionId);
        if (!firstTableNodeId) {
          throw new Error('tables.clearContents setup failed: prepared table nodeId was not found.');
        }
        clearContentsTableBySession.delete(sessionId);

        return unwrap<any>(
          await api.doc.tables.clearContents({
            sessionId,
            nodeId: firstTableNodeId,
          }),
        );
      },
    },
    {
      operationId: 'tables.move',
      setup: 'table',
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.move', fixture);
        return unwrap<any>(
          await api.doc.tables.move({
            sessionId,
            nodeId: f.tableNodeId,
            destination: { kind: 'documentStart' },
          }),
        );
      },
    },
    {
      operationId: 'tables.split',
      setup: 'table',
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.split', fixture);
        return unwrap<any>(await api.doc.tables.split({ sessionId, nodeId: f.tableNodeId, atRowIndex: 1 }));
      },
    },
    {
      operationId: 'tables.convertToText',
      setup: 'blank',
      prepare: async (sessionId) => {
        await api.doc.insert({
          sessionId,
          value: 'Alpha\tBeta\tGamma',
        });

        const secondParagraphResult = unwrap<any>(
          await api.doc.create.paragraph({
            sessionId,
            at: { kind: 'documentEnd' },
            text: 'One\tTwo\tThree',
          }),
        );
        if (secondParagraphResult?.success !== true) {
          const code = secondParagraphResult?.failure?.code ?? 'UNKNOWN';
          throw new Error(`tables.convertToText setup failed while creating second paragraph (code: ${code}).`);
        }

        const paragraphNodeId = await firstNodeId(sessionId, 'paragraph');
        const convertFromTextResult = unwrap<any>(
          await api.doc.tables.convertFromText({
            sessionId,
            nodeId: paragraphNodeId,
            delimiter: 'tab',
          }),
        );
        assertMutationSuccess('tables.convertFromText', convertFromTextResult);

        const tableNodeId = convertFromTextResult?.table?.nodeId;
        if (!tableNodeId) {
          throw new Error('tables.convertToText setup failed: converted table nodeId was not returned.');
        }
        convertToTextTableBySession.set(sessionId, tableNodeId);
      },
      run: async (sessionId) => {
        const tableNodeId = convertToTextTableBySession.get(sessionId);
        if (!tableNodeId) {
          throw new Error('tables.convertToText setup failed: prepared table nodeId was not found.');
        }
        convertToTextTableBySession.delete(sessionId);
        return unwrap<any>(
          await api.doc.tables.convertToText({
            sessionId,
            nodeId: tableNodeId,
            delimiter: 'tab',
          }),
        );
      },
    },
    {
      operationId: 'tables.setLayout',
      setup: 'table',
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.setLayout', fixture);
        return unwrap<any>(await api.doc.tables.setLayout({ sessionId, nodeId: f.tableNodeId, alignment: 'center' }));
      },
    },
    {
      operationId: 'tables.insertRow',
      setup: 'table',
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.insertRow', fixture);
        return unwrap<any>(
          await api.doc.tables.insertRow({
            sessionId,
            tableNodeId: f.tableNodeId,
            rowIndex: 0,
            position: 'below',
          }),
        );
      },
    },
    {
      operationId: 'tables.deleteRow',
      setup: 'table',
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.deleteRow', fixture);
        return unwrap<any>(await api.doc.tables.deleteRow({ sessionId, tableNodeId: f.tableNodeId, rowIndex: 0 }));
      },
    },
    {
      operationId: 'tables.setRowHeight',
      setup: 'table',
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.setRowHeight', fixture);
        return unwrap<any>(
          await api.doc.tables.setRowHeight({
            sessionId,
            tableNodeId: f.tableNodeId,
            rowIndex: 0,
            heightPt: 36,
            rule: 'atLeast',
          }),
        );
      },
    },
    {
      operationId: 'tables.distributeRows',
      setup: 'table',
      prepare: async (sessionId, fixture) => {
        const f = requireFixture('tables.distributeRows', fixture);
        const presets = [
          { rowIndex: 0, heightPt: 18 },
          { rowIndex: 1, heightPt: 54 },
          { rowIndex: 2, heightPt: 30 },
        ];

        for (const preset of presets) {
          const setHeightResult = unwrap<any>(
            await api.doc.tables.setRowHeight({
              sessionId,
              tableNodeId: f.tableNodeId,
              rowIndex: preset.rowIndex,
              heightPt: preset.heightPt,
              rule: 'exact',
            }),
          );
          assertMutationSuccess('tables.setRowHeight', setHeightResult);
        }
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.distributeRows', fixture);
        return unwrap<any>(await api.doc.tables.distributeRows({ sessionId, nodeId: f.tableNodeId }));
      },
    },
    {
      operationId: 'tables.setRowOptions',
      setup: 'table',
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.setRowOptions', fixture);
        return unwrap<any>(
          await api.doc.tables.setRowOptions({
            sessionId,
            tableNodeId: f.tableNodeId,
            rowIndex: 0,
            allowBreakAcrossPages: false,
            repeatHeader: true,
          }),
        );
      },
    },
    {
      operationId: 'tables.insertColumn',
      setup: 'table',
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.insertColumn', fixture);
        return unwrap<any>(
          await api.doc.tables.insertColumn({
            sessionId,
            tableNodeId: f.tableNodeId,
            columnIndex: 0,
            position: 'right',
          }),
        );
      },
    },
    {
      operationId: 'tables.deleteColumn',
      setup: 'table',
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.deleteColumn', fixture);
        return unwrap<any>(
          await api.doc.tables.deleteColumn({
            sessionId,
            tableNodeId: f.tableNodeId,
            columnIndex: 0,
          }),
        );
      },
    },
    {
      operationId: 'tables.setColumnWidth',
      setup: 'table',
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.setColumnWidth', fixture);
        return unwrap<any>(
          await api.doc.tables.setColumnWidth({
            sessionId,
            tableNodeId: f.tableNodeId,
            columnIndex: 0,
            widthPt: 72,
          }),
        );
      },
    },
    {
      operationId: 'tables.distributeColumns',
      setup: 'table',
      prepare: async (sessionId, fixture) => {
        const f = requireFixture('tables.distributeColumns', fixture);
        const presets = [
          { columnIndex: 0, widthPt: 36 },
          { columnIndex: 1, widthPt: 108 },
          { columnIndex: 2, widthPt: 54 },
        ];

        for (const preset of presets) {
          const setWidthResult = unwrap<any>(
            await api.doc.tables.setColumnWidth({
              sessionId,
              tableNodeId: f.tableNodeId,
              columnIndex: preset.columnIndex,
              widthPt: preset.widthPt,
            }),
          );
          assertMutationSuccess('tables.setColumnWidth', setWidthResult);
        }
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.distributeColumns', fixture);
        return unwrap<any>(await api.doc.tables.distributeColumns({ sessionId, nodeId: f.tableNodeId }));
      },
    },
    {
      operationId: 'tables.insertCell',
      setup: 'blank',
      prepare: async (sessionId) => {
        await api.doc.insert({ sessionId, value: 'Apple\tBanana\tMango' });

        for (const rowText of ['Orange\tGrape\tKiwi', 'Pear\tPeach\tPlum']) {
          const createRowResult = unwrap<any>(
            await api.doc.create.paragraph({
              sessionId,
              at: { kind: 'documentEnd' },
              text: rowText,
            }),
          );
          if (createRowResult?.success !== true) {
            const code = createRowResult?.failure?.code ?? 'UNKNOWN';
            throw new Error(`tables.insertCell setup failed while creating row paragraph (code: ${code}).`);
          }
        }

        const paragraphNodeId = await firstNodeId(sessionId, 'paragraph');
        const convertResult = unwrap<any>(
          await api.doc.tables.convertFromText({
            sessionId,
            nodeId: paragraphNodeId,
            delimiter: 'tab',
          }),
        );
        assertMutationSuccess('tables.convertFromText', convertResult);

        const tableNodeId = convertResult?.table?.nodeId;
        if (!tableNodeId) {
          throw new Error('tables.insertCell setup failed: converted table nodeId was not returned.');
        }

        const cellsResult = unwrap<any>(await api.doc.tables.getCells({ sessionId, nodeId: tableNodeId, rowIndex: 0 }));
        const firstCellNodeId = cellsResult?.cells?.find(
          (cell: any) => cell?.rowIndex === 0 && cell?.columnIndex === 0,
        )?.nodeId;
        if (!firstCellNodeId) {
          throw new Error('tables.insertCell setup failed: first-row first-column cell was not found.');
        }

        const tableInfo = unwrap<any>(await api.doc.tables.get({ sessionId, nodeId: tableNodeId }));
        if (typeof tableInfo?.rows !== 'number' || tableInfo.rows < 1) {
          throw new Error('tables.insertCell setup failed: initial table row count could not be determined.');
        }

        insertCellBySession.set(sessionId, firstCellNodeId);
        insertCellTableBySession.set(sessionId, tableNodeId);
        insertCellInitialRowsBySession.set(sessionId, tableInfo.rows);
      },
      run: async (sessionId) => {
        const cellNodeId = insertCellBySession.get(sessionId);
        const tableNodeId = insertCellTableBySession.get(sessionId);
        const initialRows = insertCellInitialRowsBySession.get(sessionId);
        if (!cellNodeId) {
          throw new Error('tables.insertCell setup failed: prepared cell nodeId was not found.');
        }
        if (!tableNodeId) {
          throw new Error('tables.insertCell setup failed: prepared table nodeId was not found.');
        }
        if (typeof initialRows !== 'number') {
          throw new Error('tables.insertCell setup failed: prepared initial row count was not found.');
        }
        insertCellBySession.delete(sessionId);
        insertCellTableBySession.delete(sessionId);
        insertCellInitialRowsBySession.delete(sessionId);

        const result = unwrap<any>(
          await api.doc.tables.insertCell({ sessionId, nodeId: cellNodeId, mode: 'shiftRight' }),
        );
        assertMutationSuccess('tables.insertCell', result);

        const tableResult = unwrap<any>(await api.doc.tables.get({ sessionId, nodeId: tableNodeId }));
        if (tableResult?.rows !== initialRows + 1) {
          throw new Error(
            `tables.insertCell expected row count to grow by 1 after overflow-preserving shiftRight, received ${tableResult?.rows} from initial ${initialRows}.`,
          );
        }

        const mangoResult = unwrap<any>(
          await api.doc.query.match({
            sessionId,
            select: { type: 'text', pattern: 'Mango', caseSensitive: true },
            require: 'first',
          }),
        );
        const mangoMatch = mangoResult?.items?.[0];
        if (!mangoMatch) {
          throw new Error('tables.insertCell expected to preserve rightmost cell content "Mango" after shiftRight.');
        }

        return result;
      },
    },
    {
      operationId: 'tables.deleteCell',
      setup: 'blank',
      prepare: async (sessionId) => {
        await api.doc.insert({ sessionId, value: 'A1\tB1\tC1' });

        for (const rowText of ['A2\tB2\tC2', 'A3\tB3\tC3']) {
          const createRowResult = unwrap<any>(
            await api.doc.create.paragraph({
              sessionId,
              at: { kind: 'documentEnd' },
              text: rowText,
            }),
          );
          if (createRowResult?.success !== true) {
            const code = createRowResult?.failure?.code ?? 'UNKNOWN';
            throw new Error(`tables.deleteCell setup failed while creating row paragraph (code: ${code}).`);
          }
        }

        const paragraphNodeId = await firstNodeId(sessionId, 'paragraph');
        const convertResult = unwrap<any>(
          await api.doc.tables.convertFromText({
            sessionId,
            nodeId: paragraphNodeId,
            delimiter: 'tab',
          }),
        );
        assertMutationSuccess('tables.convertFromText', convertResult);

        const tableNodeId = convertResult?.table?.nodeId;
        if (!tableNodeId) {
          throw new Error('tables.deleteCell setup failed: converted table nodeId was not returned.');
        }

        const cellsResult = unwrap<any>(await api.doc.tables.getCells({ sessionId, nodeId: tableNodeId }));
        const firstCellNodeId = cellsResult?.cells?.[0]?.nodeId;
        if (!firstCellNodeId) {
          throw new Error('tables.deleteCell setup failed: no table cell was returned from getCells.');
        }

        deleteCellBySession.set(sessionId, firstCellNodeId);
      },
      run: async (sessionId) => {
        const cellNodeId = deleteCellBySession.get(sessionId);
        if (!cellNodeId) {
          throw new Error('tables.deleteCell setup failed: prepared cell nodeId was not found.');
        }
        deleteCellBySession.delete(sessionId);
        return unwrap<any>(await api.doc.tables.deleteCell({ sessionId, nodeId: cellNodeId, mode: 'shiftLeft' }));
      },
    },
    {
      operationId: 'tables.mergeCells',
      setup: 'table',
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.mergeCells', fixture);
        return unwrap<any>(
          await api.doc.tables.mergeCells({
            sessionId,
            tableNodeId: f.tableNodeId,
            start: { rowIndex: 0, columnIndex: 0 },
            end: { rowIndex: 0, columnIndex: 1 },
          }),
        );
      },
    },
    {
      operationId: 'tables.unmergeCells',
      setup: 'table',
      prepare: async (sessionId, fixture) => {
        const f = requireFixture('tables.unmergeCells', fixture);
        const mergeResult = unwrap<any>(
          await api.doc.tables.mergeCells({
            sessionId,
            tableNodeId: f.tableNodeId,
            start: { rowIndex: 0, columnIndex: 0 },
            end: { rowIndex: 0, columnIndex: 1 },
          }),
        );
        assertMutationSuccess('tables.mergeCells', mergeResult);
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.unmergeCells', fixture);
        return unwrap<any>(await api.doc.tables.unmergeCells({ sessionId, nodeId: f.cellNodeId }));
      },
    },
    {
      operationId: 'tables.splitCell',
      setup: 'table',
      prepare: async (sessionId, fixture) => {
        const f = requireFixture('tables.splitCell', fixture);
        const mergeResult = unwrap<any>(
          await api.doc.tables.mergeCells({
            sessionId,
            tableNodeId: f.tableNodeId,
            start: { rowIndex: 0, columnIndex: 0 },
            end: { rowIndex: 0, columnIndex: 1 },
          }),
        );
        assertMutationSuccess('tables.mergeCells', mergeResult);
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.splitCell', fixture);
        return unwrap<any>(
          await api.doc.tables.splitCell({
            sessionId,
            nodeId: f.cellNodeId,
            rows: 1,
            columns: 2,
          }),
        );
      },
    },
    {
      operationId: 'tables.setCellProperties',
      setup: 'table',
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.setCellProperties', fixture);
        return unwrap<any>(
          await api.doc.tables.setCellProperties({
            sessionId,
            nodeId: f.cellNodeId,
            verticalAlign: 'center',
          }),
        );
      },
    },
    {
      operationId: 'tables.sort',
      setup: 'table',
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.sort', fixture);
        return unwrap<any>(
          await api.doc.tables.sort({
            sessionId,
            nodeId: f.tableNodeId,
            keys: [{ columnIndex: 0, direction: 'ascending', type: 'text' }],
          }),
        );
      },
    },
    {
      operationId: 'tables.setAltText',
      setup: 'table',
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.setAltText', fixture);
        return unwrap<any>(
          await api.doc.tables.setAltText({
            sessionId,
            nodeId: f.tableNodeId,
            title: 'Test Table',
            description: 'Doc-api story output',
          }),
        );
      },
    },
    {
      operationId: 'tables.setStyle',
      setup: 'table',
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.setStyle', fixture);
        return unwrap<any>(await api.doc.tables.setStyle({ sessionId, nodeId: f.tableNodeId, styleId: 'TableGrid' }));
      },
    },
    {
      operationId: 'tables.clearStyle',
      setup: 'blank',
      seedDoc: corpusDoc('basic/ooxml-bold-rstyle-linked-combos-demo.docx'),
      prepare: async (sessionId, fixture) => {
        if (fixture) {
          throw new Error('tables.clearStyle setup should not receive a table fixture.');
        }

        const createResult = unwrap<any>(
          await api.doc.create.table({
            sessionId,
            rows: 3,
            columns: 3,
            at: { kind: 'documentStart' },
          }),
        );
        assertMutationSuccess('create.table', createResult);
        const tableNodeId = createResult?.table?.nodeId;
        if (!tableNodeId) {
          throw new Error('tables.clearStyle setup failed: created table nodeId was not returned.');
        }

        const setStyle = unwrap<any>(
          await api.doc.tables.setStyle({
            sessionId,
            nodeId: tableNodeId,
            styleId: 'ColorfulGrid-Accent1',
          }),
        );
        assertMutationSuccess('tables.setStyle', setStyle);
        clearStyleTableBySession.set(sessionId, tableNodeId);
      },
      run: async (sessionId) => {
        const tableNodeId = clearStyleTableBySession.get(sessionId);
        if (!tableNodeId) {
          throw new Error('tables.clearStyle setup failed: prepared table nodeId was not found.');
        }
        clearStyleTableBySession.delete(sessionId);
        return unwrap<any>(await api.doc.tables.clearStyle({ sessionId, nodeId: tableNodeId }));
      },
    },
    {
      operationId: 'tables.setStyleOption',
      setup: 'table',
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.setStyleOption', fixture);
        return unwrap<any>(
          await api.doc.tables.setStyleOption({
            sessionId,
            nodeId: f.tableNodeId,
            flag: 'headerRow',
            enabled: true,
          }),
        );
      },
    },
    {
      operationId: 'tables.setBorder',
      setup: 'table',
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.setBorder', fixture);
        return unwrap<any>(
          await api.doc.tables.setBorder({
            sessionId,
            nodeId: f.tableNodeId,
            edge: 'top',
            lineStyle: 'single',
            lineWeightPt: 1,
            color: '000000',
          }),
        );
      },
    },
    {
      operationId: 'tables.clearBorder',
      setup: 'table',
      prepare: async (sessionId, fixture) => {
        const f = requireFixture('tables.clearBorder', fixture);
        const presetResult = unwrap<any>(
          await api.doc.tables.applyBorderPreset({
            sessionId,
            nodeId: f.tableNodeId,
            preset: 'all',
          }),
        );
        assertMutationSuccess('tables.applyBorderPreset', presetResult);
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.clearBorder', fixture);

        for (const edge of ['top', 'bottom', 'left', 'right', 'insideH', 'insideV'] as const) {
          const clearResult = unwrap<any>(
            await api.doc.tables.clearBorder({
              sessionId,
              nodeId: f.tableNodeId,
              edge,
            }),
          );
          assertMutationSuccess('tables.clearBorder', clearResult);
        }

        return { success: true };
      },
    },
    {
      operationId: 'tables.applyBorderPreset',
      setup: 'table',
      prepare: async (sessionId, fixture) => {
        const f = requireFixture('tables.applyBorderPreset', fixture);
        const allPresetResult = unwrap<any>(
          await api.doc.tables.applyBorderPreset({
            sessionId,
            nodeId: f.tableNodeId,
            preset: 'all',
          }),
        );
        assertMutationSuccess('tables.applyBorderPreset', allPresetResult);
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.applyBorderPreset', fixture);
        return unwrap<any>(
          await api.doc.tables.applyBorderPreset({
            sessionId,
            nodeId: f.tableNodeId,
            preset: 'box',
          }),
        );
      },
    },
    {
      operationId: 'tables.setShading',
      setup: 'table',
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.setShading', fixture);
        return unwrap<any>(await api.doc.tables.setShading({ sessionId, nodeId: f.tableNodeId, color: 'FF0000' }));
      },
    },
    {
      operationId: 'tables.clearShading',
      setup: 'table',
      prepare: async (sessionId, fixture) => {
        const f = requireFixture('tables.clearShading', fixture);
        const setTableShading = unwrap<any>(
          await api.doc.tables.setShading({
            sessionId,
            nodeId: f.tableNodeId,
            color: 'FF0000',
          }),
        );
        assertMutationSuccess('tables.setShading', setTableShading);

        const setCellShading = unwrap<any>(
          await api.doc.tables.setShading({
            sessionId,
            nodeId: f.cellNodeId,
            color: 'FFCC00',
          }),
        );
        assertMutationSuccess('tables.setShading', setCellShading);
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.clearShading', fixture);
        return unwrap<any>(await api.doc.tables.clearShading({ sessionId, nodeId: f.tableNodeId }));
      },
    },
    {
      operationId: 'tables.setTablePadding',
      setup: 'table',
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.setTablePadding', fixture);
        return unwrap<any>(
          await api.doc.tables.setTablePadding({
            sessionId,
            nodeId: f.tableNodeId,
            topPt: 18,
            rightPt: 18,
            bottomPt: 18,
            leftPt: 18,
          }),
        );
      },
    },
    {
      operationId: 'tables.setCellPadding',
      setup: 'table',
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.setCellPadding', fixture);
        return unwrap<any>(
          await api.doc.tables.setCellPadding({
            sessionId,
            nodeId: f.cellNodeId,
            topPt: 5,
            rightPt: 5,
            bottomPt: 5,
            leftPt: 5,
          }),
        );
      },
    },
    {
      operationId: 'tables.setCellSpacing',
      setup: 'table',
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.setCellSpacing', fixture);
        return unwrap<any>(await api.doc.tables.setCellSpacing({ sessionId, nodeId: f.tableNodeId, spacingPt: 2 }));
      },
    },
    {
      operationId: 'tables.clearCellSpacing',
      setup: 'table',
      prepare: async (sessionId, fixture) => {
        const f = requireFixture('tables.clearCellSpacing', fixture);
        const setSpacingFirst = unwrap<any>(
          await api.doc.tables.setCellSpacing({
            sessionId,
            nodeId: f.tableNodeId,
            spacingPt: 8,
          }),
        );
        assertMutationSuccess('tables.setCellSpacing', setSpacingFirst);

        const secondTable = unwrap<any>(
          await api.doc.create.table({
            sessionId,
            rows: 3,
            columns: 3,
            at: { kind: 'documentEnd' },
          }),
        );
        assertMutationSuccess('create.table', secondTable);
        const secondTableNodeId = secondTable?.table?.nodeId;
        if (!secondTableNodeId) {
          throw new Error('tables.clearCellSpacing setup failed: second table nodeId was not returned.');
        }

        const setSpacingSecond = unwrap<any>(
          await api.doc.tables.setCellSpacing({
            sessionId,
            nodeId: secondTableNodeId,
            spacingPt: 8,
          }),
        );
        assertMutationSuccess('tables.setCellSpacing', setSpacingSecond);
      },
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.clearCellSpacing', fixture);
        return unwrap<any>(
          await api.doc.tables.clearCellSpacing({
            sessionId,
            nodeId: f.tableNodeId,
          }),
        );
      },
    },
    {
      operationId: 'tables.get',
      setup: 'table',
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.get', fixture);
        return unwrap<any>(await api.doc.tables.get({ sessionId, nodeId: f.tableNodeId }));
      },
    },
    {
      operationId: 'tables.getCells',
      setup: 'table',
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.getCells', fixture);
        return unwrap<any>(await api.doc.tables.getCells({ sessionId, nodeId: f.tableNodeId }));
      },
    },
    {
      operationId: 'tables.getProperties',
      setup: 'table',
      run: async (sessionId, fixture) => {
        const f = requireFixture('tables.getProperties', fixture);
        return unwrap<any>(await api.doc.tables.getProperties({ sessionId, nodeId: f.tableNodeId }));
      },
    },
  ];

  it('covers every table command currently defined on this branch', () => {
    const scenarioIds = scenarios.map((scenario) => scenario.operationId);
    expect(new Set(scenarioIds).size).toBe(scenarioIds.length);
    expect(new Set(scenarioIds)).toEqual(new Set(ALL_TABLE_COMMAND_IDS));
  });

  for (const scenario of scenarios) {
    it(`${scenario.operationId}: executes and saves source/result docs`, async () => {
      const sessionId = makeSessionId(scenario.operationId.replace(/\./g, '-'));
      const fixture = scenario.setup === 'table' ? await setupTableFixture(sessionId) : null;

      if (scenario.setup === 'blank') {
        if (scenario.seedDoc) {
          await api.doc.open({ sessionId, doc: scenario.seedDoc });
        } else {
          await api.doc.open({ sessionId });
        }
      }

      if (scenario.prepare) {
        await scenario.prepare(sessionId, fixture);
      }

      await saveSource(sessionId, scenario.operationId);

      const result = await scenario.run(sessionId, fixture);

      if (readOperationIds.has(scenario.operationId)) {
        assertReadOutput(scenario.operationId, result);
        await saveReadOutput(scenario.operationId, result);
      } else {
        assertMutationSuccess(scenario.operationId, result);
      }

      await saveResult(sessionId, scenario.operationId);
    });
  }
});
