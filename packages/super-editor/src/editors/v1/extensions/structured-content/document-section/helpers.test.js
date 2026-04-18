import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { getAllSections, exportSectionsToHTML, exportSectionsToJSON, getLinkedSectionEditor } from './helpers.js';

const makeSection = (schema, attrs, text) =>
  schema.nodes.documentSection.create(attrs, schema.nodes.paragraph.create(null, schema.text(text)));

describe('document section helpers', () => {
  let editor;
  let schema;

  beforeEach(async () => {
    ({ editor } = await initTestEditor({ mode: 'text', content: '<p>base</p>' }));
    schema = editor.schema;
  });

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  const replaceDoc = (nodeList) => {
    const doc = schema.nodes.doc.create(null, nodeList);
    const tr = editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content);
    editor.view.dispatch(tr);
  };

  it('collects and exports sections without duplicates', () => {
    replaceDoc([
      makeSection(schema, { id: 1, title: 'Alpha', description: 'one' }, 'First'),
      makeSection(schema, { id: 2, title: 'Beta', description: 'two' }, 'Second'),
      makeSection(schema, { id: 1, title: 'Duplicate', description: 'dup' }, 'First copy'),
    ]);

    const sections = getAllSections(editor);
    expect(sections).toHaveLength(3);
    expect(sections[0].node.attrs.title).toBe('Alpha');

    const html = exportSectionsToHTML(editor);
    expect(html).toHaveLength(2);
    expect(html[0]).toMatchObject({ id: 1, title: 'Alpha', description: 'one' });
    expect(html[0].html).toContain('First');

    const json = exportSectionsToJSON(editor);
    expect(json).toHaveLength(2);
    expect(json[1].content.type).toBe('documentSection');
  });

  it('returns null when section id not found', () => {
    replaceDoc([makeSection(schema, { id: 5, title: 'Missing' }, 'Content')]);
    const result = getLinkedSectionEditor(999, {}, editor);
    expect(result).toBeNull();
  });

  it('links a child editor and synchronises updates in both directions', () => {
    replaceDoc([makeSection(schema, { id: 7, title: 'Linked' }, 'Original')]);

    const child = getLinkedSectionEditor(7, { isHeadless: true }, editor);
    expect(child).toBeTruthy();

    // child -> parent
    child.commands.insertContent(' child-update');
    const sectionsAfterChildUpdate = getAllSections(editor);
    expect(sectionsAfterChildUpdate[0].node.textContent).toContain('child-update');

    // parent -> child
    const [{ pos, node }] = sectionsAfterChildUpdate;
    const updatedNode = node.type.create(node.attrs, [schema.nodes.paragraph.create(null, schema.text('Parent sync'))]);
    editor.view.dispatch(editor.state.tr.replaceWith(pos, pos + node.nodeSize, updatedNode));

    expect(child.state.doc.textContent).toContain('Parent sync');

    child.destroy();
  });
});
