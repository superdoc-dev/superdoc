/**
 * Display token for tracked format changes that semantically represent
 * hyperlink insertion rather than generic formatting.
 */
export const HyperlinkAddedDisplayType = 'hyperlinkAdded';

/**
 * Display token for tracked format changes that modify an existing hyperlink
 * (e.g. changing the href or re-saving the same link in suggesting mode).
 */
export const HyperlinkModifiedDisplayType = 'hyperlinkModified';

const getMarkSnapshots = (attrs = {}) => {
  const before = Array.isArray(attrs.before) ? attrs.before : [];
  const after = Array.isArray(attrs.after) ? attrs.after : [];
  return { before, after };
};

const findSnapshotByType = (snapshots, type) => {
  return snapshots.find((snapshot) => snapshot?.type === type) ?? null;
};

const getNodeText = (nodes = []) => {
  return nodes
    .map((node) => node?.text || node?.textContent || '')
    .join('')
    .trim();
};

const getHyperlinkTarget = (linkSnapshot) => {
  const href = linkSnapshot?.attrs?.href;
  if (typeof href === 'string' && href.trim().length > 0) {
    return href.trim();
  }

  const anchor = linkSnapshot?.attrs?.anchor;
  if (typeof anchor === 'string' && anchor.trim().length > 0) {
    return `#${anchor.trim()}`;
  }

  return null;
};

const getLiveLinkMark = (nodes = []) => {
  for (const node of nodes) {
    const linkMark = node?.marks?.find((mark) => mark?.type?.name === 'link');
    if (linkMark) {
      return linkMark;
    }
  }

  return null;
};

const getHyperlinkLabel = ({ linkSnapshot, nodes }) => {
  return (
    getHyperlinkTarget(linkSnapshot) ||
    (typeof linkSnapshot?.attrs?.text === 'string' && linkSnapshot.attrs.text.trim().length > 0
      ? linkSnapshot.attrs.text.trim()
      : null) ||
    getNodeText(nodes)
  );
};

const getAddedMarkTypes = ({ before, after }) => {
  const beforeTypes = new Set(before.map((snapshot) => snapshot?.type).filter(Boolean));
  const afterTypes = new Set(after.map((snapshot) => snapshot?.type).filter(Boolean));
  return [...afterTypes].filter((type) => !beforeTypes.has(type));
};

const getRemovedMarkTypes = ({ before, after }) => {
  const beforeTypes = new Set(before.map((snapshot) => snapshot?.type).filter(Boolean));
  const afterTypes = new Set(after.map((snapshot) => snapshot?.type).filter(Boolean));
  return [...beforeTypes].filter((type) => !afterTypes.has(type));
};

const isUnderlineOnlyFormatDelta = ({ before, after }) => {
  const addedTypes = getAddedMarkTypes({ before, after });
  const removedTypes = getRemovedMarkTypes({ before, after });
  return removedTypes.length === 0 && addedTypes.length === 1 && addedTypes[0] === 'underline';
};

const snapshotAttrsEqual = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => {
    const valA = a[key];
    const valB = b[key];
    // Treat null/undefined as equivalent (attrs often mix the two)
    if (valA == null && valB == null) return true;
    return valA === valB;
  });
};

/**
 * Detect tracked format changes that should render with hyperlink-specific copy.
 *
 * The tracked-change layer stores hyperlink application as a format change because
 * it is implemented as mark mutations. For comment bubbles, however, "Format:
 * underline" is misleading when the meaningful change is "a hyperlink was added."
 *
 * @param {Object} params
 * @param {Object} [params.attrs={}] Tracked format mark attributes
 * @param {Array} [params.nodes=[]] Live text nodes covered by the tracked change
 * @returns {{trackedChangeDisplayType: string, trackedChangeText: string} | null}
 */
export const resolveTrackedFormatDisplay = ({ attrs = {}, nodes = [] }) => {
  const { before, after } = getMarkSnapshots(attrs);
  const beforeLink = findSnapshotByType(before, 'link');
  const afterLink = findSnapshotByType(after, 'link');
  const inferredLiveLink =
    !beforeLink && !afterLink && isUnderlineOnlyFormatDelta({ before, after }) ? getLiveLinkMark(nodes) : null;
  const addedLink = afterLink || inferredLiveLink;

  // Link exists in both before and after — either a no-op re-save or a real edit.
  // Handle here instead of falling through to the generic translator, which would
  // produce a spurious "Format: underline" comment.
  if (beforeLink && addedLink) {
    // True no-op: every link attr is identical — suppress the comment.
    if (snapshotAttrsEqual(beforeLink.attrs, addedLink.attrs)) {
      return { trackedChangeDisplayType: null, trackedChangeText: '' };
    }

    const trackedChangeText = getHyperlinkLabel({ linkSnapshot: addedLink, nodes });
    if (!trackedChangeText) {
      return null;
    }
    return {
      trackedChangeDisplayType: HyperlinkModifiedDisplayType,
      trackedChangeText,
    };
  }

  if (!addedLink) {
    return null;
  }

  const trackedChangeText = getHyperlinkLabel({ linkSnapshot: addedLink, nodes });
  if (!trackedChangeText) {
    return null;
  }

  return {
    trackedChangeDisplayType: HyperlinkAddedDisplayType,
    trackedChangeText,
  };
};
