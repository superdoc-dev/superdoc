/**
 * Normalize and merge overlapping ranges within document bounds.
 *
 * - Clamps range endpoints to `[0, docSize]`.
 * - Drops empty/invalid ranges.
 * - Sorts and merges overlaps/touching ranges.
 *
 * @param {{ from: number, to: number }[]} ranges
 * @param {number} docSize
 * @returns {{ from: number, to: number }[]}
 */
export const mergeRanges = (ranges, docSize) => {
  if (!ranges.length) return [];
  const sorted = ranges
    .map(({ from, to }) => ({
      from: Math.max(0, from),
      to: Math.min(docSize, to),
    }))
    .filter(({ from, to }) => from < to)
    .sort((a, b) => a.from - b.from);

  const merged = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.from <= last.to) {
      last.to = Math.max(last.to, range.to);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
};

/**
 * Collect changed ranges using mapping maps from each transaction.
 *
 * This captures structural changes (insert/delete/replace) recorded by step maps.
 * Mark-only changes may not appear here.
 *
 * @param {import('prosemirror-state').Transaction[]} transactions
 * @param {number} docSize
 * @returns {{ from: number, to: number }[]}
 */
export const collectChangedRanges = (transactions, docSize) => {
  const ranges = [];
  transactions.forEach((tr) => {
    if (!tr.docChanged) return;
    tr.mapping.maps.forEach((map) => {
      map.forEach((oldStart, oldEnd, newStart, newEnd) => {
        if (newStart !== oldStart || oldEnd !== newEnd) {
          ranges.push({ from: newStart, to: newEnd });
        }
      });
    });
  });
  return mergeRanges(ranges, docSize);
};

/**
 * Remap ranges through a sequence of transactions to align with the final document.
 *
 * @param {{ from: number, to: number }[]} ranges
 * @param {import('prosemirror-state').Transaction[]} transactions
 * @param {number} docSize
 * @returns {{ from: number, to: number }[]}
 */
export const mapRangesThroughTransactions = (ranges, transactions, docSize) => {
  let mapped = ranges;
  transactions.forEach((tr) => {
    mapped = mapped
      .map(({ from, to }) => {
        const mappedFrom = tr.mapping.map(from, -1);
        const mappedTo = tr.mapping.map(to, 1);
        if (mappedFrom >= mappedTo) return null;
        return { from: mappedFrom, to: mappedTo };
      })
      .filter(Boolean);
  });
  return mergeRanges(mapped, docSize);
};

/**
 * Collect changed ranges and map them through later transactions so they point
 * to positions in the final document. Optional extra ranges can be provided
 * and will be mapped through all transactions before merging.
 *
 * This unions:
 * - step ranges (captures mark-only changes)
 * - mapping-map ranges (captures structural changes)
 * - extra ranges (caller-provided)
 *
 * @param {import('prosemirror-state').Transaction[]} transactions
 * @param {number} docSize
 * @param {{ extraRanges?: { from: number, to: number }[] }=} options
 * @returns {{ from: number, to: number }[]}
 */
export const collectChangedRangesThroughTransactions = (transactions, docSize, options = {}) => {
  const ranges = [];
  const extraRanges = Array.isArray(options.extraRanges) ? options.extraRanges : [];
  if (extraRanges.length) {
    const mappedExtras = mapRangesThroughTransactions(extraRanges, transactions, docSize);
    ranges.push(...mappedExtras);
  }
  transactions.forEach((tr, index) => {
    if (!tr.docChanged) return;
    const perTransactionRanges = [];
    tr.steps.forEach((step) => {
      if (typeof step.from !== 'number' || typeof step.to !== 'number') return;
      const from = tr.mapping.map(step.from, 1);
      const to = tr.mapping.map(step.to, -1);
      if (from >= to) return;
      perTransactionRanges.push({ from, to });
    });
    tr.mapping.maps.forEach((map) => {
      map.forEach((oldStart, oldEnd, newStart, newEnd) => {
        if (newStart !== oldStart || oldEnd !== newEnd) {
          perTransactionRanges.push({ from: newStart, to: newEnd });
        }
      });
    });
    if (!perTransactionRanges.length) return;
    const remainingTransactions = transactions.slice(index + 1);
    const mapped = mapRangesThroughTransactions(perTransactionRanges, remainingTransactions, docSize);
    ranges.push(...mapped);
  });
  return mergeRanges(ranges, docSize);
};

/**
 * Clamp a range to be within document bounds
 * @param {number} start - Start position
 * @param {number} end - End position
 * @param {number} docSize - Document size
 * @returns {[number, number]|null} Clamped [start, end] range, or null if range is invalid
 *
 * @description
 * Returns null when:
 * - The range is zero-length (start === end) after clamping
 * - The range is inverted (start > end) after clamping
 * - The range is completely outside document bounds
 *
 * Note: Zero-length ranges (point ranges) are considered invalid and will return null.
 * Use this function when you need ranges that span at least one position.
 *
 * @example
 * clampRange(10, 20, 100)   // => { start: 10, end: 20 } - valid range
 * clampRange(50, 50, 100)   // => null - zero-length range
 * clampRange(-10, 20, 100)  // => { start: 0, end: 20 } - start clamped to 0
 * clampRange(10, 150, 100)  // => { start: 10, end: 100 } - end clamped to docSize
 * clampRange(150, 200, 100) // => null - completely out of bounds
 */
export const clampRange = (start, end, docSize) => {
  const safeStart = Math.max(0, Math.min(start, docSize));
  const safeEnd = Math.max(0, Math.min(end, docSize));

  if (safeStart >= safeEnd) {
    return null;
  }

  return { start: safeStart, end: safeEnd };
};
