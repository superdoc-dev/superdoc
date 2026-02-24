/**
 * Find tracked mark between positions by mark name and attrs.
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
