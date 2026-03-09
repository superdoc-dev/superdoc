import type { Executor } from '../types.js';
import { parseTarget, trackedOptions } from './utils.js';

export async function routeCreate(params: Record<string, unknown>, execute: Executor) {
  const type = params.type as string;
  const options = trackedOptions(params);
  const at = parseTarget(params, 'at');

  switch (type) {
    case 'paragraph': {
      const input: Record<string, unknown> = {};
      if (params.text) input.text = params.text;
      if (at) input.at = at;
      return execute('create.paragraph', input, options);
    }
    case 'heading': {
      const input: Record<string, unknown> = { level: params.level ?? 1 };
      if (params.text) input.text = params.text;
      if (at) input.at = at;
      return execute('create.heading', input, options);
    }
    case 'table': {
      const input: Record<string, unknown> = {
        rows: params.rows ?? 2,
        columns: params.cols ?? 2,
      };
      if (at) input.at = at;
      return execute('create.table', input, options);
    }
    case 'image': {
      const input: Record<string, unknown> = { src: params.src };
      if (at) input.at = at;
      return execute('create.image', input, options);
    }
    case 'list': {
      const kind = (params.kind ?? 'bullet') as string;
      const items = params.items as string[] | undefined;

      // Multi-item shorthand: create the first item, then insert the rest
      if (Array.isArray(items) && items.length > 0) {
        const firstInput: Record<string, unknown> = { kind, text: items[0] };
        if (at) firstInput.at = at;
        const firstResult = (await execute('create.list', firstInput, options)) as Record<string, unknown>;

        let lastItemAddress = firstResult.item as Record<string, unknown>;
        const allItems = [lastItemAddress];

        for (let i = 1; i < items.length; i++) {
          const insertResult = (await execute('lists.insert', {
            target: { kind: 'content', stability: 'stable', nodeId: lastItemAddress?.nodeId },
            position: 'after',
            text: items[i],
          })) as Record<string, unknown>;
          lastItemAddress = insertResult.item as Record<string, unknown>;
          allItems.push(lastItemAddress);
        }

        return { success: true, listId: firstResult.listId, items: allItems };
      }

      // Single-item creation
      const input: Record<string, unknown> = { kind };
      if (params.text) input.text = params.text;
      if (at) input.at = at;
      return execute('create.list', input, options);
    }
    case 'section_break': {
      const input: Record<string, unknown> = {};
      if (at) input.at = at;
      return execute('create.sectionBreak', input, options);
    }
    case 'toc': {
      const input: Record<string, unknown> = {};
      if (at) input.at = at;
      return execute('create.tableOfContents', input, options);
    }
    case 'content_control': {
      const input: Record<string, unknown> = { kind: params.kind ?? 'block' };
      if (at) input.at = at;
      if (params.control_type) input.controlType = params.control_type;
      return execute('create.contentControl', input, options);
    }
    default:
      throw new Error(
        `Unknown block type: "${type}". Expected one of: paragraph, heading, table, image, list, section_break, toc, content_control.`,
      );
  }
}
