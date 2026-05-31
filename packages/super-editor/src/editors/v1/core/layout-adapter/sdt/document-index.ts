/**
 * Document Index Processing Module
 *
 * Index field containers convert their child paragraphs to flow blocks via the
 * shared paragraph-container handler, which keeps section-break accounting
 * aligned with the paragraph flow inside the index.
 */

export { handleParagraphContainerNode as handleIndexNode } from './paragraph-container.js';
