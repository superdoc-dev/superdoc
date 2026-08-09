import { describe, it, expect } from 'vite-plus/test';
import { conversation, comment } from './comment-schemas.js';

describe('comment-schemas', () => {
  it('exposes a conversation template with null defaults', () => {
    expect(conversation).toEqual({
      conversationId: null,
      documentId: null,
      creatorId: null,
      creatorEmail: null,
      creatorName: null,
      comments: [],
      selection: null,
    });
  });

  it('exposes a comment template with user/timestamp placeholders', () => {
    expect(comment).toEqual({
      comment: null,
      user: { id: null, name: null, email: null },
      timestamp: null,
    });
  });
});
