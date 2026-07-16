/**
 * Editor-neutral list counter manager. Mirrors v1
 * `super-editor/.../paragraph/NumberingManager.js` so word-layout marker text
 * matches v1 for abstract-id shared counters and `w:lvlOverride/@w:startOverride`
 * scoping.
 *
 * Behavior:
 * - counters are tracked per abstractId so multiple concrete `numId`s sharing
 *   the same abstract definition continue numbering across the document
 * - a per-`(numId, level)` `startOverridden` flag scopes counters back to the
 *   single concrete `numId` when an `lvlOverride/startOverride` is in play
 * - cache mode keeps the fast `lastSeen*` lookup path used by v1
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
  setCounter(numId: NumId, level: number, pos: number, value: number, abstractId?: string | number): void;
  getCounter(numId: NumId, level: number, pos: number): number | null;
  calculateCounter(numId: NumId, level: number, pos: number, abstractId?: string | number): number;
  getAncestorsPath(numId: NumId, level: number, pos: number): number[];
  calculatePath(numId: NumId, level: number, pos: number): number[];
  getCountersMap(): CounterMap;
  exportSnapshot(): NumberingManagerSnapshot;
  restoreSnapshot(snapshot: NumberingManagerSnapshot | null): void;
  _clearCache(): void;
  enableCache(): void;
  disableCache(): void;
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

  const clearRuntimeState = (): void => {
    countersMap = {};
    abstractCountersMap = {};
    abstractIdMap = {};
    lastSeenByAbstractIdMap = {};
    lastSeenByNumIdMap = {};
    pathCache = {};
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
      if (!startsMap[key]) startsMap[key] = {};
      startsMap[key][level] = {
        start: startValue,
        restart: restartValue,
        startOverridden,
      };
    },

    setCounter(numId, level, pos, value, abstractId): void {
      validateNumId(numId);
      validateLevel(level);
      validatePosition(pos);
      validateCounterValue(value);

      const key = toKey(numId);
      const abstractKey = abstractId != null ? toKey(abstractId) : toKey(abstractIdMap[key] ?? key);
      abstractIdMap[key] = abstractKey;

      if (!countersMap[key]) countersMap[key] = {};
      if (!countersMap[key][level]) countersMap[key][level] = {};
      countersMap[key][level][pos] = value;

      if (!abstractCountersMap[abstractKey]) abstractCountersMap[abstractKey] = {};
      if (!abstractCountersMap[abstractKey][level]) abstractCountersMap[abstractKey][level] = {};
      abstractCountersMap[abstractKey][level][pos] = value;

      // Invalidate ancestor path cache for this numId.
      delete pathCache[key];

      if (!cacheEnabled) return;
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
      return countersMap[key]?.[level]?.[pos] ?? null;
    },

    calculateCounter(numId, level, pos, abstractId): number {
      validateNumId(numId);
      validateLevel(level);
      validatePosition(pos);

      const key = toKey(numId);
      const abstractKey = abstractId != null ? toKey(abstractId) : toKey(abstractIdMap[key] ?? key);
      abstractIdMap[key] = abstractKey;

      const startValue = startsMap?.[key]?.[level]?.start ?? 1;
      const restartSetting = startsMap?.[key]?.[level]?.restart;
      const startOverridden = startsMap?.[key]?.[level]?.startOverridden ?? false;

      let previousPos: number | null = null;
      let previousCount = startValue - 1;

      if (cacheEnabled) {
        const cachedLast = startOverridden
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
        const lowerLevelData = effectiveAncestorLevelData(numId, lvl);
        const wasUsed = Object.keys(lowerLevelData)
          .map(Number)
          .some((p) => Number.isFinite(p) && p > previousPos! && p < pos);
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
        path.push(levelData[previousPos]);
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
        clearRuntimeState();
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

    _clearCache(): void {
      clearRuntimeState();
    },

    enableCache(): void {
      cacheEnabled = true;
      clearRuntimeState();
    },

    disableCache(): void {
      cacheEnabled = false;
      clearRuntimeState();
    },

    clearAllState(): void {
      startsMap = {};
      clearRuntimeState();
    },
  };
}
