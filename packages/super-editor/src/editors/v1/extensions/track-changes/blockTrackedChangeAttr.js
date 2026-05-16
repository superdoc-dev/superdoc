/**
 * Shared ProseMirror addAttributes-compatible spec for block-level tracked
 * changes. Apply to block-unit nodes (TableRow for v1; TableCell, Image,
 * PageBreak in future) by spreading into addAttributes().
 *
 * Value shape:
 *   { kind: 'insert' | 'delete', id: string, operationId?: string } | null
 */
export const blockTrackedChangeAttrSpec = {
  trackChange: {
    default: null,
    parseDOM: (el) => {
      const kind = el.getAttribute('data-track-change');
      if (kind !== 'insert' && kind !== 'delete') return null;
      return {
        kind,
        id: el.getAttribute('data-track-change-id') ?? null,
        operationId: el.getAttribute('data-track-change-operation') ?? undefined,
      };
    },
    renderDOM: (attrs) => {
      const tc = attrs?.trackChange;
      return tc ? { 'data-track-change': tc.kind } : {};
    },
  },
};
