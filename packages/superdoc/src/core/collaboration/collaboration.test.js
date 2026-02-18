import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import * as collaborationModule from './collaboration.js';
import {
  initCollaborationComments,
  loadCommentsFromYdoc,
  initSuperdocYdoc,
  makeDocumentsCollaborative,
  syncCommentsToClients,
} from './helpers.js';
import * as commentsModule from './collaboration-comments.js';
const { addYComment, updateYComment, deleteYComment, getCommentIndex } = commentsModule;
import { SuperDoc } from '../SuperDoc.js';
import { PERMISSIONS, isAllowed } from './permissions.js';
import * as permissionsModule from './permissions.js';

var awarenessStatesToArrayMock;

var MockYMap;
var MockYArray;
var MockYDoc;
var MockWebsocketProvider;
var MockHocuspocusProvider;
var websocketInstances = [];
var hocuspocusInstances = [];

vi.mock('@superdoc/common/collaboration/awareness', () => {
  awarenessStatesToArrayMock = vi.fn(() => [{ name: 'Remote User' }]);
  return { awarenessStatesToArray: awarenessStatesToArrayMock };
});

vi.mock('y-websocket', () => {
  MockWebsocketProvider = class {
    constructor(url, name, ydoc, options) {
      this.url = url;
      this.name = name;
      this.ydoc = ydoc;
      this.options = options;
      this.awareness = {
        setLocalStateField: vi.fn(),
        on: vi.fn((event, handler) => {
          if (event === 'update') this._awarenessHandler = handler;
        }),
        getStates: vi.fn(() => this._states || new Map()),
      };
      websocketInstances.push(this);
    }

    emitAwareness(changes, states = new Map()) {
      this._states = states;
      this._awarenessHandler?.(changes);
    }
  };

  return {
    WebsocketProvider: MockWebsocketProvider,
  };
});

vi.mock('@hocuspocus/provider', () => {
  MockHocuspocusProvider = class {
    constructor(options) {
      this.options = options;
      this._handlers = {};
      hocuspocusInstances.push(this);
    }

    setAwarenessField(field, value) {
      this._awarenessField = { field, value };
    }

    on(event, handler) {
      this._handlers[event] = handler;
    }

    emit(event, payload) {
      this._handlers[event]?.(payload);
    }
  };

  return {
    HocuspocusProvider: MockHocuspocusProvider,
  };
});

vi.mock('yjs', () => {
  MockYMap = class extends Map {
    toJSON() {
      return Object.fromEntries(this);
    }
  };

  MockYArray = class {
    constructor() {
      this.items = [];
      this._observers = new Set();
    }

    push(nodes) {
      this.items.push(...nodes);
    }

    delete(index, count) {
      this.items.splice(index, count);
    }

    insert(index, nodes) {
      this.items.splice(index, 0, ...nodes);
    }

    toJSON() {
      return this.items.map((item) => (item?.toJSON ? item.toJSON() : item));
    }

    observe(handler) {
      this._observers.add(handler);
    }

    emit(event) {
      for (const handler of this._observers) handler(event);
    }
  };

  MockYDoc = class {
    constructor() {
      this._arrays = new Map();
      this._lastMeta = null;
    }

    getArray(name) {
      if (!this._arrays.has(name)) {
        this._arrays.set(name, new MockYArray());
      }
      return this._arrays.get(name);
    }

    transact(fn, meta) {
      this._lastMeta = meta;
      fn();
    }
  };

  return {
    Doc: MockYDoc,
    Map: MockYMap,
  };
});

var useCommentMock;
vi.mock('../../components/CommentsLayer/use-comment', () => {
  useCommentMock = vi.fn((comment) => ({ normalized: comment.commentId }));
  return { default: useCommentMock };
});

beforeAll(() => {
  globalThis.superdoc = { user: { name: 'Global User', email: 'global@example.com' } };
  globalThis.__IS_DEBUG__ = false;
});

beforeEach(() => {
  awarenessStatesToArrayMock?.mockClear();
  useCommentMock?.mockClear();
  websocketInstances.length = 0;
  hocuspocusInstances.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('collaboration.createProvider', () => {
  it('creates websocket provider with awareness hook', () => {
    const context = { emit: vi.fn() };
    const config = { url: 'ws://test-server' };
    const user = { name: 'Sam', email: 'sam@example.com' };
    const result = collaborationModule.createProvider({
      config,
      user,
      documentId: 'doc-1',
      superdocInstance: context,
    });

    expect(result.provider).toBeInstanceOf(MockWebsocketProvider);
    expect(result.provider.awareness.setLocalStateField).toHaveBeenCalledWith('user', user);

    const states = new Map([[1, { user: { name: 'Other' } }]]);
    awarenessStatesToArrayMock.mockReturnValueOnce([{ name: 'Other' }]);
    result.provider.emitAwareness({ added: [1], removed: [] }, states);

    expect(context.emit).toHaveBeenCalledWith(
      'awareness-update',
      expect.objectContaining({ states: [{ name: 'Other' }] }),
    );
  });

  it('creates hocuspocus provider and wires lifecycle callbacks', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const context = { emit: vi.fn() };
    const user = { name: 'Ana', email: 'ana@example.com' };

    const { provider } = collaborationModule.createProvider({
      config: { providerType: 'hocuspocus', token: 'abc' },
      user,
      documentId: 'doc-2',
      socket: { url: 'wss://socket' },
      superdocInstance: context,
    });

    expect(provider).toBeInstanceOf(MockHocuspocusProvider);
    expect(provider._awarenessField).toEqual({ field: 'user', value: user });

    provider.options.onConnect();
    provider.options.onDisconnect();
    provider.options.onDestroy();
    provider.options.onAuthenticationFailed('bad-token');
    provider.emit('awarenessUpdate', { states: new Map([[2, { user: user }]]) });
    expect(awarenessStatesToArrayMock).toHaveBeenCalled();
    expect(context.emit).toHaveBeenCalledWith(
      'awareness-update',
      expect.objectContaining({ states: [{ name: 'Remote User' }] }),
    );
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('collaboration helpers', () => {
  let superdoc;
  let commentsArray;

  beforeEach(() => {
    const ydoc = new MockYDoc();
    commentsArray = ydoc.getArray('comments');
    superdoc = {
      config: {
        superdocId: 'doc-123',
        user: { name: 'Owner', email: 'owner@example.com' },
        role: 'editor',
        isInternal: false,
        socket: { id: 'socket' },
        modules: {
          comments: true,
          collaboration: { providerType: 'superdoc', url: 'ws://collab' },
        },
        documents: [{ id: 'doc-a' }, { id: 'doc-b' }],
      },
      colors: ['#f00'],
      provider: {
        on: vi.fn(),
        off: vi.fn(),
      },
      ydoc,
      commentsStore: {
        commentsParentElement: 'parent',
        editorCommentIds: ['1'],
        handleEditorLocationsUpdate: vi.fn(),
        hasSyncedCollaborationComments: false,
        commentsList: [],
      },
      emit: vi.fn(),
      isCollaborative: true,
    };
  });

  it('initCollaborationComments wires provider sync and deduplicates updates', () => {
    initCollaborationComments(superdoc);

    expect(superdoc.provider.on).toHaveBeenCalledWith('synced', expect.any(Function));
    expect(commentsArray._observers.size).toBe(1);

    // Trigger synced event
    const syncedHandler = superdoc.provider.on.mock.calls[0][1];
    syncedHandler();
    expect(superdoc.commentsStore.handleEditorLocationsUpdate).toHaveBeenCalled();
    expect(superdoc.commentsStore.hasSyncedCollaborationComments).toBe(true);

    // Trigger observation from another user
    commentsArray.items = [
      new MockYMap(Object.entries({ commentId: 'c1', text: 'Hello' })),
      new MockYMap(Object.entries({ commentId: 'c1', text: 'Duplicate' })),
      new MockYMap(Object.entries({ commentId: 'c2', text: 'Another' })),
    ];

    const event = {
      transaction: { origin: { user: { name: 'Other', email: 'other@example.com' } } },
    };
    commentsArray.emit(event);

    expect(useCommentMock).toHaveBeenCalledTimes(2);
    expect(superdoc.commentsStore.commentsList).toEqual([{ normalized: 'c1' }, { normalized: 'c2' }]);

    // Event from same user should be ignored
    commentsArray.emit({ transaction: { origin: { user: superdoc.config.user } } });
    expect(useCommentMock).toHaveBeenCalledTimes(2);
  });

  it('initCollaborationComments loads existing comments from ydoc on init', () => {
    commentsArray.items = [
      new MockYMap(Object.entries({ commentId: 'c1', text: 'Hello' })),
      new MockYMap(Object.entries({ commentId: 'c1', text: 'Duplicate' })),
      new MockYMap(Object.entries({ commentId: 'c2', text: 'Another' })),
    ];

    initCollaborationComments(superdoc);

    expect(useCommentMock).toHaveBeenCalledTimes(2);
    expect(superdoc.commentsStore.commentsList).toEqual([{ normalized: 'c1' }, { normalized: 'c2' }]);
  });

  it('loadCommentsFromYdoc hydrates comments from importedId and deduplicates by stable key', () => {
    commentsArray.items = [
      new MockYMap(Object.entries({ importedId: 'legacy-1', text: 'legacy without commentId' })),
      new MockYMap(Object.entries({ importedId: 'legacy-1', text: 'duplicate legacy' })),
      new MockYMap(Object.entries({ commentId: 'c2', text: 'normal comment' })),
      new MockYMap(Object.entries({ commentId: 'c2', text: 'duplicate normal comment' })),
    ];
    superdoc.provider.synced = true;

    const loaded = loadCommentsFromYdoc(superdoc);

    expect(loaded).toBe(true);
    expect(useCommentMock).toHaveBeenCalledTimes(2);
    expect(useCommentMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ importedId: 'legacy-1', commentId: 'legacy-1' }),
    );
    expect(useCommentMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ commentId: 'c2' }));
    expect(superdoc.commentsStore.commentsList).toEqual([{ normalized: 'legacy-1' }, { normalized: 'c2' }]);
    expect(superdoc.commentsStore.hasSyncedCollaborationComments).toBe(true);
  });

  it('initCollaborationComments re-hydrates store on repeated init without duplicating listeners', () => {
    commentsArray.items = [new MockYMap(Object.entries({ commentId: 'c1', text: 'first' }))];

    initCollaborationComments(superdoc);
    expect(commentsArray._observers.size).toBe(1);
    expect(superdoc.provider.on).toHaveBeenCalledTimes(1);
    expect(superdoc.commentsStore.commentsList).toEqual([{ normalized: 'c1' }]);

    // Simulate store reset after mount; second init should re-hydrate but not add listeners again.
    superdoc.commentsStore.commentsList = [];
    initCollaborationComments(superdoc);

    expect(commentsArray._observers.size).toBe(1);
    expect(superdoc.provider.on).toHaveBeenCalledTimes(1);
    expect(superdoc.commentsStore.commentsList).toEqual([{ normalized: 'c1' }]);
  });

  it('initCollaborationComments skips when module disabled', () => {
    superdoc.config.modules.comments = false;
    initCollaborationComments(superdoc);
    expect(superdoc.provider.on).not.toHaveBeenCalled();
  });

  it('initSuperdocYdoc delegates to createProvider with derived document id', () => {
    const mockProvider = { provider: 'p', ydoc: 'y' };
    const spy = vi.spyOn(collaborationModule, 'createProvider').mockReturnValue(mockProvider);

    const result = initSuperdocYdoc(superdoc);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-123-superdoc-external',
      }),
    );
    expect(result).toEqual(mockProvider);
    spy.mockRestore();
  });

  it('makeDocumentsCollaborative mutates documents with provider metadata', () => {
    const created = makeDocumentsCollaborative(superdoc);
    expect(created).toHaveLength(2);
    created.forEach((doc) => {
      expect(doc.provider).toBeInstanceOf(MockWebsocketProvider);
      expect(doc.ydoc).toBeInstanceOf(MockYDoc);
      expect(doc.socket).toEqual(superdoc.config.socket);
      expect(doc.role).toBe(superdoc.config.role);
    });
  });
});

describe('collaboration comments primitives', () => {
  const testUser = { name: 'Test User', email: 'test@example.com' };

  it('manages Yjs comment array operations', () => {
    const ydoc = new MockYDoc();
    const yArray = ydoc.getArray('comments');
    const baseComment = { commentId: 'c1', body: 'Hello' };

    addYComment(yArray, ydoc, { comment: baseComment }, testUser);
    expect(yArray.toJSON()).toEqual([baseComment]);
    expect(ydoc._lastMeta.user).toEqual(testUser);

    const updatedComment = { commentId: 'c1', body: 'Updated' };
    updateYComment(yArray, ydoc, { comment: updatedComment }, testUser);
    expect(yArray.toJSON()).toEqual([updatedComment]);

    deleteYComment(yArray, ydoc, { comment: updatedComment }, testUser);
    expect(yArray.toJSON()).toEqual([]);
  });

  it('getCommentIndex finds matching comment ids', () => {
    const ydoc = new MockYDoc();
    const yArray = ydoc.getArray('comments');
    addYComment(yArray, ydoc, { comment: { commentId: 'c5', body: 'Test' } }, testUser);
    expect(getCommentIndex(yArray, { commentId: 'missing' })).toBe(-1);
    expect(getCommentIndex(yArray, { commentId: 'c5' })).toBe(0);
  });
});

describe('syncCommentsToClients routing', () => {
  let superdoc;
  let addSpy;
  let updateSpy;
  let deleteSpy;

  beforeEach(() => {
    const ydoc = new MockYDoc();
    superdoc = {
      ydoc,
      isCollaborative: true,
      config: {
        user: { name: 'Test User', email: 'test@example.com' },
        modules: { comments: true },
      },
    };

    addSpy = vi.spyOn(commentsModule, 'addYComment');
    updateSpy = vi.spyOn(commentsModule, 'updateYComment');
    deleteSpy = vi.spyOn(commentsModule, 'deleteYComment');
  });

  afterEach(() => {
    addSpy.mockRestore();
    updateSpy.mockRestore();
    deleteSpy.mockRestore();
  });

  it('routes events to the correct helpers', () => {
    syncCommentsToClients(superdoc, { type: 'add', comment: { commentId: 'a' } });
    expect(addSpy).toHaveBeenCalled();

    syncCommentsToClients(superdoc, { type: 'update', comment: { commentId: 'a' } });
    expect(updateSpy).toHaveBeenCalledTimes(1);

    syncCommentsToClients(superdoc, { type: 'resolved', comment: { commentId: 'a' } });
    expect(updateSpy).toHaveBeenCalledTimes(2);

    syncCommentsToClients(superdoc, { type: 'deleted', comment: { commentId: 'a' } });
    expect(deleteSpy).toHaveBeenCalled();
  });

  it('ignores events when collaboration disabled', () => {
    superdoc.isCollaborative = false;
    syncCommentsToClients(superdoc, { type: 'add', comment: {} });
    expect(addSpy).not.toHaveBeenCalled();
  });

  it('ignores events when comments module disabled', () => {
    superdoc.config.modules.comments = false;
    syncCommentsToClients(superdoc, { type: 'add', comment: {} });
    expect(addSpy).not.toHaveBeenCalled();
  });
});

describe('permissions', () => {
  it('exposes immutable list of permission keys', () => {
    expect(Object.keys(PERMISSIONS)).toEqual(expect.arrayContaining(['RESOLVE_OWN', 'VERSION_HISTORY']));
  });

  it('validates role access using isAllowed', () => {
    expect(isAllowed(PERMISSIONS.RESOLVE_OWN, 'editor', true)).toBe(true);
    expect(isAllowed(PERMISSIONS.RESOLVE_OWN, 'viewer', true)).toBe(false);
    expect(isAllowed(PERMISSIONS.REJECT_OWN, 'suggester', false)).toBe(true);
    expect(isAllowed(PERMISSIONS.REJECT_OTHER, 'suggester', false)).toBe(false);
  });

  it('delegates permission decisions to a hook when provided', () => {
    const permissionResolver = vi.fn().mockImplementation(({ defaultDecision, comment, currentUser, superdoc }) => {
      expect(defaultDecision).toBe(true);
      expect(comment.commentId).toBe('comment-1');
      expect(currentUser.email).toBe('editor@example.com');
      expect(superdoc).toBeDefined();
      return false;
    });

    const superdoc = {
      config: {
        user: { email: 'editor@example.com' },
        modules: {
          comments: {
            permissionResolver,
          },
        },
      },
    };

    const allowed = isAllowed(PERMISSIONS.RESOLVE_OWN, 'editor', true, {
      superdoc,
      comment: { commentId: 'comment-1' },
      trackedChange: { id: 'comment-1', attrs: { authorEmail: 'editor@example.com' } },
    });

    expect(allowed).toBe(false);
    expect(permissionResolver).toHaveBeenCalledWith(
      expect.objectContaining({
        permission: PERMISSIONS.RESOLVE_OWN,
        role: 'editor',
        isInternal: true,
        defaultDecision: true,
        trackedChange: expect.objectContaining({ id: 'comment-1' }),
      }),
    );
  });

  it('falls back to default decision when hook returns non-boolean', () => {
    const superdoc = {
      config: {
        user: { email: 'viewer@example.com' },
        modules: {
          comments: {
            permissionResolver: vi.fn(() => undefined),
          },
        },
      },
    };

    const allowed = isAllowed(PERMISSIONS.RESOLVE_OWN, 'viewer', true, {
      superdoc,
      comment: { commentId: 'comment-2' },
    });

    expect(allowed).toBe(false);
  });

  it('canPerformPermission resolves tracked-change comments via store', () => {
    const originalIsAllowed = permissionsModule.isAllowed;
    const resolver = vi.fn(({ comment }) => {
      expect(comment).toEqual({ commentId: 'change-1', text: 'hello' });
      return true;
    });

    const superdoc = {
      config: {
        role: 'editor',
        isInternal: true,
        user: { email: 'editor@example.com' },
        modules: {
          comments: {
            permissionResolver: resolver,
          },
        },
      },
      commentsStore: {
        getComment: vi.fn(() => ({
          getValues: () => ({ commentId: 'change-1', text: 'hello' }),
        })),
      },
    };

    const isAllowedSpy = vi
      .spyOn(permissionsModule, 'isAllowed')
      .mockImplementation((permission, role, isInternal, ctx) => {
        expect(ctx.comment).toEqual({ commentId: 'change-1', text: 'hello' });
        return originalIsAllowed(permission, role, isInternal, ctx);
      });

    const result = SuperDoc.prototype.canPerformPermission.call(superdoc, {
      permission: PERMISSIONS.RESOLVE_OWN,
      trackedChange: { id: 'change-1', attrs: { authorEmail: 'editor@example.com' } },
    });

    expect(result).toBe(true);
    expect(superdoc.commentsStore.getComment).toHaveBeenCalledWith('change-1');
    expect(resolver).toHaveBeenCalled();
    expect(isAllowedSpy).toHaveBeenCalledWith(
      PERMISSIONS.RESOLVE_OWN,
      'editor',
      true,
      expect.objectContaining({ trackedChange: expect.objectContaining({ id: 'change-1' }) }),
    );

    isAllowedSpy.mockRestore();
  });
});
