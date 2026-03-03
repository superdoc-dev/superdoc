import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./part-spec-registry.js', async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    EXCLUDED_PART_PATHS: new Set(['word/document.xml']),
  };
});

import {
  isApplyingRemotePart,
  semanticEquals,
  publishPartSections,
  applyRemotePartSections,
  hydrateOrSeedPart,
  createSpecObserver,
  deleteRemotePartSections,
} from './part-sync-engine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createMockYMap = (initial = {}) => {
  const store = new Map(Object.entries(initial));
  return {
    get: (k) => store.get(k),
    set: vi.fn((k, v) => store.set(k, v)),
    delete: vi.fn((k) => store.delete(k)),
    has: (k) => store.has(k),
    forEach: (fn) => store.forEach(fn),
    store,
  };
};

const createMockYdoc = (maps = {}) => ({
  isDestroyed: false,
  getMap: vi.fn((name) => {
    if (!maps[name]) maps[name] = createMockYMap();
    return maps[name];
  }),
  transact: vi.fn((fn) => fn()),
});

const createMockEditor = (overrides = {}) => ({
  isDestroyed: false,
  options: { ydoc: createMockYdoc(), user: { id: 'user-1' } },
  converter: {},
  emit: vi.fn(),
  ...overrides,
});

const createMockSpec = (overrides = {}) => ({
  id: 'test-spec',
  partPath: 'word/test.xml',
  channel: 'testChannel',
  version: 1,
  sectionKey: (section) => `test-spec/${section}`,
  parseKey: (key) => (key.startsWith('test-spec/') ? key.slice('test-spec/'.length) : null),
  listSections: vi.fn(() => ['root']),
  readSection: vi.fn(() => ({ data: 'local' })),
  validateSection: vi.fn(() => true),
  applySection: vi.fn(),
  afterApply: vi.fn(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// semanticEquals
// ---------------------------------------------------------------------------

describe('semanticEquals', () => {
  it('returns true for reference equality', () => {
    const obj = { a: 1 };
    expect(semanticEquals(obj, obj)).toBe(true);
  });

  it('returns true when both are null', () => {
    expect(semanticEquals(null, null)).toBe(true);
  });

  it('returns true when both are undefined', () => {
    expect(semanticEquals(undefined, undefined)).toBe(true);
  });

  it('returns false for null vs undefined', () => {
    expect(semanticEquals(null, undefined)).toBe(false);
  });

  it('returns false when one side is null and the other is an object', () => {
    expect(semanticEquals(null, { a: 1 })).toBe(false);
    expect(semanticEquals({ a: 1 }, null)).toBe(false);
  });

  it('returns false when one side is undefined and the other is an object', () => {
    expect(semanticEquals(undefined, { a: 1 })).toBe(false);
    expect(semanticEquals({ a: 1 }, undefined)).toBe(false);
  });

  it('returns true for deep equal objects', () => {
    expect(semanticEquals({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toBe(true);
  });

  it('returns false for different objects', () => {
    expect(semanticEquals({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('returns true for deep equal arrays', () => {
    expect(semanticEquals([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  it('returns false for different arrays', () => {
    expect(semanticEquals([1, 2], [1, 3])).toBe(false);
  });

  it('returns true for identical primitives', () => {
    expect(semanticEquals(42, 42)).toBe(true);
    expect(semanticEquals('hello', 'hello')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// publishPartSections
// ---------------------------------------------------------------------------

describe('publishPartSections', () => {
  let editor;
  let spec;

  beforeEach(() => {
    editor = createMockEditor();
    spec = createMockSpec();
  });

  it('publishes changed sections to Y.Map via transact', () => {
    publishPartSections(editor, spec);

    const map = editor.options.ydoc.getMap(spec.channel);
    expect(editor.options.ydoc.transact).toHaveBeenCalledOnce();
    expect(map.set).toHaveBeenCalledWith('test-spec/root', expect.objectContaining({ data: 'local' }));
  });

  it('skips unchanged sections when semantically equal', () => {
    const channelMap = createMockYMap({ 'test-spec/root': { data: 'local' } });
    const ydoc = createMockYdoc({ testChannel: channelMap });
    editor = createMockEditor({ options: { ydoc, user: { id: 'user-1' } } });

    publishPartSections(editor, spec);

    expect(ydoc.transact).not.toHaveBeenCalled();
  });

  it('does not transact when no sections changed', () => {
    spec = createMockSpec({
      listSections: vi.fn(() => []),
    });

    publishPartSections(editor, spec);

    expect(editor.options.ydoc.transact).not.toHaveBeenCalled();
  });

  it('uses sectionHints when provided instead of listSections', () => {
    publishPartSections(editor, spec, ['customSection']);

    expect(spec.listSections).not.toHaveBeenCalled();
    const map = editor.options.ydoc.getMap(spec.channel);
    expect(map.set).toHaveBeenCalledWith('test-spec/customSection', expect.anything());
  });

  it('skips when apply guard is active', () => {
    const map = createMockYMap();
    const ydoc = createMockYdoc({ testChannel: map });
    editor = createMockEditor({ options: { ydoc, user: { id: 'user-1' } } });

    // Trigger applyRemotePartSections to set the guard synchronously
    applyRemotePartSections(editor, spec, map, ['test-spec/root']);

    // Guard is active synchronously — publish should be skipped
    publishPartSections(editor, spec);
    expect(ydoc.transact).not.toHaveBeenCalled();
  });

  it('skips when editor is destroyed', () => {
    editor.isDestroyed = true;
    publishPartSections(editor, spec);
    expect(editor.options.ydoc.transact).not.toHaveBeenCalled();
  });

  it('skips when ydoc is missing', () => {
    editor = createMockEditor({ options: { user: { id: 'user-1' } } });
    publishPartSections(editor, spec);
    // No error thrown
  });

  it('skips when ydoc is destroyed', () => {
    editor.options.ydoc.isDestroyed = true;
    publishPartSections(editor, spec);
    expect(editor.options.ydoc.transact).not.toHaveBeenCalled();
  });

  it('skips when converter is missing', () => {
    editor.converter = null;
    publishPartSections(editor, spec);
    expect(editor.options.ydoc.transact).not.toHaveBeenCalled();
  });

  it('writes metadata to ooxmlPartMeta', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);

    publishPartSections(editor, spec);

    const metaMap = editor.options.ydoc.getMap('ooxmlPartMeta');
    expect(metaMap.set).toHaveBeenCalledWith('test-spec/root', {
      updatedBy: 'user-1',
      updatedAt: 1000,
    });

    vi.restoreAllMocks();
  });

  it('uses "unknown" userId when user is not set', () => {
    editor = createMockEditor({ options: { ydoc: createMockYdoc(), user: {} } });

    publishPartSections(editor, spec);

    const metaMap = editor.options.ydoc.getMap('ooxmlPartMeta');
    expect(metaMap.set).toHaveBeenCalledWith(
      'test-spec/root',
      expect.objectContaining({
        updatedBy: 'unknown',
      }),
    );
  });

  it('sets _version sentinel once', () => {
    publishPartSections(editor, spec);

    const map = editor.options.ydoc.getMap(spec.channel);
    expect(map.set).toHaveBeenCalledWith('_version', 1);
  });

  it('does not overwrite existing _version', () => {
    const channelMap = createMockYMap({ _version: 1 });
    const ydoc = createMockYdoc({ testChannel: channelMap });
    editor = createMockEditor({ options: { ydoc, user: { id: 'user-1' } } });

    spec = createMockSpec({ readSection: vi.fn(() => ({ data: 'new' })) });
    publishPartSections(editor, spec);

    const versionCalls = channelMap.set.mock.calls.filter(([k]) => k === '_version');
    expect(versionCalls).toHaveLength(0);
  });

  it('does not set _version when spec.version is null', () => {
    spec = createMockSpec({ version: null });
    publishPartSections(editor, spec);

    const map = editor.options.ydoc.getMap(spec.channel);
    const versionCalls = map.set.mock.calls.filter(([k]) => k === '_version');
    expect(versionCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// applyRemotePartSections
// ---------------------------------------------------------------------------

describe('applyRemotePartSections', () => {
  let editor;
  let spec;
  let map;

  beforeEach(() => {
    vi.useFakeTimers();
    editor = createMockEditor();
    spec = createMockSpec();
    map = createMockYMap({ 'test-spec/root': { data: 'remote' } });
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('applies remote values to converter via spec.applySection', () => {
    applyRemotePartSections(editor, spec, map, ['test-spec/root']);

    expect(spec.applySection).toHaveBeenCalledWith(
      editor.converter,
      'root',
      expect.objectContaining({ data: 'remote' }),
    );
  });

  it('calls afterApply with applied sections', () => {
    applyRemotePartSections(editor, spec, map, ['test-spec/root']);

    expect(spec.afterApply).toHaveBeenCalledWith(editor, ['root']);
  });

  it('emits xmlPartChanged event', () => {
    applyRemotePartSections(editor, spec, map, ['test-spec/root']);

    expect(editor.emit).toHaveBeenCalledWith('partChanged', {
      partId: 'test-spec',
      changedPaths: ['root'],
      source: 'yjs.remote',
    });
  });

  it('skips sections where validateSection returns false', () => {
    spec = createMockSpec({ validateSection: vi.fn(() => false) });

    applyRemotePartSections(editor, spec, map, ['test-spec/root']);

    expect(spec.applySection).not.toHaveBeenCalled();
    expect(editor.emit).not.toHaveBeenCalled();
  });

  it('skips semantic no-ops', () => {
    spec = createMockSpec({ readSection: vi.fn(() => ({ data: 'remote' })) });

    applyRemotePartSections(editor, spec, map, ['test-spec/root']);

    expect(spec.applySection).not.toHaveBeenCalled();
    expect(editor.emit).not.toHaveBeenCalled();
  });

  it('skips unrecognized keys where parseKey returns null', () => {
    applyRemotePartSections(editor, spec, map, ['unknown-key']);

    expect(spec.applySection).not.toHaveBeenCalled();
    expect(editor.emit).not.toHaveBeenCalled();
  });

  it('sets apply guard synchronously during apply', () => {
    spec = createMockSpec({
      applySection: vi.fn(() => {
        expect(isApplyingRemotePart(editor, 'test-spec')).toBe(true);
      }),
    });

    applyRemotePartSections(editor, spec, map, ['test-spec/root']);

    expect(spec.applySection).toHaveBeenCalled();
  });

  it('clears apply guard asynchronously via setTimeout', () => {
    applyRemotePartSections(editor, spec, map, ['test-spec/root']);

    expect(isApplyingRemotePart(editor, 'test-spec')).toBe(true);

    vi.runAllTimers();

    expect(isApplyingRemotePart(editor, 'test-spec')).toBe(false);
  });

  it('clears apply guard even when an error is thrown', () => {
    spec = createMockSpec({
      applySection: vi.fn(() => {
        throw new Error('boom');
      }),
    });

    expect(() => applyRemotePartSections(editor, spec, map, ['test-spec/root'])).toThrow('boom');

    vi.runAllTimers();

    expect(isApplyingRemotePart(editor, 'test-spec')).toBe(false);
  });

  it('handles editor destroyed gracefully', () => {
    editor.isDestroyed = true;
    applyRemotePartSections(editor, spec, map, ['test-spec/root']);
    expect(spec.applySection).not.toHaveBeenCalled();
  });

  it('handles missing converter gracefully', () => {
    editor.converter = null;
    applyRemotePartSections(editor, spec, map, ['test-spec/root']);
    expect(spec.applySection).not.toHaveBeenCalled();
  });

  it('does not call afterApply when no sections were applied', () => {
    applyRemotePartSections(editor, spec, map, ['unknown-key']);
    expect(spec.afterApply).not.toHaveBeenCalled();
  });

  it('works when afterApply is not defined', () => {
    spec = createMockSpec({ afterApply: undefined });
    expect(() => applyRemotePartSections(editor, spec, map, ['test-spec/root'])).not.toThrow();
    expect(editor.emit).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// hydrateOrSeedPart
// ---------------------------------------------------------------------------

describe('hydrateOrSeedPart', () => {
  let editor;
  let spec;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('hydrates when _version exists in map', () => {
    const channelMap = createMockYMap({
      _version: 1,
      'test-spec/root': { data: 'remote' },
    });
    const ydoc = createMockYdoc({ testChannel: channelMap });
    editor = createMockEditor({ options: { ydoc, user: { id: 'user-1' } } });
    spec = createMockSpec();

    hydrateOrSeedPart(editor, spec);

    expect(spec.applySection).toHaveBeenCalledWith(
      editor.converter,
      'root',
      expect.objectContaining({ data: 'remote' }),
    );
  });

  it('does not hydrate keys that are not present in the map', () => {
    const channelMap = createMockYMap({ _version: 1 });
    const ydoc = createMockYdoc({ testChannel: channelMap });
    editor = createMockEditor({ options: { ydoc, user: { id: 'user-1' } } });
    spec = createMockSpec();

    hydrateOrSeedPart(editor, spec);

    expect(spec.applySection).not.toHaveBeenCalled();
  });

  it('seeds local sections when channel has _version but spec is not remotely initialized', () => {
    // Shared channel may have _version set by another spec while this one is
    // still uninitialized remotely. In that case we seed instead of delete.
    const channelMap = createMockYMap({ _version: 1 });
    const ydoc = createMockYdoc({ testChannel: channelMap });
    editor = createMockEditor({ options: { ydoc, user: { id: 'user-1' } } });
    spec = createMockSpec({
      listSections: vi.fn(() => ['root']),
      removeSection: vi.fn(),
    });

    hydrateOrSeedPart(editor, spec);

    // Should seed local root to remote channel and not delete local state.
    expect(spec.applySection).not.toHaveBeenCalled();
    expect(channelMap.set).toHaveBeenCalledWith('test-spec/root', expect.anything());
    expect(spec.removeSection).not.toHaveBeenCalled();
  });

  it('removes stale local sections when spec has remote readiness metadata', () => {
    const channelMap = createMockYMap({ _version: 1 });
    const metaMap = createMockYMap({
      'test-spec/root': { updatedBy: 'user-2', updatedAt: 1000 },
    });
    const ydoc = createMockYdoc({ testChannel: channelMap, ooxmlPartMeta: metaMap });
    editor = createMockEditor({ options: { ydoc, user: { id: 'user-1' } } });
    spec = createMockSpec({
      listSections: vi.fn(() => ['root']),
      removeSection: vi.fn(),
    });

    hydrateOrSeedPart(editor, spec);

    expect(spec.applySection).not.toHaveBeenCalled();
    expect(spec.removeSection).toHaveBeenCalledWith(editor.converter, 'root');
  });

  it('removes only stale local sections when remote has a subset', () => {
    // Remote has sectionA but not sectionB — local has both
    const channelMap = createMockYMap({
      _version: 1,
      'test-spec/sectionA': { data: 'remote-a' },
    });
    const ydoc = createMockYdoc({ testChannel: channelMap });
    editor = createMockEditor({ options: { ydoc, user: { id: 'user-1' } } });
    spec = createMockSpec({
      listSections: vi.fn(() => ['sectionA', 'sectionB']),
      readSection: vi.fn((converter, section) => (section === 'sectionA' ? { data: 'local-a' } : { data: 'local-b' })),
      removeSection: vi.fn(),
    });

    hydrateOrSeedPart(editor, spec);

    // sectionA should be applied (remote update), sectionB should be removed (stale)
    expect(spec.applySection).toHaveBeenCalledWith(
      editor.converter,
      'sectionA',
      expect.objectContaining({ data: 'remote-a' }),
    );
    expect(spec.removeSection).toHaveBeenCalledWith(editor.converter, 'sectionB');
    expect(spec.removeSection).not.toHaveBeenCalledWith(editor.converter, 'sectionA');
  });

  it('does not remove when spec has no removeSection', () => {
    // Spec without removeSection should not attempt deletion
    const channelMap = createMockYMap({ _version: 1 });
    const ydoc = createMockYdoc({ testChannel: channelMap });
    editor = createMockEditor({ options: { ydoc, user: { id: 'user-1' } } });
    spec = createMockSpec(); // no removeSection by default

    hydrateOrSeedPart(editor, spec);

    // Just verify it doesn't throw
    expect(spec.applySection).not.toHaveBeenCalled();
  });

  it('seeds when no _version exists', () => {
    const channelMap = createMockYMap();
    const ydoc = createMockYdoc({ testChannel: channelMap });
    editor = createMockEditor({ options: { ydoc, user: { id: 'user-1' } } });
    spec = createMockSpec();

    hydrateOrSeedPart(editor, spec);

    expect(ydoc.transact).toHaveBeenCalled();
    expect(channelMap.set).toHaveBeenCalledWith('test-spec/root', expect.anything());
  });

  it('skips when editor is destroyed', () => {
    editor = createMockEditor();
    editor.isDestroyed = true;
    spec = createMockSpec();

    hydrateOrSeedPart(editor, spec);

    expect(spec.listSections).not.toHaveBeenCalled();
  });

  it('skips when ydoc is missing', () => {
    editor = createMockEditor({ options: { user: { id: 'user-1' } } });
    spec = createMockSpec();

    hydrateOrSeedPart(editor, spec);

    expect(spec.listSections).not.toHaveBeenCalled();
  });

  it('skips when ydoc is destroyed', () => {
    const ydoc = createMockYdoc();
    ydoc.isDestroyed = true;
    editor = createMockEditor({ options: { ydoc, user: { id: 'user-1' } } });
    spec = createMockSpec();

    hydrateOrSeedPart(editor, spec);

    expect(spec.listSections).not.toHaveBeenCalled();
  });

  it('does not seed when converter is missing and no _version', () => {
    const channelMap = createMockYMap();
    const ydoc = createMockYdoc({ testChannel: channelMap });
    editor = createMockEditor({
      options: { ydoc, user: { id: 'user-1' } },
      converter: null,
    });
    spec = createMockSpec();

    hydrateOrSeedPart(editor, spec);

    expect(ydoc.transact).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createSpecObserver
// ---------------------------------------------------------------------------

describe('createSpecObserver', () => {
  let editor;
  let spec;
  let observer;

  beforeEach(() => {
    vi.useFakeTimers();
    const channelMap = createMockYMap({ 'test-spec/root': { data: 'remote' } });
    const ydoc = createMockYdoc({ testChannel: channelMap });
    editor = createMockEditor({ options: { ydoc, user: { id: 'user-1' } } });
    spec = createMockSpec();
    observer = createSpecObserver(editor, spec);
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  const makeEvent = (keys, local = false) => ({
    transaction: { local },
    changes: {
      keys: new Map(Object.entries(keys)),
    },
  });

  it('ignores local transactions', () => {
    observer(makeEvent({ 'test-spec/root': { action: 'update' } }, true));
    expect(spec.applySection).not.toHaveBeenCalled();
  });

  it('ignores _version key changes', () => {
    observer(makeEvent({ _version: { action: 'add' } }));
    expect(spec.applySection).not.toHaveBeenCalled();
  });

  it('routes add changes to applyRemotePartSections', () => {
    observer(makeEvent({ 'test-spec/root': { action: 'add' } }));
    expect(spec.applySection).toHaveBeenCalled();
  });

  it('routes update changes to applyRemotePartSections', () => {
    observer(makeEvent({ 'test-spec/root': { action: 'update' } }));
    expect(spec.applySection).toHaveBeenCalled();
  });

  it('ignores delete changes', () => {
    observer(makeEvent({ 'test-spec/root': { action: 'delete' } }));
    expect(spec.applySection).not.toHaveBeenCalled();
  });

  it('does nothing when no relevant keys changed', () => {
    observer(makeEvent({ _version: { action: 'update' } }));
    expect(spec.applySection).not.toHaveBeenCalled();
    expect(editor.emit).not.toHaveBeenCalled();
  });

  it('handles multiple changed keys', () => {
    const channelMap = createMockYMap({
      'test-spec/sectionA': { data: 'a' },
      'test-spec/sectionB': { data: 'b' },
    });
    const ydoc = createMockYdoc({ testChannel: channelMap });
    editor = createMockEditor({ options: { ydoc, user: { id: 'user-1' } } });
    spec = createMockSpec();
    observer = createSpecObserver(editor, spec);

    observer(
      makeEvent({
        'test-spec/sectionA': { action: 'update' },
        'test-spec/sectionB': { action: 'add' },
      }),
    );

    expect(spec.applySection).toHaveBeenCalledTimes(2);
  });

  it('skips when ydoc has no map', () => {
    editor = createMockEditor({
      options: { ydoc: null, user: { id: 'user-1' } },
    });
    observer = createSpecObserver(editor, spec);

    observer(makeEvent({ 'test-spec/root': { action: 'update' } }));

    expect(spec.applySection).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// isApplyingRemotePart (integration with apply/clear cycle)
// ---------------------------------------------------------------------------

describe('isApplyingRemotePart', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('returns false when no guard has been set', () => {
    const editor = createMockEditor();
    expect(isApplyingRemotePart(editor, 'any-spec')).toBe(false);
  });

  it('returns true after applyRemotePartSections sets the guard', () => {
    const editor = createMockEditor();
    const spec = createMockSpec();
    const map = createMockYMap({ 'test-spec/root': { data: 'remote' } });

    applyRemotePartSections(editor, spec, map, ['test-spec/root']);

    expect(isApplyingRemotePart(editor, 'test-spec')).toBe(true);
  });

  it('returns false after timer clears the guard', () => {
    const editor = createMockEditor();
    const spec = createMockSpec();
    const map = createMockYMap({ 'test-spec/root': { data: 'remote' } });

    applyRemotePartSections(editor, spec, map, ['test-spec/root']);
    vi.runAllTimers();

    expect(isApplyingRemotePart(editor, 'test-spec')).toBe(false);
  });

  it('tracks guards independently per spec id', () => {
    const editor = createMockEditor();
    const specA = createMockSpec({ id: 'spec-a' });
    const specB = createMockSpec({ id: 'spec-b' });
    const mapA = createMockYMap({ 'test-spec/root': { data: 'remote' } });

    applyRemotePartSections(editor, specA, mapA, ['test-spec/root']);

    expect(isApplyingRemotePart(editor, 'spec-a')).toBe(true);
    expect(isApplyingRemotePart(editor, 'spec-b')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deleteRemotePartSections
// ---------------------------------------------------------------------------

describe('deleteRemotePartSections', () => {
  let editor;
  let spec;

  beforeEach(() => {
    vi.useFakeTimers();
    editor = createMockEditor();
    spec = createMockSpec({
      removeSection: vi.fn(),
    });
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('calls spec.removeSection for each recognized key', () => {
    deleteRemotePartSections(editor, spec, ['test-spec/root']);

    expect(spec.removeSection).toHaveBeenCalledWith(editor.converter, 'root');
  });

  it('calls afterApply with removed sections', () => {
    deleteRemotePartSections(editor, spec, ['test-spec/root']);

    expect(spec.afterApply).toHaveBeenCalledWith(editor, ['root']);
  });

  it('emits xmlPartChanged with source yjs.remote.delete', () => {
    deleteRemotePartSections(editor, spec, ['test-spec/root']);

    expect(editor.emit).toHaveBeenCalledWith('partChanged', {
      partId: 'test-spec',
      changedPaths: ['root'],
      source: 'yjs.remote.delete',
    });
  });

  it('skips keys where parseKey returns null', () => {
    deleteRemotePartSections(editor, spec, ['unknown-key']);

    expect(spec.removeSection).not.toHaveBeenCalled();
    expect(editor.emit).not.toHaveBeenCalled();
  });

  it('does nothing if spec has no removeSection', () => {
    spec = createMockSpec({ removeSection: undefined });

    deleteRemotePartSections(editor, spec, ['test-spec/root']);

    expect(editor.emit).not.toHaveBeenCalled();
  });

  it('does nothing if editor is destroyed', () => {
    editor.isDestroyed = true;

    deleteRemotePartSections(editor, spec, ['test-spec/root']);

    expect(spec.removeSection).not.toHaveBeenCalled();
  });

  it('does nothing if no converter', () => {
    editor.converter = null;

    deleteRemotePartSections(editor, spec, ['test-spec/root']);

    expect(spec.removeSection).not.toHaveBeenCalled();
  });

  it('sets and clears apply guard', () => {
    deleteRemotePartSections(editor, spec, ['test-spec/root']);

    expect(isApplyingRemotePart(editor, 'test-spec')).toBe(true);

    vi.runAllTimers();

    expect(isApplyingRemotePart(editor, 'test-spec')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// publishPartSections — deletion of stale keys
// ---------------------------------------------------------------------------

describe('publishPartSections — stale key deletion', () => {
  let editor;
  let spec;

  beforeEach(() => {
    editor = createMockEditor();
    spec = createMockSpec();
  });

  it('deletes stale keys from Y.Map on full publish (no sectionHints)', () => {
    // Set up Y.Map with a stale key that belongs to the spec but is not in listSections
    const channelMap = createMockYMap({
      'test-spec/root': { data: 'local' },
      'test-spec/staleSection': { data: 'old' },
    });
    const ydoc = createMockYdoc({ testChannel: channelMap });
    editor = createMockEditor({ options: { ydoc, user: { id: 'user-1' } } });
    // listSections only returns 'root', not 'staleSection'
    spec = createMockSpec({ listSections: vi.fn(() => ['root']) });

    publishPartSections(editor, spec);

    expect(channelMap.delete).toHaveBeenCalledWith('test-spec/staleSection');
  });

  it('does NOT delete stale keys when sectionHints is provided', () => {
    const channelMap = createMockYMap({
      'test-spec/root': { data: 'local' },
      'test-spec/staleSection': { data: 'old' },
    });
    const ydoc = createMockYdoc({ testChannel: channelMap });
    editor = createMockEditor({ options: { ydoc, user: { id: 'user-1' } } });
    spec = createMockSpec({ readSection: vi.fn(() => ({ data: 'new' })) });

    publishPartSections(editor, spec, ['root']);

    expect(channelMap.delete).not.toHaveBeenCalled();
  });

  it('combines writes and deletes in the same transact call', () => {
    const channelMap = createMockYMap({
      'test-spec/staleSection': { data: 'old' },
    });
    const ydoc = createMockYdoc({ testChannel: channelMap });
    editor = createMockEditor({ options: { ydoc, user: { id: 'user-1' } } });
    // readSection returns new data so 'root' is a write, 'staleSection' is a delete
    spec = createMockSpec({
      listSections: vi.fn(() => ['root']),
      readSection: vi.fn(() => ({ data: 'new' })),
    });

    publishPartSections(editor, spec);

    expect(ydoc.transact).toHaveBeenCalledOnce();
    expect(channelMap.set).toHaveBeenCalledWith('test-spec/root', expect.anything());
    expect(channelMap.delete).toHaveBeenCalledWith('test-spec/staleSection');
  });
});

// ---------------------------------------------------------------------------
// createSpecObserver — delete change routing
// ---------------------------------------------------------------------------

describe('createSpecObserver — delete routing', () => {
  let editor;
  let spec;
  let observer;

  beforeEach(() => {
    vi.useFakeTimers();
    const channelMap = createMockYMap({ 'test-spec/root': { data: 'remote' } });
    const ydoc = createMockYdoc({ testChannel: channelMap });
    editor = createMockEditor({ options: { ydoc, user: { id: 'user-1' } } });
    spec = createMockSpec({ removeSection: vi.fn() });
    observer = createSpecObserver(editor, spec);
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  const makeEvent = (keys, local = false) => ({
    transaction: { local },
    changes: {
      keys: new Map(Object.entries(keys)),
    },
  });

  it('routes delete changes to deleteRemotePartSections', () => {
    observer(makeEvent({ 'test-spec/root': { action: 'delete' } }));

    expect(spec.removeSection).toHaveBeenCalledWith(editor.converter, 'root');
  });
});

// ---------------------------------------------------------------------------
// hydrateOrSeedPart — late joiner
// ---------------------------------------------------------------------------

describe('hydrateOrSeedPart — late joiner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('hydrates remote keys even if listSections returns empty', () => {
    // Late joiner: the local converter has no sections for this spec,
    // but the Y.Map already has data from another collaborator.
    const channelMap = createMockYMap({
      _version: 1,
      'test-spec/root': { data: 'remote' },
    });
    const ydoc = createMockYdoc({ testChannel: channelMap });
    const editor = createMockEditor({ options: { ydoc, user: { id: 'user-1' } } });
    const spec = createMockSpec({
      listSections: vi.fn(() => []),
    });

    hydrateOrSeedPart(editor, spec);

    // Should still apply from the Y.Map keys rather than relying on listSections
    expect(spec.applySection).toHaveBeenCalledWith(
      editor.converter,
      'root',
      expect.objectContaining({ data: 'remote' }),
    );
  });
});

// ---------------------------------------------------------------------------
// EXCLUDED_PART_PATHS guard
// ---------------------------------------------------------------------------

describe('EXCLUDED_PART_PATHS guard', () => {
  const excludedSpec = () =>
    createMockSpec({
      id: 'document',
      partPath: 'word/document.xml',
      channel: 'ooxmlPartModels',
    });

  it('publishPartSections skips excluded partPath', () => {
    const editor = createMockEditor();
    const spec = excludedSpec();

    publishPartSections(editor, spec);

    expect(editor.options.ydoc.transact).not.toHaveBeenCalled();
    expect(spec.listSections).not.toHaveBeenCalled();
  });

  it('applyRemotePartSections skips excluded partPath', () => {
    vi.useFakeTimers();
    const editor = createMockEditor();
    const spec = excludedSpec();
    const map = createMockYMap({ 'document/root': { data: 'remote' } });

    applyRemotePartSections(editor, spec, map, ['document/root']);

    expect(spec.applySection).not.toHaveBeenCalled();
    expect(editor.emit).not.toHaveBeenCalled();
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('hydrateOrSeedPart skips excluded partPath', () => {
    vi.useFakeTimers();
    const channelMap = createMockYMap({ _version: 1, 'document/root': { data: 'remote' } });
    const ydoc = createMockYdoc({ ooxmlPartModels: channelMap });
    const editor = createMockEditor({ options: { ydoc, user: { id: 'user-1' } } });
    const spec = excludedSpec();

    hydrateOrSeedPart(editor, spec);

    expect(spec.applySection).not.toHaveBeenCalled();
    expect(spec.listSections).not.toHaveBeenCalled();
    vi.runAllTimers();
    vi.useRealTimers();
  });
});
