import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIActions } from '../../index';
import type { AIProvider, AIActionsOptions, SuperDoc, Editor } from '../../../shared/types';

describe('AIActions', () => {
  let mockProvider: AIProvider;
  let mockEditor: Editor;
  let mockSuperdoc: SuperDoc;

  beforeEach(() => {
    mockProvider = {
      async *streamCompletion(_messages, _options) {
        yield 'chunk1';
        yield 'chunk2';
        yield 'chunk3';
      },
      async getCompletion(_messages, _options) {
        return 'Complete response';
      },
    };

    const mockDoc = {
      textContent: 'Sample document text',
      content: { size: 100 },
      textBetween: vi.fn((from: number, to: number, _separator?: string) => {
        // Simple mock: return a substring based on positions
        const text = 'Sample document text';
        return text.substring(Math.max(0, from), Math.min(text.length, to));
      }),
      resolve: vi.fn((_pos) => ({
        pos: _pos,
        parent: { inlineContent: true },
        min: vi.fn(() => _pos),
        max: vi.fn(() => _pos),
      })),
    };

    mockEditor = {
      state: {
        doc: mockDoc,
        tr: {
          setSelection: vi.fn().mockReturnThis(),
          scrollIntoView: vi.fn().mockReturnThis(),
        },
      },
      view: {
        state: {
          doc: mockDoc,
          selection: {
            from: 0,
            to: 0,
            empty: true,
          },
        },
        dispatch: vi.fn(),
        domAtPos: vi.fn((_pos: number) => {
          return {
            node: {
              scrollIntoView: vi.fn(),
            },
            offset: 0,
          };
        }),
      },
      exportDocx: vi.fn(),
      options: {
        documentId: 'doc-123',
        user: { name: 'Test User', image: '' },
      },
      commands: {
        search: vi.fn().mockReturnValue([]),
        setTextSelection: vi.fn(),
        setHighlight: vi.fn(),
        deleteSelection: vi.fn(),
        insertContent: vi.fn(),
        getSelectionMarks: vi.fn().mockReturnValue([]),
        enableTrackChanges: vi.fn(),
        disableTrackChanges: vi.fn(),
        insertComment: vi.fn(),
        insertContentAt: vi.fn(),
      },
      setOptions: vi.fn(),
    } as unknown as Editor;

    mockSuperdoc = {
      activeEditor: mockEditor,
      config: {
        user: {
          name: 'Manual User',
          email: 'writer@example.com',
        },
      },
    } as unknown as SuperDoc;
  });

  describe('constructor', () => {
    it('should initialize with provider config', async () => {
      const options: AIActionsOptions = {
        user: { displayName: 'AI Bot', userId: 'bot-123' },
        provider: mockProvider,
      };

      const ai = new AIActions(mockSuperdoc, options);
      await ai.waitUntilReady();

      expect(ai.getIsReady()).toBe(true);
    });

    it('should call onReady callback when initialized', async () => {
      const onReady = vi.fn();
      const options: AIActionsOptions = {
        user: { displayName: 'AI Bot', userId: 'bot-123' },
        provider: mockProvider,
        onReady,
      };

      const ai = new AIActions(mockSuperdoc, options);
      await ai.waitUntilReady();

      expect(onReady).toHaveBeenCalledWith(
        expect.objectContaining({
          aiActions: expect.any(Object),
        }),
      );
    });

    it('should use custom system prompt if provided', async () => {
      const options: AIActionsOptions = {
        user: { displayName: 'AI Bot', userId: 'bot-123' },
        provider: mockProvider,
        systemPrompt: 'Custom system prompt',
      };

      const ai = new AIActions(mockSuperdoc, options);
      await ai.waitUntilReady();

      // Call a method that uses the provider to verify the prompt
      const completionSpy = vi.spyOn(mockProvider, 'getCompletion');
      await ai.getCompletion('test');

      expect(completionSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: 'Custom system prompt',
          }),
        ]),
        undefined,
      );
    });

    it('should use default system prompt if not provided', async () => {
      const options: AIActionsOptions = {
        user: { displayName: 'AI Bot', userId: 'bot-123' },
        provider: mockProvider,
      };

      const ai = new AIActions(mockSuperdoc, options);
      await ai.waitUntilReady();

      const completionSpy = vi.spyOn(mockProvider, 'getCompletion');
      await ai.getCompletion('test');

      expect(completionSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('SuperDoc'),
          }),
        ]),
        undefined,
      );
    });

    it('should preserve existing editor user metadata when configuring AI user', async () => {
      mockEditor.options.user = {
        name: 'Human User',
        email: 'writer@example.com',
        image: 'human.png',
      } as unknown as typeof mockEditor.options.user;

      const options: AIActionsOptions = {
        user: { displayName: 'AI Bot', userId: 'bot-123' },
        provider: mockProvider,
      };

      const ai = new AIActions(mockSuperdoc, options);
      await ai.waitUntilReady();

      expect(mockEditor.setOptions).toHaveBeenCalledWith({
        user: expect.objectContaining({
          email: 'writer@example.com',
          id: 'bot-123',
          name: 'AI Bot',
        }),
      });
    });

    it('should fall back to SuperDoc config user when editor options are missing user data', async () => {
      mockEditor.options.user = undefined as unknown as typeof mockEditor.options.user;

      const options: AIActionsOptions = {
        user: { displayName: 'AI Bot', userId: 'bot-123' },
        provider: mockProvider,
      };

      const ai = new AIActions(mockSuperdoc, options);
      await ai.waitUntilReady();

      expect(mockEditor.setOptions).toHaveBeenCalledWith({
        user: expect.objectContaining({
          email: 'writer@example.com',
          name: 'AI Bot',
        }),
      });
    });
  });

  describe('waitUntilReady', () => {
    it('should resolve immediately if already ready', async () => {
      const options: AIActionsOptions = {
        user: { displayName: 'AI Bot', userId: 'bot-123' },
        provider: mockProvider,
      };

      const ai = new AIActions(mockSuperdoc, options);
      await ai.waitUntilReady();

      const start = Date.now();
      await ai.waitUntilReady();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(10);
    });

    it('should wait for initialization if not ready', async () => {
      const options: AIActionsOptions = {
        user: { displayName: 'AI Bot', userId: 'bot-123' },
        provider: mockProvider,
      };

      const ai = new AIActions(mockSuperdoc, options);

      // Should wait for initialization
      await ai.waitUntilReady();
      expect(ai.getIsReady()).toBe(true);
    });
  });

  describe('getCompletion', () => {
    it('should get completion with document context', async () => {
      const options: AIActionsOptions = {
        user: { displayName: 'AI Bot', userId: 'bot-123' },
        provider: mockProvider,
      };

      const ai = new AIActions(mockSuperdoc, options);
      await ai.waitUntilReady();

      const completionSpy = vi.spyOn(mockProvider, 'getCompletion');
      await ai.getCompletion('test prompt');

      expect(completionSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('test prompt'),
          }),
        ]),
        undefined,
      );
    });

    it('should throw if not ready', async () => {
      const options: AIActionsOptions = {
        user: { displayName: 'AI Bot', userId: 'bot-123' },
        provider: mockProvider,
      };

      // Create AI without waiting for ready
      const ai = new AIActions(mockSuperdoc, options);

      // Manually set isReady to false to test
      (ai as unknown as { isReady: boolean }).isReady = false;

      await expect(ai.getCompletion('test')).rejects.toThrow('AIActions is not ready yet');
    });

    it('should pass options to provider', async () => {
      const options: AIActionsOptions = {
        user: { displayName: 'AI Bot', userId: 'bot-123' },
        provider: mockProvider,
      };

      const ai = new AIActions(mockSuperdoc, options);
      await ai.waitUntilReady();

      const completionSpy = vi.spyOn(mockProvider, 'getCompletion');
      await ai.getCompletion('test', { temperature: 0.5, maxTokens: 100 });

      expect(completionSpy).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          temperature: 0.5,
          maxTokens: 100,
        }),
      );
    });

    it('should handle errors and call onError callback', async () => {
      const onError = vi.fn();
      const errorProvider: AIProvider = {
        async *streamCompletion() {
          yield 'test';
        },
        async getCompletion() {
          throw new Error('Provider error');
        },
      };

      const options: AIActionsOptions = {
        user: { displayName: 'AI Bot', userId: 'bot-123' },
        provider: errorProvider,
        onError,
      };

      const ai = new AIActions(mockSuperdoc, options);
      await ai.waitUntilReady();

      await expect(ai.getCompletion('test')).rejects.toThrow('Provider error');
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // Streaming is handled internally by AIActionsService when actions are called
  // These tests are skipped as they test a non-existent public API
  describe.skip('streamCompletion', () => {
    it.skip('should stream completion chunks', async () => {
      // Streaming happens internally via action methods
    });

    it.skip('should accumulate chunks correctly', async () => {
      // Streaming happens internally via action methods
    });

    it.skip('should throw if not ready', async () => {
      // Streaming happens internally via action methods
    });

    it.skip('should handle streaming errors', async () => {
      // Streaming happens internally via action methods
    });
  });

  describe('getDocumentContext', () => {
    it('should return document text content when no selection', async () => {
      const options: AIActionsOptions = {
        user: { displayName: 'AI Bot', userId: 'bot-123' },
        provider: mockProvider,
      };

      const ai = new AIActions(mockSuperdoc, options);
      await ai.waitUntilReady();

      // Ensure no selection
      mockEditor.view.state.selection = {
        from: 0,
        to: 0,
        empty: true,
      } as unknown as typeof mockEditor.view.state.selection;

      const context = ai.getDocumentContext();
      expect(context).toBe('Sample document text');
    });

    it('should return selected text when there is a selection', async () => {
      const options: AIActionsOptions = {
        user: { displayName: 'AI Bot', userId: 'bot-123' },
        provider: mockProvider,
      };

      const ai = new AIActions(mockSuperdoc, options);
      await ai.waitUntilReady();

      // Set up a selection
      mockEditor.view.state.selection = {
        from: 0,
        to: 6,
        empty: false,
      } as unknown as typeof mockEditor.view.state.selection;

      // Mock textBetween to return the selected portion
      mockEditor.view.state.doc.textBetween = vi.fn(() => 'Sample');

      const context = ai.getDocumentContext();
      expect(context).toBe('Sample');
      expect(mockEditor.view.state.doc.textBetween).toHaveBeenCalledWith(0, 6, ' ');
    });

    it('should return document text when editor view state is missing but state exists', async () => {
      const options: AIActionsOptions = {
        user: { displayName: 'AI Bot', userId: 'bot-123' },
        provider: mockProvider,
      };

      const ai = new AIActions(mockSuperdoc, options);
      await ai.waitUntilReady();

      // Remove view state (but editor.state still exists as fallback)
      (mockEditor as unknown as { view: null }).view = null;

      const context = ai.getDocumentContext();
      // Should fall back to editor.state.doc.textContent
      expect(context).toBe('Sample document text');
    });

    it('throws during construction when no editor is available', () => {
      const noEditorSuperdoc: SuperDoc = {
        activeEditor: null,
      } as unknown as SuperDoc;

      const options: AIActionsOptions = {
        user: { displayName: 'AI Bot', userId: 'bot-123' },
        provider: mockProvider,
      };

      expect(() => new AIActions(noEditorSuperdoc, options)).toThrow(
        'AIActions requires an active editor before initialization',
      );
    });
  });

  describe('action methods', () => {
    it('should call find action', async () => {
      mockProvider.getCompletion = vi
        .fn()
        .mockResolvedValue(JSON.stringify({ success: true, results: [{ originalText: 'test' }] }));
      mockEditor.commands.search = vi.fn().mockReturnValue([{ from: 0, to: 4 }]);

      const options: AIActionsOptions = {
        user: { displayName: 'AI Bot', userId: 'bot-123' },
        provider: mockProvider,
      };

      const ai = new AIActions(mockSuperdoc, options);
      await ai.waitUntilReady();

      const result = await ai.action.find('find test');
      expect(result.success).toBe(true);
    });

    it('rejects action calls when the active editor is missing', async () => {
      const options: AIActionsOptions = {
        user: { displayName: 'AI Bot', userId: 'bot-123' },
        provider: mockProvider,
      };

      const ai = new AIActions(mockSuperdoc, options);
      await ai.waitUntilReady();

      mockSuperdoc.activeEditor = null as unknown as Editor;

      await expect(ai.action.find('find test')).rejects.toThrow('No active SuperDoc editor available for AI actions');
    });

    it('should call callbacks for actions', async () => {
      const onStreamingStart = vi.fn();
      const onStreamingEnd = vi.fn();

      mockProvider.getCompletion = vi
        .fn()
        .mockResolvedValue(JSON.stringify({ success: true, results: [{ originalText: 'test' }] }));
      mockEditor.commands.search = vi.fn().mockReturnValue([{ from: 0, to: 4 }]);

      const options: AIActionsOptions = {
        user: { displayName: 'AI Bot', userId: 'bot-123' },
        provider: mockProvider,
        onStreamingStart,
        onStreamingEnd,
      };

      const ai = new AIActions(mockSuperdoc, options);
      await ai.waitUntilReady();

      await ai.action.find('test');
    });
  });

  describe('logging', () => {
    it('should log errors when logging is enabled', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {
        // Mock implementation
      });

      const errorProvider: AIProvider = {
        async *streamCompletion() {
          yield 'test';
        },
        async getCompletion() {
          throw new Error('Test error');
        },
      };

      const options: AIActionsOptions = {
        user: { displayName: 'AI Bot', userId: 'bot-123' },
        provider: errorProvider,
        enableLogging: true,
      };

      const ai = new AIActions(mockSuperdoc, options);
      await ai.waitUntilReady();

      await expect(ai.getCompletion('test')).rejects.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith('🦋 🦸‍♀️ [superdoc-ai]', expect.any(String), expect.any(Error));

      consoleSpy.mockRestore();
    });

    it('should not log errors when logging is disabled', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {
        // Mock implementation
      });

      const errorProvider: AIProvider = {
        async *streamCompletion() {
          yield 'test';
        },
        async getCompletion() {
          throw new Error('Test error');
        },
      };

      const options: AIActionsOptions = {
        user: { displayName: 'AI Bot', userId: 'bot-123' },
        provider: errorProvider,
        enableLogging: false,
      };

      const ai = new AIActions(mockSuperdoc, options);
      await ai.waitUntilReady();

      await expect(ai.getCompletion('test')).rejects.toThrow();
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
