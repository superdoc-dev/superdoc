import type { DrawingBlock } from '@superdoc/contracts';

export const isWordArtTextboxWatermarkBlock = (block: DrawingBlock | undefined): boolean => {
  if (!block || block.kind !== 'drawing' || block.drawingKind !== 'vectorShape') {
    return false;
  }

  const attrs = (block.attrs as Record<string, unknown> | undefined) ?? {};
  const hasTextContent = Array.isArray(block.textContent?.parts) && block.textContent.parts.length > 0;

  return (
    attrs.isWordArt === true &&
    attrs.isTextBox === true &&
    hasTextContent &&
    block.anchor?.isAnchored === true &&
    block.anchor.hRelativeFrom === 'page' &&
    block.anchor.alignH === 'center' &&
    block.anchor.vRelativeFrom === 'page' &&
    block.anchor.alignV === 'center' &&
    block.wrap?.type === 'None'
  );
};
