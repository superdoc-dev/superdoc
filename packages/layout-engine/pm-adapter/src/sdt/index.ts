/**
 * SDT (Structured Document Tags) Module
 *
 * Centralized exports for processing OOXML Structured Document Tags including:
 * - SDT metadata resolution and application
 * - Table of Contents (TOC) processing
 * - Document section processing
 */

// Metadata
export {
  hasInstruction,
  getNodeInstruction,
  getDocPartGallery,
  getDocPartObjectId,
  resolveNodeSdtMetadata,
  applySdtMetadataToParagraphBlocks,
  applySdtMetadataToTableBlock,
  applySdtMetadataToListBlock,
} from './metadata.js';

// Table of Contents
export { applyTocMetadata, processTocChildren, handleTableOfContentsNode } from './toc.js';

// Document Index
export { handleIndexNode } from './document-index.js';

// Structured Content Block
export { handleStructuredContentBlockNode } from './structured-content-block.js';

// Document Section
export { processDocumentSectionChildren, handleDocumentSectionNode } from './document-section.js';

// Document Part Object
export { handleDocumentPartObjectNode } from './document-part-object.js';
