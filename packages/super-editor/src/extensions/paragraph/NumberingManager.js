/**
 * Factory that tracks numbering counters, restart settings, and cached paths
 * for list rendering. Each instance is meant to be scoped to a document view.
 *
 * @returns {{
 *   setStartSettings: (numId: string | number, level: number, startValue: number, restartValue?: number) => void,
 *   setCounter: (numId: string | number, level: number, pos: number, value: number) => void,
 *   getCounter: (numId: string | number, level: number, pos: number) => number | null,
 *   calculateCounter: (numId: string | number, level: number, pos: number) => number,
 *   getAncestorsPath: (numId: string | number, level: number, pos: number) => number[],
 *   calculatePath: (numId: string | number, level: number, pos: number) => number[],
 *   getCountersMap: () => Record<string, Record<string, Record<string, number>>>,
 *   _clearCache: () => void,
 *   enableCache: () => void,
 *   disableCache: () => void
 * }}
 */
export function createNumberingManager() {
  /*
   * {
   * "(numId)": {
   *   "(ilvl)": {
   *     "(pos)": count
   *   }
   * }
   */
  let countersMap = {};

  /*
   * {
   *   "(ilvl)": {
   *     "(pos)": count
   *   }
   */
  let abstractCountersMap = {};

  /*
   * {
   *   "(numId)": "(abstractId)"
   * }
   */
  let abstractIdMap = {};

  /*
   * {
   * "(numId)": {
   *   "(ilvl)": {
   *     start: value,
   *     restart: value
   *   }
   * }
   */
  const startsMap = {};

  /*
   * {
   * "(abstractId)": {
   *   "(level)": {
   *     pos: value,
   *     count: value
   *   }
   * }
   */
  let lastSeenByAbstractIdMap = {};

  /*
   * {
   * "(abstractId)": {
   *   "(level)": {
   *     pos: value,
   *     count: value
   *   }
   * }
   */
  let lastSeenByNumIdMap = {};

  /*
   * {
   * "(pos)": [count, count, ...]
   * }
   */
  let pathCache = {};

  let cacheEnabled = false;

  return {
    /**
     * Persist the base start value and optional restart limit for a given
     * numId/level combination.
     *
     * @param {string | number} numId
     * @param {number} level
     * @param {number} startValue
     * @param {number} [restartValue]
     * @param {boolean} [startOverridden=false]
     */
    setStartSettings(numId, level, startValue, restartValue, startOverridden = false) {
      if (!startsMap[numId]) {
        startsMap[numId] = {};
      }
      if (!startsMap[numId][level]) {
        startsMap[numId][level] = {};
      }
      startsMap[numId][level].start = startValue;
      startsMap[numId][level].restart = restartValue;
      startsMap[numId][level].startOverridden = startOverridden;
    },
    /**
     * Record the computed counter for a specific node position. When caching is
     * enabled this also tracks the latest position to speed up lookups.
     *
     * @param {string | number} numId
     * @param {number} level
     * @param {number} pos
     * @param {number} value
     */
    setCounter(numId, level, pos, value, abstractId) {
      // Update counters map
      if (!countersMap[numId]) {
        countersMap[numId] = {};
      }
      if (!countersMap[numId][level]) {
        countersMap[numId][level] = {};
      }
      countersMap[numId][level][pos] = value;

      // Update abstract counters map
      abstractIdMap[numId] = abstractId;
      if (!abstractCountersMap[abstractId]) {
        abstractCountersMap[abstractId] = {};
      }
      if (!abstractCountersMap[abstractId][level]) {
        abstractCountersMap[abstractId][level] = {};
      }
      abstractCountersMap[abstractId][level][pos] = value;

      if (!cacheEnabled) {
        return;
      }
      if (!lastSeenByAbstractIdMap[abstractId]) {
        lastSeenByAbstractIdMap[abstractId] = {};
      }
      const lastSeen = lastSeenByAbstractIdMap[abstractId][level];
      if (!lastSeen || pos > lastSeen.pos) {
        lastSeenByAbstractIdMap[abstractId][level] = { pos, count: value };
      }
      if (!lastSeenByNumIdMap[numId]) {
        lastSeenByNumIdMap[numId] = {};
      }
      const lastSeenNumId = lastSeenByNumIdMap[numId][level];
      if (!lastSeenNumId || pos > lastSeenNumId.pos) {
        lastSeenByNumIdMap[numId][level] = { pos, count: value };
      }
    },
    /**
     * Retrieve a previously stored counter for the provided position.
     *
     * @param {string | number} numId
     * @param {number} level
     * @param {number} pos
     * @returns {number | null}
     */
    getCounter(numId, level, pos) {
      if (countersMap[numId] && countersMap[numId][level] && countersMap[numId][level][pos] != null) {
        return countersMap[numId][level][pos];
      }
      return null;
    },
    /**
     * Calculate the counter value that should be used for the given position,
     * respecting restart rules, ancestor usage, and cached history.
     *
     * @param {string | number} numId
     * @param {number} level
     * @param {number} pos
     * @returns {number}
     */
    calculateCounter(numId, level, pos, abstractId) {
      abstractIdMap[numId] = abstractId;
      const restartSetting = startsMap?.[numId]?.[level]?.restart;
      const startValue = startsMap?.[numId]?.[level]?.start ?? 1;
      const startOverridden = startsMap?.[numId]?.[level]?.startOverridden ?? false;
      const levelData = abstractCountersMap?.[abstractId]?.[level] || {};
      let previousPos = null;
      let previousCount = startValue - 1;

      if (cacheEnabled) {
        let cachedLast;
        if (startOverridden) {
          cachedLast = lastSeenByNumIdMap?.[numId]?.[level];
        } else {
          cachedLast = lastSeenByAbstractIdMap?.[abstractId]?.[level];
        }
        if (cachedLast && cachedLast.pos < pos) {
          previousPos = cachedLast.pos;
          previousCount = cachedLast.count;
        }
      }
      if (previousPos == null && !cacheEnabled) {
        let maxPos = null;
        for (const key of Object.keys(levelData)) {
          const p = parseInt(key, 10);
          if (!Number.isFinite(p) || p >= pos) {
            continue;
          }
          if (maxPos == null || p > maxPos) {
            maxPos = p;
          }
        }
        if (maxPos != null) {
          previousPos = maxPos;
          previousCount = levelData[maxPos];
        }
      }

      // If my restart setting is 0, always increment previous sibling
      if (restartSetting === 0) {
        return previousCount + 1;
      }

      // If no previous sibling, return start value
      if (previousPos == null) {
        return startValue;
      }

      // Figure out what other levels have been used between my position and previous sibling
      // This considers all levels lower than me that have the same abstractId
      const usedLevels = [];
      for (let lvl = 0; lvl < level; lvl++) {
        const levelData = abstractCountersMap?.[abstractId]?.[lvl] || {};
        const hasUsed = Object.keys(levelData)
          .map((p) => parseInt(p))
          .some((p) => p > previousPos && p < pos);
        if (hasUsed) {
          usedLevels.push(lvl);
        }
      }
      // If no other levels were used between me and my previous sibling, simply increment previous sibling
      if (usedLevels.length === 0) {
        return previousCount + 1;
      }

      // If my restart setting is null and lower levels were used between me and my previous sibling, restart from start
      if (restartSetting == null) {
        return startValue;
      }
      // If my restart setting is a number and a level equal to or lower than that was used between me and my previous sibling, restart from start
      const shouldRestart = usedLevels.some((lvl) => lvl <= restartSetting);
      if (shouldRestart) {
        return startValue;
      }
      // Otherwise, increment previous sibling
      return previousCount + 1;

      // Maybe record the level usage positions in a map for quick lookup?
    },
    /**
     * Resolve the counter values for every ancestor level preceding the given
     * position. All numbering definitions that have the same abstract id
     * are considered. Results are cached when cache mode is active.
     *
     * @param {string | number} numId
     * @param {number} level
     * @param {number} pos
     * @returns {number[]}
     */
    getAncestorsPath(numId, level, pos) {
      if (cacheEnabled && pathCache?.[numId]?.[level]?.[pos]) {
        return pathCache[numId][level][pos];
      }
      const path = [];
      const abstractId = abstractIdMap[numId];
      for (let lvl = 0; lvl < level; lvl++) {
        const startCount = startsMap?.[numId]?.[lvl]?.start ?? 1;
        const levelData = abstractCountersMap?.[abstractId]?.[lvl] || {};

        if (levelData == null) {
          path.push(startCount);
          continue;
        }
        // Find the highest position less than pos
        const previousPos = Object.keys(levelData)
          .map((p) => parseInt(p))
          .filter((p) => p < pos)
          .pop();

        if (previousPos == null) {
          path.push(startCount);
        } else {
          path.push(levelData[previousPos]);
        }
      }
      if (cacheEnabled) {
        if (!pathCache[numId]) {
          pathCache[numId] = {};
        }
        if (!pathCache[numId][level]) {
          pathCache[numId][level] = {};
        }
        pathCache[numId][level][pos] = path;
      }
      return path;
    },
    /**
     * Convenience helper that appends the current level counter on top of the
     * ancestor path.
     *
     * @param {string | number} numId
     * @param {number} level
     * @param {number} pos
     * @returns {number[]}
     */
    calculatePath(numId, level, pos) {
      const path = this.getAncestorsPath(numId, level, pos);
      const myCount = this.getCounter(numId, level, pos);
      path.push(myCount);
      return path;
    },
    /**
     * Expose the internal counters map mainly for debugging and tests.
     *
     * @returns {Record<string, Record<string, Record<string, number>>>}
     */
    getCountersMap() {
      return countersMap;
    },
    /**
     * Reset cached counter/path structures. Intended for internal use only.
     */
    _clearCache() {
      lastSeenByAbstractIdMap = {};
      lastSeenByNumIdMap = {};
      pathCache = {};
      countersMap = {};
      abstractCountersMap = {};
      abstractIdMap = {};
    },
    /**
     * Enable cache-aware logic (used during document scans) and drop stale data.
     */
    enableCache() {
      cacheEnabled = true;
      this._clearCache();
    },
    /**
     * Disable cache-aware logic and clear residual cache entries.
     */
    disableCache() {
      cacheEnabled = false;
      this._clearCache();
    },
  };
}
