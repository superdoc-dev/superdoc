import { type InlineConverterParams } from './common';

/**
 * pm-adapter inline converter for the SuperDoc `smartTag` node (SD-2647).
 *
 * A smartTag is a transparent OOXML inline wrapper (`<w:smartTag>`); its
 * children are normal inline content. The pm-adapter contribution mirrors
 * `structuredContentNodeToBlocks`: visit the children with the inherited
 * marks unchanged so the wrapper contributes no run of its own.
 *
 * SD-2781 (mirrors structured-content / bookmark-start): forward
 * `inlineRunProperties` so children inside the smartTag wrapper preserve
 * run-level bidi/script metadata. The wrapper itself doesn't introduce a new
 * run boundary, so the parent run's inline source still applies.
 *
 * The wrapper's own attrs (`element`, `uri`, `smartTagPr`) are metadata only;
 * they survive round-trip via the v3 translator and don't affect layout.
 */
export function smartTagNodeToBlocks({
  node,
  inheritedMarks,
  sdtMetadata,
  visitNode,
  runProperties,
  inlineRunProperties,
}: InlineConverterParams): void {
  node.content?.forEach((child) =>
    visitNode(child, inheritedMarks, sdtMetadata, runProperties, false, inlineRunProperties),
  );
}
