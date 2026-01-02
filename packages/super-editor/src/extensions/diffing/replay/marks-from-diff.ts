/**
 * Builds a mark set from inline diff metadata.
 *
 * @param params Inputs used to resolve marks for an inline diff.
 * @param params.schema Schema used to resolve mark types.
 * @param params.action Inline diff action to apply.
 * @param params.marks Mark JSON entries present on the diff.
 * @param params.marksDiff Mark diff entries for modified content.
 * @param params.oldMarks Mark JSON entries from the original content.
 * @returns The resolved marks to apply to inserted/replaced text.
 */
export function marksFromDiff({
  schema,
  action,
  marks = [],
  marksDiff = null,
  oldMarks = [],
}: {
  schema: import('prosemirror-model').Schema;
  action: import('../algorithm/inline-diffing.ts').InlineDiffResult['action'];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  marksDiff?: import('../algorithm/attributes-diffing.ts').MarksDiff | null;
  oldMarks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}): import('prosemirror-model').Mark[] {
  if (action === 'deleted') {
    return [];
  }

  if (action === 'modified') {
    if (marksDiff && oldMarks.length > 0) {
      const updatedMarks = applyMarksDiff(oldMarks, marksDiff);
      return buildMarksFromJSON(schema, updatedMarks);
    }
    if (marks.length > 0) {
      return buildMarksFromJSON(schema, marks);
    }
    return [];
  }

  if (marks.length === 0) {
    return [];
  }

  return buildMarksFromJSON(schema, marks);
}

/**
 * Applies a marks diff to a list of mark JSON entries.
 *
 * @param existingMarks Base mark JSON entries.
 * @param marksDiff Diff to apply against the base marks.
 * @returns Updated mark JSON entries.
 */
const applyMarksDiff = (
  existingMarks: Array<{ type: string; attrs?: Record<string, unknown> }>,
  marksDiff: import('../algorithm/attributes-diffing.ts').MarksDiff,
): Array<{ type: string; attrs?: Record<string, unknown> }> => {
  const byType = new Map<string, Record<string, unknown>>();

  existingMarks.forEach((mark) => {
    byType.set(mark.type, mark.attrs ?? {});
  });

  marksDiff.deleted.forEach((mark) => {
    byType.delete(mark.name);
  });

  marksDiff.modified.forEach((mark) => {
    byType.set(mark.name, mark.newAttrs ?? {});
  });

  marksDiff.added.forEach((mark) => {
    byType.set(mark.name, mark.attrs ?? {});
  });

  return Array.from(byType.entries()).map(([type, attrs]) => ({ type, attrs }));
};

/**
 * Converts mark JSON entries into schema marks, skipping unknown types.
 *
 * @param schema Schema used to resolve mark types.
 * @param marks Mark JSON entries to convert.
 * @returns Resolved mark instances.
 */
const buildMarksFromJSON = (
  schema: import('prosemirror-model').Schema,
  marks: Array<{ type: string; attrs?: Record<string, unknown> }>,
): import('prosemirror-model').Mark[] => {
  const resolvedMarks: import('prosemirror-model').Mark[] = [];

  marks.forEach((mark) => {
    const markType = schema.marks[mark.type];
    if (!markType) {
      return;
    }
    resolvedMarks.push(markType.create(mark.attrs ?? {}));
  });

  return resolvedMarks;
};
