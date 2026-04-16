import { describe, it, expect } from 'vitest';
import { isRef } from 'vue';
import useConversation from './use-conversation.js';

const baseParams = (overrides = {}) => ({
  documentId: 'doc-1',
  creatorEmail: 'alice@example.com',
  creatorName: 'Alice',
  selection: { documentId: 'doc-1', page: 1, source: 'superdoc' },
  ...overrides,
});

describe('useConversation', () => {
  it('generates a conversationId when none is provided', () => {
    const convo = useConversation(baseParams());
    expect(typeof convo.conversationId).toBe('string');
    expect(convo.conversationId.length).toBeGreaterThan(0);
  });

  it('preserves a provided conversationId', () => {
    const convo = useConversation(baseParams({ conversationId: 'fixed-id' }));
    expect(convo.conversationId).toBe('fixed-id');
  });

  it('exposes creator metadata unchanged', () => {
    const convo = useConversation(baseParams());
    expect(convo.creatorEmail).toBe('alice@example.com');
    expect(convo.creatorName).toBe('Alice');
    expect(convo.documentId).toBe('doc-1');
  });

  it('wraps comments into useComment instances', () => {
    const convo = useConversation(
      baseParams({
        comments: [
          { commentId: 'c-1', commentText: 'hello' },
          { commentId: 'c-2', commentText: 'world' },
        ],
      }),
    );
    expect(convo.comments.value).toHaveLength(2);
    expect(convo.comments.value[0].getValues).toBeTypeOf('function');
  });

  it('defaults optional flags', () => {
    const convo = useConversation(baseParams());
    expect(convo.markedDone.value).toBeNull();
    expect(convo.markedDoneByEmail.value).toBeNull();
    expect(convo.markedDoneByName.value).toBeNull();
    expect(convo.isFocused.value).toBe(false);
    expect(convo.isTrackedChange.value).toBe(false);
    expect(convo.group.value).toBeNull();
  });

  it('sets suppressClick when selection source is super-editor', () => {
    const convo = useConversation(baseParams({ selection: { documentId: 'doc-1', source: 'super-editor' } }));
    expect(convo.suppressClick.value).toBe(true);
  });

  it('returns reactive refs for mutable fields', () => {
    const convo = useConversation(baseParams());
    expect(isRef(convo.markedDone)).toBe(true);
    expect(isRef(convo.isFocused)).toBe(true);
    expect(isRef(convo.group)).toBe(true);
  });

  describe('markDone', () => {
    it('records the marker email, name, and timestamp', () => {
      const convo = useConversation(baseParams());
      convo.markDone('bob@example.com', 'Bob');
      expect(convo.markedDoneByEmail.value).toBe('bob@example.com');
      expect(convo.markedDoneByName.value).toBe('Bob');
      expect(convo.markedDone.value).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('clears the group when marked done', () => {
      const convo = useConversation(baseParams());
      convo.group.value = { id: 'g-1' };
      convo.markDone('bob@example.com', 'Bob');
      expect(convo.group.value).toBeNull();
    });
  });

  describe('getValues', () => {
    it('returns a plain object with creator + selection values', () => {
      const convo = useConversation(baseParams({ conversationId: 'conv-1' }));
      const values = convo.getValues();
      expect(values.conversationId).toBe('conv-1');
      expect(values.documentId).toBe('doc-1');
      expect(values.creatorEmail).toBe('alice@example.com');
      expect(values.selection).toBeDefined();
      expect(values.comments).toEqual([]);
    });

    it('maps comments through their own getValues()', () => {
      const convo = useConversation(baseParams({ comments: [{ commentId: 'c-1', commentText: 'hi' }] }));
      const values = convo.getValues();
      expect(values.comments).toHaveLength(1);
      expect(values.comments[0].commentId).toBe('c-1');
    });

    it('reflects markedDone state after marking', () => {
      const convo = useConversation(baseParams());
      convo.markDone('bob@example.com', 'Bob');
      const values = convo.getValues();
      expect(values.markedDoneByEmail).toBe('bob@example.com');
      expect(values.markedDone).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
