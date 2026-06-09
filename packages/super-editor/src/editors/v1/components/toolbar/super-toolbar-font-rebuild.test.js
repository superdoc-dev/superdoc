import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'eventemitter3';
import { SuperToolbar } from './super-toolbar.js';

// super-toolbar.js pulls a broad import graph; mock the same heavy leaves the sibling super-toolbar.test.js
// does, so the module imports cleanly in jsdom.
vi.mock('prosemirror-history', () => ({ undoDepth: () => 0, redoDepth: () => 0 }));
vi.mock('@core/helpers/getActiveFormatting.js', () => ({ getActiveFormatting: vi.fn(() => []) }));
vi.mock('@helpers/isInTable.js', () => ({ isInTable: vi.fn(() => false) }));
vi.mock('@extensions/linked-styles/index.js', () => ({ getQuickFormatList: vi.fn(() => []) }));
vi.mock('@extensions/track-changes/permission-helpers.js', () => ({
  collectTrackedChanges: vi.fn(() => []),
  isTrackedChangeActionAllowed: vi.fn(() => true),
}));

// The font dropdown is rebuilt by re-running makeDefaultItems with the current document fonts. Replace it
// with a light factory whose fontFamily item simply carries the toolbarFonts it was built with, so a
// rebuild is observable as "the dropdown now lists this font". The composition (dedupe and ordering)
// is covered in constants.test.js; here we only prove the TRIGGER threads the CURRENT document
// options into a fresh build - the original bug was fonts-changed refreshing state without rebuilding.
const { makeDefaultItemsSpy } = vi.hoisted(() => ({ makeDefaultItemsSpy: vi.fn() }));
vi.mock('./defaultItems', () => ({ makeDefaultItems: makeDefaultItemsSpy }));

const fontFamilyItem = (toolbarFonts) => ({
  name: { value: 'fontFamily' },
  options: { value: toolbarFonts },
  resetDisabled: vi.fn(),
  activate: vi.fn(),
  deactivate: vi.fn(),
  setDisabled: vi.fn(),
  allowWithoutEditor: { value: false },
});

const aptos = { logicalFamily: 'Aptos', previewFamily: 'Aptos' };

describe('SuperToolbar font dropdown rebuild trigger', () => {
  let toolbar;
  let editor;
  let documentOptions;

  beforeEach(() => {
    vi.clearAllMocks();
    makeDefaultItemsSpy.mockImplementation(({ toolbarFonts }) => ({
      defaultItems: [fontFamilyItem(toolbarFonts)],
      overflowItems: [],
    }));

    documentOptions = []; // a blank document: no document-specific fonts yet
    // A non-resolving selector makes the constructor early-return after building the initial items, so
    // there is no Vue mount or headless controller to stand up (the sibling toolbar tests use the same trick).
    toolbar = new SuperToolbar({ selector: '#nope', role: 'editor' });
    // The toolbar reads document fonts from the public read API; stand in a controllable one.
    toolbar.superdoc = { fonts: { getDocumentFontOptions: () => documentOptions } };
    // Isolate the rebuild from state refresh: updateToolbarState only re-reads existing item state, which is
    // exactly what the original bug relied on. Stubbing it proves the rebuild path stands on its own.
    vi.spyOn(toolbar, 'updateToolbarState').mockImplementation(() => {});
    // A real emitter editor: setActiveEditor binds 'fonts-changed' on it, which each test fires.
    editor = new EventEmitter();
    toolbar.setActiveEditor(editor);
  });

  const fontOptions = () => toolbar.getToolbarItemByName('fontFamily').options.value ?? [];

  it('rebuilds the dropdown options when fonts-changed reports a newly-resolved document font', () => {
    // Before resolution the dropdown carries only the bundled defaults (no document font).
    expect(fontOptions().some((o) => o.label === 'Aptos')).toBe(false);

    // Fonts settle asynchronously after load: the document now uses Aptos (no open substitute).
    documentOptions = [aptos];
    editor.emit('fonts-changed');

    // The dropdown was rebuilt (not merely state-refreshed): Aptos now appears.
    const option = fontOptions().find((o) => o.label === 'Aptos');
    expect(option).toBeTruthy();
  });

  it('rebuilds on active-editor change so a document that already resolved its fonts is reflected', () => {
    // The next document already knows its fonts before it becomes active.
    documentOptions = [aptos];
    toolbar.setActiveEditor(new EventEmitter());

    expect(fontOptions().some((o) => o.label === 'Aptos')).toBe(true);
  });

  it('emits toolbar-items-changed on active-editor change so a freshly attached editor is not left locked', () => {
    const changed = vi.fn();
    toolbar.on('toolbar-items-changed', changed);

    toolbar.setActiveEditor(new EventEmitter());
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('does not rebuild or re-emit when the same editor refocuses', () => {
    const changed = vi.fn();
    toolbar.on('toolbar-items-changed', changed);
    const buildsBeforeRefocus = makeDefaultItemsSpy.mock.calls.length;

    toolbar.setActiveEditor(editor);

    expect(makeDefaultItemsSpy.mock.calls.length).toBe(buildsBeforeRefocus);
    expect(changed).not.toHaveBeenCalled();
  });

  it('does not rebuild when fonts-changed fires with the same options (signature guard)', () => {
    documentOptions = [aptos];
    editor.emit('fonts-changed'); // first change -> rebuild
    const buildsAfterChange = makeDefaultItemsSpy.mock.calls.length;

    editor.emit('fonts-changed'); // identical options -> no rebuild
    expect(makeDefaultItemsSpy.mock.calls.length).toBe(buildsAfterChange);
  });

  it('emits toolbar-items-changed on rebuild (and not on the guarded no-op) so the view re-renders', () => {
    // The rebuilt arrays are plain fields; Toolbar.vue only re-reads them on this event. Prove it fires.
    const changed = vi.fn();
    toolbar.on('toolbar-items-changed', changed);

    documentOptions = [aptos];
    editor.emit('fonts-changed'); // a real change -> one rebuild -> one notify
    expect(changed).toHaveBeenCalledTimes(1);

    editor.emit('fonts-changed'); // identical options -> guard skips both the rebuild and the notify
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('does not rebuild custom configured font lists on document font changes', () => {
    const configuredFont = { label: 'BrandSans', key: 'BrandSans' };
    toolbar = new SuperToolbar({
      selector: '#nope',
      role: 'editor',
      fonts: [configuredFont],
    });
    toolbar.superdoc = { fonts: { getDocumentFontOptions: () => documentOptions } };
    vi.spyOn(toolbar, 'updateToolbarState').mockImplementation(() => {});
    editor = new EventEmitter();
    toolbar.setActiveEditor(editor);
    const buildsAfterAttach = makeDefaultItemsSpy.mock.calls.length;

    documentOptions = [aptos];
    editor.emit('fonts-changed');

    expect(makeDefaultItemsSpy.mock.calls.length).toBe(buildsAfterAttach);
    expect(toolbar.getToolbarItemByName('fontFamily').options.value).toEqual([configuredFont]);
  });
});
