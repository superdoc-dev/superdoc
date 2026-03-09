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
      if (!at) throw new Error('List creation requires an "at" parameter pointing to paragraphs to convert.');
      const input: Record<string, unknown> = {
        mode: 'fromParagraphs',
        target: at,
        kind: params.kind ?? 'bullet',
      };
      return execute('lists.create', input, options);
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
