/**
 * Editor-neutral list counter manager. Keeps word-layout marker text stable for
 * abstract-id shared counters and `w:lvlOverride/@w:startOverride` scoping.
 *
 * Behavior:
 * - counters are tracked per abstractId so multiple concrete `numId`s sharing
 *   the same abstract definition continue numbering across the document
 * - a per-`(numId, level)` `startOverridden` flag scopes counters back to the
 *   single concrete `numId` when an `lvlOverride/startOverride` is in play
 * - cache mode keeps the fast `lastSeen*` lookup path used by runtime adapters
 */

type NumId = string | number;
type Level = number;
type Position = number;
type CounterValue = number;

type CounterLevelMap = Record<Position, CounterValue>;
type CounterMap = Record<string, Record<Level, CounterLevelMap>>;

type StartSettings = {
  start: number;
  restart?: number;
  startOverridden?: boolean;
};

type StartsMap = Record<string, Record<Level, StartSettings>>;
type PathCache = Record<string, Record<Level, Record<Position, number[]>>>;
type LastSeenMap = Record<string, Record<Level, { pos: number; count: number }>>;

/**
 * Same-realm brand for numbering cursors. Applied as a non-enumerable
 * Symbol-keyed property so `structuredClone` (which drops Symbol keys) yields an
 * object our `restoreCursor` refuses. This enforces the "no numbering cursor
 * crosses a worker/page boundary" invariant structurally, without a runtime
 * serialization check.
 */
const NUMBERING_CURSOR_BRAND = Symbol('word-layout/numbering-cursor');

/**
 * Opaque, same-realm numbering cursor. Its payload is one immutable persistent
 * state root, so capture and restore are O(1); unchanged numbering scopes are
 * structurally shared across every retained cursor. Restore is valid only
 * within the JS realm that captured it and only in compact mode.
 */
export interface NumberingCursor {
  readonly __wordLayoutNumberingCursor: true;
}

interface NumberingCursorPayload {
  readonly state: CompactNumberingState;
}

/**
 * A small persistent hash trie used only by the compact numbering machine.
 * Every update copies one fixed-depth path while sharing every untouched
 * branch. A cursor therefore retains one immutable root pointer rather than a
 * clone of every active numbering scope.
 */
type PersistentTrieNode<Value> = PersistentTrieBranch<Value> | PersistentTrieLeaf<Value>;

interface PersistentTrieBranch<Value> {
  readonly kind: 'branch';
  readonly children: ReadonlyArray<PersistentTrieNode<Value> | undefined>;
}

interface PersistentTrieLeaf<Value> {
  readonly kind: 'leaf';
  readonly entries: ReadonlyArray<readonly [string, Value]>;
}

interface PersistentTrieUpdate<Value> {
  readonly root: PersistentTrieNode<Value>;
  readonly allocatedNodes: number;
}

const PERSISTENT_TRIE_BITS = 4;
const PERSISTENT_TRIE_MASK = (1 << PERSISTENT_TRIE_BITS) - 1;
const PERSISTENT_TRIE_DEPTH = 32 / PERSISTENT_TRIE_BITS;

function persistentTrieHash(key: string): number {
  // FNV-1a, kept local so the cursor representation has no package dependency.
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function persistentTrieGet<Value>(root: PersistentTrieNode<Value> | null, key: string): Value | undefined {
  if (!root) return undefined;
  const hash = persistentTrieHash(key);
  let node: PersistentTrieNode<Value> | undefined = root;
  for (let depth = 0; depth < PERSISTENT_TRIE_DEPTH; depth += 1) {
    if (!node || node.kind !== 'branch') return undefined;
    node = node.children[(hash >>> (depth * PERSISTENT_TRIE_BITS)) & PERSISTENT_TRIE_MASK];
  }
  if (!node || node.kind !== 'leaf') return undefined;
  return node.entries.find(([entryKey]) => entryKey === key)?.[1];
}

function persistentTrieSet<Value>(
  root: PersistentTrieNode<Value> | null,
  key: string,
  value: Value,
): PersistentTrieUpdate<Value> {
  const hash = persistentTrieHash(key);

  function update(node: PersistentTrieNode<Value> | undefined, depth: number): PersistentTrieUpdate<Value> {
    if (depth === PERSISTENT_TRIE_DEPTH) {
      const entries = node?.kind === 'leaf' ? [...node.entries] : [];
      const existingIndex = entries.findIndex(([entryKey]) => entryKey === key);
      if (existingIndex >= 0) entries[existingIndex] = [key, value];
      else entries.push([key, value]);
      return { root: { kind: 'leaf', entries }, allocatedNodes: 1 };
    }

    const childIndex = (hash >>> (depth * PERSISTENT_TRIE_BITS)) & PERSISTENT_TRIE_MASK;
    const children = node?.kind === 'branch' ? [...node.children] : [];
    const child = update(children[childIndex], depth + 1);
    children[childIndex] = child.root;
    return {
      root: { kind: 'branch', children },
      allocatedNodes: child.allocatedNodes + 1,
    };
  }

  return update(root ?? undefined, 0);
}

function* persistentTrieEntries<Value>(
  root: PersistentTrieNode<Value> | null,
): IterableIterator<readonly [string, Value]> {
  if (!root) return;
  if (root.kind === 'leaf') {
    yield* root.entries;
    return;
  }
  for (const child of root.children) {
    if (child) yield* persistentTrieEntries(child);
  }
}

interface CompactNumberingState {
  readonly starts: PersistentTrieNode<StartSettings> | null;
  readonly abstractIds: PersistentTrieNode<string> | null;
  readonly lastSeenByAbstractId: PersistentTrieNode<{ pos: number; count: number }> | null;
  readonly lastSeenByNumId: PersistentTrieNode<{ pos: number; count: number }> | null;
  /** Diagnostic allocation count for deterministic linear-growth tests. */
  readonly allocatedNodes: number;
}

const EMPTY_COMPACT_STATE: CompactNumberingState = Object.freeze({
  starts: null,
  abstractIds: null,
  lastSeenByAbstractId: null,
  lastSeenByNumId: null,
  allocatedNodes: 0,
});

function compactScopedLevelKey(scope: string, level: number): string {
  return JSON.stringify([scope, level]);
}

const validateNumId = (numId: NumId): void => {
  if (typeof numId === 'string') {
    if (numId.trim().length === 0) {
      throw new Error('Invalid numId: empty string. NumId must be a non-empty string or number.');
    }
    return;
  }
  if (typeof numId === 'number') {
    if (!Number.isFinite(numId)) {
      throw new Error(`Invalid numId: ${String(numId)}. NumId must be a finite number.`);
    }
    return;
  }
  throw new Error('Invalid numId. NumId must be a non-empty string or number.');
};

const validateLevel = (level: number): void => {
  if (!Number.isFinite(level) || level < 0) {
    throw new Error(`Invalid level: ${String(level)}. Level must be a non-negative finite number.`);
  }
};

const validatePosition = (pos: number): void => {
  if (!Number.isFinite(pos) || pos < 0) {
    throw new Error(`Invalid position: ${String(pos)}. Position must be a non-negative finite number.`);
  }
};

const validateStartValue = (value: number): void => {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid startValue: ${String(value)}. Start value must be a finite number.`);
  }
};

const validateRestartValue = (value: number): void => {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid restartValue: ${String(value)}. Restart value must be a finite number.`);
  }
};

const validateCounterValue = (value: number): void => {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid value: ${String(value)}. Value must be a finite number.`);
  }
};

const toKey = (id: NumId | string | number | undefined): string => String(id);

const safeIncrement = (value: number): number => {
  const next = value + 1;
  if (!Number.isSafeInteger(next)) {
    throw new Error('Counter overflow');
  }
  return next;
};

export interface NumberingManager {
  setStartSettings(
    numId: NumId,
    level: number,
    startValue: number,
    restartValue?: number,
    startOverridden?: boolean,
  ): void;
  ensureStartSettings(
    numId: NumId,
    level: number,
    startValue: number,
    restartValue?: number,
    startOverridden?: boolean,
  ): void;
  setCounter(numId: NumId, level: number, pos: number, value: number, abstractId?: string | number): void;
  getCounter(numId: NumId, level: number, pos: number): number | null;
  calculateCounter(numId: NumId, level: number, pos: number, abstractId?: string | number): number;
  getAncestorsPath(numId: NumId, level: number, pos: number): number[];
  calculatePath(numId: NumId, level: number, pos: number): number[];
  getCountersMap(): CounterMap;
  exportSnapshot(): NumberingManagerSnapshot;
  restoreSnapshot(snapshot: NumberingManagerSnapshot | null): void;
  /**
   * Capture a compact, same-realm cursor of current numbering state in O(1).
   * The returned token is opaque and non-serializable by contract: passing it
   * through `structuredClone` or a worker boundary strips its brand and
   * `restoreCursor` rejects it. Throws unless compact mode is enabled.
   */
  captureCursor(): NumberingCursor;
  /**
   * Restore state in O(1) from a cursor produced in the same realm. Throws on a
   * foreign/serialized cursor or when compact mode is not enabled; `null`
   * resets to the empty state.
   */
  restoreCursor(cursor: NumberingCursor | null): void;
  _clearCache(): void;
  enableCache(): void;
  disableCache(): void;
  /**
   * Enable compact (cursor-timeline) mode: the cache-fast lookup path PLUS
   * suppression of the historical per-position counter maps and the
   * position-keyed path cache. Sequential queries are served from last-seen
   * facts. Current state is linear in active scopes, while retained cursors add
   * only fixed-depth structurally shared transitions. Arbitrary past-position
   * `getCounter` queries are not answerable in this mode; callers needing them
   * must use the default (non-compact) mode.
   */
  enableCompactMode(): void;
  clearAllState(): void;
}

export interface NumberingManagerSnapshot {
  startsMap: StartsMap;
  countersMap: CounterMap;
  abstractCountersMap: CounterMap;
  abstractIdMap: Record<string, string | undefined>;
  lastSeenByAbstractIdMap: LastSeenMap;
  lastSeenByNumIdMap: LastSeenMap;
}

export function createNumberingManager(): NumberingManager {
  // Per-numId counters (used when startOverridden scopes counters to a single
  // concrete numId).
  let countersMap: CounterMap = {};
  // Per-abstractId counters (default lookup — used so multiple numIds sharing
  // the same abstract definition share counters across the document).
  let abstractCountersMap: CounterMap = {};
  // numId → abstractId mapping recorded by setCounter / calculateCounter.
  let abstractIdMap: Record<string, string | undefined> = {};

  // startsMap is per concrete numId, mirroring the OOXML model where
  // `w:lvlOverride` (with or without `w:startOverride`) is attached to a
  // concrete `w:num`.
  let startsMap: StartsMap = {};

  let lastSeenByAbstractIdMap: LastSeenMap = {};
  let lastSeenByNumIdMap: LastSeenMap = {};
  let pathCache: PathCache = {};
  let cacheEnabled = false;
  // Compact (cursor-timeline) mode. Implies `cacheEnabled`. Suppresses the
  // per-position counter maps and path cache, which are the O(document) growers
  // behind the full-document projection crash; sequential numbering is answered
  // from the last-seen facts instead.
  let compact = false;
  let compactState = EMPTY_COMPACT_STATE;

  function compactStartSettings(numId: NumId, level: number): StartSettings | undefined {
    return persistentTrieGet(compactState.starts, compactScopedLevelKey(toKey(numId), level));
  }

  function compactAbstractId(numId: NumId): string | undefined {
    return persistentTrieGet(compactState.abstractIds, toKey(numId));
  }

  function compactLastSeen(
    root: CompactNumberingState['lastSeenByAbstractId'] | CompactNumberingState['lastSeenByNumId'],
    scope: string,
    level: number,
  ): { pos: number; count: number } | undefined {
    return persistentTrieGet(root, compactScopedLevelKey(scope, level));
  }

  function updateCompactState<
    Key extends keyof Pick<
      CompactNumberingState,
      'starts' | 'abstractIds' | 'lastSeenByAbstractId' | 'lastSeenByNumId'
    >,
  >(
    key: Key,
    update: PersistentTrieUpdate<
      NonNullable<CompactNumberingState[Key]> extends PersistentTrieNode<infer Value> ? Value : never
    >,
  ): void {
    compactState = {
      ...compactState,
      [key]: update.root,
      allocatedNodes: compactState.allocatedNodes + update.allocatedNodes,
    };
  }

  function setCompactStartSettings(numId: NumId, level: number, value: StartSettings): void {
    const existing = compactStartSettings(numId, level);
    if (
      existing?.start === value.start &&
      existing.restart === value.restart &&
      existing.startOverridden === value.startOverridden
    ) {
      return;
    }
    updateCompactState(
      'starts',
      persistentTrieSet(compactState.starts, compactScopedLevelKey(toKey(numId), level), value),
    );
  }

  function setCompactAbstractId(numId: NumId, abstractId: string): void {
    const key = toKey(numId);
    if (compactAbstractId(key) === abstractId) return;
    updateCompactState('abstractIds', persistentTrieSet(compactState.abstractIds, key, abstractId));
  }

  function setCompactLastSeen(
    key: 'lastSeenByAbstractId' | 'lastSeenByNumId',
    scope: string,
    level: number,
    value: { pos: number; count: number },
  ): void {
    updateCompactState(key, persistentTrieSet(compactState[key], compactScopedLevelKey(scope, level), value));
  }

  function materializeCompactState(): Pick<
    NumberingManagerSnapshot,
    'startsMap' | 'abstractIdMap' | 'lastSeenByAbstractIdMap' | 'lastSeenByNumIdMap'
  > {
    const materializedStarts: StartsMap = {};
    for (const [encodedKey, settings] of persistentTrieEntries(compactState.starts)) {
      const [scope, level] = JSON.parse(encodedKey) as [string, number];
      if (!materializedStarts[scope]) materializedStarts[scope] = {};
      materializedStarts[scope][level] = { ...settings };
    }
    const materializedAbstractIds: Record<string, string | undefined> = {};
    for (const [scope, abstractId] of persistentTrieEntries(compactState.abstractIds)) {
      materializedAbstractIds[scope] = abstractId;
    }
    const materializeLastSeen = (
      root: CompactNumberingState['lastSeenByAbstractId'] | CompactNumberingState['lastSeenByNumId'],
    ): LastSeenMap => {
      const result: LastSeenMap = {};
      for (const [encodedKey, fact] of persistentTrieEntries(root)) {
        const [scope, level] = JSON.parse(encodedKey) as [string, number];
        if (!result[scope]) result[scope] = {};
        result[scope][level] = { ...fact };
      }
      return result;
    };
    return {
      startsMap: materializedStarts,
      abstractIdMap: materializedAbstractIds,
      lastSeenByAbstractIdMap: materializeLastSeen(compactState.lastSeenByAbstractId),
      lastSeenByNumIdMap: materializeLastSeen(compactState.lastSeenByNumId),
    };
  }

  function restoreCompactState(snapshot: NumberingManagerSnapshot): void {
    compactState = EMPTY_COMPACT_STATE;
    for (const [scope, levels] of Object.entries(snapshot.startsMap)) {
      for (const [level, settings] of Object.entries(levels)) {
        setCompactStartSettings(scope, Number(level), { ...settings });
      }
    }
    for (const [scope, abstractId] of Object.entries(snapshot.abstractIdMap)) {
      if (abstractId != null) setCompactAbstractId(scope, abstractId);
    }
    for (const [scope, levels] of Object.entries(snapshot.lastSeenByAbstractIdMap)) {
      for (const [level, fact] of Object.entries(levels)) {
        setCompactLastSeen('lastSeenByAbstractId', scope, Number(level), { ...fact });
      }
    }
    for (const [scope, levels] of Object.entries(snapshot.lastSeenByNumIdMap)) {
      for (const [level, fact] of Object.entries(levels)) {
        setCompactLastSeen('lastSeenByNumId', scope, Number(level), { ...fact });
      }
    }
  }

  const clearRuntimeState = (): void => {
    countersMap = {};
    abstractCountersMap = {};
    abstractIdMap = {};
    lastSeenByAbstractIdMap = {};
    lastSeenByNumIdMap = {};
    pathCache = {};
    if (compact) {
      compactState = {
        starts: compactState.starts,
        abstractIds: null,
        lastSeenByAbstractId: null,
        lastSeenByNumId: null,
        allocatedNodes: compactState.allocatedNodes,
      };
    }
  };

  function effectiveLevelData(numId: NumId, level: number): CounterLevelMap {
    const key = toKey(numId);
    const startOverridden = startsMap?.[key]?.[level]?.startOverridden ?? false;
    if (startOverridden) {
      return countersMap[key]?.[level] ?? {};
    }
    const abstractKey = toKey(abstractIdMap[key]);
    return abstractCountersMap[abstractKey]?.[level] ?? {};
  }

  function effectiveAncestorLevelData(numId: NumId, level: number): CounterLevelMap {
    // For ancestor path walking, mirror v1: walk abstract-level data so paths
    // include counters from sibling numIds that share the same abstract id.
    const key = toKey(numId);
    const startOverridden = startsMap?.[key]?.[level]?.startOverridden ?? false;
    if (startOverridden) {
      return countersMap[key]?.[level] ?? {};
    }
    const abstractKey = toKey(abstractIdMap[key]);
    return abstractCountersMap[abstractKey]?.[level] ?? {};
  }

  /**
   * Compact-mode analogue of `effectiveAncestorLevelData`: the single last-seen
   * counter fact for `(numId, lvl)`, scoped exactly like the position-map lookup
   * (per-numId when that lower level is `startOverridden`, else the shared
   * abstract scope). Sufficient for forward projection because positions advance
   * monotonically, so the last-seen entry is always the newest position strictly
   * below the paragraph currently being numbered.
   */
  function ancestorLastSeen(numId: NumId, lvl: number): { pos: number; count: number } | undefined {
    const key = toKey(numId);
    const startOverridden = compact
      ? (compactStartSettings(key, lvl)?.startOverridden ?? false)
      : (startsMap?.[key]?.[lvl]?.startOverridden ?? false);
    if (startOverridden) {
      if (compact) return compactLastSeen(compactState.lastSeenByNumId, key, lvl);
      return lastSeenByNumIdMap[key]?.[lvl];
    }
    const abstractKey = compact ? toKey(compactAbstractId(key)) : toKey(abstractIdMap[key]);
    if (compact) return compactLastSeen(compactState.lastSeenByAbstractId, abstractKey, lvl);
    return lastSeenByAbstractIdMap[abstractKey]?.[lvl];
  }

  function getPreviousFromMap(
    levelData: CounterLevelMap,
    pos: number,
  ): { previousPos: number | null; previousCount: number } {
    let previousPos: number | null = null;
    for (const key of Object.keys(levelData)) {
      const candidate = Number(key);
      if (!Number.isFinite(candidate) || candidate >= pos) continue;
      if (previousPos == null || candidate > previousPos) {
        previousPos = candidate;
      }
    }
    if (previousPos == null) return { previousPos: null, previousCount: 0 };
    return { previousPos, previousCount: levelData[previousPos] ?? 0 };
  }

  return {
    setStartSettings(numId, level, startValue, restartValue, startOverridden = false): void {
      validateNumId(numId);
      validateLevel(level);
      validateStartValue(startValue);
      if (restartValue != null) {
        validateRestartValue(restartValue);
      }
      const key = toKey(numId);
      const settings: StartSettings = {
        start: startValue,
        ...(restartValue != null ? { restart: restartValue } : {}),
        startOverridden,
      };
      if (compact) {
        setCompactStartSettings(key, level, settings);
        return;
      }
      if (!startsMap[key]) startsMap[key] = {};
      startsMap[key][level] = settings;
    },

    ensureStartSettings(numId, level, startValue, restartValue, startOverridden = false): void {
      validateNumId(numId);
      validateLevel(level);
      validateStartValue(startValue);
      if (restartValue != null) {
        validateRestartValue(restartValue);
      }
      const key = toKey(numId);
      const settings: StartSettings = {
        start: startValue,
        ...(restartValue != null ? { restart: restartValue } : {}),
        startOverridden,
      };
      // Register-if-absent: never clobber an existing start setting (e.g. one
      // already written by setStartSettings for an emitted paragraph). This
      // primes ancestor-level fallback starts without overwriting real state.
      if (compact) {
        if (compactStartSettings(key, level) != null) return;
        setCompactStartSettings(key, level, settings);
        return;
      }
      if (startsMap[key]?.[level] != null) return;
      if (!startsMap[key]) startsMap[key] = {};
      startsMap[key][level] = settings;
    },

    setCounter(numId, level, pos, value, abstractId): void {
      validateNumId(numId);
      validateLevel(level);
      validatePosition(pos);
      validateCounterValue(value);

      const key = toKey(numId);
      const abstractKey =
        abstractId != null
          ? toKey(abstractId)
          : compact
            ? toKey(compactAbstractId(key) ?? key)
            : toKey(abstractIdMap[key] ?? key);
      if (compact) setCompactAbstractId(key, abstractKey);
      else abstractIdMap[key] = abstractKey;

      // Compact (cursor-timeline) mode keeps only the last-seen facts recorded
      // below; the historical per-position counter maps and the position-keyed
      // path cache are exactly what grow O(document), so they are skipped.
      if (!compact) {
        if (!countersMap[key]) countersMap[key] = {};
        if (!countersMap[key][level]) countersMap[key][level] = {};
        countersMap[key][level][pos] = value;

        if (!abstractCountersMap[abstractKey]) abstractCountersMap[abstractKey] = {};
        if (!abstractCountersMap[abstractKey][level]) abstractCountersMap[abstractKey][level] = {};
        abstractCountersMap[abstractKey][level][pos] = value;

        // Invalidate ancestor path cache for this numId.
        delete pathCache[key];
      }

      if (!cacheEnabled) return;
      if (compact) {
        const lastSeenAbs = compactLastSeen(compactState.lastSeenByAbstractId, abstractKey, level);
        if (!lastSeenAbs || pos > lastSeenAbs.pos) {
          setCompactLastSeen('lastSeenByAbstractId', abstractKey, level, { pos, count: value });
        }
        const lastSeenNum = compactLastSeen(compactState.lastSeenByNumId, key, level);
        if (!lastSeenNum || pos > lastSeenNum.pos) {
          setCompactLastSeen('lastSeenByNumId', key, level, { pos, count: value });
        }
        return;
      }
      if (!lastSeenByAbstractIdMap[abstractKey]) lastSeenByAbstractIdMap[abstractKey] = {};
      const lastSeenAbs = lastSeenByAbstractIdMap[abstractKey][level];
      if (!lastSeenAbs || pos > lastSeenAbs.pos) {
        lastSeenByAbstractIdMap[abstractKey][level] = { pos, count: value };
      }
      if (!lastSeenByNumIdMap[key]) lastSeenByNumIdMap[key] = {};
      const lastSeenNum = lastSeenByNumIdMap[key][level];
      if (!lastSeenNum || pos > lastSeenNum.pos) {
        lastSeenByNumIdMap[key][level] = { pos, count: value };
      }
    },

    getCounter(numId, level, pos): number | null {
      validateNumId(numId);
      validateLevel(level);
      validatePosition(pos);
      const key = toKey(numId);
      if (compact) {
        // Only the current (just-set) position is answerable in compact mode —
        // which is all `calculatePath` asks for. Historical positions are not
        // retained.
        const lsNum = compactLastSeen(compactState.lastSeenByNumId, key, level);
        if (lsNum && lsNum.pos === pos) return lsNum.count;
        const abstractKey = toKey(compactAbstractId(key));
        const lsAbs = compactLastSeen(compactState.lastSeenByAbstractId, abstractKey, level);
        if (lsAbs && lsAbs.pos === pos) return lsAbs.count;
        return null;
      }
      return countersMap[key]?.[level]?.[pos] ?? null;
    },

    calculateCounter(numId, level, pos, abstractId): number {
      validateNumId(numId);
      validateLevel(level);
      validatePosition(pos);

      const key = toKey(numId);
      const abstractKey =
        abstractId != null
          ? toKey(abstractId)
          : compact
            ? toKey(compactAbstractId(key) ?? key)
            : toKey(abstractIdMap[key] ?? key);
      if (compact) setCompactAbstractId(key, abstractKey);
      else abstractIdMap[key] = abstractKey;

      const startSettings = compact ? compactStartSettings(key, level) : startsMap?.[key]?.[level];
      const startValue = startSettings?.start ?? 1;
      const restartSetting = startSettings?.restart;
      const startOverridden = startSettings?.startOverridden ?? false;

      let previousPos: number | null = null;
      let previousCount = startValue - 1;

      if (cacheEnabled) {
        const cachedLast = compact
          ? startOverridden
            ? compactLastSeen(compactState.lastSeenByNumId, key, level)
            : compactLastSeen(compactState.lastSeenByAbstractId, abstractKey, level)
          : startOverridden
            ? lastSeenByNumIdMap?.[key]?.[level]
            : lastSeenByAbstractIdMap?.[abstractKey]?.[level];
        if (cachedLast && cachedLast.pos < pos) {
          previousPos = cachedLast.pos;
          previousCount = cachedLast.count;
        }
      }

      if (previousPos == null && !cacheEnabled) {
        const levelData = effectiveLevelData(numId, level);
        const prev = getPreviousFromMap(levelData, pos);
        if (prev.previousPos != null) {
          previousPos = prev.previousPos;
          previousCount = prev.previousCount;
        }
      }

      if (restartSetting === 0) {
        return safeIncrement(previousCount);
      }

      if (previousPos == null) {
        return startValue;
      }

      const usedLevels: number[] = [];
      for (let lvl = 0; lvl < level; lvl++) {
        let wasUsed: boolean;
        if (compact) {
          // Forward invariant: the last-seen lower-level position is the newest
          // one below `pos`, so "a lower level was used since previousPos" is
          // exactly "its last-seen position falls in (previousPos, pos)".
          const ls = ancestorLastSeen(numId, lvl);
          wasUsed = ls != null && ls.pos > previousPos! && ls.pos < pos;
        } else {
          const lowerLevelData = effectiveAncestorLevelData(numId, lvl);
          wasUsed = Object.keys(lowerLevelData)
            .map(Number)
            .some((p) => Number.isFinite(p) && p > previousPos! && p < pos);
        }
        if (wasUsed) usedLevels.push(lvl);
      }

      if (usedLevels.length === 0) {
        return safeIncrement(previousCount);
      }

      if (restartSetting == null) {
        return startValue;
      }

      const shouldRestart = usedLevels.some((lvl) => lvl <= restartSetting);
      if (shouldRestart) {
        return startValue;
      }

      return safeIncrement(previousCount);
    },

    getAncestorsPath(numId, level, pos): number[] {
      validateNumId(numId);
      validateLevel(level);
      validatePosition(pos);

      const key = toKey(numId);

      if (compact) {
        // Ancestor counters are the current last-seen count at each lower level
        // (all recorded positions are < pos under the forward invariant). No
        // per-position path cache — it is one of the O(document) growers.
        const path: number[] = [];
        for (let lvl = 0; lvl < level; lvl++) {
          const startCount = compactStartSettings(key, lvl)?.start ?? 1;
          const ls = ancestorLastSeen(numId, lvl);
          path.push(ls != null && ls.pos < pos ? ls.count : startCount);
        }
        return path;
      }

      if (cacheEnabled) {
        const cached = pathCache[key]?.[level]?.[pos];
        if (cached) return [...cached];
      }

      const path: number[] = [];
      for (let lvl = 0; lvl < level; lvl++) {
        const startCount = startsMap?.[key]?.[lvl]?.start ?? 1;
        const levelData = effectiveAncestorLevelData(numId, lvl);
        const previousPositions = Object.keys(levelData)
          .map(Number)
          .filter((p) => Number.isFinite(p) && p < pos)
          .sort((a, b) => a - b);
        if (previousPositions.length === 0) {
          path.push(startCount);
          continue;
        }
        const previousPos = previousPositions[previousPositions.length - 1];
        if (previousPos == null) {
          path.push(startCount);
          continue;
        }
        path.push(levelData[previousPos] ?? startCount);
      }

      if (cacheEnabled) {
        if (!pathCache[key]) pathCache[key] = {};
        if (!pathCache[key][level]) pathCache[key][level] = {};
        pathCache[key][level][pos] = [...path];
      }
      return path;
    },

    calculatePath(numId, level, pos): number[] {
      validateNumId(numId);
      validateLevel(level);
      validatePosition(pos);
      const path = this.getAncestorsPath(numId, level, pos);
      const myCounter = this.getCounter(numId, level, pos);
      if (myCounter != null) {
        path.push(myCounter);
      }
      return path;
    },

    getCountersMap(): CounterMap {
      return countersMap;
    },

    exportSnapshot(): NumberingManagerSnapshot {
      if (compact) {
        const materialized = materializeCompactState();
        return structuredClone({
          ...materialized,
          countersMap: {},
          abstractCountersMap: {},
        });
      }
      return structuredClone({
        startsMap,
        countersMap,
        abstractCountersMap,
        abstractIdMap,
        lastSeenByAbstractIdMap,
        lastSeenByNumIdMap,
      });
    },

    restoreSnapshot(snapshot: NumberingManagerSnapshot | null): void {
      if (!snapshot) {
        startsMap = {};
        compactState = EMPTY_COMPACT_STATE;
        clearRuntimeState();
        return;
      }
      if (compact) {
        restoreCompactState(snapshot);
        startsMap = {};
        countersMap = {};
        abstractCountersMap = {};
        abstractIdMap = {};
        lastSeenByAbstractIdMap = {};
        lastSeenByNumIdMap = {};
        pathCache = {};
        return;
      }
      startsMap = structuredClone(snapshot.startsMap);
      countersMap = structuredClone(snapshot.countersMap);
      abstractCountersMap = structuredClone(snapshot.abstractCountersMap);
      abstractIdMap = structuredClone(snapshot.abstractIdMap);
      lastSeenByAbstractIdMap = structuredClone(snapshot.lastSeenByAbstractIdMap);
      lastSeenByNumIdMap = structuredClone(snapshot.lastSeenByNumIdMap);
      pathCache = {};
    },

    captureCursor(): NumberingCursor {
      if (!compact) {
        throw new Error('captureCursor: compact mode is required; call enableCompactMode() first');
      }
      // O(1): immutable trie roots are shared with the manager and all prior
      // cursors. Subsequent mutations replace only one fixed-depth path.
      const payload = {} as NumberingCursorPayload;
      Object.defineProperty(payload, 'state', {
        value: compactState,
        enumerable: false,
        configurable: false,
        writable: false,
      });
      // Brand as a non-enumerable Symbol-keyed prop: a same-realm identity that
      // does not survive structuredClone (Symbol keys are dropped), so a cursor
      // that crossed a worker/page boundary is rejected by restoreCursor.
      Object.defineProperty(payload, NUMBERING_CURSOR_BRAND, {
        value: true,
        enumerable: false,
        configurable: false,
        writable: false,
      });
      return Object.freeze(payload) as unknown as NumberingCursor;
    },

    restoreCursor(cursor): void {
      if (!compact) {
        throw new Error('restoreCursor: compact mode is required; call enableCompactMode() first');
      }
      if (!cursor) {
        startsMap = {};
        compactState = EMPTY_COMPACT_STATE;
        clearRuntimeState();
        return;
      }
      if (!(cursor as unknown as Record<symbol, unknown>)[NUMBERING_CURSOR_BRAND]) {
        throw new Error('restoreCursor: foreign or serialized numbering cursor rejected (missing same-realm brand)');
      }
      const payload = cursor as unknown as NumberingCursorPayload;
      compactState = payload.state;
      // Position maps stay empty in cursor mode; sequential queries use the
      // last-seen facts restored above.
      countersMap = {};
      abstractCountersMap = {};
      pathCache = {};
    },

    _clearCache(): void {
      clearRuntimeState();
    },

    enableCache(): void {
      if (compact) {
        startsMap = materializeCompactState().startsMap;
      }
      cacheEnabled = true;
      compact = false;
      compactState = EMPTY_COMPACT_STATE;
      clearRuntimeState();
    },

    disableCache(): void {
      if (compact) {
        startsMap = materializeCompactState().startsMap;
      }
      cacheEnabled = false;
      compact = false;
      compactState = EMPTY_COMPACT_STATE;
      clearRuntimeState();
    },

    enableCompactMode(): void {
      const startsToCarry = compact ? materializeCompactState().startsMap : structuredClone(startsMap);
      cacheEnabled = true;
      compact = true;
      compactState = EMPTY_COMPACT_STATE;
      clearRuntimeState();
      startsMap = {};
      for (const [scope, levels] of Object.entries(startsToCarry)) {
        for (const [level, settings] of Object.entries(levels)) {
          setCompactStartSettings(scope, Number(level), { ...settings });
        }
      }
    },

    clearAllState(): void {
      startsMap = {};
      compactState = EMPTY_COMPACT_STATE;
      clearRuntimeState();
    },
  };
}
