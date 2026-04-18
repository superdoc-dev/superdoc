import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { TrackInsertMarkName, TrackDeleteMarkName } from '../constants.js';
import { TrackChangesBasePlugin, TrackChangesBasePluginKey } from './trackChangesBasePlugin.js';
import { initTestEditor } from '@tests/helpers/helpers.js';

const highlightedClass = 'track-insert-dec highlighted';

describe('TrackChangesBasePlugin', () => {
  let editor;
  let schema;

  const createDocWithMark = () => {
    const mark = schema.marks[TrackInsertMarkName].create({ id: 'insert-1' });
    const paragraph = schema.nodes.paragraph.create(null, schema.text('Tracked', [mark]));
    return schema.nodes.doc.create(null, paragraph);
  };

  const createState = (doc) =>
    EditorState.create({
      schema,
      doc,
      plugins: [TrackChangesBasePlugin()],
    });

  beforeEach(() => {
    ({ editor } = initTestEditor({ mode: 'text', content: '<p></p>' }));
    schema = editor.schema;
  });

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('initialises with highlighted decorations for tracked insert marks', () => {
    const doc = createDocWithMark();
    const state = createState(doc);
    const pluginState = TrackChangesBasePluginKey.getState(state);

    expect(pluginState).toMatchObject({
      isTrackChangesActive: false,
      onlyOriginalShown: false,
      onlyModifiedShown: false,
    });

    const decorations = pluginState.decorations.find();
    expect(decorations).toHaveLength(1);
    expect(decorations[0].type.attrs.class).toBe(highlightedClass);
  });

  it('recomputes decorations when toggling visibility and activation flags', () => {
    let state = createState(createDocWithMark());

    // Show only original content hides insertions
    let tr = state.tr;
    tr.setMeta(TrackChangesBasePluginKey, { type: 'SHOW_ONLY_ORIGINAL', value: true });
    state = state.apply(tr);
    let pluginState = TrackChangesBasePluginKey.getState(state);
    expect(pluginState.onlyOriginalShown).toBe(true);
    expect(pluginState.onlyModifiedShown).toBe(false);
    expect(pluginState.decorations.find()[0].type.attrs.class).toBe('track-insert-dec hidden');

    // Switching to "final" view hides deletions but shows insertions
    tr = state.tr;
    tr.setMeta(TrackChangesBasePluginKey, { type: 'SHOW_ONLY_MODIFIED', value: true });
    state = state.apply(tr);
    pluginState = TrackChangesBasePluginKey.getState(state);
    expect(pluginState.onlyOriginalShown).toBe(false);
    expect(pluginState.onlyModifiedShown).toBe(true);
    expect(pluginState.decorations.find()[0].type.attrs.class).toBe('track-insert-dec normal');

    // Enabling tracking updates the activity flag without altering visibility
    tr = state.tr;
    tr.setMeta(TrackChangesBasePluginKey, { type: 'TRACK_CHANGES_ENABLE', value: true });
    state = state.apply(tr);
    pluginState = TrackChangesBasePluginKey.getState(state);
    expect(pluginState.isTrackChangesActive).toBe(true);
    expect(pluginState.decorations.find()[0].type.attrs.class).toBe('track-insert-dec normal');
  });

  it('returns an empty decoration set when no tracked marks exist', () => {
    const emptyParagraph = schema.nodes.paragraph.create();
    const doc = schema.nodes.doc.create(null, emptyParagraph);
    const state = createState(doc);
    const pluginState = TrackChangesBasePluginKey.getState(state);
    expect(pluginState.decorations).toBeDefined();
    expect(pluginState.decorations.find()).toHaveLength(0);
  });

  describe('Delete decoration widgets', () => {
    const createDocWithDeleteMark = () => {
      const deleteMark = schema.marks[TrackDeleteMarkName].create({ id: 'delete-1' });
      const paragraph = schema.nodes.paragraph.create(null, schema.text('Deleted text', [deleteMark]));
      return schema.nodes.doc.create(null, paragraph);
    };

    it('creates both inline and widget decorations for delete marks in normal mode', () => {
      const doc = createDocWithDeleteMark();
      const state = createState(doc);
      const pluginState = TrackChangesBasePluginKey.getState(state);

      const decorations = pluginState.decorations.find();

      // Should have 2 decorations: 1 inline + 1 widget
      expect(decorations).toHaveLength(2);

      // Check inline decoration
      const inlineDecoration = decorations.find((dec) => dec.type?.attrs?.class);
      expect(inlineDecoration).toBeDefined();
      expect(inlineDecoration.type.attrs.class).toBe('track-delete-dec highlighted');

      // Check widget decoration - widget decorations have a spec.key property
      const widgetDecoration = decorations.find((dec) => dec.spec?.key);
      expect(widgetDecoration).toBeDefined();
    });

    it('widget decoration has correct properties', () => {
      const doc = createDocWithDeleteMark();
      const state = createState(doc);
      const pluginState = TrackChangesBasePluginKey.getState(state);

      const decorations = pluginState.decorations.find();
      const widgetDecoration = decorations.find((dec) => dec.spec?.key);

      // Check widget spec has ignoreSelection
      expect(widgetDecoration.spec.ignoreSelection).toBe(true);

      // Check widget has a key
      expect(widgetDecoration.spec.key).toBeDefined();
      expect(widgetDecoration.spec.key).toBe('stable-key');

      // Verify the widget creates a span with the correct class
      const widgetElement = widgetDecoration.type.toDOM();
      expect(widgetElement.classList.contains('track-delete-widget')).toBe(true);
    });

    it('widget decoration does not have contentEditable attribute', () => {
      const doc = createDocWithDeleteMark();
      const state = createState(doc);
      const pluginState = TrackChangesBasePluginKey.getState(state);

      const decorations = pluginState.decorations.find();
      const widgetDecoration = decorations.find((dec) => dec.spec?.key);

      const widgetElement = widgetDecoration.type.toDOM();

      // The widget should not have contentEditable set to false
      expect(widgetElement.hasAttribute('contentEditable')).toBe(false);
    });

    it('creates widget decorations for multiple delete marks', () => {
      // Create a document with two separate delete marks
      const deleteMark1 = schema.marks[TrackDeleteMarkName].create({ id: 'delete-1' });
      const deleteMark2 = schema.marks[TrackDeleteMarkName].create({ id: 'delete-2' });

      const text1 = schema.text('First deletion', [deleteMark1]);
      const text2 = schema.text(' ');
      const text3 = schema.text('Second deletion', [deleteMark2]);

      const paragraph = schema.nodes.paragraph.create(null, [text1, text2, text3]);
      const doc = schema.nodes.doc.create(null, paragraph);

      const state = createState(doc);
      const pluginState = TrackChangesBasePluginKey.getState(state);

      const decorations = pluginState.decorations.find();

      // Should have 4 decorations: 2 inline + 2 widget (one pair for each deletion)
      expect(decorations).toHaveLength(4);

      const widgetDecorations = decorations.filter((dec) => dec.spec?.key);
      expect(widgetDecorations).toHaveLength(2);

      // Both widgets should have the same key (this is the current implementation)
      // Note: This highlights the issue mentioned in the code review
      expect(widgetDecorations[0].spec.key).toBe('stable-key');
      expect(widgetDecorations[1].spec.key).toBe('stable-key');
    });

    it('does not create widget decorations in "only original" mode', () => {
      const doc = createDocWithDeleteMark();
      let state = createState(doc);

      // Switch to "only original" mode
      const tr = state.tr;
      tr.setMeta(TrackChangesBasePluginKey, { type: 'SHOW_ONLY_ORIGINAL', value: true });
      state = state.apply(tr);

      const pluginState = TrackChangesBasePluginKey.getState(state);
      const decorations = pluginState.decorations.find();

      // Should only have 1 inline decoration (no widget in this mode)
      expect(decorations).toHaveLength(1);
      expect(decorations[0].type.attrs.class).toBe('track-delete-dec normal');

      // Verify no widget decorations
      const widgetDecorations = decorations.filter((dec) => dec.spec?.key);
      expect(widgetDecorations).toHaveLength(0);
    });

    it('does not create widget decorations in "only modified" mode', () => {
      const doc = createDocWithDeleteMark();
      let state = createState(doc);

      // Switch to "only modified" mode
      const tr = state.tr;
      tr.setMeta(TrackChangesBasePluginKey, { type: 'SHOW_ONLY_MODIFIED', value: true });
      state = state.apply(tr);

      const pluginState = TrackChangesBasePluginKey.getState(state);
      const decorations = pluginState.decorations.find();

      // Should only have 1 inline decoration with 'hidden' class (no widget in this mode)
      expect(decorations).toHaveLength(1);
      expect(decorations[0].type.attrs.class).toBe('track-delete-dec hidden');

      // Verify no widget decorations
      const widgetDecorations = decorations.filter((dec) => dec.spec?.key);
      expect(widgetDecorations).toHaveLength(0);
    });

    it('widget decoration is positioned at the start of the deleted range', () => {
      const doc = createDocWithDeleteMark();
      const state = createState(doc);
      const pluginState = TrackChangesBasePluginKey.getState(state);

      const decorations = pluginState.decorations.find();
      const widgetDecoration = decorations.find((dec) => dec.spec?.key);
      const inlineDecoration = decorations.find((dec) => dec.type?.attrs?.class);

      // Widget should be positioned at the same start position as the inline decoration
      expect(widgetDecoration.from).toBe(inlineDecoration.from);
    });
  });
});
