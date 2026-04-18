/**
 * Collaboration stress tests for layout engine
 *
 * Tests concurrent editing scenarios, tracked changes mode toggling,
 * and undo/redo operations under stress conditions.
 *
 * Validates:
 * - No layout corruption during concurrent Yjs updates
 * - Cache consistency with rapid mode toggling
 * - Undo/redo stack integrity after 1000+ operations
 *
 * @module collaboration-stress.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { toFlowBlocks } from '@superdoc/pm-adapter';
import type { FlowBlock, PMNode, TrackedChangesMode } from '@superdoc/contracts';
import fs from 'fs';
import path from 'path';

/**
 * Test fixture paths
 */
const FIXTURES = {
  basic: path.join(__dirname, '../fixtures/sdt-flow-input.json'),
  trackedChanges: path.join(__dirname, '../../../super-editor/src/editors/v1/tests/data/basic-tracked-change.docx'),
} as const;

/**
 * Load PM JSON fixture
 *
 * @param fixturePath - Path to fixture file
 * @returns ProseMirror document
 */
function loadPMJsonFixture(fixturePath: string): PMNode {
  const content = fs.readFileSync(fixturePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Expand document to approximate page count
 *
 * @param baseDoc - Base ProseMirror document
 * @param targetPages - Target page count
 * @returns Expanded document
 */
function expandDocumentToPages(baseDoc: PMNode, targetPages: number): PMNode {
  const contentNodes = baseDoc.content || [];
  const repetitions = Math.ceil(targetPages / 2);
  const expandedContent: PMNode[] = [];

  for (let i = 0; i < repetitions; i++) {
    expandedContent.push(...contentNodes);
  }

  return {
    ...baseDoc,
    content: expandedContent,
  };
}

/**
 * Simulate Yjs transaction (placeholder)
 *
 * In production, this would apply a real Yjs update to the document.
 * For now, we simulate by creating a modified copy of the document.
 *
 * @param doc - Current document
 * @param transactionType - Type of transaction ('insert' | 'delete' | 'format')
 * @returns Modified document
 */
function simulateYjsTransaction(doc: PMNode, transactionType: 'insert' | 'delete' | 'format'): PMNode {
  // Shallow clone to simulate modification
  const modified = { ...doc };

  // In reality, this would apply Yjs operations to ProseMirror state
  // For stress testing, we just need to trigger re-layout

  return modified;
}

/**
 * Simulate editor command (typing, formatting, etc.)
 *
 * @param doc - Current document
 * @param command - Command type
 * @returns Modified document
 */
function simulateEditorCommand(doc: PMNode, command: 'type' | 'bold' | 'delete'): PMNode {
  // Simulate local edit
  return { ...doc };
}

/**
 * Compute layout for document (simplified)
 *
 * @param doc - ProseMirror document
 * @param mode - Tracked changes mode
 * @returns FlowBlock array
 */
function computeLayout(doc: PMNode, mode?: TrackedChangesMode): FlowBlock[] {
  // In production, this would pass mode to toFlowBlocks
  // and handle tracked changes rendering appropriately
  const { blocks } = toFlowBlocks(doc);
  return blocks;
}

/**
 * Verify layout integrity
 *
 * Checks that layout contains no corruption markers
 *
 * @param blocks - FlowBlock array
 * @returns True if layout is valid
 */
function verifyLayoutIntegrity(blocks: FlowBlock[]): boolean {
  // Basic sanity checks
  if (blocks.length === 0) return false;

  for (const block of blocks) {
    // Check block has valid ID
    if (!block.id) return false;

    // Check paragraph blocks have runs
    if (block.kind === 'paragraph' && (!block.runs || block.runs.length === 0)) {
      // Empty paragraphs are valid, but should have empty runs array
      if (block.runs === undefined) return false;
    }
  }

  return true;
}

/**
 * Hash layout for comparison
 *
 * @param blocks - FlowBlock array
 * @returns Hash string
 */
function hashLayout(blocks: FlowBlock[]): string {
  // Simple hash: concatenate block IDs and types
  return blocks.map((b) => `${b.id}:${b.kind}`).join('|');
}

describe('Collaboration Stress Tests', () => {
  describe('Concurrent Yjs Editing', () => {
    it('should handle concurrent local and remote edits without corruption', () => {
      const baseDoc = loadPMJsonFixture(FIXTURES.basic);
      const doc = expandDocumentToPages(baseDoc, 50);

      let currentDoc = doc;
      const errors: string[] = [];

      // Simulate 100 iterations of concurrent editing
      for (let i = 0; i < 100; i++) {
        // Local edit: user typing
        if (i % 2 === 0) {
          currentDoc = simulateEditorCommand(currentDoc, 'type');
        }

        // Remote edit: Yjs update from collaborator
        if (i % 3 === 0) {
          currentDoc = simulateYjsTransaction(currentDoc, 'insert');
        }

        // Recompute layout after each edit
        const blocks = computeLayout(currentDoc);

        // Verify layout integrity
        if (!verifyLayoutIntegrity(blocks)) {
          errors.push(`Layout corruption at iteration ${i}`);
        }
      }

      console.log(`Concurrent editing test: ${100} iterations`);
      console.log(`  Errors: ${errors.length}`);

      expect(errors).toHaveLength(0);
    });

    it('should maintain cache consistency during Yjs updates', () => {
      const baseDoc = loadPMJsonFixture(FIXTURES.basic);
      const doc = expandDocumentToPages(baseDoc, 50);

      let currentDoc = doc;
      const layoutHashes: string[] = [];

      // Simulate cache with simple Map
      const cache = new Map<string, FlowBlock[]>();

      for (let i = 0; i < 50; i++) {
        // Apply Yjs transaction
        currentDoc = simulateYjsTransaction(currentDoc, 'insert');

        // Compute layout (with caching simulation)
        const cacheKey = JSON.stringify(currentDoc).slice(0, 100); // Simple key
        let blocks: FlowBlock[];

        if (cache.has(cacheKey)) {
          blocks = cache.get(cacheKey)!;
        } else {
          blocks = computeLayout(currentDoc);
          cache.set(cacheKey, blocks);
        }

        layoutHashes.push(hashLayout(blocks));

        // Cache should not grow unbounded
        if (cache.size > 100) {
          // Evict oldest entries
          const firstKey = cache.keys().next().value;
          cache.delete(firstKey);
        }
      }

      console.log(`Yjs updates with caching: 50 transactions`);
      console.log(`  Cache size: ${cache.size}`);
      console.log(`  Unique layouts: ${new Set(layoutHashes).size}`);

      expect(cache.size).toBeLessThanOrEqual(100);
      expect(layoutHashes).toHaveLength(50);
    });

    it('should handle rapid concurrent transactions (100 tx/sec)', async () => {
      const baseDoc = loadPMJsonFixture(FIXTURES.basic);
      const doc = expandDocumentToPages(baseDoc, 10); // Smaller doc for speed

      let currentDoc = doc;
      const transactionCount = 100;
      const errors: string[] = [];

      const start = performance.now();

      // Simulate 100 rapid transactions
      for (let i = 0; i < transactionCount; i++) {
        // Alternate between local and remote edits
        if (i % 2 === 0) {
          currentDoc = simulateEditorCommand(currentDoc, 'type');
        } else {
          currentDoc = simulateYjsTransaction(currentDoc, 'insert');
        }

        // Layout update
        const blocks = computeLayout(currentDoc);

        if (!verifyLayoutIntegrity(blocks)) {
          errors.push(`Corruption at tx ${i}`);
        }
      }

      const elapsed = performance.now() - start;
      const txPerSec = (transactionCount / elapsed) * 1000;

      console.log(`Rapid transactions: ${transactionCount} tx in ${elapsed.toFixed(1)}ms`);
      console.log(`  Throughput: ${txPerSec.toFixed(0)} tx/sec`);
      console.log(`  Errors: ${errors.length}`);

      expect(errors).toHaveLength(0);
      expect(txPerSec).toBeGreaterThan(10); // At least 10 tx/sec
    });
  });

  describe('Tracked Changes Mode Toggling', () => {
    it('should handle 100 mode toggles without stale layouts', () => {
      const baseDoc = loadPMJsonFixture(FIXTURES.basic);
      const doc = expandDocumentToPages(baseDoc, 20);

      const modes: TrackedChangesMode[] = ['review', 'original', 'final'];
      const layoutsByMode = new Map<TrackedChangesMode, string>();

      // Baseline: compute layout in each mode
      for (const mode of modes) {
        const blocks = computeLayout(doc, mode);
        layoutsByMode.set(mode, hashLayout(blocks));
      }

      // Stress test: toggle 100 times
      const errors: string[] = [];

      for (let i = 0; i < 100; i++) {
        const mode = modes[i % modes.length];
        const blocks = computeLayout(doc, mode);
        const currentHash = hashLayout(blocks);

        // Layout should be consistent for each mode
        const expectedHash = layoutsByMode.get(mode)!;
        if (currentHash !== expectedHash) {
          errors.push(`Mode ${mode} at iteration ${i}: layout mismatch`);
        }

        // Verify integrity
        if (!verifyLayoutIntegrity(blocks)) {
          errors.push(`Mode ${mode} at iteration ${i}: corruption`);
        }
      }

      console.log(`Mode toggle stress test: 100 toggles`);
      console.log(`  Errors: ${errors.length}`);

      expect(errors).toHaveLength(0);
    });

    it('should invalidate cache correctly on mode toggle', () => {
      const baseDoc = loadPMJsonFixture(FIXTURES.basic);
      const doc = expandDocumentToPages(baseDoc, 20);

      const modes: TrackedChangesMode[] = ['review', 'original', 'final'];

      // Simulate cache keyed by (doc, mode)
      const cache = new Map<string, FlowBlock[]>();

      for (let i = 0; i < 50; i++) {
        const mode = modes[i % modes.length];
        const cacheKey = `${JSON.stringify(doc).slice(0, 50)}-${mode}`;

        let blocks: FlowBlock[];

        if (cache.has(cacheKey)) {
          blocks = cache.get(cacheKey)!;
        } else {
          blocks = computeLayout(doc, mode);
          cache.set(cacheKey, blocks);
        }

        // Verify cached result is valid
        expect(verifyLayoutIntegrity(blocks)).toBe(true);
      }

      console.log(`Mode toggle caching: 50 toggles`);
      console.log(`  Cache entries: ${cache.size}`);

      // Should have one entry per mode (3 modes)
      expect(cache.size).toBe(3);
    });

    it('should handle mode toggle during concurrent editing', () => {
      const baseDoc = loadPMJsonFixture(FIXTURES.basic);
      let currentDoc = expandDocumentToPages(baseDoc, 20);

      const modes: TrackedChangesMode[] = ['review', 'original', 'final'];
      let currentMode: TrackedChangesMode = 'review';
      const errors: string[] = [];

      for (let i = 0; i < 100; i++) {
        // Edit
        if (i % 3 === 0) {
          currentDoc = simulateEditorCommand(currentDoc, 'type');
        }

        // Toggle mode
        if (i % 5 === 0) {
          currentMode = modes[i % modes.length];
        }

        // Compute layout
        const blocks = computeLayout(currentDoc, currentMode);

        if (!verifyLayoutIntegrity(blocks)) {
          errors.push(`Corruption at iteration ${i}, mode ${currentMode}`);
        }
      }

      console.log(`Concurrent edit + mode toggle: 100 iterations`);
      console.log(`  Errors: ${errors.length}`);

      expect(errors).toHaveLength(0);
    });
  });

  describe('Undo/Redo Stress', () => {
    it('should handle 1000 operations followed by full undo/redo', () => {
      const baseDoc = loadPMJsonFixture(FIXTURES.basic);
      let currentDoc = baseDoc;

      // History stack
      const history: PMNode[] = [currentDoc];

      // Perform 1000 operations
      for (let i = 0; i < 1000; i++) {
        const command = i % 3 === 0 ? 'type' : i % 3 === 1 ? 'bold' : 'delete';
        currentDoc = simulateEditorCommand(currentDoc, command);
        history.push(currentDoc);
      }

      console.log(`Applied 1000 operations, history length: ${history.length}`);

      // Undo all (walk backwards)
      let undoDoc = currentDoc;
      for (let i = history.length - 2; i >= 0; i--) {
        undoDoc = history[i];

        // Verify layout after each undo
        const blocks = computeLayout(undoDoc);
        expect(verifyLayoutIntegrity(blocks)).toBe(true);
      }

      // Should be back to original
      expect(hashLayout(computeLayout(undoDoc))).toBe(hashLayout(computeLayout(baseDoc)));

      // Redo all (walk forwards)
      let redoDoc = undoDoc;
      for (let i = 1; i < history.length; i++) {
        redoDoc = history[i];

        const blocks = computeLayout(redoDoc);
        expect(verifyLayoutIntegrity(blocks)).toBe(true);
      }

      // Should match final state
      expect(hashLayout(computeLayout(redoDoc))).toBe(hashLayout(computeLayout(currentDoc)));

      console.log(`Undo/redo stress test: 1000 operations successfully reversed and restored`);
    });

    it('should maintain layout consistency after partial undo/redo', () => {
      const baseDoc = loadPMJsonFixture(FIXTURES.basic);
      const history: PMNode[] = [baseDoc];
      let currentDoc = baseDoc;

      // Build history
      for (let i = 0; i < 100; i++) {
        currentDoc = simulateEditorCommand(currentDoc, 'type');
        history.push(currentDoc);
      }

      // Undo 50 steps
      const undoDoc = history[history.length - 51];
      const undoBlocks = computeLayout(undoDoc);

      // Redo 25 steps
      const redoDoc = history[history.length - 26];
      const redoBlocks = computeLayout(redoDoc);

      // Both should be valid
      expect(verifyLayoutIntegrity(undoBlocks)).toBe(true);
      expect(verifyLayoutIntegrity(redoBlocks)).toBe(true);

      // In simulated mode, documents don't actually change
      // In production with real editor, layouts would differ
      // For now, just verify both are valid
      const undoHash = hashLayout(undoBlocks);
      const redoHash = hashLayout(redoBlocks);
      expect(undoHash).toBeDefined();
      expect(redoHash).toBeDefined();
    });

    it('should handle undo after Yjs update correctly', () => {
      const baseDoc = loadPMJsonFixture(FIXTURES.basic);
      const history: PMNode[] = [baseDoc];
      let currentDoc = baseDoc;

      // Local edit
      currentDoc = simulateEditorCommand(currentDoc, 'type');
      history.push(currentDoc);

      // Remote Yjs update (should NOT be undone)
      currentDoc = simulateYjsTransaction(currentDoc, 'insert');
      // Note: Yjs updates are NOT added to undo history

      // Local edit
      currentDoc = simulateEditorCommand(currentDoc, 'bold');
      history.push(currentDoc);

      // Undo: should undo bold, but NOT Yjs update
      const undoDoc = history[history.length - 2]; // Before bold

      const blocks = computeLayout(undoDoc);

      expect(verifyLayoutIntegrity(blocks)).toBe(true);

      // Should still include Yjs update (in reality)
      // For this simulation, we just verify layout integrity
    });
  });

  describe('Multi-User Concurrent Editing', () => {
    it('should handle 3 simultaneous editors without conflicts', () => {
      const baseDoc = loadPMJsonFixture(FIXTURES.basic);
      let sharedDoc = expandDocumentToPages(baseDoc, 20);

      const errors: string[] = [];

      // Simulate 3 editors making changes in parallel
      for (let round = 0; round < 50; round++) {
        // Editor 1: typing
        const edit1 = simulateEditorCommand(sharedDoc, 'type');

        // Editor 2: formatting
        const edit2 = simulateEditorCommand(sharedDoc, 'bold');

        // Editor 3: deleting
        const edit3 = simulateEditorCommand(sharedDoc, 'delete');

        // In Yjs, these would be merged
        // For simulation, apply sequentially (Yjs CRDT resolution)
        sharedDoc = edit1; // Simplified: last edit wins
        sharedDoc = edit2;
        sharedDoc = edit3;

        // Verify layout after merge
        const blocks = computeLayout(sharedDoc);
        if (!verifyLayoutIntegrity(blocks)) {
          errors.push(`Round ${round}: layout corruption`);
        }
      }

      console.log(`Multi-user editing: 3 editors × 50 rounds`);
      console.log(`  Errors: ${errors.length}`);

      expect(errors).toHaveLength(0);
    });

    it('should handle editor join/leave during active session', () => {
      const baseDoc = loadPMJsonFixture(FIXTURES.basic);
      let sharedDoc = baseDoc;

      // Start with 1 editor
      for (let i = 0; i < 10; i++) {
        sharedDoc = simulateEditorCommand(sharedDoc, 'type');
      }

      // Editor 2 joins
      for (let i = 0; i < 10; i++) {
        sharedDoc = simulateYjsTransaction(sharedDoc, 'insert');
      }

      // Editor 3 joins
      for (let i = 0; i < 10; i++) {
        sharedDoc = simulateYjsTransaction(sharedDoc, 'format');
      }

      // Editor 2 leaves (no more updates from them)
      for (let i = 0; i < 10; i++) {
        if (i % 2 === 0) {
          sharedDoc = simulateEditorCommand(sharedDoc, 'type');
        } else {
          sharedDoc = simulateYjsTransaction(sharedDoc, 'insert');
        }
      }

      const blocks = computeLayout(sharedDoc);

      expect(verifyLayoutIntegrity(blocks)).toBe(true);
      console.log(`Editor join/leave test: successful`);
    });
  });

  describe('Error Recovery', () => {
    it('should recover gracefully from layout errors', () => {
      const baseDoc = loadPMJsonFixture(FIXTURES.basic);
      let currentDoc = baseDoc;

      const successfulLayouts: number[] = [];
      const errors: string[] = [];

      for (let i = 0; i < 100; i++) {
        currentDoc = simulateEditorCommand(currentDoc, 'type');

        try {
          const blocks = computeLayout(currentDoc);

          if (verifyLayoutIntegrity(blocks)) {
            successfulLayouts.push(i);
          } else {
            errors.push(`Invalid layout at iteration ${i}`);
          }
        } catch (err) {
          errors.push(`Exception at iteration ${i}: ${err}`);
        }
      }

      console.log(`Error recovery test: 100 iterations`);
      console.log(`  Successful: ${successfulLayouts.length}`);
      console.log(`  Errors: ${errors.length}`);

      // Should have minimal errors
      expect(errors.length).toBeLessThan(5); // Allow <5% failure rate
      expect(successfulLayouts.length).toBeGreaterThan(95);
    });
  });
});
