import type { SandboxState } from '../state.js';

export type FindContentParams = {
  selector: {
    type: 'text';
    pattern: string;
    flags?: string;
  };
  limit?: number;
  offset?: number;
};

export type FindContentMatch = {
  address: { kind: 'block'; blockId: string };
  text: string;
};

export type FindContentResult = {
  matches: FindContentMatch[];
  total: number;
};

function buildRegex(pattern: string, flags?: string): RegExp {
  try {
    return new RegExp(pattern, flags ?? 'i');
  } catch {
    return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags ?? 'i');
  }
}

/**
 * Searches sandbox blocks for text matching a regex pattern.
 *
 * @param state - The sandbox document state to search.
 * @param params - Search parameters including selector, limit, and offset.
 * @returns Matching blocks and total count (before limit/offset).
 * @throws {Error} If the selector type is not 'text'.
 */
export function executeFindContent(state: SandboxState, params: FindContentParams): FindContentResult {
  if (!params?.selector || params.selector.type !== 'text') {
    throw new Error('find_content currently only supports selector.type = "text"');
  }

  const regex = buildRegex(params.selector.pattern, params.selector.flags);
  const matches: FindContentMatch[] = [];

  for (const block of state.blocks) {
    // Regexes with the global flag are stateful across .test() calls.
    regex.lastIndex = 0;
    if (!regex.test(block.text)) continue;
    matches.push({
      address: { kind: 'block', blockId: block.blockId },
      text: block.text,
    });
  }

  const offset = Math.max(0, params.offset ?? 0);
  const limit = params.limit == null ? matches.length : Math.max(0, params.limit);
  const sliced = matches.slice(offset, offset + limit);

  return {
    matches: sliced,
    total: matches.length,
  };
}
