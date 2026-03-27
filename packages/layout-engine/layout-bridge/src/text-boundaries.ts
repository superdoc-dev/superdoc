import type { FlowBlock } from '@superdoc/contracts';

/**
 * Represents a boundary range with start and end positions
 */
export type BoundaryRange = {
  from: number;
  to: number;
};

/**
 * Find word boundaries around a given position in a block
 * Uses Unicode word boundary detection
 */
export function findWordBoundaries(blocks: FlowBlock[], pos: number): BoundaryRange | null {
  // Find the block and local position
  const blockInfo = findBlockAtPosition(blocks, pos);
  if (!blockInfo) return null;

  const { block, localPos } = blockInfo;
  if (block.kind !== 'paragraph') return null;

  // Get the full text content of the block
  const { text, pmStart } = extractBlockText(block);
  if (text.length === 0) return null;

  // Clamp localPos to valid range
  const clampedPos = Math.max(0, Math.min(localPos, text.length));

  // Find word start
  let wordStart = clampedPos;
  while (wordStart > 0 && isWordChar(text[wordStart - 1])) {
    wordStart--;
  }

  // Find word end
  let wordEnd = clampedPos;
  while (wordEnd < text.length && isWordChar(text[wordEnd])) {
    wordEnd++;
  }

  // If we didn't find a word (e.g., clicked on whitespace), try to select the whitespace
  if (wordStart === wordEnd) {
    // Select adjacent whitespace
    while (wordStart > 0 && isWhitespace(text[wordStart - 1])) {
      wordStart--;
    }
    while (wordEnd < text.length && isWhitespace(text[wordEnd])) {
      wordEnd++;
    }
    // If still zero-length (e.g., punctuation), treat as no word found
    if (wordStart === wordEnd) {
      return null;
    }
  }

  // Convert back to absolute positions
  return {
    from: pmStart + wordStart,
    to: pmStart + wordEnd,
  };
}

/**
 * Find paragraph boundaries (entire block) around a given position
 */
export function findParagraphBoundaries(blocks: FlowBlock[], pos: number): BoundaryRange | null {
  // Find the block at the position
  const blockInfo = findBlockAtPosition(blocks, pos);
  if (!blockInfo) return null;

  const { block } = blockInfo;

  // For paragraph blocks, return the full range
  if (block.kind === 'paragraph') {
    const { pmStart, pmEnd } = extractBlockText(block);
    return { from: pmStart, to: pmEnd };
  }

  // For image blocks, select the entire image
  if (block.kind === 'image') {
    // Images don't have pmStart/pmEnd, but we can use the position
    // In practice, images are typically single-position items
    return { from: pos, to: pos + 1 };
  }

  return null;
}

/**
 * Extract the full text content from a paragraph block along with its PM positions
 */
function extractBlockText(block: FlowBlock): {
  text: string;
  pmStart: number;
  pmEnd: number;
} {
  if (block.kind !== 'paragraph') {
    return { text: '', pmStart: 0, pmEnd: 0 };
  }

  let text = '';
  let pmStart = Infinity;
  let pmEnd = 0;

  for (const run of block.runs) {
    text +=
      'src' in run ||
      run.kind === 'lineBreak' ||
      run.kind === 'break' ||
      run.kind === 'fieldAnnotation' ||
      run.kind === 'math'
        ? ''
        : run.text;
    if (run.pmStart !== undefined) {
      pmStart = Math.min(pmStart, run.pmStart);
    }
    if (run.pmEnd !== undefined) {
      pmEnd = Math.max(pmEnd, run.pmEnd);
    }
  }

  // Handle edge case where no runs have PM positions
  if (pmStart === Infinity) pmStart = 0;
  // If pmEnd couldn't be determined from runs, fall back to pmStart + text length
  if (pmEnd === 0 && text.length > 0) pmEnd = pmStart + text.length;

  return { text, pmStart, pmEnd };
}

/**
 * Find the block containing the given position and return the local position within that block
 */
function findBlockAtPosition(blocks: FlowBlock[], pos: number): { block: FlowBlock; localPos: number } | null {
  for (const block of blocks) {
    if (block.kind === 'paragraph') {
      const { pmStart, pmEnd } = extractBlockText(block);
      if (pos >= pmStart && pos <= pmEnd) {
        return { block, localPos: pos - pmStart };
      }
    }
  }
  return null;
}

/**
 * Check if a character is a word character
 * Uses a simplified Unicode word boundary detection
 */
function isWordChar(char: string): boolean {
  // Match letters, numbers, and underscore (similar to \w in regex)
  // Also include common word characters from various scripts
  return /[\p{L}\p{N}_]/u.test(char);
}

/**
 * Check if a character is whitespace
 */
function isWhitespace(char: string): boolean {
  return /\s/.test(char);
}
