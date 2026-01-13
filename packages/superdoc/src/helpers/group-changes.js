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
  const grouped = [];
  const processed = new Set();

  for (let i = 0; i < changes.length; i++) {
    if (processed.has(i)) continue;

    const c1 = changes[i];
    const c1Key = markMetaKeys[c1.mark.type.name];
    const c1Id = c1.mark.attrs.id;

    // First, try to find an adjacent change with the same ID (original behavior)
    const c2 = changes[i + 1];
    if (c2 && c1.to === c2.from && c1Id === c2.mark.attrs.id) {
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

    // If not adjacent, look for any change with the same ID but different type (replacement)
    // This handles cases where insertion and deletion aren't adjacent
    let foundMatch = false;
    for (let j = i + 1; j < changes.length; j++) {
      if (processed.has(j)) continue;

      const c2 = changes[j];
      if (c1Id === c2.mark.attrs.id && c1.mark.type.name !== c2.mark.type.name) {
        const c2Key = markMetaKeys[c2.mark.type.name];
        grouped.push({
          from: Math.min(c1.from, c2.from),
          to: Math.max(c1.to, c2.to),
          [c1Key]: c1,
          [c2Key]: c2,
        });
        processed.add(i);
        processed.add(j);
        foundMatch = true;
        break;
      }
    }

    if (!foundMatch) {
      grouped.push({
        from: c1.from,
        to: c1.to,
        [c1Key]: c1,
      });
      processed.add(i);
    }
  }
  return grouped;
};
