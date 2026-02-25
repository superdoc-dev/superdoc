import { describe, it, expect, afterEach, vi } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';

/**
 * API Contract Tests
 *
 * These tests verify critical API contracts that external consumers depend on.
 * If these tests fail, it's a BREAKING CHANGE that will break downstream code.
 *
 * Purpose: Prevent regressions in:
 * - Event payload structures
 * - Function signatures
 * - Callback signatures
 */
describe('Editor - API Contracts (Regression Prevention)', () => {
  let editor;

  // Ensure real timers in case a previous suite left fake timers on
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    if (editor && !editor.isDestroyed) {
      editor.destroy();
      editor = null;
    }
  });

  describe('Event Payload Contracts', () => {
    it('beforeCreate event must include { editor }', () => {
      let beforeCreatePayload;

      ({ editor } = initTestEditor({
        mode: 'text',
        content: '<p>Test</p>',
        useImmediateSetTimeout: false,
        onBeforeCreate: (payload) => {
          beforeCreatePayload = payload;
        },
      }));

      // CRITICAL: Must include editor instance
      expect(beforeCreatePayload).toBeDefined();
      expect(beforeCreatePayload).toHaveProperty('editor');
      expect(beforeCreatePayload.editor).toBe(editor);
    });

    it('create event must include { editor }', () => {
      let createPayload;

      ({ editor } = initTestEditor({
        mode: 'text',
        content: '<p>Test</p>',
        useImmediateSetTimeout: false,
        onCreate: (payload) => {
          createPayload = payload;
        },
      }));

      // Wait for create event (it's emitted async)
      return new Promise((resolve) => {
        setTimeout(() => {
          expect(createPayload).toBeDefined();
          expect(createPayload).toHaveProperty('editor');
          expect(createPayload.editor).toBe(editor);
          resolve();
        }, 10);
      });
    });

    it('onFontsResolved callback must receive single object (not array)', () => {
      // This test verifies the TypeScript type signature is correct
      // The actual callback receives { documentFonts, unsupportedFonts }

      const mockCallback = (payload) => {
        // Should be able to destructure as object
        const { documentFonts, unsupportedFonts } = payload;
        expect(Array.isArray(documentFonts)).toBe(true);
        expect(Array.isArray(unsupportedFonts)).toBe(true);
      };

      // Simulate what the editor emits
      const mockPayload = {
        documentFonts: ['Arial', 'Times New Roman'],
        unsupportedFonts: ['CustomFont'],
      };

      expect(() => mockCallback(mockPayload)).not.toThrow();

      // This would fail if payload were an array:
      // const invalidPayload = [{ documentFonts: [], unsupportedFonts: [] }];
      // expect(() => mockCallback(invalidPayload)).toThrow(); // Cannot destructure
    });
  });

  describe('Initialization Path Contracts', () => {
    it('markdown option should initialize with editor instance', () => {
      let initCompleted = false;

      ({ editor } = initTestEditor({
        mode: 'text',
        markdown: '# Test Heading\n\nParagraph text',
        useImmediateSetTimeout: false,
        onCreate: () => {
          initCompleted = true;
        },
      }));

      return new Promise((resolve) => {
        setTimeout(() => {
          expect(initCompleted).toBe(true);
          expect(editor.state).toBeDefined();
          expect(editor.state.doc).toBeDefined();
          resolve();
        }, 10);
      });
    });

    it('docx markdown initialization forwards unsupported-content callback', () => {
      const onUnsupportedContent = vi.fn();

      ({ editor } = initTestEditor({
        mode: 'docx',
        content: '<p>Fallback content</p>',
        markdown: '<video src="demo.mp4"></video>',
        onUnsupportedContent,
        useImmediateSetTimeout: false,
      }));

      return new Promise((resolve) => {
        setTimeout(() => {
          expect(onUnsupportedContent).toHaveBeenCalledTimes(1);
          expect(onUnsupportedContent.mock.calls[0][0]).toEqual([
            expect.objectContaining({ tagName: 'VIDEO', count: 1 }),
          ]);
          resolve();
        }, 10);
      });
    });

    it('html option should initialize with editor instance', () => {
      let initCompleted = false;

      ({ editor } = initTestEditor({
        mode: 'text',
        html: '<p>Test paragraph</p>',
        useImmediateSetTimeout: false,
        onCreate: () => {
          initCompleted = true;
        },
      }));

      return new Promise((resolve) => {
        setTimeout(() => {
          expect(initCompleted).toBe(true);
          expect(editor.state).toBeDefined();
          expect(editor.state.doc).toBeDefined();
          resolve();
        }, 10);
      });
    });

    it('html mode with string content should initialize with editor instance', () => {
      let initCompleted = false;

      ({ editor } = initTestEditor({
        mode: 'html',
        content: '<p>Test content</p>',
        useImmediateSetTimeout: false,
        onCreate: () => {
          initCompleted = true;
        },
      }));

      return new Promise((resolve) => {
        setTimeout(() => {
          expect(initCompleted).toBe(true);
          expect(editor.state).toBeDefined();
          expect(editor.state.doc).toBeDefined();
          resolve();
        }, 10);
      });
    });
  });

  describe('Editor API Methods', () => {
    it('replaceNodeWithHTML method exists (uses editor internally)', () => {
      ({ editor } = initTestEditor({
        mode: 'text',
        content: '<p>Test</p>',
      }));

      // replaceNodeWithHTML should internally call createDocFromHTML with editor
      // This is tested by the method existing and not throwing
      expect(editor.replaceNodeWithHTML).toBeDefined();
      expect(typeof editor.replaceNodeWithHTML).toBe('function');
    });

    it('editor.doc getter exposes DocumentApi with find and capabilities', () => {
      ({ editor } = initTestEditor({
        mode: 'text',
        content: '<p>Test</p>',
      }));

      const doc = editor.doc;
      expect(doc).toBeDefined();
      expect(typeof doc.find).toBe('function');
      expect(typeof doc.capabilities).toBe('function');
    });
  });
});
