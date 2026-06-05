import type { TextRun } from '@superdoc/contracts';
import type { PMNode } from '../../types.js';
import { textNodeToRun } from './text-run.js';
import type { InlineConverterParams } from './common.js';

/**
 * Converts a sequenceField PM node to a TextRun token for post-assembly resolution.
 */
export function sequenceFieldNodeToRun(params: InlineConverterParams): TextRun | null {
  const { node, positions, sdtMetadata } = params;

  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  const cachedText = typeof attrs.resolvedNumber === 'string' ? attrs.resolvedNumber : '';

  const run = textNodeToRun({
    ...params,
    node: { type: 'text', text: cachedText || '1', marks: [...(node.marks ?? [])] } as PMNode,
  });
  run.token = 'seq';
  run.seqMetadata = {
    identifier: String(attrs.identifier ?? ''),
    instruction: String(attrs.instruction ?? ''),
    fieldArgument: String(attrs.fieldArgument ?? ''),
    sequenceMode: attrs.sequenceMode === 'current' ? 'current' : 'next',
    hideResult: attrs.hideResult === true,
    restartNumber: typeof attrs.restartNumber === 'number' ? attrs.restartNumber : null,
    restartLevel: typeof attrs.restartLevel === 'number' ? attrs.restartLevel : null,
    format: typeof attrs.format === 'string' ? attrs.format : undefined,
    hasGeneralFormat: attrs.hasGeneralFormat === true,
    pageNumberFieldFormat: readObjectAttr(attrs.pageNumberFieldFormat),
    numericPictureFormat: readObjectAttr(attrs.numericPictureFormat),
    cachedText,
  };

  const pos = positions.get(node);
  if (pos) {
    run.pmStart = pos.start;
    run.pmEnd = pos.end;
  }

  if (sdtMetadata) {
    run.sdt = sdtMetadata;
  }

  return run;
}

function readObjectAttr<T extends object>(value: unknown): T | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as T) : null;
}
