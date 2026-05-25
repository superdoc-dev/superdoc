/**
 * Find a tracked mark in a document range by mark name and (optionally)
 * a partial attrs match. Returns the first hit; expands by `offset`
 * around the requested range so non-inclusive marks just outside it
 * are still considered. If nothing matches inside the range, falls
 * back to inspecting nodes adjacent to the range boundaries (handles
 * Google-Docs-style text inserted directly under a paragraph without
 * a wrapping run, and Firefox-vs-Chrome wrapping differences).
 *
 * @param {object} args
 * @param {import('./types.js').Transaction} args.tr - Transaction
 *   whose `tr.doc` is searched.
 * @param {number} args.from - Range start.
 * @param {number} args.to - Range end.
 * @param {string} args.markName - Mark type name to match.
 * @param {import('./types.js').Attrs} [args.attrs] - Partial attrs
 *   to match; every key listed must equal the candidate's attr value.
 *   Defaults to `{}` (no attr constraint).
 * @param {number} [args.offset] - Expand the range by this many
 *   positions on each side. Defaults to `1` to catch non-inclusive marks.
 * @returns {import('./types.js').TrackedMarkRange | null} The first
 *   match `{ from, to, mark }`, or `null` if no candidate matches.
 */
export const findTrackedMarkBetween = ({
  tr,
  from,
  to,
  markName,
  attrs = {},
  offset = 1, // To get non-inclusive marks.
}) => {
  const { doc } = tr;

  const startPos = Math.max(from - offset, 0); // $from.start()
  const endPos = Math.min(to + offset, doc.content.size); // $from.end()

  /** @type {import('./types.js').TrackedMarkRange | null} */
  let markFound = null;

  const tryMatch = (node, pos) => {
    if (!node || node?.nodeSize === undefined) {
      return;
    }

    const mark = node.marks?.find(
      (mark) => mark.type.name === markName && Object.keys(attrs).every((attr) => mark.attrs[attr] === attrs[attr]),
    );

    if (mark && !markFound) {
      markFound = {
        from: pos,
        to: pos + node.nodeSize,
        mark,
      };
      // Return false to stop the search
      return false;
    }
  };

  doc.nodesBetween(startPos, endPos, (node, pos) => {
    return tryMatch(node, pos);
  });

  const inspectAroundPosition = (pos) => {
    if (pos < 0 || pos > doc.content.size) {
      return;
    }

    const resolved = doc.resolve(pos);
    const before = resolved.nodeBefore;
    const after = resolved.nodeAfter;

    // Check if nodeBefore is a text node directly (not wrapped in a run).
    // This handles cases where text is inserted outside of run nodes,
    // such as in Google Docs exports with paragraph > lineBreak structure.
    // Firefox inserts text directly as paragraph children, while Chrome
    // tends to use run wrappers, so we need to handle both cases.
    if (before?.type?.name === 'text') {
      const beforeStart = Math.max(pos - before.nodeSize, 0);
      tryMatch(before, beforeStart);
    } else if (before?.type?.name === 'run') {
      const beforeStart = Math.max(pos - before.nodeSize, 0);
      const node = before.content?.content?.[0];
      if (node?.type?.name === 'text') {
        tryMatch(node, beforeStart);
      }
    }

    // Check if nodeAfter is a text node directly (not wrapped in a run)
    if (after?.type?.name === 'text') {
      tryMatch(after, pos);
    } else if (after?.type?.name === 'run') {
      const node = after.content?.content?.[0];
      if (node?.type?.name === 'text') {
        tryMatch(node, pos);
      }
    }
  };

  if (!markFound) {
    inspectAroundPosition(startPos);
    inspectAroundPosition(endPos);
  }

  return markFound;
};
