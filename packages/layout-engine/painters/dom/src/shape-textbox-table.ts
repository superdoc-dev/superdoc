import type { ShapeTextContent, TableBlock, TableFragment, TableMeasure, TextPart } from '@superdoc/contracts';
import { getCellSpacingPx } from '@superdoc/contracts';
import type { FragmentRenderContext } from './renderer.js';
import { renderTableFragment, type TableRenderDependencies } from './table/renderTableFragment.js';

export function buildShapeTextboxTableFragment(block: TableBlock, measure: TableMeasure): TableFragment {
  return {
    kind: 'table',
    blockId: block.id,
    fromRow: 0,
    toRow: block.rows.length,
    x: 0,
    y: 0,
    width: measure.totalWidth,
    height: measure.totalHeight,
    columnWidths: measure.columnWidths,
  };
}

type RenderShapeTextboxTableParams = {
  doc: Document;
  part: TextPart;
  context?: FragmentRenderContext;
  renderLine: TableRenderDependencies['renderLine'];
  captureLineSnapshot?: TableRenderDependencies['captureLineSnapshot'];
  renderDrawingContent?: TableRenderDependencies['renderDrawingContent'];
  applySdtDataset: TableRenderDependencies['applySdtDataset'];
  applyContainerSdtDataset?: TableRenderDependencies['applyContainerSdtDataset'];
  applyStyles: TableRenderDependencies['applyStyles'];
};

export function renderShapeTextboxTable({
  doc,
  part,
  context,
  renderLine,
  captureLineSnapshot,
  renderDrawingContent,
  applySdtDataset,
  applyContainerSdtDataset,
  applyStyles,
}: RenderShapeTextboxTableParams): HTMLElement | null {
  const tableBlock = part.tableBlock;
  const tableMeasure = part.tableMeasure;
  if (!tableBlock || !tableMeasure) {
    return null;
  }

  const cellSpacingPx = tableMeasure.cellSpacingPx ?? getCellSpacingPx(tableBlock.attrs?.cellSpacing);
  const fragment = buildShapeTextboxTableFragment(tableBlock, tableMeasure);
  const renderContext = context ?? { pageNumber: 1, totalPages: 1, section: 'body' as const };

  return renderTableFragment({
    doc,
    fragment,
    context: renderContext,
    block: tableBlock,
    measure: tableMeasure,
    cellSpacingPx,
    effectiveColumnWidths: fragment.columnWidths ?? tableMeasure.columnWidths,
    chrome: 'none',
    renderLine,
    captureLineSnapshot,
    renderDrawingContent,
    applyFragmentFrame: (el, frag) => {
      const tableFragment = frag as TableFragment;
      el.style.position = 'relative';
      el.style.left = `${tableFragment.x}px`;
      el.style.top = `${tableFragment.y}px`;
      el.style.width = `${tableFragment.width}px`;
      el.style.height = `${tableFragment.height}px`;
    },
    applySdtDataset,
    applyContainerSdtDataset,
    applyStyles,
  });
}

export function shapeTextContentHasTableParts(textContent?: ShapeTextContent): boolean {
  return Boolean(textContent?.parts?.some((part) => part.kind === 'table' && part.tableBlock));
}
