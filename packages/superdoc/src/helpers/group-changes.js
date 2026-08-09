/**
 * Track changes helper
 * Combines replace transactions which are represented by insertion + deletion
 *
 * @param {Array} changes - Array of tracked changes from the editor
 * @returns {Array} Grouped track changes array with combined replacements
 */

export const groupChanges = (changes) => {
  const markMetaKeys = {
    trackInsert: 'insertedMark',
    trackDelete: 'deletionMark',
    trackFormat: 'formatMark',
  };

  // Build a Map of id → changes[] for O(1) lookup instead of O(n) inner scan
  const byId = new Map();
  for (const change of changes) {
    const id = change.mark.attrs.id;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(change);
  }

  const grouped = [];

  for (const [, group] of byId) {
    if (group.length === 1) {
      // Single change — no pairing needed
      const c = group[0];
      const key = markMetaKeys[c.mark.type.name];
      grouped.push({ from: c.from, to: c.to, [key]: c });
      continue;
    }

    // Multiple changes with same ID — check for adjacent pair first, then fall back to type-based pairing
    const processed = new Set();

    for (let i = 0; i < group.length; i++) {
      if (processed.has(i)) continue;

      const c1 = group[i];
      const c1Key = markMetaKeys[c1.mark.type.name];

      // Try adjacent match within group
      const c2 = group[i + 1];
      if (c2 && !processed.has(i + 1) && c1.to === c2.from && c1.mark.type.name !== c2.mark.type.name) {
        const c2Key = markMetaKeys[c2.mark.type.name];
        grouped.push({
          from: c1.from,
          to: c2.to,
          [c1Key]: c1,
          [c2Key]: c2,
        });
        processed.add(i);
        processed.add(i + 1);
        continue;
      }

      // Try type-based pairing (replacement: insert+delete with same ID)
      let foundMatch = false;
      for (let j = i + 1; j < group.length; j++) {
        if (processed.has(j)) continue;
        const cj = group[j];
        if (c1.mark.type.name !== cj.mark.type.name) {
          const cjKey = markMetaKeys[cj.mark.type.name];
          grouped.push({
            from: Math.min(c1.from, cj.from),
            to: Math.max(c1.to, cj.to),
            [c1Key]: c1,
            [cjKey]: cj,
          });
          processed.add(i);
          processed.add(j);
          foundMatch = true;
          break;
        }
      }

      if (!foundMatch) {
        grouped.push({ from: c1.from, to: c1.to, [c1Key]: c1 });
        processed.add(i);
      }
    }
  }

  return grouped;
};
