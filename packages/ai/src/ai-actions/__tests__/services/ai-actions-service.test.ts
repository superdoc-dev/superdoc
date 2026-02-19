import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIActionsService } from '../../services/ai-actions-service';
import type { AIProvider, Editor } from '../../../shared/types';
import { EditorAdapter } from '../../editor/editor-adapter';

const createChain = (commands?: Record<string, unknown>) => {
  const chainApi = {
    setTextSelection: vi.fn((args) => {
      commands?.setTextSelection?.(args);
      return chainApi;
    }),
    setHighlight: vi.fn((color) => {
      commands?.setHighlight?.(color);
      return chainApi;
    }),
    enableTrackChanges: vi.fn(() => {
      commands?.enableTrackChanges?.();
      return chainApi;
    }),
    deleteSelection: vi.fn(() => {
      commands?.deleteSelection?.();
      return chainApi;
    }),
    insertContent: vi.fn((content) => {
      commands?.insertContent?.(content);
      return chainApi;
    }),
    disableTrackChanges: vi.fn(() => {
      commands?.disableTrackChanges?.();
      return chainApi;
    }),
    insertComment: vi.fn((payload) => {
      commands?.insertComment?.(payload);
      return chainApi;
    }),
    run: vi.fn(() => true),
  };

  const chainFn = vi.fn(() => chainApi);

  return { chainFn, chainApi };
};

describe('AIActionsService', () => {
  let mockProvider: AIProvider;
  let mockEditor: Editor;
  let chainFn: ReturnType<typeof createChain>['chainFn'];
  let chainApi: ReturnType<typeof createChain>['chainApi'];

  beforeEach(() => {
    mockProvider = {
      async *streamCompletion() {
        yield 'test';
      },
      async getCompletion() {
        return JSON.stringify({ success: true, results: [] });
      },
    };

    mockEditor = {
      state: {
        doc: {
          textContent: 'Sample document text for testing',
          content: { size: 100 },
          resolve: vi.fn((_pos) => ({
            pos: _pos,
            parent: { inlineContent: true },
            min: vi.fn(() => _pos),
            max: vi.fn(() => _pos),
            marks: vi.fn(() => []),
          })),
          textBetween: vi.fn((from, to) => 'Sample document text for testing'.slice(from, to)),
          nodesBetween: vi.fn(),
        },
        selection: {
          from: 0,
          to: 0,
        },
        tr: {
          setSelection: vi.fn().mockReturnThis(),
          scrollIntoView: vi.fn().mockReturnThis(),
          delete: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
        },
        schema: {
          text: vi.fn((text, marks) => ({
            text,
            marks: marks || [],
            nodeSize: text.length,
          })),
        },
      },
      view: {
        dispatch: vi.fn(),
        domAtPos: vi.fn(() => {
          return {
            node: {
              scrollIntoView: vi.fn(),
            },
            offset: 0,
          };
        }),
      },
      dispatch: vi.fn(),
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
      chain: vi.fn(),
    } as unknown as Editor;
    const chain = createChain(mockEditor.commands);
    chainFn = chain.chainFn;
    chainApi = chain.chainApi;
    mockEditor.chain = chainFn;
  });

  describe('find', () => {
    it('should find first occurrence', async () => {
      const response = JSON.stringify({
        success: true,
        results: [{ originalText: 'Sample' }, { originalText: 'document' }],
      });

      mockProvider.getCompletion = vi.fn().mockResolvedValue(response);
      mockEditor.commands.search = vi
        .fn()
        .mockReturnValueOnce([{ from: 0, to: 6 }])
        .mockReturnValueOnce([{ from: 7, to: 15 }]);

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.find('find sample');

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].originalText).toBe('Sample');
      expect(mockEditor.commands.search).toHaveBeenCalledWith('Sample', { highlight: true });
      expect(mockEditor.commands.search).toHaveBeenCalledWith('document', { highlight: true });
    });

    it('should return empty result when no matches', async () => {
      mockProvider.getCompletion = vi.fn().mockResolvedValue(JSON.stringify({ success: false, results: [] }));

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.find('find nothing');

      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(0);
    });

    it('should validate input query', async () => {
      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);

      await expect(actions.find('')).rejects.toThrow('Query cannot be empty');
      await expect(actions.find('   ')).rejects.toThrow('Query cannot be empty');
    });

    it('should return empty when no document context', async () => {
      const actions = new AIActionsService(mockProvider, mockEditor, () => '', false);
      const result = await actions.find('query');

      expect(result).toEqual({ success: false, results: [] });
    });
  });

  describe('findAll', () => {
    it('should find all occurrences', async () => {
      const response = JSON.stringify({
        success: true,
        results: [{ originalText: 'test' }, { originalText: 'test' }, { originalText: 'test' }],
      });

      mockProvider.getCompletion = vi.fn().mockResolvedValue(response);
      mockEditor.commands.search = vi.fn().mockReturnValue([
        { from: 0, to: 4 },
        { from: 10, to: 14 },
        { from: 20, to: 24 },
      ]);

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.findAll('find all test');

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3);
      expect(mockEditor.commands.search).toHaveBeenCalledWith('test', { highlight: true });
    });
  });

  describe('highlight', () => {
    it('should highlight found content', async () => {
      const response = JSON.stringify({
        success: true,
        results: [{ originalText: 'highlight me' }],
      });

      mockProvider.getCompletion = vi.fn().mockResolvedValue(response);
      mockEditor.commands.search = vi.fn().mockReturnValue([{ from: 5, to: 17 }]);

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.highlight('highlight this');

      expect(result.success).toBe(true);
      expect(chainFn).toHaveBeenCalled();
      expect(chainApi.setTextSelection).toHaveBeenCalledWith({ from: 5, to: 17 });
      expect(chainApi.setHighlight).toHaveBeenCalledWith('#6CA0DC');
      expect(chainApi.run).toHaveBeenCalled();
    });

    it('should use custom color', async () => {
      const response = JSON.stringify({
        success: true,
        results: [{ originalText: 'text' }],
      });

      mockProvider.getCompletion = vi.fn().mockResolvedValue(response);
      mockEditor.commands.search = vi.fn().mockReturnValue([{ from: 0, to: 4 }]);

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      await actions.highlight('highlight', '#FF0000');

      expect(chainApi.setHighlight).toHaveBeenCalledWith('#FF0000');
    });

    it('should return failure when no positions found', async () => {
      const response = JSON.stringify({
        success: true,
        results: [{ originalText: 'text' }],
      });

      mockProvider.getCompletion = vi.fn().mockResolvedValue(response);
      mockEditor.commands.search = vi.fn().mockReturnValue([]);

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.highlight('highlight');

      expect(result.success).toBe(false);
    });
  });

  describe('replace', () => {
    it('should replace single occurrence', async () => {
      const response = JSON.stringify({
        success: true,
        results: [
          {
            originalText: 'old',
            suggestedText: 'new',
          },
        ],
      });

      mockProvider.getCompletion = vi.fn().mockResolvedValue(response);
      mockEditor.commands.search = vi.fn().mockReturnValue([{ from: 0, to: 3 }]);

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.replace('replace old with new');

      expect(result.success).toBe(true);
      expect(mockEditor.dispatch).toHaveBeenCalled();
    });

    it('should validate input', async () => {
      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);

      await expect(actions.replace('')).rejects.toThrow('Query cannot be empty');
    });
  });

  describe('replaceAll', () => {
    it('should replace all occurrences', async () => {
      const response = JSON.stringify({
        success: true,
        results: [
          { originalText: 'old', suggestedText: 'new' },
          { originalText: 'old', suggestedText: 'new' },
        ],
      });

      mockProvider.getCompletion = vi.fn().mockResolvedValue(response);
      mockEditor.commands.search = vi
        .fn()
        .mockReturnValueOnce([{ from: 0, to: 3 }])
        .mockReturnValueOnce([{ from: 10, to: 13 }]);

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.replaceAll('replace all old with new');

      expect(result.success).toBe(true);
    });
  });

  describe('literalReplace', () => {
    let literalSpy: ReturnType<typeof vi.spyOn<typeof EditorAdapter.prototype, 'findLiteralMatches'>>;
    let trackedSpy: ReturnType<typeof vi.spyOn<typeof EditorAdapter.prototype, 'createTrackedChange'>>;

    beforeEach(() => {
      literalSpy = vi.spyOn(EditorAdapter.prototype, 'findLiteralMatches');
      trackedSpy = vi.spyOn(EditorAdapter.prototype, 'createTrackedChange');
    });

    afterEach(() => {
      literalSpy.mockRestore();
      trackedSpy.mockRestore();
    });

    it('should deterministically replace literal text', async () => {
      const firstMatch = { from: 0, to: 1, text: 'A' };
      const secondMatch = { from: 20, to: 21, text: 'A' };
      // Mock returns matches on first call, then empty array (simulating replacements)
      literalSpy.mockReturnValueOnce([firstMatch, secondMatch]).mockReturnValue([]);

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.literalReplace('A', 'B', { caseSensitive: true });

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].originalText).toBe('A');
      expect(mockEditor.dispatch).toHaveBeenCalled();
      expect(trackedSpy).not.toHaveBeenCalled();
    });

    it('should support track changes option', async () => {
      literalSpy.mockReturnValue([{ from: 0, to: 1, text: 'A' }]);
      trackedSpy.mockReturnValue('tracked-1');

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.literalReplace('A', 'B', { trackChanges: true });

      expect(result.success).toBe(true);
      expect(result.results[0].changeId).toBe('tracked-1');
      expect(trackedSpy).toHaveBeenCalled();
    });

    it('should automatically detect and use active selection', async () => {
      literalSpy.mockReturnValue([]);

      // Set up editor with active selection matching the find text
      const docWithTextBetween = {
        ...mockEditor.state.doc,
        textBetween: vi.fn((from: number, to: number) => {
          return 'Sample document text for testing'.slice(from, to);
        }),
      };

      const mockSelection = {
        from: 0,
        to: 6,
        empty: false,
        $anchor: { pos: 0 } as unknown as { pos: number },
        $head: { pos: 6 } as unknown as { pos: number },
        ranges: [] as unknown[],
        anchor: 0,
        head: 6,
      } as unknown as typeof mockEditor.view.state.selection;

      mockEditor.view = {
        state: {
          selection: mockSelection,
          doc: docWithTextBetween,
        },
        dispatch: vi.fn(),
      } as unknown as Editor;

      mockEditor.state = {
        ...mockEditor.state,
        doc: docWithTextBetween,
        selection: mockSelection,
      };

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.literalReplace('Sample', 'Updated');

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].originalText).toBe('Sample');
      expect(literalSpy).not.toHaveBeenCalled();
    });

    it('should return failure when no matches exist', async () => {
      literalSpy.mockReturnValue([]);

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.literalReplace('Missing', 'Replacement');

      expect(result.success).toBe(false);
      expect(result.results).toEqual([]);
    });

    it('should validate find text input', async () => {
      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);

      await expect(actions.literalReplace('', 'value')).rejects.toThrow('Find text cannot be empty');
    });

    it('should find and replace all matches in a single pass', async () => {
      // For simple replacements (where replacement doesn't contain search text),
      // all matches should be found and replaced in a single pass
      literalSpy.mockReturnValueOnce([
        { from: 0, to: 1, text: 'A' },
        { from: 10, to: 11, text: 'A' },
      ]);

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.literalReplace('A', 'B');

      expect(literalSpy).toHaveBeenCalledTimes(1); // Only called once (single pass)
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2); // Both matches replaced
    });

    it('should NOT replace same match multiple times (regression test)', async () => {
      const match = { from: 5, to: 6, text: 'A' };
      literalSpy.mockReturnValue([match]);
      trackedSpy.mockReturnValue('change-1');

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.literalReplace('A', 'B', { trackChanges: true });

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(trackedSpy).toHaveBeenCalledTimes(1);
      expect(literalSpy).toHaveBeenCalledTimes(1);
    });

    it('should loop multiple passes when replacement contains search text', async () => {
      literalSpy
        .mockReturnValueOnce([{ from: 0, to: 3, text: 'cat' }])
        .mockReturnValueOnce([{ from: 0, to: 3, text: 'cat' }])
        .mockReturnValue([]);

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.literalReplace('cat', 'category');

      expect(result.success).toBe(true);
      expect(literalSpy.mock.calls.length).toBeGreaterThan(1);
    });

    it('should allow replacements that only differ by casing when case insensitive', async () => {
      const match = { from: 0, to: 5, text: 'apple' };
      literalSpy.mockReturnValueOnce([match]).mockReturnValue([]);

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.literalReplace('apple', 'Apple');

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
    });

    it('should throw when trackChanges and contentType: html are both set', async () => {
      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);

      await expect(
        actions.literalReplace('A', '<strong>B</strong>', { trackChanges: true, contentType: 'html' }),
      ).rejects.toThrow('trackChanges and contentType');
    });

    it('should throw when trackChanges and contentType: markdown are both set', async () => {
      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);

      await expect(
        actions.literalReplace('A', '**B**', { trackChanges: true, contentType: 'markdown' }),
      ).rejects.toThrow('trackChanges and contentType');
    });
  });

  describe('insertTrackedChange', () => {
    it('should insert single tracked change', async () => {
      const response = JSON.stringify({
        success: true,
        results: [
          {
            originalText: 'original',
            suggestedText: 'modified',
          },
        ],
      });

      mockProvider.getCompletion = vi.fn().mockResolvedValue(response);
      mockEditor.commands.search = vi.fn().mockReturnValue([{ from: 0, to: 8 }]);

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.insertTrackedChange('suggest change');

      expect(result.success).toBe(true);
      expect(mockEditor.commands.enableTrackChanges).toHaveBeenCalled();
      expect(mockEditor.commands.disableTrackChanges).toHaveBeenCalled();
    });
  });

  describe('insertTrackedChanges', () => {
    it('should insert multiple tracked changes', async () => {
      const response = JSON.stringify({
        success: true,
        results: [
          { originalText: 'first', suggestedText: 'modified1' },
          { originalText: 'second', suggestedText: 'modified2' },
        ],
      });

      mockProvider.getCompletion = vi.fn().mockResolvedValue(response);
      mockEditor.commands.search = vi
        .fn()
        .mockReturnValueOnce([{ from: 0, to: 5 }])
        .mockReturnValueOnce([{ from: 10, to: 16 }]);

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.insertTrackedChanges('suggest multiple changes');

      expect(result.success).toBe(true);
    });
  });

  describe('insertComment', () => {
    it('should insert single comment', async () => {
      const response = JSON.stringify({
        success: true,
        results: [
          {
            originalText: 'text',
            suggestedText: 'comment content',
          },
        ],
      });

      mockProvider.getCompletion = vi.fn().mockResolvedValue(response);
      mockEditor.commands.search = vi.fn().mockReturnValue([{ from: 0, to: 4 }]);

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.insertComment('add comment');

      expect(result.success).toBe(true);
      expect(chainApi.insertComment).toHaveBeenCalledWith({
        commentText: 'comment content',
      });
    });
  });

  describe('insertComments', () => {
    it('should insert multiple comments', async () => {
      const response = JSON.stringify({
        success: true,
        results: [
          { originalText: 'text1', suggestedText: 'comment1' },
          { originalText: 'text2', suggestedText: 'comment2' },
        ],
      });

      mockProvider.getCompletion = vi.fn().mockResolvedValue(response);
      mockEditor.commands.search = vi
        .fn()
        .mockReturnValueOnce([{ from: 0, to: 5 }])
        .mockReturnValueOnce([{ from: 10, to: 15 }]);

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.insertComments('add multiple comments');

      expect(result.success).toBe(true);
    });
  });

  describe('summarize', () => {
    it('should generate summary', async () => {
      const response = JSON.stringify({
        success: true,
        results: [
          {
            suggestedText: 'This is a summary of the document',
          },
        ],
      });

      mockProvider.getCompletion = vi.fn().mockResolvedValue(response);

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.summarize('summarize this document');

      expect(result.success).toBe(true);
      expect(result.results[0].suggestedText).toBe('This is a summary of the document');
    });

    it('should return failure when no document context', async () => {
      const actions = new AIActionsService(mockProvider, mockEditor, () => '', false);
      const result = await actions.summarize('summarize');

      expect(result).toEqual({ results: [], success: false });
    });

    it('should disable streaming when stream preference is false', async () => {
      const response = JSON.stringify({
        success: true,
        results: [{ suggestedText: 'summary' }],
      });

      const streamSpy = vi.fn().mockImplementation(async function* () {
        yield response;
      });
      const completionSpy = vi.fn().mockResolvedValue(response);

      mockProvider.streamCompletion = streamSpy as typeof mockProvider.streamCompletion;
      mockProvider.getCompletion = completionSpy;

      const actions = new AIActionsService(
        mockProvider,
        mockEditor,
        () => mockEditor.state.doc.textContent,
        false,
        undefined,
        false,
      );

      const result = await actions.summarize('summarize this document');

      expect(result.success).toBe(true);
      expect(streamSpy).not.toHaveBeenCalled();
      expect(completionSpy).toHaveBeenCalled();
    });

    it('should emit partial summaries via onStreamChunk when streaming', async () => {
      const streamingChunks = ['{"success":true,"results":[{"suggestedText":"Part ', 'One"}]}'];

      mockProvider.streamCompletion = vi.fn().mockImplementation(async function* () {
        for (const chunk of streamingChunks) {
          yield chunk;
        }
      });

      mockProvider.getCompletion = vi
        .fn()
        .mockResolvedValue(JSON.stringify({ success: true, results: [{ suggestedText: 'Part One' }] }));

      const onStreamChunk = vi.fn();
      const actions = new AIActionsService(
        mockProvider,
        mockEditor,
        () => mockEditor.state.doc.textContent,
        false,
        onStreamChunk,
        true,
      );

      const result = await actions.summarize('summarize this document');

      expect(result.success).toBe(true);
      expect(onStreamChunk).toHaveBeenCalled();
      expect(onStreamChunk.mock.calls.at(-1)?.[0]).toBe('Part One');
    });
  });

  describe('insertContent', () => {
    it('should insert new content', async () => {
      const response = JSON.stringify({
        success: true,
        results: [
          {
            suggestedText: 'New content to insert',
          },
        ],
      });

      mockProvider.getCompletion = vi.fn().mockResolvedValue(response);

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.insertContent('generate introduction');

      expect(result.success).toBe(true);
      expect(mockEditor.dispatch).toHaveBeenCalled();
    });

    it('should validate input', async () => {
      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);

      await expect(actions.insertContent('')).rejects.toThrow('Query cannot be empty');
    });

    it('should throw when no editor is provided', () => {
      expect(() => {
        return new AIActionsService(mockProvider, null, () => mockEditor.state.doc.textContent, false);
      }).toThrowError('SuperDoc editor is not available; retry once the editor is initialized');
    });

    it('should return failure when AI returns no suggestions', async () => {
      const response = JSON.stringify({
        success: true,
        results: [],
      });

      mockProvider.getCompletion = vi.fn().mockResolvedValue(response);

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.insertContent('insert content');

      expect(result).toEqual({ success: false, results: [] });
    });

    it('should respect positional arguments when inserting content', async () => {
      const response = JSON.stringify({
        success: true,
        results: [
          {
            suggestedText: 'Heading content',
          },
        ],
      });

      mockProvider.getCompletion = vi.fn().mockResolvedValue(response);
      const insertSpy = vi.spyOn(EditorAdapter.prototype, 'insertText').mockImplementation(() => {
        // Mock implementation
      });

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.insertContent('add heading', { position: 'before' });

      expect(result.success).toBe(true);
      expect(insertSpy).toHaveBeenCalledWith('Heading content', { position: 'before' });

      insertSpy.mockRestore();
    });

    it('should strip list numbering from suggested insertions while keeping leading whitespace', async () => {
      const response = JSON.stringify({
        success: true,
        results: [
          {
            suggestedText: '\n1.2 Artificial intelligence clause',
          },
        ],
      });

      mockProvider.getCompletion = vi.fn().mockResolvedValue(response);
      const insertSpy = vi.spyOn(EditorAdapter.prototype, 'insertText').mockImplementation(() => {
        // Mock implementation
      });

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.insertContent('add clause');

      expect(result.success).toBe(true);
      expect(insertSpy).toHaveBeenCalledWith('\nArtificial intelligence clause', { position: 'replace' });
      expect(result.results?.[0]?.suggestedText).toBe('\nArtificial intelligence clause');

      insertSpy.mockRestore();
    });

    it('should stream content chunks into the editor when enabled', async () => {
      const finalPayload = JSON.stringify({
        success: true,
        results: [{ suggestedText: 'Generated content' }],
      });

      const streamingChunks = ['{"success":true,"results":[{"suggestedText":"Generated ', 'content"}]}'];

      mockProvider.streamCompletion = vi.fn().mockImplementation(async function* () {
        for (const chunk of streamingChunks) {
          yield chunk;
        }
      });

      mockProvider.getCompletion = vi.fn().mockResolvedValue(finalPayload);

      const onStreamChunk = vi.fn();
      const actions = new AIActionsService(
        mockProvider,
        mockEditor,
        () => mockEditor.state.doc.textContent,
        false,
        onStreamChunk,
        true,
      );

      const result = await actions.insertContent('generate introduction');

      expect(result.success).toBe(true);
      expect(mockEditor.dispatch).toHaveBeenCalled();
      expect(onStreamChunk).toHaveBeenCalledWith('Generated content');
    });

    it('should disable streaming when stream preference is false', async () => {
      const response = JSON.stringify({
        success: true,
        results: [
          {
            suggestedText: 'Generated content',
          },
        ],
      });

      const streamSpy = vi.fn().mockImplementation(async function* () {
        yield response;
      });
      const completionSpy = vi.fn().mockResolvedValue(response);

      mockProvider.streamCompletion = streamSpy as typeof mockProvider.streamCompletion;
      mockProvider.getCompletion = completionSpy;

      const actions = new AIActionsService(
        mockProvider,
        mockEditor,
        () => mockEditor.state.doc.textContent,
        false,
        undefined,
        false,
      );

      const result = await actions.insertContent('generate introduction');

      expect(result.success).toBe(true);
      expect(streamSpy).not.toHaveBeenCalled();
      expect(completionSpy).toHaveBeenCalled();
    });
  });

  describe('insertContent with contentType', () => {
    it('should disable streaming when contentType is html', async () => {
      const response = JSON.stringify({
        success: true,
        results: [{ suggestedText: '<p>Hello <a href="https://example.com">link</a></p>' }],
      });

      const streamSpy = vi.fn().mockImplementation(async function* () {
        yield response;
      });
      const completionSpy = vi.fn().mockResolvedValue(response);

      mockProvider.streamCompletion = streamSpy as typeof mockProvider.streamCompletion;
      mockProvider.getCompletion = completionSpy;

      const insertFormattedSpy = vi
        .spyOn(EditorAdapter.prototype, 'insertFormattedContent')
        .mockImplementation(() => {});

      const actions = new AIActionsService(
        mockProvider,
        mockEditor,
        () => mockEditor.state.doc.textContent,
        false,
        undefined,
        true, // streaming preference enabled
      );

      const result = await actions.insertContent('generate html', { contentType: 'html' });

      expect(result.success).toBe(true);
      // Streaming must be disabled for HTML content
      expect(streamSpy).not.toHaveBeenCalled();
      expect(completionSpy).toHaveBeenCalled();
      // Should use insertFormattedContent, not insertText
      expect(insertFormattedSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ contentType: 'html' }),
      );

      insertFormattedSpy.mockRestore();
    });

    it('should disable streaming when contentType is markdown', async () => {
      const response = JSON.stringify({
        success: true,
        results: [{ suggestedText: '# Title\n\n[link](https://example.com)' }],
      });

      const streamSpy = vi.fn().mockImplementation(async function* () {
        yield response;
      });
      const completionSpy = vi.fn().mockResolvedValue(response);

      mockProvider.streamCompletion = streamSpy as typeof mockProvider.streamCompletion;
      mockProvider.getCompletion = completionSpy;

      const insertFormattedSpy = vi
        .spyOn(EditorAdapter.prototype, 'insertFormattedContent')
        .mockImplementation(() => {});

      const actions = new AIActionsService(
        mockProvider,
        mockEditor,
        () => mockEditor.state.doc.textContent,
        false,
        undefined,
        true,
      );

      const result = await actions.insertContent('generate markdown', { contentType: 'markdown' });

      expect(result.success).toBe(true);
      expect(streamSpy).not.toHaveBeenCalled();
      expect(completionSpy).toHaveBeenCalled();
      expect(insertFormattedSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ contentType: 'markdown' }),
      );

      insertFormattedSpy.mockRestore();
    });

    it('should route through insertFormattedContent with position: before for html', async () => {
      const response = JSON.stringify({
        success: true,
        results: [{ suggestedText: '<p>Before content</p>' }],
      });

      mockProvider.getCompletion = vi.fn().mockResolvedValue(response);

      const insertFormattedSpy = vi
        .spyOn(EditorAdapter.prototype, 'insertFormattedContent')
        .mockImplementation(() => {});

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.insertContent('add content', {
        position: 'before',
        contentType: 'html',
      });

      expect(result.success).toBe(true);
      expect(insertFormattedSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ position: 'before', contentType: 'html' }),
      );

      insertFormattedSpy.mockRestore();
    });

    it('should route through insertFormattedContent with position: after for html', async () => {
      const response = JSON.stringify({
        success: true,
        results: [{ suggestedText: '<p>After content</p>' }],
      });

      mockProvider.getCompletion = vi.fn().mockResolvedValue(response);

      const insertFormattedSpy = vi
        .spyOn(EditorAdapter.prototype, 'insertFormattedContent')
        .mockImplementation(() => {});

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.insertContent('add content', {
        position: 'after',
        contentType: 'html',
      });

      expect(result.success).toBe(true);
      expect(insertFormattedSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ position: 'after', contentType: 'html' }),
      );

      insertFormattedSpy.mockRestore();
    });

    it('should use plain insertText path when contentType is text', async () => {
      const response = JSON.stringify({
        success: true,
        results: [{ suggestedText: 'Plain text content' }],
      });

      mockProvider.getCompletion = vi.fn().mockResolvedValue(response);

      const insertTextSpy = vi.spyOn(EditorAdapter.prototype, 'insertText').mockImplementation(() => {});
      const insertFormattedSpy = vi
        .spyOn(EditorAdapter.prototype, 'insertFormattedContent')
        .mockImplementation(() => {});

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.insertContent('add content', { contentType: 'text' });

      expect(result.success).toBe(true);
      expect(insertFormattedSpy).not.toHaveBeenCalled();
      expect(insertTextSpy).toHaveBeenCalled();

      insertTextSpy.mockRestore();
      insertFormattedSpy.mockRestore();
    });
  });

  describe('literalReplace with contentType', () => {
    let literalSpy: ReturnType<typeof vi.spyOn<typeof EditorAdapter.prototype, 'findLiteralMatches'>>;
    let insertFormattedSpy: ReturnType<typeof vi.spyOn<typeof EditorAdapter.prototype, 'insertFormattedContent'>>;

    beforeEach(() => {
      literalSpy = vi.spyOn(EditorAdapter.prototype, 'findLiteralMatches');
      insertFormattedSpy = vi.spyOn(EditorAdapter.prototype, 'insertFormattedContent').mockImplementation(() => {});
    });

    afterEach(() => {
      literalSpy.mockRestore();
      insertFormattedSpy.mockRestore();
    });

    it('should route replacement through insertFormattedContent when contentType is html', async () => {
      const match = { from: 0, to: 5, text: 'Hello' };
      literalSpy.mockReturnValueOnce([match]).mockReturnValue([]);

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.literalReplace('Hello', '<p><strong>Hi</strong></p>', {
        contentType: 'html',
      });

      expect(result.success).toBe(true);
      expect(mockEditor.commands.setTextSelection).toHaveBeenCalled();
      expect(insertFormattedSpy).toHaveBeenCalledWith(
        '<p><strong>Hi</strong></p>',
        expect.objectContaining({ contentType: 'html', position: 'replace' }),
      );
    });
  });

  describe('error handling', () => {
    it('should respect enableLogging flag', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {
        // Mock implementation
      });

      mockProvider.getCompletion = vi.fn().mockResolvedValue('invalid json');
      mockEditor.commands.search = vi.fn().mockReturnValue([{ from: 0, to: 4 }]);

      // Test with logging disabled
      const actions1 = new AIActionsService(mockProvider, mockEditor, () => 'context', false);
      const response1 = JSON.stringify({
        success: true,
        results: [{ originalText: 'test', suggestedText: 'new' }],
      });
      mockProvider.getCompletion = vi.fn().mockResolvedValue(response1);

      await actions1.replace('test');

      consoleSpy.mockRestore();
    });

    it('should handle missing positions gracefully', async () => {
      const response = JSON.stringify({
        success: true,
        results: [
          {
            originalText: 'text',
            suggestedText: 'replacement',
          },
        ],
      });

      mockProvider.getCompletion = vi.fn().mockResolvedValue(response);
      mockEditor.commands.search = vi.fn().mockReturnValue([]);

      const actions = new AIActionsService(mockProvider, mockEditor, () => mockEditor.state.doc.textContent, false);
      const result = await actions.replace('replace text');

      expect(result.results).toHaveLength(0);
    });
  });
});
