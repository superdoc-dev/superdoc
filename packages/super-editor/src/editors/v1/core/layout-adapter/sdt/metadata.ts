/**
 * SDT Metadata Module
 *
 * Functions for resolving and applying Structured Document Tag (SDT) metadata
 * to FlowBlocks. SDTs are OOXML containers that can hold special metadata like
 * document sections, TOC entries, structured content blocks, etc.
 */

import type {
  FlowBlock,
  TableBlock,
  ListBlock,
  SdtMetadata,
  FieldAnnotationMetadata,
  StructuredContentMetadata,
  DocumentSectionMetadata,
  DocPartMetadata,
} from '@superdoc/contracts';
import type { PMNode } from '../types.js';
import { resolveSdtMetadata } from '@superdoc/style-engine';

type SdtMetadataForOverride<TOverride extends string | undefined> = TOverride extends 'fieldAnnotation'
  ? FieldAnnotationMetadata
  : TOverride extends 'structuredContent' | 'structuredContentBlock'
    ? StructuredContentMetadata
    : TOverride extends 'documentSection'
      ? DocumentSectionMetadata
      : TOverride extends 'docPartObject'
        ? DocPartMetadata
        : SdtMetadata;

/**
 * Type guard to check if a node has instruction attribute.
 */
export function hasInstruction(node: PMNode): node is PMNode & { attrs: { instruction?: string } } {
  return (
    typeof node.attrs === 'object' &&
    node.attrs !== null &&
    'instruction' in node.attrs &&
    typeof (node.attrs as Record<string, unknown>).instruction === 'string'
  );
}

/**
 * Safely extract instruction attribute from a node.
 */
export function getNodeInstruction(node: PMNode): string | undefined {
  if (typeof node.attrs !== 'object' || node.attrs === null) return undefined;
  const attrs = node.attrs as Record<string, unknown>;
  return typeof attrs.instruction === 'string' ? attrs.instruction : undefined;
}

/**
 * Safely extract docPartGallery attribute from a node.
 */
export function getDocPartGallery(node: PMNode): string | undefined {
  if (typeof node.attrs !== 'object' || node.attrs === null) return undefined;
  const attrs = node.attrs as Record<string, unknown>;
  return typeof attrs.docPartGallery === 'string' ? attrs.docPartGallery : undefined;
}

/**
 * Safely extract docPartObject ID attribute from a node.
 */
export function getDocPartObjectId(node: PMNode): string | undefined {
  if (typeof node.attrs !== 'object' || node.attrs === null) return undefined;
  const attrs = node.attrs as Record<string, unknown>;
  return typeof attrs.id === 'string' ? attrs.id : undefined;
}

/**
 * Resolve SDT metadata from a ProseMirror node.
 * Uses the style engine's resolveSdtMetadata function with appropriate caching.
 *
 * @param node - PM node to extract metadata from
 * @param overrideType - Optional type override (e.g., 'documentSection', 'docPartObject')
 * @returns Resolved SDT metadata, or undefined if none
 */
export function resolveNodeSdtMetadata<TOverride extends string | undefined = undefined>(
  node: PMNode,
  overrideType?: TOverride,
): SdtMetadataForOverride<TOverride> | undefined {
  const attrs = node.attrs;
  if (!attrs) return undefined;
  const nodeType = overrideType ?? node.type;
  if (!nodeType) return undefined;
  const cacheKey =
    typeof attrs.hash === 'string'
      ? attrs.hash
      : typeof attrs.id === 'string'
        ? attrs.id
        : typeof attrs.fieldId === 'string'
          ? attrs.fieldId
          : undefined;
  return resolveSdtMetadata({
    nodeType,
    attrs,
    cacheKey,
  }) as SdtMetadataForOverride<TOverride> | undefined;
}

/**
 * Apply SDT metadata to paragraph blocks.
 * Sets the sdt property in block.attrs for each paragraph.
 *
 * @param blocks - Array of flow blocks to process (only paragraphs are modified)
 * @param metadata - SDT metadata to apply
 */
export function applySdtMetadataToParagraphBlocks(blocks: FlowBlock[], metadata?: SdtMetadata): void {
  if (!metadata) return;
  blocks.forEach((block) => {
    if (block.kind !== 'paragraph') return;
    if (!block.attrs) block.attrs = {};
    block.attrs.sdt = metadata;
  });
}

/**
 * Apply SDT metadata to a table block and all its cell paragraphs.
 * Recursively applies metadata to nested paragraph content within table cells.
 *
 * @param tableBlock - Table block to process
 * @param metadata - SDT metadata to apply
 */
export function applySdtMetadataToTableBlock(tableBlock: FlowBlock | undefined, metadata?: SdtMetadata): void {
  if (!metadata || !tableBlock || tableBlock.kind !== 'table') return;
  const table = tableBlock as TableBlock;
  if (!table.attrs) table.attrs = {};
  table.attrs.sdt = metadata;
  table.rows?.forEach((row) => {
    row.cells?.forEach((cell) => {
      const cellBlocks = cell.blocks;
      if (cellBlocks && cellBlocks.length > 0) {
        applySdtMetadataToParagraphBlocks(cellBlocks, metadata);
        cellBlocks.forEach((block) => {
          if (block.kind === 'table') {
            applySdtMetadataToTableBlock(block, metadata);
          }
        });
        return;
      }
      if (cell.paragraph) {
        applySdtMetadataToParagraphBlocks([cell.paragraph], metadata);
      }
    });
  });
}

/**
 * Record the ordered block-container chain (outermost first) on every emitted
 * block, and fill in `attrs.sdt` for block kinds the metadata helpers skip
 * (drawings, images) so a non-paragraph child of a content control no longer
 * breaks that control's grouping run. Recurses table cells.
 *
 * @param blocks - Flow blocks to stamp
 * @param nearest - This control's metadata (each block's nearest container)
 * @param chain - Full container ancestry, outermost first
 */
export function applySdtContainerChain(
  blocks: FlowBlock[],
  nearest: SdtMetadata | undefined,
  chain: readonly SdtMetadata[],
): void {
  if (!nearest && chain.length === 0) return;
  for (const block of blocks) applyChainToBlock(block, nearest, chain);
}

function applyChainToBlock(block: FlowBlock, nearest: SdtMetadata | undefined, chain: readonly SdtMetadata[]): void {
  const target = block as { kind: FlowBlock['kind']; attrs?: Record<string, unknown> };
  if (!target.attrs) target.attrs = {};
  if (nearest && target.attrs.sdt == null) target.attrs.sdt = nearest;
  if (chain.length > 0) target.attrs.sdtContainers = chain as SdtMetadata[];
  if (block.kind === 'table') {
    const table = block as TableBlock;
    table.rows?.forEach((row) => {
      row.cells?.forEach((cell) => {
        const cellBlocks = cell.blocks && cell.blocks.length > 0 ? cell.blocks : cell.paragraph ? [cell.paragraph] : [];
        cellBlocks.forEach((cellBlock) => applyChainToBlock(cellBlock, nearest, chain));
      });
    });
  }
}

/**
 * Applies SDT metadata to all list items within a ListBlock.
 *
 * List items contain embedded paragraph blocks (ListItem.paragraph), and this function
 * ensures each paragraph receives the specified SDT metadata. This is commonly used when
 * a list appears inside a documentSection or other SDT container, so the list items
 * inherit the parent's metadata.
 *
 * @param listBlock - The list block whose items should receive metadata
 * @param metadata - The SDT metadata to apply (e.g., documentSection, structuredContent)
 *
 * @example
 * ```typescript
 * const sectionMetadata: DocumentSectionMetadata = {
 *   type: 'documentSection',
 *   id: 'section-1',
 *   title: 'Locked Section',
 *   isLocked: true
 * };
 *
 * applySdtMetadataToListBlock(listBlock, sectionMetadata);
 * // Now every list item's paragraph has section metadata
 * ```
 */
export function applySdtMetadataToListBlock(listBlock: ListBlock | undefined, metadata?: SdtMetadata): void {
  if (!metadata || !listBlock) return;

  // Apply metadata to each list item's embedded paragraph
  listBlock.items.forEach((item) => {
    if (!item.paragraph.attrs) {
      item.paragraph.attrs = {};
    }
    item.paragraph.attrs.sdt = metadata;
  });
}
