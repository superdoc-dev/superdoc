export type TableSnapshotFlags = {
  inTableFragment: boolean;
  inTableParagraph: boolean;
};

export const getTableSnapshotFlags = (lineEl: HTMLElement): TableSnapshotFlags => ({
  inTableFragment: Boolean(lineEl.closest('.superdoc-table-fragment')),
  inTableParagraph: Boolean(lineEl.closest('.superdoc-table-paragraph')),
});
