import { describe, it, expect, afterEach } from 'vitest';
import { initTestEditor } from '@tests/helpers/helpers.js';
import { AiLoaderNodeName } from '../extensions/ai/ai-constants.js';

describe('Editor schema utilities', () => {
  let editor;

  afterEach(() => {
    if (editor && !editor.isDestroyed) {
      editor.destroy();
      editor = null;
    }
  });

  it('returns a summary for the current schema', async () => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p>Test</p>' }));

    const extensions = editor.extensionService?.extensions || [];
    const aiLoaderExt = extensions.find((ext) => ext.name === AiLoaderNodeName);

    expect(aiLoaderExt).toBeDefined();
    expect(aiLoaderExt?.config).toBeDefined();
    expect(aiLoaderExt?.config?.excludeFromSummaryJSON).toBe(true);

    const summary = await editor.getSchemaSummaryJSON();
    const nodeNames = summary.nodes.map((n) => n.name);
    const markNames = summary.marks.map((m) => m.name);

    expect(summary.schemaVersion).toBeDefined();
    expect(nodeNames).toEqual(expect.arrayContaining(['doc', 'paragraph', 'text']));
    expect(markNames.length).toBeGreaterThan(0);
    expect(nodeNames).not.toContain(AiLoaderNodeName);

    const paragraphSummary = summary.nodes.find((n) => n.name === 'paragraph')?.summary;
    expect(paragraphSummary).toBeTruthy();
  });

  it('validates JSON against the live schema', () => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p>Test</p>' }));

    const validDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ok' }] }],
    };

    const node = editor.validateJSON(validDoc);
    expect(node.type.name).toBe('doc');
    expect(() => editor.validateJSON({ type: 'doc', content: [{ type: 'unknown' }] })).toThrow(
      /Invalid document for current schema/i,
    );

    const fragment = [
      { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'world' }] },
    ];
    const fragmentNodes = editor.validateJSON(fragment);
    expect(Array.isArray(fragmentNodes)).toBe(true);
    expect(fragmentNodes).toHaveLength(2);
    expect(fragmentNodes[0].type.name).toBe('paragraph');
    expect(fragmentNodes[1].type.name).toBe('paragraph');

    const singleNode = { type: 'paragraph', content: [{ type: 'text', text: 'single' }] };
    const singleParagraph = editor.validateJSON(singleNode);
    expect(singleParagraph.type.name).toBe('paragraph');
  });
});
