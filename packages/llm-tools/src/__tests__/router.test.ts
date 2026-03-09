import { test, expect, describe } from 'bun:test';
import { dispatch, ROUTERS, ALL_TOOLS } from '../index.js';
import type { Executor } from '../types.js';

/** Creates a mock executor that records calls and returns a default value. */
function mockExecutor(returnValue: unknown = { ok: true }) {
  const calls: Array<{ operationId: string; input: Record<string, unknown>; options?: Record<string, unknown> }> = [];
  const execute: Executor = async (operationId, input, options) => {
    calls.push({ operationId, input, options });
    return returnValue;
  };
  return { execute, calls };
}

describe('dispatch', () => {
  test('throws on unknown tool name', async () => {
    const { execute } = mockExecutor();
    await expect(dispatch('unknown_tool', {}, execute)).rejects.toThrow('Unknown tool: "unknown_tool"');
  });

  test('has a router for every tool', () => {
    const toolNames = ALL_TOOLS.map((t) => t.name);
    for (const name of toolNames) {
      expect(ROUTERS[name]).toBeDefined();
    }
  });
});

describe('routeRead', () => {
  test('routes text format to getText', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_read', { format: 'text' }, execute);
    expect(calls).toHaveLength(1);
    expect(calls[0].operationId).toBe('getText');
  });

  test('routes markdown format to getMarkdown', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_read', { format: 'markdown' }, execute);
    expect(calls[0].operationId).toBe('getMarkdown');
  });

  test('routes html format to getHtml', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_read', { format: 'html' }, execute);
    expect(calls[0].operationId).toBe('getHtml');
  });

  test('routes info format to info', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_read', { format: 'info' }, execute);
    expect(calls[0].operationId).toBe('info');
  });

  test('throws on unknown format', async () => {
    const { execute } = mockExecutor();
    await expect(dispatch('superdoc_read', { format: 'xml' }, execute)).rejects.toThrow('Unknown format');
  });
});

describe('routeFind', () => {
  test('routes text search', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_find', { pattern: 'hello' }, execute);
    expect(calls[0].operationId).toBe('find');
    expect(calls[0].input).toEqual({ type: 'text', pattern: 'hello', mode: 'contains' });
  });

  test('routes node type search', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_find', { type: 'heading' }, execute);
    expect(calls[0].input).toEqual({ type: 'node', nodeType: 'heading' });
  });

  test('routes combined pattern + type search', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_find', { pattern: 'hello', type: 'heading' }, execute);
    expect(calls[0].input).toEqual({ type: 'text', pattern: 'hello', mode: 'contains', nodeType: 'heading' });
  });

  test('wraps in select when limit/offset provided', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_find', { pattern: 'test', limit: 5 }, execute);
    expect(calls[0].input).toHaveProperty('select');
    expect(calls[0].input).toHaveProperty('limit', 5);
  });
});

describe('routeEdit', () => {
  const target = JSON.stringify({ kind: 'text', blockId: 'abc' });

  test('routes insert', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_edit', { action: 'insert', target, text: 'hello' }, execute);
    expect(calls[0].operationId).toBe('insert');
    expect(calls[0].input.text).toBe('hello');
  });

  test('routes replace', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_edit', { action: 'replace', target, text: 'new text' }, execute);
    expect(calls[0].operationId).toBe('replace');
  });

  test('routes delete', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_edit', { action: 'delete', target }, execute);
    expect(calls[0].operationId).toBe('delete');
  });

  test('passes tracked mode when suggest=true', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_edit', { action: 'insert', target, text: 'hi', suggest: true }, execute);
    expect(calls[0].options).toEqual({ changeMode: 'tracked' });
  });

  test('no options when suggest is not set', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_edit', { action: 'insert', target, text: 'hi' }, execute);
    expect(calls[0].options).toBeUndefined();
  });
});

describe('routeCreate', () => {
  test('routes paragraph creation', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_create', { type: 'paragraph', text: 'Hello' }, execute);
    expect(calls[0].operationId).toBe('create.paragraph');
    expect(calls[0].input.text).toBe('Hello');
  });

  test('routes heading with level', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_create', { type: 'heading', text: 'Title', level: 2 }, execute);
    expect(calls[0].operationId).toBe('create.heading');
    expect(calls[0].input.level).toBe(2);
  });

  test('routes table with rows and columns', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_create', { type: 'table', rows: 3, cols: 4 }, execute);
    expect(calls[0].operationId).toBe('create.table');
    expect(calls[0].input.rows).toBe(3);
    expect(calls[0].input.columns).toBe(4);
  });

  test('routes list creation with at', async () => {
    const at = JSON.stringify({ kind: 'block', nodeId: 'p1' });
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_create', { type: 'list', kind: 'ordered', at }, execute);
    expect(calls[0].operationId).toBe('lists.create');
    expect(calls[0].input.kind).toBe('ordered');
    expect(calls[0].input.target).toEqual({ kind: 'block', nodeId: 'p1' });
  });

  test('list creation throws without at', async () => {
    const { execute } = mockExecutor();
    await expect(dispatch('superdoc_create', { type: 'list', kind: 'ordered' }, execute)).rejects.toThrow(
      'requires an "at" parameter',
    );
  });

  test('routes content_control with kind', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_create', { type: 'content_control', kind: 'inline' }, execute);
    expect(calls[0].operationId).toBe('create.contentControl');
    expect(calls[0].input.kind).toBe('inline');
  });

  test('throws on unknown type', async () => {
    const { execute } = mockExecutor();
    await expect(dispatch('superdoc_create', { type: 'chart' }, execute)).rejects.toThrow('Unknown block type');
  });
});

describe('routeFormat', () => {
  const target = JSON.stringify({ kind: 'text', blockId: 'abc' });

  test('routes inline formatting', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_format', { target, bold: true, italic: true }, execute);
    expect(calls).toHaveLength(1);
    expect(calls[0].operationId).toBe('format.apply');
    expect(calls[0].input.inline).toEqual({ bold: 'on', italic: 'on' });
  });

  test('routes paragraph alignment', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_format', { target, alignment: 'center' }, execute);
    expect(calls[0].operationId).toBe('format.paragraph.setAlignment');
    expect(calls[0].input.alignment).toBe('center');
  });

  test('routes paragraph spacing with correct field names', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_format', { target, space_before: 12, space_after: 6 }, execute);
    expect(calls[0].operationId).toBe('format.paragraph.setSpacing');
    expect(calls[0].input.before).toBe(12);
    expect(calls[0].input.after).toBe(6);
  });

  test('routes named style with styleId', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_format', { target, style: 'Heading1' }, execute);
    expect(calls[0].operationId).toBe('styles.paragraph.setStyle');
    expect(calls[0].input.styleId).toBe('Heading1');
  });

  test('combines multiple formatting in one call', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_format', { target, bold: true, alignment: 'center', style: 'Normal' }, execute);
    expect(calls).toHaveLength(3);
    expect(calls[0].operationId).toBe('format.apply');
    expect(calls[1].operationId).toBe('format.paragraph.setAlignment');
    expect(calls[2].operationId).toBe('styles.paragraph.setStyle');
  });

  test('passes tracked mode when suggest=true', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_format', { target, bold: true, suggest: true }, execute);
    expect(calls[0].options).toEqual({ changeMode: 'tracked' });
  });
});

describe('routeComment', () => {
  test('routes list', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_comment', { action: 'list' }, execute);
    expect(calls[0].operationId).toBe('comments.list');
  });

  test('routes create with target', async () => {
    const target = JSON.stringify({ kind: 'text', blockId: 'x' });
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_comment', { action: 'create', target, text: 'Nice work' }, execute);
    expect(calls[0].operationId).toBe('comments.create');
    expect(calls[0].input.text).toBe('Nice work');
  });

  test('create throws without target', async () => {
    const { execute } = mockExecutor();
    await expect(dispatch('superdoc_comment', { action: 'create', text: 'Hi' }, execute)).rejects.toThrow(
      'Target is required',
    );
  });

  test('routes reply with parentCommentId', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_comment', { action: 'reply', comment_id: 'c1', text: 'Thanks' }, execute);
    expect(calls[0].operationId).toBe('comments.create');
    expect(calls[0].input.parentCommentId).toBe('c1');
  });

  test('routes resolve', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_comment', { action: 'resolve', comment_id: 'c1' }, execute);
    expect(calls[0].operationId).toBe('comments.patch');
    expect(calls[0].input.status).toBe('resolved');
  });

  test('routes delete', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_comment', { action: 'delete', comment_id: 'c1' }, execute);
    expect(calls[0].operationId).toBe('comments.delete');
    expect(calls[0].input.commentId).toBe('c1');
  });
});

describe('routeReview', () => {
  test('routes list', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_review', { action: 'list' }, execute);
    expect(calls[0].operationId).toBe('trackChanges.list');
  });

  test('routes accept with id', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_review', { action: 'accept', id: 'tc1' }, execute);
    expect(calls[0].operationId).toBe('trackChanges.decide');
    expect(calls[0].input).toEqual({ decision: 'accept', target: { id: 'tc1' } });
  });

  test('routes reject with id', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_review', { action: 'reject', id: 'tc1' }, execute);
    expect(calls[0].operationId).toBe('trackChanges.decide');
    expect(calls[0].input).toEqual({ decision: 'reject', target: { id: 'tc1' } });
  });

  test('routes accept_all', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_review', { action: 'accept_all' }, execute);
    expect(calls[0].input).toEqual({ decision: 'accept', target: { scope: 'all' } });
  });

  test('routes reject_all', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_review', { action: 'reject_all' }, execute);
    expect(calls[0].input).toEqual({ decision: 'reject', target: { scope: 'all' } });
  });
});

describe('routeTable', () => {
  const target = JSON.stringify({ kind: 'block', nodeId: 'tbl1' });

  test('routes get', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_table', { action: 'get', target }, execute);
    expect(calls[0].operationId).toBe('tables.get');
  });

  test('routes insert_row', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_table', { action: 'insert_row', target, position: 'below' }, execute);
    expect(calls[0].operationId).toBe('tables.insertRow');
    expect(calls[0].input.position).toBe('below');
  });

  test('routes delete_row', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_table', { action: 'delete_row', target }, execute);
    expect(calls[0].operationId).toBe('tables.deleteRow');
  });

  test('routes insert_column with tableTarget and columnIndex', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_table', { action: 'insert_column', target, column_index: 2, position: 'right' }, execute);
    expect(calls[0].operationId).toBe('tables.insertColumn');
    expect(calls[0].input.tableTarget).toEqual({ kind: 'block', nodeId: 'tbl1' });
    expect(calls[0].input.columnIndex).toBe(2);
    expect(calls[0].input.position).toBe('right');
  });

  test('routes merge_cells with start/end', async () => {
    const { execute, calls } = mockExecutor();
    const start = { rowIndex: 0, columnIndex: 0 };
    const end = { rowIndex: 1, columnIndex: 1 };
    await dispatch('superdoc_table', { action: 'merge_cells', target, start, end }, execute);
    expect(calls[0].operationId).toBe('tables.mergeCells');
    expect(calls[0].input.tableTarget).toEqual({ kind: 'block', nodeId: 'tbl1' });
    expect(calls[0].input.start).toEqual(start);
    expect(calls[0].input.end).toEqual(end);
  });

  test('routes set_style with styleId', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_table', { action: 'set_style', target, style: 'TableGrid' }, execute);
    expect(calls[0].operationId).toBe('tables.setStyle');
    expect(calls[0].input.styleId).toBe('TableGrid');
  });

  test('routes sort with keys array', async () => {
    const { execute, calls } = mockExecutor();
    const keys = [{ columnIndex: 0, direction: 'ascending', type: 'text' }];
    await dispatch('superdoc_table', { action: 'sort', target, keys }, execute);
    expect(calls[0].operationId).toBe('tables.sort');
    expect(calls[0].input.keys).toEqual(keys);
  });
});

describe('routeList', () => {
  const target = JSON.stringify({ kind: 'block', nodeId: 'li1' });

  test('routes insert', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_list', { action: 'insert', target, text: 'New item', position: 'after' }, execute);
    expect(calls[0].operationId).toBe('lists.insert');
    expect(calls[0].input.text).toBe('New item');
  });

  test('routes indent', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_list', { action: 'indent', target }, execute);
    expect(calls[0].operationId).toBe('lists.indent');
  });

  test('routes outdent', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_list', { action: 'outdent', target }, execute);
    expect(calls[0].operationId).toBe('lists.outdent');
  });

  test('routes set_type', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_list', { action: 'set_type', target, kind: 'ordered' }, execute);
    expect(calls[0].operationId).toBe('lists.setType');
    expect(calls[0].input.kind).toBe('ordered');
  });

  test('routes detach', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_list', { action: 'detach', target }, execute);
    expect(calls[0].operationId).toBe('lists.detach');
  });
});

describe('routeImage', () => {
  const target = JSON.stringify({ nodeId: 'img1' });

  test('routes list without target', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_image', { action: 'list' }, execute);
    expect(calls[0].operationId).toBe('images.list');
  });

  test('routes get with imageId', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_image', { action: 'get', target }, execute);
    expect(calls[0].operationId).toBe('images.get');
    expect(calls[0].input.imageId).toBe('img1');
  });

  test('routes resize with nested size', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_image', { action: 'resize', target, width: 200, height: 100 }, execute);
    expect(calls[0].operationId).toBe('images.setSize');
    expect(calls[0].input.size).toEqual({ width: 200, height: 100 });
  });

  test('routes set_alt_text with description field', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_image', { action: 'set_alt_text', target, alt_text: 'A photo' }, execute);
    expect(calls[0].operationId).toBe('images.setAltText');
    expect(calls[0].input.description).toBe('A photo');
  });

  test('routes set_wrap with type field', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_image', { action: 'set_wrap', target, wrap: 'tight' }, execute);
    expect(calls[0].operationId).toBe('images.setWrapType');
    expect(calls[0].input.type).toBe('tight');
  });

  test('routes delete', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_image', { action: 'delete', target }, execute);
    expect(calls[0].operationId).toBe('images.delete');
  });
});

describe('routeSection', () => {
  const target = JSON.stringify({ kind: 'section', sectionId: 's1' });

  test('routes get_layout with address field', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_section', { action: 'get_layout', target }, execute);
    expect(calls[0].operationId).toBe('sections.get');
    expect(calls[0].input.address).toEqual({ kind: 'section', sectionId: 's1' });
  });

  test('routes set_margins', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch(
      'superdoc_section',
      { action: 'set_margins', target, top: 1, bottom: 1, left: 1, right: 1 },
      execute,
    );
    expect(calls[0].operationId).toBe('sections.setPageMargins');
  });

  test('routes insert_break with mapped break type', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_section', { action: 'insert_break', break_type: 'page' }, execute);
    expect(calls[0].operationId).toBe('create.sectionBreak');
    expect(calls[0].input.breakType).toBe('nextPage');
  });

  test('routes insert_break with even/odd mapping', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_section', { action: 'insert_break', break_type: 'even' }, execute);
    expect(calls[0].input.breakType).toBe('evenPage');
  });

  test('routes list_headers_footers with section', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_section', { action: 'list_headers_footers', target }, execute);
    expect(calls[0].operationId).toBe('headerFooters.list');
    expect(calls[0].input.section).toEqual({ kind: 'section', sectionId: 's1' });
  });
});

describe('routeReference', () => {
  const target = JSON.stringify({ kind: 'text', blockId: 'p1' });

  test('routes list_links', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_reference', { action: 'list_links' }, execute);
    expect(calls[0].operationId).toBe('hyperlinks.list');
  });

  test('routes insert_link with nested link spec', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch(
      'superdoc_reference',
      { action: 'insert_link', target, url: 'https://example.com', text: 'Click' },
      execute,
    );
    expect(calls[0].operationId).toBe('hyperlinks.insert');
    expect(calls[0].input.link).toEqual({ destination: { href: 'https://example.com' } });
    expect(calls[0].input.text).toBe('Click');
  });

  test('routes update_link with patch structure', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_reference', { action: 'update_link', id: 'link1', url: 'https://new.com' }, execute);
    expect(calls[0].operationId).toBe('hyperlinks.patch');
    expect(calls[0].input.target).toBe('link1');
    expect(calls[0].input.patch).toEqual({ href: 'https://new.com' });
  });

  test('routes remove_link', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_reference', { action: 'remove_link', id: 'link1' }, execute);
    expect(calls[0].operationId).toBe('hyperlinks.remove');
    expect(calls[0].input.target).toBe('link1');
  });

  test('routes insert_bookmark with at field', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_reference', { action: 'insert_bookmark', target, name: 'MyBookmark' }, execute);
    expect(calls[0].operationId).toBe('bookmarks.insert');
    expect(calls[0].input.at).toEqual({ kind: 'text', blockId: 'p1' });
    expect(calls[0].input.name).toBe('MyBookmark');
  });

  test('routes remove_bookmark with target', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_reference', { action: 'remove_bookmark', id: 'bk1' }, execute);
    expect(calls[0].operationId).toBe('bookmarks.remove');
    expect(calls[0].input.target).toBe('bk1');
  });

  test('routes insert_footnote with at, type, content', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_reference', { action: 'insert_footnote', target, text: 'See appendix' }, execute);
    expect(calls[0].operationId).toBe('footnotes.insert');
    expect(calls[0].input.at).toEqual({ kind: 'text', blockId: 'p1' });
    expect(calls[0].input.type).toBe('footnote');
    expect(calls[0].input.content).toBe('See appendix');
  });

  test('routes remove_footnote with target', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_reference', { action: 'remove_footnote', id: 'fn1' }, execute);
    expect(calls[0].operationId).toBe('footnotes.remove');
    expect(calls[0].input.target).toBe('fn1');
  });
});

describe('routeControl', () => {
  const target = JSON.stringify({ kind: 'block', nodeId: 'sdt1' });

  test('routes list', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_control', { action: 'list' }, execute);
    expect(calls[0].operationId).toBe('contentControls.list');
  });

  test('routes get', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_control', { action: 'get', target }, execute);
    expect(calls[0].operationId).toBe('contentControls.get');
  });

  test('fill routes checkbox via controlType', async () => {
    const { execute, calls } = mockExecutor({ controlType: 'checkbox' });
    await dispatch('superdoc_control', { action: 'fill', target, value: 'true' }, execute);
    // First call: get control type; second call: set checkbox
    expect(calls).toHaveLength(2);
    expect(calls[0].operationId).toBe('contentControls.get');
    expect(calls[1].operationId).toBe('contentControls.checkbox.setState');
    expect(calls[1].input.checked).toBe(true);
  });

  test('fill routes dropDownList via controlType', async () => {
    const { execute, calls } = mockExecutor({ controlType: 'dropDownList' });
    await dispatch('superdoc_control', { action: 'fill', target, value: 'Option A' }, execute);
    expect(calls[1].operationId).toBe('contentControls.choiceList.setSelected');
    expect(calls[1].input.value).toBe('Option A');
  });

  test('fill routes date via controlType', async () => {
    const { execute, calls } = mockExecutor({ controlType: 'date' });
    await dispatch('superdoc_control', { action: 'fill', target, value: '2026-01-01' }, execute);
    expect(calls[1].operationId).toBe('contentControls.date.setValue');
  });

  test('fill defaults to text for unknown controlType', async () => {
    const { execute, calls } = mockExecutor({ controlType: 'text' });
    await dispatch('superdoc_control', { action: 'fill', target, value: 'Hello' }, execute);
    expect(calls[1].operationId).toBe('contentControls.text.setValue');
  });

  test('routes wrap with kind field', async () => {
    const { execute, calls } = mockExecutor();
    await dispatch('superdoc_control', { action: 'wrap', target, type: 'block' }, execute);
    expect(calls[0].operationId).toBe('contentControls.wrap');
    expect(calls[0].input.kind).toBe('block');
  });
});
