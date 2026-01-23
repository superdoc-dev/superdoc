import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { Editor } from './Editor.js';
import {
  InvalidStateError,
  NoSourcePathError,
  FileSystemNotAvailableError,
  DocumentLoadError,
} from './errors/index.js';
import { loadTestDataForEditorTests, getMinimalTranslatedLinkedStyles } from '@tests/helpers/helpers.js';
import { getStarterExtensions } from '@extensions/index.js';
import { SuperConverter } from './super-converter/SuperConverter.js';

/**
 * Comprehensive test suite for the Editor Document Lifecycle API.
 *
 * Tests cover:
 * - open() instance method - state transitions, different source types, error handling
 * - Static Editor.open() - smart defaults, config separation
 * - close() - idempotency, event emission, cleanup
 * - save() - NoSourcePathError when no path, state transitions
 * - saveTo() - updates source path
 * - exportDocument() - returns Blob/Buffer
 * - Error classes - instanceof checks, cause preservation
 * - Integration workflows - open → save → close → reopen
 */

// Shared test data loaded once
let blankDocData: { docx: unknown; media: unknown; mediaFiles: unknown; fonts: unknown };

beforeAll(async () => {
  blankDocData = await loadTestDataForEditorTests('blank-doc.docx');
});

/**
 * Helper to create an editor configured for lifecycle API testing
 */
function createTestEditor(options: Partial<Parameters<(typeof Editor)['prototype']['constructor']>[0]> = {}) {
  return new Editor({
    isHeadless: true,
    deferDocumentLoad: true,
    mode: 'docx',
    extensions: getStarterExtensions(),
    suppressDefaultDocxStyles: true,
    ...options,
  });
}

/**
 * Helper to get open options with blank doc data
 */
function getBlankDocOptions() {
  return {
    mode: 'docx' as const,
    content: blankDocData.docx,
    mediaFiles: blankDocData.mediaFiles,
    fonts: blankDocData.fonts,
  };
}

describe('Editor Lifecycle API', () => {
  describe('Error Classes', () => {
    describe('InvalidStateError', () => {
      it('should be an instance of Error', () => {
        const error = new InvalidStateError('test message');
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(InvalidStateError);
      });

      it('should have correct name', () => {
        const error = new InvalidStateError('test message');
        expect(error.name).toBe('InvalidStateError');
      });

      it('should preserve message', () => {
        const error = new InvalidStateError('test message');
        expect(error.message).toBe('test message');
      });
    });

    describe('NoSourcePathError', () => {
      it('should be an instance of Error', () => {
        const error = new NoSourcePathError('test message');
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(NoSourcePathError);
      });

      it('should have correct name', () => {
        const error = new NoSourcePathError('test message');
        expect(error.name).toBe('NoSourcePathError');
      });

      it('should preserve message', () => {
        const error = new NoSourcePathError('test message');
        expect(error.message).toBe('test message');
      });
    });

    describe('FileSystemNotAvailableError', () => {
      it('should be an instance of Error', () => {
        const error = new FileSystemNotAvailableError('test message');
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(FileSystemNotAvailableError);
      });

      it('should have correct name', () => {
        const error = new FileSystemNotAvailableError('test message');
        expect(error.name).toBe('FileSystemNotAvailableError');
      });

      it('should preserve message', () => {
        const error = new FileSystemNotAvailableError('test message');
        expect(error.message).toBe('test message');
      });
    });

    describe('DocumentLoadError', () => {
      it('should be an instance of Error', () => {
        const error = new DocumentLoadError('test message');
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(DocumentLoadError);
      });

      it('should have correct name', () => {
        const error = new DocumentLoadError('test message');
        expect(error.name).toBe('DocumentLoadError');
      });

      it('should preserve message', () => {
        const error = new DocumentLoadError('test message');
        expect(error.message).toBe('test message');
      });

      it('should preserve cause error', () => {
        const cause = new Error('underlying error');
        const error = new DocumentLoadError('test message', cause);
        expect(error.cause).toBe(cause);
      });

      it('should work without cause error', () => {
        const error = new DocumentLoadError('test message');
        expect(error.cause).toBeUndefined();
      });
    });
  });

  describe('Editor.open() instance method', () => {
    let editor: Editor;

    beforeEach(() => {
      editor = createTestEditor();
    });

    afterEach(() => {
      if (editor && !editor.isDestroyed) {
        try {
          if (editor.lifecycleState === 'ready') {
            editor.close();
          }
          editor.destroy();
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    describe('State Transitions', () => {
      it('should start in "initialized" state', () => {
        expect(editor.lifecycleState).toBe('initialized');
      });

      it('should transition to "ready" on successful open', async () => {
        expect(editor.lifecycleState).toBe('initialized');

        await editor.open(undefined, getBlankDocOptions());

        expect(editor.lifecycleState).toBe('ready');
      });

      it('should throw InvalidStateError if called when already in "ready" state', async () => {
        await editor.open(undefined, getBlankDocOptions());
        expect(editor.lifecycleState).toBe('ready');

        await expect(editor.open(undefined, getBlankDocOptions())).rejects.toThrow(InvalidStateError);
        await expect(editor.open(undefined, getBlankDocOptions())).rejects.toThrow(
          /Invalid operation: editor is in 'ready' state/,
        );
      });

      it('should allow opening after close()', async () => {
        await editor.open(undefined, getBlankDocOptions());
        expect(editor.lifecycleState).toBe('ready');

        editor.close();
        expect(editor.lifecycleState).toBe('closed');

        await editor.open(undefined, getBlankDocOptions());
        expect(editor.lifecycleState).toBe('ready');
      });
    });

    describe('Source Types', () => {
      it('should handle undefined source with content option (blank document)', async () => {
        await editor.open(undefined, getBlankDocOptions());

        expect(editor.lifecycleState).toBe('ready');
        expect(editor.sourcePath).toBeNull();
      });

      it('should handle Blob source and throw DocumentLoadError for invalid content', async () => {
        // Create a mock blob that won't parse as valid docx
        const blob = new Blob(['mock invalid content'], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });

        await expect(editor.open(blob)).rejects.toThrow(DocumentLoadError);

        // Should transition to closed state after error
        expect(editor.lifecycleState).toBe('closed');
      });

      it('should handle Buffer source in Node.js environment', async () => {
        // Check if Buffer is available (Node.js)
        if (typeof Buffer !== 'undefined') {
          const buffer = Buffer.from('mock invalid content');

          // Invalid buffer should throw DocumentLoadError
          await expect(editor.open(buffer)).rejects.toThrow(DocumentLoadError);
          expect(editor.lifecycleState).toBe('closed');
        }
      });
    });

    describe('Options', () => {
      it('should apply isCommentsEnabled from options', async () => {
        await editor.open(undefined, { ...getBlankDocOptions(), isCommentsEnabled: true });

        expect(editor.options.isCommentsEnabled).toBe(true);
      });

      it('should apply documentMode from options', async () => {
        await editor.open(undefined, { ...getBlankDocOptions(), documentMode: 'viewing' });

        expect(editor.options.documentMode).toBe('viewing');
      });

      it('should apply suppressDefaultDocxStyles from options', async () => {
        await editor.open(undefined, { ...getBlankDocOptions(), suppressDefaultDocxStyles: true });

        expect(editor.options.suppressDefaultDocxStyles).toBe(true);
      });
    });

    describe('Event Emission', () => {
      it('should emit documentOpen event with editor and sourcePath', async () => {
        const handler = vi.fn();
        editor.on('documentOpen', handler);

        await editor.open(undefined, getBlankDocOptions());

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith({
          editor,
          sourcePath: null,
        });
      });
    });
  });

  describe('Editor.open() static factory', () => {
    let editor: Editor | null = null;

    afterEach(() => {
      if (editor && !editor.isDestroyed) {
        try {
          if (editor.lifecycleState === 'ready') {
            editor.close();
          }
          editor.destroy();
        } catch {
          // Ignore cleanup errors
        }
      }
      editor = null;
    });

    describe('Smart Defaults', () => {
      it('should enable headless mode when no element/selector provided', async () => {
        editor = await Editor.open(undefined, {
          extensions: getStarterExtensions(),
          suppressDefaultDocxStyles: true,
          ...getBlankDocOptions(),
        });

        expect(editor.options.isHeadless).toBe(true);
      });

      it('should default to docx mode when not specified', () => {
        // Test that the default is applied at config level
        const testEditor = createTestEditor();

        expect(testEditor.options.mode).toBe('docx');

        testEditor.destroy();
      });

      it('should allow overriding mode', async () => {
        const converter = new SuperConverter();
        converter.translatedLinkedStyles = getMinimalTranslatedLinkedStyles();

        editor = await Editor.open(undefined, {
          extensions: getStarterExtensions(),
          suppressDefaultDocxStyles: true,
          mode: 'html',
          converter,
        });

        expect(editor.options.mode).toBe('html');
      });
    });

    describe('Config Separation', () => {
      it('should separate editor config from document options', async () => {
        editor = await Editor.open(undefined, {
          // Editor options
          isHeadless: true,
          extensions: getStarterExtensions(),
          suppressDefaultDocxStyles: true,

          // Document options
          ...getBlankDocOptions(),
          isCommentsEnabled: true,
          documentMode: 'viewing',
        });

        expect(editor.options.isHeadless).toBe(true);
        expect(editor.options.mode).toBe('docx');
        expect(editor.options.isCommentsEnabled).toBe(true);
        expect(editor.options.documentMode).toBe('viewing');
      });
    });

    describe('Return Value', () => {
      it('should return Editor instance in ready state', async () => {
        editor = await Editor.open(undefined, {
          extensions: getStarterExtensions(),
          suppressDefaultDocxStyles: true,
          ...getBlankDocOptions(),
        });

        expect(editor).toBeInstanceOf(Editor);
        expect(editor.lifecycleState).toBe('ready');
      });

      it('should set deferDocumentLoad automatically', async () => {
        editor = await Editor.open(undefined, {
          extensions: getStarterExtensions(),
          suppressDefaultDocxStyles: true,
          ...getBlankDocOptions(),
        });

        expect(editor.options.deferDocumentLoad).toBe(true);
      });
    });
  });

  describe('close()', () => {
    let editor: Editor;

    beforeEach(async () => {
      editor = createTestEditor();
      await editor.open(undefined, getBlankDocOptions());
    });

    afterEach(() => {
      if (editor && !editor.isDestroyed) {
        try {
          editor.destroy();
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    describe('State Transitions', () => {
      it('should transition from "ready" to "closed"', () => {
        expect(editor.lifecycleState).toBe('ready');

        editor.close();

        expect(editor.lifecycleState).toBe('closed');
      });

      it('should not throw on repeated close calls (idempotent)', () => {
        editor.close();
        expect(editor.lifecycleState).toBe('closed');

        // Should not throw on second close (idempotent)
        expect(() => editor.close()).not.toThrow();
      });
    });

    describe('Idempotency', () => {
      it('should be idempotent - calling close() multiple times is safe', () => {
        editor.close();
        expect(editor.lifecycleState).toBe('closed');

        editor.close();
        expect(editor.lifecycleState).toBe('closed');

        editor.close();
        expect(editor.lifecycleState).toBe('closed');
      });

      it('should be no-op when called in "initialized" state', () => {
        const freshEditor = createTestEditor();

        expect(freshEditor.lifecycleState).toBe('initialized');

        freshEditor.close();

        expect(freshEditor.lifecycleState).toBe('initialized');

        freshEditor.destroy();
      });
    });

    describe('Event Emission', () => {
      it('should emit documentClose event', () => {
        const handler = vi.fn();
        editor.on('documentClose', handler);

        editor.close();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith({ editor });
      });

      it('should emit documentClose before state transition', () => {
        let lifecycleStateDuringEvent: string | undefined;
        const handler = vi.fn(() => {
          // Capture lifecycle state during event - should still be 'ready'
          lifecycleStateDuringEvent = editor.lifecycleState;
        });
        editor.on('documentClose', handler);

        editor.close();

        expect(handler).toHaveBeenCalled();
        expect(lifecycleStateDuringEvent).toBe('ready');
      });
    });

    describe('Cleanup', () => {
      it('should clear source path on close', () => {
        // Source path should be null for blank document
        expect(editor.sourcePath).toBeNull();

        editor.close();

        expect(editor.sourcePath).toBeNull();
      });

      it('should allow reopening after close', async () => {
        editor.close();
        expect(editor.lifecycleState).toBe('closed');

        await editor.open(undefined, getBlankDocOptions());
        expect(editor.lifecycleState).toBe('ready');
      });
    });
  });

  describe('save()', () => {
    let editor: Editor;

    beforeEach(async () => {
      editor = createTestEditor();
      await editor.open(undefined, getBlankDocOptions());
    });

    afterEach(() => {
      if (editor && !editor.isDestroyed) {
        try {
          if (editor.lifecycleState === 'ready') {
            editor.close();
          }
          editor.destroy();
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    describe('NoSourcePathError', () => {
      it('should throw NoSourcePathError when no source path is available', async () => {
        expect(editor.sourcePath).toBeNull();

        await expect(editor.save()).rejects.toThrow(NoSourcePathError);
        await expect(editor.save()).rejects.toThrow(/No source path. Use saveTo\(path\) or exportDocument\(\) instead/);
      });

      it('should throw NoSourcePathError for blank documents', async () => {
        expect(editor.sourcePath).toBeNull();

        await expect(editor.save()).rejects.toThrow(NoSourcePathError);
      });
    });

    describe('State Transitions', () => {
      it('should throw InvalidStateError if not in "ready" state', async () => {
        editor.close();
        expect(editor.lifecycleState).toBe('closed');

        await expect(editor.save()).rejects.toThrow(InvalidStateError);
      });
    });
  });

  describe('saveTo()', () => {
    let editor: Editor;

    beforeEach(async () => {
      editor = createTestEditor();
      await editor.open(undefined, getBlankDocOptions());
    });

    afterEach(() => {
      if (editor && !editor.isDestroyed) {
        try {
          if (editor.lifecycleState === 'ready') {
            editor.close();
          }
          editor.destroy();
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    describe('State Transitions', () => {
      it('should throw InvalidStateError if not in "ready" state', async () => {
        editor.close();

        await expect(editor.saveTo('/test.docx')).rejects.toThrow(InvalidStateError);
      });
    });

    describe('File System', () => {
      it('should attempt to write file and handle environment appropriately', async () => {
        const path = '/test/path/document.docx';

        // The test environment should either write (Node.js with fs)
        // or throw FileSystemNotAvailableError (browser without API)
        try {
          await editor.saveTo(path);
          // If it succeeds, source path should be updated (Node.js with fs)
          expect(editor.sourcePath).toBe(path);
        } catch (error) {
          // Expected in browser environment without File System Access API
          expect(error).toBeInstanceOf(Error);
        }
      });
    });
  });

  describe('exportDocument()', () => {
    let editor: Editor;

    beforeEach(async () => {
      editor = createTestEditor();
      await editor.open(undefined, getBlankDocOptions());
    });

    afterEach(() => {
      if (editor && !editor.isDestroyed) {
        try {
          if (editor.lifecycleState === 'ready') {
            editor.close();
          }
          editor.destroy();
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    describe('State Transitions', () => {
      it('should throw InvalidStateError if not in "ready" state', async () => {
        editor.close();

        await expect(editor.exportDocument()).rejects.toThrow(InvalidStateError);
      });

      it('should work from "ready" state', async () => {
        expect(editor.lifecycleState).toBe('ready');

        const result = await editor.exportDocument();

        expect(result).toBeDefined();
        // Should return Blob or Buffer depending on environment
        expect(typeof result).toBe('object');
      });
    });

    describe('Return Value', () => {
      it('should return a valid document blob/buffer', async () => {
        const result = await editor.exportDocument();

        expect(result).toBeDefined();
        // In Node.js, should be Buffer; in browser, should be Blob
        if (typeof Buffer !== 'undefined') {
          expect(Buffer.isBuffer(result) || result instanceof Blob).toBe(true);
        } else {
          expect(result).toBeInstanceOf(Blob);
        }
      });
    });
  });

  describe('Integration Workflows', () => {
    describe('open → export → close → reopen', () => {
      it('should handle complete document lifecycle', async () => {
        const editor = createTestEditor();

        // Open document
        await editor.open(undefined, getBlankDocOptions());
        expect(editor.lifecycleState).toBe('ready');
        expect(editor.sourcePath).toBeNull();

        // Export
        const exported = await editor.exportDocument();
        expect(exported).toBeDefined();

        // Close
        editor.close();
        expect(editor.lifecycleState).toBe('closed');

        // Reopen
        await editor.open(undefined, getBlankDocOptions());
        expect(editor.lifecycleState).toBe('ready');

        // Cleanup
        editor.close();
        editor.destroy();
      });
    });

    describe('Static factory workflow', () => {
      it('should handle Editor.open() → export → close flow', async () => {
        const editor = await Editor.open(undefined, {
          extensions: getStarterExtensions(),
          suppressDefaultDocxStyles: true,
          ...getBlankDocOptions(),
        });

        expect(editor.lifecycleState).toBe('ready');
        expect(editor.options.deferDocumentLoad).toBe(true);

        const exported = await editor.exportDocument();
        expect(exported).toBeDefined();

        editor.close();
        expect(editor.lifecycleState).toBe('closed');

        editor.destroy();
      });
    });

    describe('Multiple document switching', () => {
      it('should handle opening different documents sequentially', async () => {
        const editor = createTestEditor();

        // Open first document
        await editor.open(undefined, getBlankDocOptions());
        expect(editor.lifecycleState).toBe('ready');

        // Close and open second document
        editor.close();
        await editor.open(undefined, { ...getBlankDocOptions(), documentMode: 'viewing' });
        expect(editor.lifecycleState).toBe('ready');
        expect(editor.options.documentMode).toBe('viewing');

        // Close and open third document
        editor.close();
        await editor.open(undefined, { ...getBlankDocOptions(), documentMode: 'editing' });
        expect(editor.lifecycleState).toBe('ready');
        expect(editor.options.documentMode).toBe('editing');

        editor.close();
        editor.destroy();
      });
    });

    describe('Error recovery', () => {
      it('should handle errors during open and allow retry', async () => {
        const editor = createTestEditor();

        // Try to open an invalid blob
        const invalidBlob = new Blob(['invalid'], { type: 'text/plain' });

        try {
          await editor.open(invalidBlob);
        } catch (error) {
          expect(error).toBeInstanceOf(DocumentLoadError);
        }

        // State should allow retry (transitions to closed on error)
        expect(editor.lifecycleState).toBe('closed');

        // Retry with valid document
        await editor.open(undefined, getBlankDocOptions());
        expect(editor.lifecycleState).toBe('ready');

        editor.close();
        editor.destroy();
      });
    });

    describe('Event listener accumulation (regression)', () => {
      it('should NOT fire events multiple times after open/close/open cycles', async () => {
        let updateCount = 0;
        const editor = new Editor({
          isHeadless: true,
          deferDocumentLoad: true,
          mode: 'docx',
          extensions: getStarterExtensions(),
          suppressDefaultDocxStyles: true,
          onUpdate: () => {
            updateCount++;
          },
        });

        // First open
        await editor.open(undefined, getBlankDocOptions());

        // Close and reopen
        editor.close();
        await editor.open(undefined, getBlankDocOptions());

        // Reset counter and trigger an update
        updateCount = 0;
        editor.commands.insertContent('test');

        // Should fire exactly once, not twice
        expect(updateCount).toBe(1);

        editor.close();
        editor.destroy();
      });
    });
  });
});
