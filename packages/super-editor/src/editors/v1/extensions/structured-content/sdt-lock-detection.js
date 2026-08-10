import { isContentLockedMode, isSdtLockedMode } from './lockModes.js';

/**
 * Collect all SDT nodes from the document.
 */
export function collectSDTNodes(doc) {
  const sdtNodes = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'structuredContent' || node.type.name === 'structuredContentBlock') {
      sdtNodes.push({
        type: node.type.name,
        node,
        lockMode: node.attrs.lockMode,
        pos,
        end: pos + node.nodeSize,
      });
    }
  });
  return sdtNodes;
}

/**
 * Check if a range [from, to] would violate any lock rules
 * Returns { blocked: boolean, reason?: string }
 */
export function checkLockViolation(sdtNodes, from, to, preservedSdtNodes) {
  for (const sdt of sdtNodes) {
    const overlaps = from < sdt.end && to > sdt.pos;
    if (!overlaps) continue;

    // Calculate relationship
    const containsSDT = from <= sdt.pos && to >= sdt.end;
    const insideSDT = from >= sdt.pos && to <= sdt.end;
    const crossesStart = from < sdt.pos && to > sdt.pos && to < sdt.end;
    const crossesEnd = from > sdt.pos && from < sdt.end && to > sdt.end;

    const wouldDamageWrapper = containsSDT || crossesStart || crossesEnd;
    // Content modification: inside SDT but NOT deleting the entire wrapper
    const wouldModifyContent = insideSDT && !containsSDT;

    const isSdtLocked = isSdtLockedMode(sdt.lockMode);
    const isContentLocked = isContentLockedMode(sdt.lockMode);

    if (isSdtLocked && wouldDamageWrapper && !preservedSdtNodes?.has(sdt)) {
      return { blocked: true, reason: `Cannot delete SDT wrapper (${sdt.lockMode})` };
    }

    if (isContentLocked && wouldModifyContent) {
      return { blocked: true, reason: `Cannot modify content (${sdt.lockMode})` };
    }
  }
  return { blocked: false };
}
