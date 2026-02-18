import type { PMNode } from '../types.js';
import type { BlockConverterOptions } from './inline-converters/common.js';

type BreakBlock = {
  kind: 'pageBreak' | 'columnBreak';
  id: string;
  attrs: Record<string, unknown>;
};

export const lineBreakNodeToBreakBlock = (node: PMNode, { nextBlockId }: BlockConverterOptions): BreakBlock | null => {
  const breakType = node.attrs?.pageBreakType ?? node.attrs?.lineBreakType ?? 'line';
  const kind = breakType === 'page' ? 'pageBreak' : breakType === 'column' ? 'columnBreak' : null;
  if (!kind) {
    return null;
  }

  return {
    kind,
    id: nextBlockId(kind),
    attrs: node.attrs || {},
  };
};
