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

const toKey = (numId: NumId): string => String(numId);

const getPreviousCounter = (
  levelData: CounterLevelMap | undefined,
  pos: number,
): { previousPos: number | null; previousCount: number } => {
  if (!levelData) return { previousPos: null, previousCount: 0 };

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
};

const safeIncrement = (value: number): number => {
  const next = value + 1;
  if (!Number.isSafeInteger(next)) {
    throw new Error('Counter overflow');
  }
  return next;
};

export function createNumberingManager() {
  let countersMap: CounterMap = {};
  let startsMap: StartsMap = {};
  let pathCache: PathCache = {};
  let cacheEnabled = false;
  let abstractIdMap: Record<string, string | number | undefined> = {};

  const clearRuntimeState = (): void => {
    countersMap = {};
    pathCache = {};
    abstractIdMap = {};
  };

  return {
    setStartSettings(
      numId: NumId,
      level: number,
      startValue: number,
      restartValue?: number,
      startOverridden = false,
    ): void {
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

    setCounter(numId: NumId, level: number, pos: number, value: number, abstractId?: string | number): void {
      validateNumId(numId);
      validateLevel(level);
      validatePosition(pos);
      validateCounterValue(value);

      const key = toKey(numId);
      abstractIdMap[key] = abstractId;

      if (!countersMap[key]) countersMap[key] = {};
      if (!countersMap[key][level]) countersMap[key][level] = {};
      countersMap[key][level][pos] = value;

      // New counters can affect ancestor paths.
      delete pathCache[key];
    },

    getCounter(numId: NumId, level: number, pos: number): number | null {
      validateNumId(numId);
      validateLevel(level);
      validatePosition(pos);

      const key = toKey(numId);
      return countersMap[key]?.[level]?.[pos] ?? null;
    },

    calculateCounter(numId: NumId, level: number, pos: number, abstractId?: string | number): number {
      validateNumId(numId);
      validateLevel(level);
      validatePosition(pos);

      const key = toKey(numId);
      abstractIdMap[key] = abstractId;

      const startValue = startsMap[key]?.[level]?.start ?? 1;
      const restartSetting = startsMap[key]?.[level]?.restart;
      const levelData = countersMap[key]?.[level];

      const { previousPos, previousCount: rawPreviousCount } = getPreviousCounter(levelData, pos);
      const previousCount = previousPos == null ? startValue - 1 : rawPreviousCount;

      if (restartSetting === 0) {
        return safeIncrement(previousCount);
      }

      if (previousPos == null) {
        return startValue;
      }

      const usedLevels: number[] = [];
      const numCounters = countersMap[key] ?? {};
      for (let lvl = 0; lvl < level; lvl++) {
        const lowerLevelData = numCounters[lvl];
        if (!lowerLevelData) continue;

        const wasUsed = Object.keys(lowerLevelData)
          .map(Number)
          .some((p) => Number.isFinite(p) && p > previousPos && p < pos);

        if (wasUsed) {
          usedLevels.push(lvl);
        }
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

    getAncestorsPath(numId: NumId, level: number, pos: number): number[] {
      validateNumId(numId);
      validateLevel(level);
      validatePosition(pos);

      const key = toKey(numId);

      if (cacheEnabled) {
        const cached = pathCache[key]?.[level]?.[pos];
        if (cached) {
          return [...cached];
        }
      }

      const path: number[] = [];
      const numCounters = countersMap[key] ?? {};
      for (let lvl = 0; lvl < level; lvl++) {
        const startCount = startsMap[key]?.[lvl]?.start ?? 1;
        const levelData = numCounters[lvl];
        if (!levelData) {
          path.push(startCount);
          continue;
        }

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

    calculatePath(numId: NumId, level: number, pos: number): number[] {
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
