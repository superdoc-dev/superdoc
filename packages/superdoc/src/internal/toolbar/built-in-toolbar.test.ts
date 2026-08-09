import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { nextTick } from 'vue';
import { BuiltInToolbar } from './built-in-toolbar.js';
import { useToolbarItem } from './built-in/use-toolbar-item.js';
import { createSuperDocUI } from '../../public/ui/create-super-doc-ui.js';
import type { SuperDocLike, SuperDocUI } from '../../public/ui/types.js';

/**
 * Controllers created by `makeHost`. The toolbar is a pure consumer of
 * `superdoc.ui` — the host owns the controller, exactly as `SuperDoc` does in
 * production — so the suite, not `toolbar.destroy()`, tears them down.
 */
const hostControllers: SuperDocUI[] = [];

function makeHost(overrides: Record<string, unknown> = {}) {
  const listeners = new Map<string, Set<() => void>>();
  const defaultConfig = {
    documentMode: 'editing',
    rulers: false,
    layoutEngineOptions: { showFormattingMarks: false },
  };
  const base = {
    activeEditor: { id: 'editor-1' },
    config: defaultConfig,
    fonts: {
      getDocumentFontOptions: () => [],
    },
    on: (event: string, handler: () => void) => {
      let handlers = listeners.get(event);
      if (!handlers) {
        handlers = new Set();
        listeners.set(event, handlers);
      }
      handlers.add(handler);
    },
    off: (event: string, handler: () => void) => {
      listeners.get(event)?.delete(handler);
    },
    emit: (event: string) => {
      for (const handler of listeners.get(event) ?? []) handler();
    },
    toggleRuler: vi.fn(),
    toggleFormattingMarks: vi.fn(),
    setShowFormattingMarks: vi.fn(),
    ...overrides,
  };
  const host: Record<string, unknown> = {
    ...base,
    config: {
      ...defaultConfig,
      ...((overrides.config as Record<string, unknown> | undefined) ?? {}),
    },
  };

  // Mirror `SuperDoc.ui`: one lazily created controller per host, with a
  // stable identity, owned by the host rather than by its consumers.
  let ui: SuperDocUI | null = null;
  Object.defineProperty(host, 'ui', {
    get() {
      if (!ui) {
        ui = createSuperDocUI({ superdoc: host as SuperDocLike });
        hostControllers.push(ui);
      }
      return ui;
    },
  });
  return host;
}

function makeFocusableHost() {
  const editorSurface = document.createElement('div');
  editorSurface.setAttribute('role', 'textbox');
  editorSurface.setAttribute('aria-label', 'SuperDoc body (v2)');
  editorSurface.tabIndex = 0;
  document.body.append(editorSurface);

  const focus = vi.fn(() => editorSurface.focus());
  const activeEditor = { id: 'editor-1', focus };
  return { editorSurface, focus, host: makeHost({ activeEditor, focus }) };
}

afterEach(() => {
  for (const controller of hostControllers.splice(0)) controller.destroy();
  document.body.innerHTML = '';
});

describe('BuiltInToolbar', () => {
  it('treats a groups array as group ordering instead of button composition', async () => {
    const toolbarContainer = document.createElement('div');
    document.body.append(toolbarContainer);

    const toolbar = new BuiltInToolbar({
      superdoc: makeHost(),
      selector: toolbarContainer,
      groups: ['left', 'center', 'right'],
      hideButtons: false,
    });

    expect(toolbar.getToolbarItemByName('bold')).toBeTruthy();
    expect(toolbar.config.toolbarGroups).toEqual(['left', 'center', 'right']);
    await nextTick();
    expect(toolbarContainer.querySelector('[data-item="btn-bold"]')).not.toBeNull();
    expect(toolbarContainer.querySelector('[data-item="btn-search"]')).not.toBeNull();
    toolbar.destroy();
  });

  it('keeps custom buttons in their configured group even when groups are explicit', () => {
    const toolbar = new BuiltInToolbar({
      superdoc: makeHost(),
      groups: {
        left: ['undo', 'redo'],
        center: ['bold'],
        right: ['zoom'],
      },
      customButtons: [
        {
          type: 'button',
          name: 'clear',
          tooltip: 'Clear formatting',
          icon: '<svg />',
          group: 'center',
          command: 'clear-formatting',
        },
      ],
    });

    expect(toolbar.getToolbarItemByGroup('center').map((item) => item.name.value)).toContain('clear');
    toolbar.destroy();
  });

  it('routes string-valued custom commands through the async shared command controller', () => {
    const toolbar = new BuiltInToolbar({
      superdoc: makeHost(),
      customButtons: [
        {
          type: 'button',
          name: 'clear',
          tooltip: 'Clear formatting',
          icon: '<svg />',
          command: 'clear-formatting',
        },
      ],
    });
    const execute = vi.fn();
    const executeAsync = vi.fn(() => Promise.resolve(true));
    toolbar.ui.commands.execute = execute;
    toolbar.ui.commands.executeAsync = executeAsync;

    toolbar.emitCommand({ item: toolbar.getToolbarItemByName('clear') });

    expect(executeAsync).toHaveBeenCalledWith('clear-formatting');
    expect(execute).not.toHaveBeenCalled();
    toolbar.destroy();
  });

  // The Link control keeps its accessible name through the real toolbar sync,
  // not just through `onActivate`/`onDeactivate`. `updateToolbarState()` has a
  // dedicated `link` handler that writes `attributes` directly, so a fix applied
  // only to the item's own handlers would still leave `ToolbarButton.vue`
  // rendering "undefined …" into its live region on the first snapshot.
  it('keeps the link accessible name across updateToolbarState with and without an href', () => {
    const toolbar = new BuiltInToolbar({ superdoc: makeHost() });
    const link = toolbar.getToolbarItemByName('link');
    expect(link, 'expected a link item on the built-in toolbar').toBeTruthy();
    expect(link!.attributes.value.ariaLabel).toBe('Link dropdown');

    // A snapshot carrying an href: the control is on a link.
    toolbar.snapshot = { commands: { link: { active: true, disabled: false, value: 'https://example.com' } } };
    toolbar.updateToolbarState();
    expect(link!.attributes.value.href).toBe('https://example.com');
    expect(link!.attributes.value.ariaLabel, 'href sync must not drop the label').toBe('Link dropdown');

    // A snapshot with no href: the caret left the link.
    toolbar.snapshot = { commands: { link: { active: false, disabled: false, value: null } } };
    toolbar.updateToolbarState();
    expect(link!.attributes.value.href).toBeUndefined();
    expect(link!.attributes.value.ariaLabel, 'clearing the href must not drop the label').toBe('Link dropdown');

    toolbar.destroy();
  });

  it('routes built-in commands through executeAsync and refreshes after settlement', async () => {
    const toolbar = new BuiltInToolbar({ superdoc: makeHost() });
    const execute = vi.fn();
    const executeAsync = vi.fn(() => Promise.resolve({ success: true }));
    toolbar.ui.commands.execute = execute;
    toolbar.ui.commands.executeAsync = executeAsync;
    const updateToolbarState = vi.spyOn(toolbar, 'updateToolbarState');

    toolbar.emitCommand({ item: toolbar.getToolbarItemByName('bold') });

    expect(executeAsync).toHaveBeenCalledWith('bold');
    expect(execute).not.toHaveBeenCalled();
    const callsAfterEmit = updateToolbarState.mock.calls.length;
    await Promise.resolve();
    expect(updateToolbarState.mock.calls.length).toBeGreaterThan(callsAfterEmit);
    toolbar.destroy();
  });

  it('does not create a Vue app when no toolbar container resolves', () => {
    const toolbar = new BuiltInToolbar({
      superdoc: makeHost(),
      selector: '#missing-toolbar',
    });

    expect(toolbar.app).toBeUndefined();
    expect(toolbar.getToolbarItemByName('bold')).toBeTruthy();
    toolbar.destroy();
  });

  it('returns focus to the V2 editor that owned the selection after selecting a document mode', async () => {
    const toolbarContainer = document.createElement('div');
    const firstEditorSurface = document.createElement('div');
    firstEditorSurface.tabIndex = 0;
    const selectedEditorSurface = document.createElement('div');
    selectedEditorSurface.setAttribute('role', 'textbox');
    selectedEditorSurface.setAttribute('aria-label', 'SuperDoc body (v2)');
    selectedEditorSurface.tabIndex = 0;
    document.body.append(toolbarContainer, firstEditorSurface, selectedEditorSurface);

    const firstEditor = {
      id: 'editor-1',
      focus: vi.fn(() => firstEditorSurface.focus()),
    };
    const selectedEditor = {
      id: 'editor-2',
      focus: vi.fn(() => selectedEditorSurface.focus()),
    };
    let toolbar: BuiltInToolbar;
    const setDocumentMode = vi.fn(() => toolbar.setActiveEditor(firstEditor));
    toolbar = new BuiltInToolbar({
      superdoc: makeHost({ activeEditor: selectedEditor, setDocumentMode }),
      selector: toolbarContainer,
    });

    const trigger = toolbarContainer.querySelector<HTMLElement>('[aria-label="Document mode"]');
    expect(trigger).not.toBeNull();
    trigger?.click();
    await nextTick();
    await nextTick();

    const options = [...document.querySelectorAll<HTMLElement>('[data-item="btn-documentMode-option"]')];
    const suggestingOption = options.find((option) => option.textContent?.includes('Suggesting'));
    expect(options[0]).toBe(document.activeElement);
    expect(suggestingOption).toBeDefined();

    suggestingOption?.click();
    await nextTick();
    await Promise.resolve();

    expect(setDocumentMode).toHaveBeenCalledWith('suggesting');
    expect(toolbar.getToolbarItemByName('documentMode')?.expand.value).toBe(false);
    expect(selectedEditor.focus).toHaveBeenCalled();
    expect(firstEditor.focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(selectedEditorSurface);
    toolbar.destroy();
  });

  it('returns focus to the V2 editor after selecting an alignment', async () => {
    const toolbarContainer = document.createElement('div');
    document.body.append(toolbarContainer);
    const { editorSurface, focus, host } = makeFocusableHost();
    const toolbar = new BuiltInToolbar({
      superdoc: host,
      selector: toolbarContainer,
      groups: { center: ['textAlign'] },
      hideButtons: false,
    });
    const executeAsync = vi.fn(() => Promise.resolve(true));
    toolbar.ui.commands.executeAsync = executeAsync;
    toolbar.getToolbarItemByName('textAlign')!.disabled.value = false;
    await nextTick();

    const trigger = toolbarContainer.querySelector<HTMLElement>('[aria-label="Text align"]');
    expect(trigger).not.toBeNull();
    trigger?.click();
    await nextTick();
    await nextTick();
    const centerOption = document.querySelector<HTMLElement>('[aria-label="Align center"]');
    expect(centerOption).not.toBeNull();
    expect(document.activeElement).not.toBe(editorSurface);

    centerOption?.click();
    await nextTick();

    expect(executeAsync).toHaveBeenCalledWith('text-align', 'center');
    expect(toolbar.getToolbarItemByName('textAlign')?.expand.value).toBe(false);
    expect(focus).toHaveBeenCalled();
    expect(document.activeElement).toBe(editorSurface);
    toolbar.destroy();
  });

  it('returns focus to the V2 editor after selecting a line height', async () => {
    const toolbarContainer = document.createElement('div');
    document.body.append(toolbarContainer);
    const { editorSurface, focus, host } = makeFocusableHost();
    const toolbar = new BuiltInToolbar({
      superdoc: host,
      selector: toolbarContainer,
      groups: { center: ['lineHeight'] },
      hideButtons: false,
    });
    const executeAsync = vi.fn(() => Promise.resolve(true));
    toolbar.ui.commands.executeAsync = executeAsync;
    toolbar.getToolbarItemByName('lineHeight')!.disabled.value = false;
    await nextTick();

    const trigger = toolbarContainer.querySelector<HTMLElement>('[aria-label="Line height"]');
    expect(trigger).not.toBeNull();
    trigger?.click();
    await nextTick();
    await nextTick();
    const option = [...document.querySelectorAll<HTMLElement>('[data-item="btn-lineHeight-option"]')].find((element) =>
      element.textContent?.includes('1.15'),
    );
    expect(option).toBeDefined();
    expect(document.activeElement).not.toBe(editorSurface);

    option?.click();
    await nextTick();

    expect(executeAsync).toHaveBeenCalledWith('line-height', 1.15);
    expect(toolbar.getToolbarItemByName('lineHeight')?.expand.value).toBe(false);
    expect(focus).toHaveBeenCalled();
    expect(document.activeElement).toBe(editorSurface);
    toolbar.destroy();
  });

  it('returns focus to the V2 editor after applying a link', async () => {
    const toolbarContainer = document.createElement('div');
    document.body.append(toolbarContainer);
    const { editorSurface, focus, host } = makeFocusableHost();
    const toolbar = new BuiltInToolbar({
      superdoc: host,
      selector: toolbarContainer,
      groups: { center: ['link'] },
      hideButtons: false,
    });
    const execute = vi.fn(() => true);
    toolbar.ui.commands.execute = execute;
    toolbar.getToolbarItemByName('link')!.disabled.value = false;
    await nextTick();

    const trigger = toolbarContainer.querySelector<HTMLElement>('[aria-label="Link dropdown"]');
    expect(trigger).not.toBeNull();
    trigger?.click();
    await nextTick();
    await nextTick();
    const urlInput = document.querySelector<HTMLInputElement>('.link-input-ctn input[name="link"]');
    expect(urlInput).not.toBeNull();
    expect(document.activeElement).not.toBe(editorSurface);
    if (urlInput) {
      urlInput.value = 'superdoc.dev';
      urlInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await nextTick();

    document.querySelector<HTMLElement>('[data-item="btn-link-apply"]')?.click();
    await nextTick();

    expect(execute).toHaveBeenCalledWith(
      'link',
      expect.objectContaining({ href: 'https://superdoc.dev', text: 'https://superdoc.dev' }),
    );
    expect(toolbar.getToolbarItemByName('link')?.expand.value).toBe(false);
    expect(focus).toHaveBeenCalled();
    expect(document.activeElement).toBe(editorSurface);
    toolbar.destroy();
  });

  it('shows the AI toolbar item only when modules.ai is configured', () => {
    const withoutAi = new BuiltInToolbar({
      superdoc: makeHost(),
    });
    const withAi = new BuiltInToolbar({
      superdoc: makeHost({ config: { modules: { ai: {} } } }),
    });

    expect(withoutAi.getToolbarItemByName('ai')).toBeUndefined();
    expect(withAi.getToolbarItemByName('ai')).toBeTruthy();

    withoutAi.destroy();
    withAi.destroy();
  });

  it('keeps v1 toolbar controls enabled for missing selection reasons only', () => {
    const toolbar = new BuiltInToolbar({
      superdoc: makeHost(),
    });

    toolbar.snapshot = {
      ...toolbar.snapshot,
      commands: {
        ...toolbar.snapshot?.commands,
        bold: { disabled: true, reason: 'range-selection-required' },
        'text-color': { disabled: true, reason: 'range-selection-required' },
        'text-align': { disabled: true, reason: 'selection-required' },
        'bullet-list': { disabled: true, supported: true },
        'numbered-list': { disabled: true, supported: true },
        'document-mode': { disabled: false, value: 'editing' },
      },
    };
    toolbar.updateToolbarState();

    expect(toolbar.getToolbarItemByName('bold')?.disabled.value).toBe(false);
    expect(toolbar.getToolbarItemByName('color')?.disabled.value).toBe(false);
    expect(toolbar.getToolbarItemByName('textAlign')?.disabled.value).toBe(false);
    expect(toolbar.getToolbarItemByName('list')?.disabled.value).toBe(false);
    expect(toolbar.getToolbarItemByName('numberedlist')?.disabled.value).toBe(false);

    toolbar.snapshot = {
      ...toolbar.snapshot,
      commands: {
        ...toolbar.snapshot?.commands,
        bold: { disabled: true, reason: 'document-readonly' },
        'document-mode': { disabled: false, value: 'editing' },
      },
    };
    toolbar.updateToolbarState();

    expect(toolbar.getToolbarItemByName('bold')?.disabled.value).toBe(true);
    toolbar.destroy();
  });

  it('blanks the font-family field for a mixed (multi-font) selection', () => {
    const toolbar = new BuiltInToolbar({ superdoc: makeHost() });

    const applyFontState = (state: Record<string, unknown>) => {
      toolbar.snapshot = {
        ...toolbar.snapshot,
        commands: {
          ...toolbar.snapshot?.commands,
          'font-family': state,
          'document-mode': { disabled: false, value: 'editing' },
        },
      };
      toolbar.updateToolbarState();
    };

    // A single resolved family shows that family.
    applyFontState({ disabled: false, value: 'Times New Roman' });
    expect(toolbar.getToolbarItemByName('fontFamily')?.label.value).toBe('Times New Roman');

    // A range selection that resolves to no single family blanks the field.
    applyFontState({ disabled: false, value: null });
    expect(toolbar.getToolbarItemByName('fontFamily')?.label.value).toBe('');
    expect(toolbar.getToolbarItemByName('fontFamily')?.selectedValue.value).toBe('');

    // No usable selection (disabled) falls back to the default family.
    applyFontState({ disabled: true, value: null, reason: 'range-selection-required' });
    expect(toolbar.getToolbarItemByName('fontFamily')?.label.value).toBe('Arial');

    toolbar.destroy();
  });

  it('projects the linked-style dropdown options from the ui.styles quick gallery', () => {
    const toolbar = new BuiltInToolbar({ superdoc: makeHost() });
    const quickGallery = [
      { id: 'Heading1', name: 'Heading 1', preview: { available: true, css: { fontWeight: 700 } } },
      { id: 'Normal', name: 'Normal' },
    ];
    toolbar.ui.styles.getQuickGallery = () => quickGallery;
    toolbar.ui.styles.getActiveParagraphStyle = () => ({
      styleId: 'Normal',
      styleName: 'Normal',
      mixed: false,
      diagnostics: [],
    });

    expect(toolbar.getLinkedStyleOptions()).toBe(quickGallery);
    expect(toolbar.getActiveLinkedStyleId()).toBe('Normal');
    toolbar.destroy();
  });

  it('routes a selected linked-style catalogue item through the linked-style command as a style id', () => {
    const toolbar = new BuiltInToolbar({ superdoc: makeHost() });
    const execute = vi.fn();
    const executeAsync = vi.fn(() => Promise.resolve(true));
    toolbar.ui.commands.execute = execute;
    toolbar.ui.commands.executeAsync = executeAsync;
    let activeStyleId: string | null = 'Heading1';
    toolbar.ui.styles.getQuickGallery = () => [{ id: 'Heading1', name: 'Heading 1' }];
    toolbar.ui.styles.getActiveParagraphStyle = () => ({
      styleId: activeStyleId,
      styleName: activeStyleId ? 'Heading 1' : null,
      mixed: activeStyleId == null,
      diagnostics: [],
    });

    const linkedStyles = toolbar.getToolbarItemByName('linkedStyles');
    const option = linkedStyles?.nestedOptions.value[0] as {
      render: () => { children?: Array<{ props?: Record<string, unknown> }> };
    };
    const vnode = option.render();
    const linkedStyleVNode = Array.isArray(vnode.children) ? vnode.children[0] : null;
    const props = linkedStyleVNode?.props as {
      onSelect?: (style: unknown) => void;
      selectedOption?: string;
      styles?: Array<{ id: string; name: string }>;
    };

    expect(props.styles?.map((style) => style.id)).toEqual(['Heading1']);
    expect(props.selectedOption).toBe('Heading1');
    props.onSelect?.({ id: 'Heading1', name: 'Heading 1' });

    expect(executeAsync).toHaveBeenCalledWith('linked-style', 'Heading1');
    expect(execute).not.toHaveBeenCalled();

    activeStyleId = null;
    const mixedVNode = option.render();
    const mixedLinkedStyleVNode = Array.isArray(mixedVNode.children) ? mixedVNode.children[0] : null;
    expect((mixedLinkedStyleVNode?.props as { selectedOption?: string | null }).selectedOption).toBeNull();
    toolbar.destroy();
  });

  it('shows the active linked-style display name from shared command state', () => {
    const toolbar = new BuiltInToolbar({ superdoc: makeHost() });
    toolbar.snapshot = {
      commands: {
        'document-mode': { value: 'editing', disabled: false },
        'linked-style': {
          disabled: false,
          enabled: true,
          supported: true,
          active: false,
          value: { styleId: 'Heading1', styleName: 'Heading 1' },
        },
      },
    };

    toolbar.updateToolbarState();
    expect(toolbar.getToolbarItemByName('linkedStyles')?.label.value).toBe('Heading 1');
    expect(toolbar.getToolbarItemByName('linkedStyles')?.disabled.value).toBe(false);
    toolbar.destroy();
  });

  it('returns an empty linked-style option list when the styles surface is unreachable', () => {
    const toolbar = new BuiltInToolbar({ superdoc: makeHost() });
    expect(toolbar.getLinkedStyleOptions()).toEqual([]);
    expect(toolbar.getActiveLinkedStyleId()).toBeNull();
    toolbar.destroy();
  });

  it('ships toolbar-scoped svg sizing so externally mounted toolbar icons render', () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(testDir, '../../assets/styles/elements/superdoc.css'), 'utf8');

    expect(css).toContain('.superdoc-toolbar svg');
    expect(css).toContain('pointer-events: none');
  });

  /**
   * `useToolbarItem` throws on three shapes, and until #1098 nothing caught
   * those throws. One malformed custom entry escaped `#makeToolbarItems` and
   * the toolbar never finished building, so a consumer lost every built-in
   * item over one of their own buttons. Observed in the browser too: all 39
   * rendered items disappeared.
   */
  describe('a malformed custom button does not take the toolbar with it', () => {
    const invalid = {
      noName: { type: 'button', label: 'Nameless', icon: '<i></i>', command: () => {} },
      unknownType: { type: 'definitelyNotAType', name: 'weird', icon: '<i></i>', command: () => {} },
      noType: { name: 'untyped', label: 'L', icon: '<i></i>', command: () => {} },
      noAffordance: { type: 'button', name: 'bare', command: () => {} },
      labelWithoutDefaultLabel: { type: 'button', name: 'liveLabelOnly', label: 'Save', command: () => {} },
    } as const;

    for (const [key, item] of Object.entries(invalid)) {
      it(`skips ${key} and keeps the built-in items`, () => {
        const toolbar = new BuiltInToolbar({
          superdoc: makeHost(),
          customButtons: [item],
          hideButtons: false,
        });

        // The built-ins are all still there, which is the whole point.
        expect(toolbar.getToolbarItemByName('bold')).toBeTruthy();
        expect(toolbar.toolbarItems.length).toBeGreaterThan(10);
        // And the entry that could not be built is simply absent.
        expect(toolbar.toolbarItems.some((i) => i.name?.value === (item as { name?: string }).name)).toBe(false);
        toolbar.destroy();
      });
    }

    it('reports the entry it skipped instead of failing silently', () => {
      // Items are built during construction, so there is no instance to attach
      // a listener to yet. Spying on the prototype is what lets the emit be
      // observed at the only moment it happens.
      const emitted: Array<[string, { error: Error; itemName: string | null }]> = [];
      const spy = vi.spyOn(BuiltInToolbar.prototype, 'emit').mockImplementation(function (
        this: unknown,
        event: string,
        payload: unknown,
      ) {
        if (event === 'exception') emitted.push([event, payload as { error: Error; itemName: string | null }]);
        return true;
      });

      const toolbar = new BuiltInToolbar({
        superdoc: makeHost(),
        customButtons: [invalid.noAffordance],
        hideButtons: false,
      });
      spy.mockRestore();

      expect(emitted).toHaveLength(1);
      const [, payload] = emitted[0];
      expect(payload.itemName).toBe('bare');
      // Actionable: names the entry and the field that would fix it.
      expect(payload.error.message).toContain('bare');
      expect(payload.error.message).toContain('defaultLabel');
      toolbar.destroy();
    });

    /**
     * Its own case because it fails differently from the others. A `null` or a
     * bare string in `options` is read unguarded while rendering
     * (`option.key`, `option.label` in `ToolbarDropdown.vue`), so it threw
     * inside Vue's render rather than at construction, which the surrounding
     * catch cannot contain: the app tore down and the toolbar disappeared.
     * Rejecting it at construction is what moves it into the recoverable path.
     */
    it('rejects a dropdown whose rows are not all objects', () => {
      const emitted: Array<{ error: Error; itemName: string | null }> = [];
      const spy = vi.spyOn(BuiltInToolbar.prototype, 'emit').mockImplementation(function (
        this: unknown,
        event: string,
        payload: unknown,
      ) {
        if (event === 'exception') emitted.push(payload as { error: Error; itemName: string | null });
        return true;
      });

      const toolbar = new BuiltInToolbar({
        superdoc: makeHost(),
        customButtons: [
          {
            type: 'dropdown',
            name: 'badRows',
            label: 'Bad rows',
            options: [{ label: 'Fine', key: 'fine' }, null, 'plain string'],
          },
          { type: 'button', name: 'survivor', icon: '<i></i>', command: () => {} },
        ],
        hideButtons: false,
      });
      spy.mockRestore();

      expect(toolbar.getToolbarItemByName('badRows')).toBeFalsy();
      // The built-ins and the valid sibling are untouched.
      expect(toolbar.getToolbarItemByName('bold')).toBeTruthy();
      expect(toolbar.getToolbarItemByName('survivor')).toBeTruthy();

      // And it says which entry and how many rows, rather than failing mute.
      expect(emitted).toHaveLength(1);
      expect(emitted[0].itemName).toBe('badRows');
      expect(emitted[0].error.message).toContain('badRows');
      expect(emitted[0].error.message).toContain('2 row(s)');
      toolbar.destroy();
    });

    /**
     * `#makeToolbarItems` runs on every throttled window resize and on font or
     * active-editor changes, so reporting from inside it fired once per
     * rebuild: a static configuration error became unbounded noise in consumer
     * telemetry for a mistake that cannot change without a reconfigure.
     * Measured before the fix as 1 exception at construction and 3 after two
     * resizes.
     */
    it('reports an unbuildable entry once, not once per rebuild', () => {
      const emitted: Array<{ itemName: string | null }> = [];
      const spy = vi.spyOn(BuiltInToolbar.prototype, 'emit').mockImplementation(function (
        this: unknown,
        event: string,
        payload: unknown,
      ) {
        if (event === 'exception') emitted.push(payload as { itemName: string | null });
        return true;
      });

      const toolbar = new BuiltInToolbar({
        superdoc: makeHost(),
        customButtons: [invalid.noAffordance],
        hideButtons: false,
      });
      expect(emitted).toHaveLength(1);

      // Every rebuild path the toolbar exposes, none of which the consumer
      // triggered and none of which changes the entry.
      toolbar.onToolbarResize();
      toolbar.onToolbarResize();
      toolbar.setActiveEditor({ id: 'editor-2' });
      spy.mockRestore();

      expect(emitted).toHaveLength(1);
      // Still skipped on each of those rebuilds, which is the half that must
      // not regress while the reporting is quietened.
      expect(toolbar.getToolbarItemByName('bare')).toBeFalsy();
      expect(toolbar.getToolbarItemByName('bold')).toBeTruthy();
      toolbar.destroy();
    });

    it('gives the host its own payload object, not the toolbar one', () => {
      // Two channels, two audiences: a toolbar listener that mutates what it
      // receives must not change what the host sees.
      const hostPayloads: Array<Record<string, unknown>> = [];
      const host = makeHost();
      (host as unknown as { emit: (e: string, p: unknown) => void }).emit = (event, p) => {
        if (event === 'exception') hostPayloads.push(p as Record<string, unknown>);
      };

      const toolbar = new BuiltInToolbar({
        superdoc: host,
        customButtons: [invalid.noAffordance],
        hideButtons: false,
      });

      expect(hostPayloads).toHaveLength(1);
      // `itemName` is the discriminator the public union documents for this
      // variant, so the host can route it without a cast.
      expect(hostPayloads[0].itemName).toBe('bare');
      toolbar.destroy();
    });

    /**
     * A sparse array is the case the first version of this check missed:
     * `filter` skips holes, so `new Array(2)` with one row assigned reported
     * zero unusable rows, and the spread then turned the hole into
     * `undefined` -- the value `ToolbarDropdown` dereferences while rendering.
     * Reachable from any JavaScript config that builds its rows by index.
     */
    it('rejects a dropdown whose rows are a sparse array', () => {
      const sparseRows = new Array(2);
      sparseRows[0] = { label: 'Only', key: 'only' };

      const toolbar = new BuiltInToolbar({
        superdoc: makeHost(),
        customButtons: [
          { type: 'dropdown', name: 'sparse', label: 'Sparse', options: sparseRows },
          { type: 'button', name: 'sibling', icon: '<i></i>', command: () => {} },
        ],
        hideButtons: false,
      });

      expect(toolbar.getToolbarItemByName('sparse')).toBeFalsy();
      expect(toolbar.getToolbarItemByName('sibling')).toBeTruthy();
      expect(toolbar.getToolbarItemByName('bold')).toBeTruthy();
      toolbar.destroy();
    });

    it('reports each nameless entry, not just the first', () => {
      // Two distinct entries failing the same way are two mistakes. Keying
      // the report-once set on the name alone collapsed them into one, so a
      // consumer could not tell how many of their entries were broken.
      const emitted: Array<{ itemName: string | null }> = [];
      const spy = vi.spyOn(BuiltInToolbar.prototype, 'emit').mockImplementation(function (
        this: unknown,
        event: string,
        payload: unknown,
      ) {
        if (event === 'exception') emitted.push(payload as { itemName: string | null });
        return true;
      });

      const toolbar = new BuiltInToolbar({
        superdoc: makeHost(),
        // Neither carries a name, and both fail the affordance check.
        customButtons: [{ type: 'button' }, { type: 'button' }],
        hideButtons: false,
      });
      expect(emitted).toHaveLength(2);

      // Still deduplicated across rebuilds, which is the property that must
      // survive making the key finer.
      toolbar.onToolbarResize();
      spy.mockRestore();
      expect(emitted).toHaveLength(2);
      toolbar.destroy();
    });

    it('shields the host payload from a toolbar listener that mutates it', () => {
      // The copy has to be taken before the toolbar emit, not at the host
      // emit: a toolbar listener runs synchronously inside `this.emit`, so a
      // copy taken afterwards already carries its changes and the isolation
      // is nominal only.
      const hostPayloads: Array<Record<string, unknown>> = [];
      const host = makeHost();
      (host as unknown as { emit: (e: string, p: unknown) => void }).emit = (event, p) => {
        if (event === 'exception') hostPayloads.push(p as Record<string, unknown>);
      };

      const toolbar = new BuiltInToolbar({
        superdoc: host,
        customButtons: [{ type: 'button', name: 'boom', icon: '<i></i>', command: 'definitelyNotACommand' }],
        hideButtons: false,
      });
      toolbar.on('exception', (payload: Record<string, unknown>) => {
        payload.itemName = 'mutated-by-listener';
      });

      // A real post-construction failure: an unknown string command throws
      // inside `emitCommand`, which catches and reports it -- the moment when
      // toolbar listeners exist and the ordering matters.
      const item = toolbar.getToolbarItemByName('boom');
      expect(item).toBeTruthy();
      toolbar.emitCommand({ item, argument: undefined, option: undefined });

      expect(hostPayloads).toHaveLength(1);
      expect(hostPayloads[0].itemName).toBe('boom');
      toolbar.destroy();
    });

    it('keeps the valid entries beside the skipped one', () => {
      const toolbar = new BuiltInToolbar({
        superdoc: makeHost(),
        customButtons: [invalid.noAffordance, { type: 'button', name: 'good', icon: '<i></i>', command: () => {} }],
        hideButtons: false,
      });

      expect(toolbar.getToolbarItemByName('good')).toBeTruthy();
      expect(toolbar.getToolbarItemByName('bare')).toBeFalsy();
      toolbar.destroy();
    });
  });

  it('names defaultLabel rather than label when a button has no affordance', () => {
    // The check tests `defaultLabel`; the message used to say "label", so a
    // consumer whose button already had `label: 'Save'` was told to add one.
    expect(() => useToolbarItem({ type: 'button', name: 'liveLabelOnly', label: 'Save' })).toThrow(/defaultLabel/);
  });

  /**
   * Names have to be unique because `data-item` is derived from them. The
   * survey showed a duplicate and a built-in collision both rendering a second
   * control under an existing id, with neither responding: a toolbar that
   * looks configured and is not.
   */
  describe('custom button names must be unique', () => {
    it('skips a second entry that reuses a custom name', () => {
      const toolbar = new BuiltInToolbar({
        superdoc: makeHost(),
        customButtons: [
          { type: 'button', name: 'dup', icon: '<i>1</i>', command: () => {} },
          { type: 'button', name: 'dup', icon: '<i>2</i>', command: () => {} },
        ],
        hideButtons: false,
      });

      expect(toolbar.toolbarItems.filter((i) => i.name?.value === 'dup')).toHaveLength(1);
      toolbar.destroy();
    });

    it('skips an entry that collides with a built-in name and keeps the built-in', () => {
      const toolbar = new BuiltInToolbar({
        superdoc: makeHost(),
        customButtons: [{ type: 'button', name: 'bold', icon: '<i></i>', command: () => {} }],
        hideButtons: false,
      });

      const bolds = toolbar.toolbarItems.filter((i) => i.name?.value === 'bold');
      expect(bolds).toHaveLength(1);
      // The surviving one is the built-in, not the replacement.
      expect(bolds[0].isCustomToolbarItem).toBeFalsy();
      toolbar.destroy();
    });
  });
});
