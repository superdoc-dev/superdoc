import { type InlineConverterParams, HiddenByVanishError } from './common';
import { type RunProperties, resolveRunProperties } from '@superdoc/style-engine/ooxml';

export function runNodeChildrenToRuns({
  node,
  inheritedMarks,
  sdtMetadata,
  converterContext,
  paragraphProperties,
  visitNode,
}: InlineConverterParams): void {
  const mergedMarks = [...(node.marks ?? []), ...(inheritedMarks ?? [])];
  const runProperties = (node.attrs?.runProperties ?? {}) as RunProperties;
  if (runProperties.vanish) {
    throw new HiddenByVanishError();
  }
  const resolvedRunProperties = resolveRunProperties(
    converterContext,
    runProperties,
    paragraphProperties,
    converterContext!.tableInfo,
    false,
    false,
  );
  // Pass the RAW inline runProperties alongside the resolved cascade. SD-2781's
  // bidi/script preservation must read from inline only - cascade-resolved
  // values would tag every style-inherited run with metadata it didn't have.
  node.content?.forEach((child) =>
    visitNode(child, mergedMarks, sdtMetadata, resolvedRunProperties, false, runProperties),
  );
}
