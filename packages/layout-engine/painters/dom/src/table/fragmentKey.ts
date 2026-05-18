import type { TableFragment } from '@superdoc/contracts';

export const tableFragmentKey = (fragment: TableFragment): string => {
  const partialKey = fragment.partialRow
    ? `:${fragment.partialRow.fromLineByCell.join(',')}-${fragment.partialRow.toLineByCell.join(',')}`
    : '';
  return `table:${fragment.blockId}:${fragment.fromRow}:${fragment.toRow}${partialKey}`;
};
