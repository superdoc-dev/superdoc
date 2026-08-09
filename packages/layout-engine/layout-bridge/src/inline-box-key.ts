import { inlineBoxStyleSignature, type InlineBoxSpan } from '@superdoc/contracts';

/** Shared inline-box identity for measure-cache and dirty-region decisions. */
export const inlineBoxKey = (box: InlineBoxSpan): string => {
  const data = Object.entries(box.data ?? {}).sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify([
    box.id,
    box.from,
    box.to,
    inlineBoxStyleSignature({ ...box.layout, ...box.appearance }),
    box.className ?? '',
    data,
    box.cursor ?? '',
  ]);
};
