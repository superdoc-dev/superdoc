/**
 * Tests for SDT Module Exports
 */

import { describe, it, expect } from 'vitest';
import * as sdtModule from './index.js';

describe('sdt module exports', () => {
  describe('metadata exports', () => {
    it('exports hasInstruction', () => {
      expect(sdtModule.hasInstruction).toBeDefined();
      expect(typeof sdtModule.hasInstruction).toBe('function');
    });

    it('exports getNodeInstruction', () => {
      expect(sdtModule.getNodeInstruction).toBeDefined();
      expect(typeof sdtModule.getNodeInstruction).toBe('function');
    });

    it('exports getDocPartGallery', () => {
      expect(sdtModule.getDocPartGallery).toBeDefined();
      expect(typeof sdtModule.getDocPartGallery).toBe('function');
    });

    it('exports getDocPartObjectId', () => {
      expect(sdtModule.getDocPartObjectId).toBeDefined();
      expect(typeof sdtModule.getDocPartObjectId).toBe('function');
    });

    it('exports resolveNodeSdtMetadata', () => {
      expect(sdtModule.resolveNodeSdtMetadata).toBeDefined();
      expect(typeof sdtModule.resolveNodeSdtMetadata).toBe('function');
    });

    it('exports applySdtMetadataToParagraphBlocks', () => {
      expect(sdtModule.applySdtMetadataToParagraphBlocks).toBeDefined();
      expect(typeof sdtModule.applySdtMetadataToParagraphBlocks).toBe('function');
    });

    it('exports applySdtMetadataToTableBlock', () => {
      expect(sdtModule.applySdtMetadataToTableBlock).toBeDefined();
      expect(typeof sdtModule.applySdtMetadataToTableBlock).toBe('function');
    });

    it('exports applySdtMetadataToListBlock', () => {
      expect(sdtModule.applySdtMetadataToListBlock).toBeDefined();
      expect(typeof sdtModule.applySdtMetadataToListBlock).toBe('function');
    });
  });

  describe('toc exports', () => {
    it('exports applyTocMetadata', () => {
      expect(sdtModule.applyTocMetadata).toBeDefined();
      expect(typeof sdtModule.applyTocMetadata).toBe('function');
    });

    it('exports processTocChildren', () => {
      expect(sdtModule.processTocChildren).toBeDefined();
      expect(typeof sdtModule.processTocChildren).toBe('function');
    });
  });

  describe('document-section exports', () => {
    it('exports processDocumentSectionChildren', () => {
      expect(sdtModule.processDocumentSectionChildren).toBeDefined();
      expect(typeof sdtModule.processDocumentSectionChildren).toBe('function');
    });
  });

  describe('module completeness', () => {
    it('exports all expected functions', () => {
      const expectedExports = [
        // Metadata
        'hasInstruction',
        'getNodeInstruction',
        'getDocPartGallery',
        'getDocPartObjectId',
        'resolveNodeSdtMetadata',
        'applySdtMetadataToParagraphBlocks',
        'applySdtMetadataToTableBlock',
        'applySdtMetadataToListBlock',
        // TOC
        'applyTocMetadata',
        'processTocChildren',
        // Document Section
        'processDocumentSectionChildren',
      ];

      const actualExports = Object.keys(sdtModule);

      expectedExports.forEach((exportName) => {
        expect(actualExports).toContain(exportName);
      });
    });

    it('does not export unexpected functions', () => {
      const expectedExports = [
        // Metadata
        'hasInstruction',
        'getNodeInstruction',
        'getDocPartGallery',
        'getDocPartObjectId',
        'resolveNodeSdtMetadata',
        'applySdtMetadataToParagraphBlocks',
        'applySdtMetadataToTableBlock',
        'applySdtMetadataToListBlock',
        // TOC
        'applyTocMetadata',
        'processTocChildren',
        'handleTableOfContentsNode',
        // Document Index
        'handleIndexNode',
        // Structured Content Block
        'handleStructuredContentBlockNode',
        // Document Section
        'processDocumentSectionChildren',
        'handleDocumentSectionNode',
        // Document Part Object
        'handleDocumentPartObjectNode',
      ];

      const actualExports = Object.keys(sdtModule);

      expect(actualExports.sort()).toEqual(expectedExports.sort());
    });
  });

  describe('functional integration', () => {
    it('can use metadata functions through module exports', () => {
      const node = {
        type: 'documentPartObject',
        attrs: { instruction: 'TOC \\o "1-3"' },
      };

      expect(sdtModule.hasInstruction(node)).toBe(true);
      expect(sdtModule.getNodeInstruction(node)).toBe('TOC \\o "1-3"');
    });

    it('can use toc functions through module exports', () => {
      const blocks = [
        {
          kind: 'paragraph' as const,
          id: 'p1',
          runs: [{ text: 'Chapter 1', fontFamily: 'Arial', fontSize: 12 }],
        },
      ];

      sdtModule.applyTocMetadata(blocks, {
        gallery: 'Table of Contents',
        uniqueId: 'toc-1',
        instruction: 'TOC \\o "1-3"',
      });

      expect(blocks[0].attrs?.isTocEntry).toBe(true);
    });

    it('can use document section functions through module exports', () => {
      const blocks: FlowBlock[] = [];
      const recordBlockKind = () => undefined;

      const mockParagraphConverter = (_para: PMNode) => {
        return [
          {
            kind: 'paragraph',
            id: 'p1',
            runs: [{ text: 'Hello', fontFamily: 'Arial', fontSize: 12 }],
          },
        ];
      };

      sdtModule.processDocumentSectionChildren(
        [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
        { type: 'documentSection', id: 'section-1' },
        {
          nextBlockId: () => 'test-id',
          positions: new Map(),
          defaultFont: 'Arial',
          defaultSize: 12,
          styleContext: { styles: new Map(), numbering: new Map() },
          listCounterContext: {
            getListCounter: () => ({ value: 0, styleId: null }),
            incrementListCounter: () => undefined,
            resetListCounter: () => undefined,
          },
          hyperlinkConfig: { mode: 'preserve' },
        },
        { blocks, recordBlockKind },
        {
          paragraphToFlowBlocks: mockParagraphConverter as never,
          tableNodeToBlock: () => null,
          imageNodeToBlock: () => null,
        },
      );

      expect(blocks).toHaveLength(1);
    });
  });
});
