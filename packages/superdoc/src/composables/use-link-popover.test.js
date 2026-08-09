// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test';
import { useLinkPopover } from './use-link-popover.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function createHandle() {
  let settle;
  return {
    id: 'link-popover',
    mode: 'floating',
    close: vi.fn((reason) => settle?.({ status: 'closed', reason })),
    result: new Promise((resolve) => {
      settle = resolve;
    }),
  };
}

function createManagerStub() {
  const handles = [];
  return {
    open: vi.fn(() => {
      const handle = createHandle();
      handles.push(handle);
      return handle;
    }),
    handles,
  };
}

function createPayload(overrides = {}) {
  const element = document.createElement('a');
  element.href = overrides.href ?? 'https://example.com';
  return {
    href: 'https://example.com',
    target: '_blank',
    rel: 'noopener',
    tooltip: 'Example',
    element,
    clientX: 42,
    clientY: 64,
    documentMode: 'editing',
    ...overrides,
  };
}

function createSubject({ resolver, manager = createManagerStub(), editor = { id: 'editor' }, ui } = {}) {
  const layer = document.createElement('div');
  vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue({
    left: 10,
    top: 20,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    x: 10,
    y: 20,
    toJSON: () => ({}),
  });
  const emitException = vi.fn();
  const uiController = ui ?? { id: 'ui' };
  const popover = useLinkPopover({
    getSurfaceManager: () => manager,
    getActiveEditor: () => editor,
    getUi: () => uiController,
    getResolver: () => resolver,
    getLayerElement: () => layer,
    emitException,
  });
  return { popover, manager, emitException, ui: uiController, editor };
}

describe('useLinkPopover', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the built-in link popover for editing mode without a resolver', async () => {
    const { popover, manager, ui } = createSubject();

    popover.handleLinkClick(createPayload());
    await tick();

    expect(manager.open).toHaveBeenCalledTimes(1);
    const request = manager.open.mock.calls[0][0];
    expect(request).toMatchObject({
      id: 'link-popover',
      mode: 'floating',
      closeOnEscape: true,
      floating: {
        left: '32px',
        top: '44px',
        closeOnOutsidePointerDown: true,
      },
    });
    expect(request.component).toBeDefined();
    expect(request.props).toMatchObject({
      href: 'https://example.com',
      target: '_blank',
      rel: 'noopener',
      tooltip: 'Example',
      documentMode: 'editing',
      ui,
    });
  });

  it('opens the built-in popover with the current doc-api href when the clicked DOM link is stale', async () => {
    const element = document.createElement('a');
    element.href = 'https://old.example/';
    element.dataset.linkRid = 'rId-old';
    element.textContent = 'SuperDoc website';
    const editor = {
      doc: {
        hyperlinks: {
          list: () => ({
            stories: [
              {
                storyId: 'main:/word/document.xml',
                hyperlinks: [
                  {
                    hyperlinkNodeId: 'hl:1',
                    rId: 'rId-new',
                    text: 'SuperDoc website',
                    targetKind: 'external',
                    externalTarget: 'https://new.example/',
                  },
                ],
              },
            ],
          }),
        },
      },
    };
    const { popover, manager } = createSubject({ editor });

    popover.handleLinkClick(
      createPayload({
        element,
        href: 'https://old.example/',
      }),
    );
    await tick();

    const request = manager.open.mock.calls[0][0];
    expect(request.props.href).toBe('https://new.example/');
    expect(request.props.hyperlinkTarget).toMatchObject({
      storyId: 'main:/word/document.xml',
      hyperlinkNodeId: 'hl:1',
      href: 'https://new.example/',
    });
  });

  it('opens the built-in popover with a hyperlink target from async worker-backed reads', async () => {
    const element = document.createElement('a');
    element.href = 'https://old.example/';
    element.dataset.linkRid = 'rId-worker';
    element.textContent = 'SuperDoc website';
    const editor = {
      doc: {
        hyperlinks: {
          list: () =>
            Promise.resolve({
              stories: [
                {
                  storyId: 'main:/word/document.xml',
                  hyperlinks: [
                    {
                      hyperlinkNodeId: 'hl:worker',
                      rId: 'rId-worker',
                      text: 'SuperDoc website',
                      targetKind: 'external',
                      externalTarget: 'https://worker.example/',
                    },
                  ],
                },
              ],
            }),
        },
      },
    };
    const { popover, manager } = createSubject({ editor });

    popover.handleLinkClick(
      createPayload({
        element,
        href: 'https://old.example/',
      }),
    );
    await tick();

    const request = manager.open.mock.calls[0][0];
    expect(request.props.href).toBe('https://worker.example/');
    expect(request.props.hyperlinkTarget).toMatchObject({
      storyId: 'main:/word/document.xml',
      hyperlinkNodeId: 'hl:worker',
      href: 'https://worker.example/',
    });
  });

  it('does not open a stale built-in popover after an async hyperlink read is cancelled', async () => {
    let resolveList;
    const editor = {
      doc: {
        hyperlinks: {
          list: () =>
            new Promise((resolve) => {
              resolveList = resolve;
            }),
        },
      },
    };
    const { popover, manager } = createSubject({ editor });

    popover.handleLinkClick(createPayload());
    popover.destroy();
    resolveList?.({ stories: [] });
    await tick();

    expect(manager.open).not.toHaveBeenCalled();
  });

  it('opens the built-in popover with full text and target for a clicked link segment', async () => {
    const element = document.createElement('a');
    element.href = 'https://example.com/';
    element.textContent = 'Super';
    const editor = {
      doc: {
        hyperlinks: {
          list: () => ({
            stories: [
              {
                storyId: 'main:/word/document.xml',
                hyperlinks: [
                  {
                    hyperlinkNodeId: 'hl:1',
                    text: 'SuperDoc website',
                    targetKind: 'external',
                    externalTarget: 'https://example.com/',
                    address: {
                      kind: 'inline',
                      nodeType: 'hyperlink',
                      anchor: {
                        start: { blockId: 'P1', offset: 10 },
                        end: { blockId: 'P1', offset: 26 },
                      },
                    },
                  },
                ],
              },
            ],
          }),
        },
      },
    };
    const { popover, manager } = createSubject({ editor });

    popover.handleLinkClick(
      createPayload({
        element,
        href: 'https://example.com/',
      }),
    );
    await tick();

    const request = manager.open.mock.calls[0][0];
    expect(request.props.hyperlinkText).toBe('SuperDoc website');
    expect(request.props.textTarget).toEqual({
      kind: 'selection',
      start: { kind: 'text', blockId: 'P1', offset: 10 },
      end: { kind: 'text', blockId: 'P1', offset: 26 },
    });
  });

  it('does not project cross-block hyperlink addresses into selection targets', async () => {
    const element = document.createElement('a');
    element.href = 'https://example.com/';
    element.textContent = 'SuperDoc website';
    const editor = {
      doc: {
        hyperlinks: {
          list: () => ({
            stories: [
              {
                storyId: 'main:/word/document.xml',
                hyperlinks: [
                  {
                    hyperlinkNodeId: 'hl:1',
                    text: 'SuperDoc website',
                    targetKind: 'external',
                    externalTarget: 'https://example.com/',
                    address: {
                      kind: 'inline',
                      nodeType: 'hyperlink',
                      anchor: {
                        start: { blockId: 'P1', offset: 10 },
                        end: { blockId: 'P2', offset: 6 },
                      },
                    },
                  },
                ],
              },
            ],
          }),
        },
      },
    };
    const { popover, manager } = createSubject({ editor });

    popover.handleLinkClick(
      createPayload({
        element,
        href: 'https://example.com/',
      }),
    );
    await tick();

    expect(manager.open.mock.calls[0][0].props.textTarget).toBeNull();
  });

  it('loads full text target details when the hyperlink list row has no address', async () => {
    const fragment = document.createElement('p');
    fragment.dataset.blockId = 'P1';
    fragment.dataset.pmStart = '1';
    fragment.append('prefix ');
    const element = document.createElement('a');
    element.href = 'https://example.com/';
    element.textContent = 'Super';
    fragment.append(element);
    const get = vi.fn(() => ({
      success: true,
      hyperlink: {
        hyperlinkNodeId: 'hl:1',
        text: 'SuperDoc website',
        targetKind: 'external',
        externalTarget: 'https://example.com/',
        address: {
          kind: 'inline',
          nodeType: 'hyperlink',
          anchor: {
            start: { blockId: 'P1', offset: 7 },
            end: { blockId: 'P1', offset: 23 },
          },
        },
      },
    }));
    const editor = {
      doc: {
        hyperlinks: {
          get,
          list: () => ({
            stories: [
              {
                storyId: 'main:/word/document.xml',
                hyperlinks: [
                  {
                    hyperlinkNodeId: 'hl:1',
                    text: 'SuperDoc website',
                    targetKind: 'external',
                    externalTarget: 'https://example.com/',
                  },
                ],
              },
            ],
          }),
        },
      },
    };
    const { popover, manager } = createSubject({ editor });

    popover.handleLinkClick(
      createPayload({
        element,
        href: 'https://example.com/',
      }),
    );
    await tick();

    expect(get).toHaveBeenCalledWith({ storyId: 'main:/word/document.xml', hyperlinkNodeId: 'hl:1' });
    expect(manager.open.mock.calls[0][0].props.textTarget).toEqual({
      kind: 'selection',
      start: { kind: 'text', blockId: 'P1', offset: 7 },
      end: { kind: 'text', blockId: 'P1', offset: 23 },
    });
  });

  it('converts rendered absolute PM link positions into block-relative text targets', async () => {
    const fragment = document.createElement('p');
    fragment.dataset.blockId = 'P1';
    fragment.dataset.pmStart = '171';
    fragment.dataset.pmEnd = '246';
    fragment.append('External link 1: https://example.com   External link 2: ');
    const element = document.createElement('a');
    element.href = 'https://www.superdoc.dev/';
    element.dataset.linkRid = 'rId203';
    element.dataset.pmStart = '230';
    element.dataset.pmEnd = '246';
    element.textContent = 'SuperDoc website';
    fragment.append(element);
    const get = vi.fn(() => ({
      success: true,
      hyperlink: {
        hyperlinkNodeId: 'hl:869:1',
        rId: 'rId203',
        text: 'SuperDoc website',
        targetKind: 'external',
        externalTarget: 'https://www.superdoc.dev/',
      },
    }));
    const match = vi.fn(() => ({
      items: [
        {
          target: {
            kind: 'selection',
            start: { kind: 'text', blockId: 'P1', offset: 56 },
            end: { kind: 'text', blockId: 'P1', offset: 72 },
          },
        },
      ],
    }));
    const editor = {
      doc: {
        query: { match },
        hyperlinks: {
          get,
          list: () => ({
            stories: [
              {
                storyId: 'main:/word/document.xml',
                hyperlinks: [
                  {
                    hyperlinkNodeId: 'hl:869:1',
                    rId: 'rId203',
                    text: 'SuperDoc website',
                    targetKind: 'external',
                    externalTarget: 'https://www.superdoc.dev/',
                  },
                ],
              },
            ],
          }),
        },
      },
    };
    const { popover, manager } = createSubject({ editor });

    popover.handleLinkClick(
      createPayload({
        element,
        href: 'https://www.superdoc.dev/',
      }),
    );
    await tick();

    expect(get).toHaveBeenCalledWith({ storyId: 'main:/word/document.xml', hyperlinkNodeId: 'hl:869:1' });
    expect(match).toHaveBeenCalledWith({
      select: { type: 'text', pattern: 'SuperDoc website', caseSensitive: true },
      require: 'any',
    });
    expect(manager.open.mock.calls[0][0].props.textTarget).toEqual({
      kind: 'selection',
      start: { kind: 'text', blockId: 'P1', offset: 56 },
      end: { kind: 'text', blockId: 'P1', offset: 72 },
    });
  });

  it('does not use a query fallback from another block when the clicked block is known', async () => {
    const fragment = document.createElement('p');
    fragment.dataset.blockId = 'P1';
    fragment.dataset.pmStart = '1';
    fragment.append('prefix ');
    const element = document.createElement('a');
    element.href = 'https://www.superdoc.dev/';
    element.textContent = 'SuperDoc website';
    fragment.append(element);
    const get = vi.fn(() => ({
      success: true,
      hyperlink: {
        hyperlinkNodeId: 'hl:869:1',
        text: 'SuperDoc website',
        targetKind: 'external',
        externalTarget: 'https://www.superdoc.dev/',
      },
    }));
    const match = vi.fn(() => ({
      items: [
        {
          target: {
            kind: 'selection',
            start: { kind: 'text', blockId: 'P2', offset: 0 },
            end: { kind: 'text', blockId: 'P2', offset: 16 },
          },
        },
      ],
    }));
    const editor = {
      doc: {
        query: { match },
        hyperlinks: {
          get,
          list: () => ({
            stories: [
              {
                storyId: 'main:/word/document.xml',
                hyperlinks: [
                  {
                    hyperlinkNodeId: 'hl:869:1',
                    text: 'SuperDoc website',
                    targetKind: 'external',
                    externalTarget: 'https://www.superdoc.dev/',
                  },
                ],
              },
            ],
          }),
        },
      },
    };
    const { popover, manager } = createSubject({ editor });

    popover.handleLinkClick(
      createPayload({
        element,
        href: 'https://www.superdoc.dev/',
      }),
    );
    await tick();

    expect(manager.open.mock.calls[0][0].props.textTarget).toEqual({
      kind: 'selection',
      start: { kind: 'text', blockId: 'P1', offset: 7 },
      end: { kind: 'text', blockId: 'P1', offset: 23 },
    });
  });

  it('uses clicked text to disambiguate rendered links that share a relationship id', async () => {
    const element = document.createElement('a');
    element.href = 'https://example.com/';
    element.dataset.linkRid = 'rId1';
    element.textContent = 'Second link';
    const editor = {
      doc: {
        hyperlinks: {
          list: () => ({
            stories: [
              {
                storyId: 'main:/word/document.xml',
                hyperlinks: [
                  {
                    hyperlinkNodeId: 'hl:1',
                    rId: 'rId1',
                    text: 'First link',
                    targetKind: 'external',
                    externalTarget: 'https://example.com/',
                  },
                  {
                    hyperlinkNodeId: 'hl:2',
                    rId: 'rId1',
                    text: 'Second link',
                    targetKind: 'external',
                    externalTarget: 'https://example.com/',
                  },
                ],
              },
            ],
          }),
        },
      },
    };
    const { popover, manager } = createSubject({ editor });

    popover.handleLinkClick(
      createPayload({
        element,
        href: 'https://example.com/',
      }),
    );
    await tick();

    const request = manager.open.mock.calls[0][0];
    expect(request.props.hyperlinkTarget).toMatchObject({
      storyId: 'main:/word/document.xml',
      hyperlinkNodeId: 'hl:2',
      text: 'Second link',
    });
  });

  it('uses clicked text range to disambiguate identical rendered links', async () => {
    const fragment = document.createElement('p');
    fragment.dataset.blockId = 'P1';
    fragment.dataset.pmStart = '1';
    const first = document.createElement('a');
    first.href = 'https://example.com/';
    first.dataset.linkRid = 'rId1';
    first.textContent = 'Click here';
    const element = document.createElement('a');
    element.href = 'https://example.com/';
    element.dataset.linkRid = 'rId1';
    element.textContent = 'Click here';
    fragment.append(first, ' and then ', element);
    const secondOffset = 'Click here and then '.length;
    const editor = {
      doc: {
        hyperlinks: {
          list: () => ({
            stories: [
              {
                storyId: 'main:/word/document.xml',
                hyperlinks: [
                  {
                    hyperlinkNodeId: 'hl:1',
                    rId: 'rId1',
                    text: 'Click here',
                    targetKind: 'external',
                    externalTarget: 'https://example.com/',
                    address: {
                      kind: 'inline',
                      nodeType: 'hyperlink',
                      anchor: {
                        start: { blockId: 'P1', offset: 0 },
                        end: { blockId: 'P1', offset: 'Click here'.length },
                      },
                    },
                  },
                  {
                    hyperlinkNodeId: 'hl:2',
                    rId: 'rId1',
                    text: 'Click here',
                    targetKind: 'external',
                    externalTarget: 'https://example.com/',
                    address: {
                      kind: 'inline',
                      nodeType: 'hyperlink',
                      anchor: {
                        start: { blockId: 'P1', offset: secondOffset },
                        end: { blockId: 'P1', offset: secondOffset + 'Click here'.length },
                      },
                    },
                  },
                ],
              },
            ],
          }),
        },
      },
    };
    const { popover, manager } = createSubject({ editor });

    popover.handleLinkClick(
      createPayload({
        element,
        href: 'https://example.com/',
      }),
    );
    await tick();

    const request = manager.open.mock.calls[0][0];
    expect(request.props.hyperlinkTarget).toMatchObject({
      storyId: 'main:/word/document.xml',
      hyperlinkNodeId: 'hl:2',
      text: 'Click here',
    });
  });

  it('prefers rendered pm offsets over DOM text walking when disambiguating identical links', async () => {
    const fragment = document.createElement('p');
    fragment.dataset.blockId = 'P1';
    fragment.dataset.pmStart = '1';
    fragment.append('1. ');
    const element = document.createElement('a');
    element.href = 'https://example.com/';
    element.dataset.linkRid = 'rId1';
    element.dataset.pmStart = '0';
    element.dataset.pmEnd = '10';
    element.textContent = 'Click here';
    fragment.append(element);
    const editor = {
      doc: {
        hyperlinks: {
          list: () => ({
            stories: [
              {
                storyId: 'main:/word/document.xml',
                hyperlinks: [
                  {
                    hyperlinkNodeId: 'hl:1',
                    rId: 'rId1',
                    text: 'Click here',
                    targetKind: 'external',
                    externalTarget: 'https://example.com/',
                    address: {
                      kind: 'inline',
                      nodeType: 'hyperlink',
                      anchor: {
                        start: { blockId: 'P1', offset: 0 },
                        end: { blockId: 'P1', offset: 10 },
                      },
                    },
                  },
                  {
                    hyperlinkNodeId: 'hl:2',
                    rId: 'rId1',
                    text: 'Click here',
                    targetKind: 'external',
                    externalTarget: 'https://example.com/',
                    address: {
                      kind: 'inline',
                      nodeType: 'hyperlink',
                      anchor: {
                        start: { blockId: 'P1', offset: 3 },
                        end: { blockId: 'P1', offset: 13 },
                      },
                    },
                  },
                ],
              },
            ],
          }),
        },
      },
    };
    const { popover, manager } = createSubject({ editor });

    popover.handleLinkClick(
      createPayload({
        element,
        href: 'https://example.com/',
      }),
    );
    await tick();

    expect(manager.open.mock.calls[0][0].props.hyperlinkTarget).toMatchObject({
      storyId: 'main:/word/document.xml',
      hyperlinkNodeId: 'hl:1',
    });
  });

  it('passes anchor navigation into the built-in link popover', async () => {
    const host = document.createElement('div');
    host.innerHTML = '<a name="section-one"></a>';
    const scrollTo = vi.fn();
    Object.defineProperty(host, 'scrollHeight', { configurable: true, value: 100 });
    Object.defineProperty(host, 'clientHeight', { configurable: true, value: 50 });
    host.scrollTo = scrollTo;
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ overflowY: 'auto' });
    const { popover, manager } = createSubject({
      ui: {
        viewport: {
          getHost: () => host,
        },
      },
    });

    popover.handleLinkClick(createPayload({ href: '#section-one' }));
    await tick();
    const handle = manager.handles[0];

    manager.open.mock.calls[0][0].props.goToAnchor('#section-one');

    expect(handle.close).toHaveBeenCalledWith('closed');
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('passes a complete resolver context', () => {
    const resolver = vi.fn(() => ({ type: 'none' }));
    const { popover, editor } = createSubject({ resolver });
    const payload = createPayload({ href: '#anchor', documentMode: 'suggesting' });

    popover.handleLinkClick(payload);

    expect(resolver).toHaveBeenCalledWith(
      expect.objectContaining({
        editor,
        href: '#anchor',
        target: '_blank',
        rel: 'noopener',
        tooltip: 'Example',
        element: payload.element,
        clientX: 42,
        clientY: 64,
        isAnchorLink: true,
        documentMode: 'suggesting',
        position: { left: '32px', top: '44px' },
      }),
    );
    expect(typeof resolver.mock.calls[0][0].closePopover).toBe('function');
  });

  it('suppresses the popover when resolver returns none', async () => {
    const { popover, manager } = createSubject({ resolver: () => ({ type: 'none' }) });

    popover.handleLinkClick(createPayload());
    await tick();

    expect(manager.open).not.toHaveBeenCalled();
  });

  it('opens a custom component with injected props', async () => {
    const component = { name: 'CustomLinkPopover' };
    const { popover, manager, editor } = createSubject({
      resolver: () => ({ type: 'custom', component, props: { label: 'Link' } }),
    });

    popover.handleLinkClick(createPayload());
    await tick();

    const request = manager.open.mock.calls[0][0];
    expect(request.component).toBeDefined();
    expect(request.props).toMatchObject({
      label: 'Link',
      editor,
      href: 'https://example.com',
    });
    expect(typeof request.props.closePopover).toBe('function');
  });

  it('closes the open surface from the injected closePopover prop', async () => {
    const component = { name: 'CustomLinkPopover' };
    const { popover, manager } = createSubject({
      resolver: () => ({ type: 'custom', component }),
    });

    popover.handleLinkClick(createPayload());
    await tick();

    const request = manager.open.mock.calls[0][0];
    const handle = manager.handles[0];
    request.props.closePopover();

    expect(handle.close).toHaveBeenCalledWith('closed');
  });

  it('falls back to default and emits exception for invalid custom resolutions', async () => {
    const { popover, manager, emitException } = createSubject({
      resolver: () => ({ type: 'custom', component: null }),
    });

    popover.handleLinkClick(createPayload());
    await tick();

    expect(emitException).toHaveBeenCalledWith({
      error: expect.objectContaining({
        message: 'modules.links.popoverResolver returned an invalid resolution.',
      }),
      source: 'linkPopoverResolver',
    });
    expect(manager.open).toHaveBeenCalledTimes(1);
    expect(manager.open.mock.calls[0][0].component).toBeDefined();
  });

  it('bridges external renderer context and cleanup return', async () => {
    const destroy = vi.fn();
    const render = vi.fn(() => ({ destroy }));
    const { popover, manager, editor } = createSubject({
      resolver: () => ({ type: 'external', render }),
    });

    popover.handleLinkClick(createPayload());
    await tick();

    const request = manager.open.mock.calls[0][0];
    const container = document.createElement('div');
    const result = request.render({
      container,
      close: vi.fn(),
    });

    expect(render).toHaveBeenCalledWith({
      container,
      closePopover: expect.any(Function),
      editor,
      href: 'https://example.com',
    });
    expect(result).toEqual({ destroy });
  });

  it('falls back to default and emits exception when resolver throws', async () => {
    const error = new Error('bad resolver');
    const { popover, manager, emitException } = createSubject({
      resolver: () => {
        throw error;
      },
    });

    popover.handleLinkClick(createPayload());
    await tick();

    expect(emitException).toHaveBeenCalledWith({ error, source: 'linkPopoverResolver' });
    expect(manager.open).toHaveBeenCalledTimes(1);
  });

  it('falls back to default when external renderer throws', async () => {
    const error = new Error('bad render');
    const { popover, manager, emitException } = createSubject({
      resolver: () => ({
        type: 'external',
        render: () => {
          throw error;
        },
      }),
    });

    popover.handleLinkClick(createPayload());
    await tick();
    const externalRequest = manager.open.mock.calls[0][0];
    const close = vi.fn();

    externalRequest.render({ container: document.createElement('div'), close });
    await tick();

    expect(emitException).toHaveBeenCalledWith({ error, source: 'linkPopoverExternalRender' });
    expect(close).toHaveBeenCalledWith('external-error');
    expect(manager.open).toHaveBeenCalledTimes(2);
  });

  it('does not fall back to default after an external renderer error if destroyed first', async () => {
    const error = new Error('bad render');
    const { popover, manager, emitException } = createSubject({
      resolver: () => ({
        type: 'external',
        render: () => {
          throw error;
        },
      }),
    });

    popover.handleLinkClick(createPayload());
    await tick();
    const externalRequest = manager.open.mock.calls[0][0];

    externalRequest.render({ container: document.createElement('div'), close: vi.fn() });
    popover.destroy();
    await tick();

    expect(emitException).toHaveBeenCalledWith({ error, source: 'linkPopoverExternalRender' });
    expect(manager.open).toHaveBeenCalledTimes(1);
  });

  it('toggles the same link closed', async () => {
    const { popover, manager } = createSubject();
    const payload = createPayload();

    popover.handleLinkClick(payload);
    await tick();
    popover.handleLinkClick(payload);

    expect(manager.handles[0].close).toHaveBeenCalledWith('toggle');
    expect(manager.open).toHaveBeenCalledTimes(1);
  });

  it('does not reopen the same link after the surface outside-click handler closes it first', async () => {
    const { popover, manager } = createSubject();
    const payload = createPayload();
    document.body.appendChild(payload.element);

    popover.handleLinkClick(payload);
    await tick();
    payload.element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    manager.handles[0].close();
    await tick();
    popover.handleLinkClick(payload);
    await tick();

    expect(manager.open).toHaveBeenCalledTimes(1);
  });

  it('reopens the same link after a non-pointer surface close', async () => {
    const { popover, manager } = createSubject();
    const payload = createPayload();

    popover.handleLinkClick(payload);
    await tick();
    manager.handles[0].close();
    await tick();
    popover.handleLinkClick(payload);
    await tick();

    expect(manager.open).toHaveBeenCalledTimes(2);
  });

  it('reopens the same link after an unrelated outside pointer close', async () => {
    const { popover, manager } = createSubject();
    const payload = createPayload();

    popover.handleLinkClick(payload);
    await tick();
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    manager.handles[0].close();
    await tick();
    popover.handleLinkClick(payload);
    await tick();

    expect(manager.open).toHaveBeenCalledTimes(2);
  });

  it('closes the active popover when destroyed', async () => {
    const { popover, manager } = createSubject();

    popover.handleLinkClick(createPayload());
    await tick();

    popover.destroy();

    expect(manager.handles[0].close).toHaveBeenCalledWith('destroyed');
  });

  it('cancels a pending surface open when explicitly closed before the microtask runs', async () => {
    const { popover, manager } = createSubject();

    popover.handleLinkClick(createPayload());
    popover.closeCurrentPopover();
    await tick();

    expect(manager.open).not.toHaveBeenCalled();
  });

  it('cancels a pending surface open when destroyed before the microtask runs', async () => {
    const { popover, manager } = createSubject();

    popover.handleLinkClick(createPayload());
    popover.destroy();
    await tick();

    expect(manager.open).not.toHaveBeenCalled();
  });

  it('opens viewing mode external links with noopener and no editable surface', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { popover, manager } = createSubject();

    popover.handleLinkClick(createPayload({ documentMode: 'viewing', rel: 'noopener noreferrer nofollow' }));
    await tick();

    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
    expect(manager.open).not.toHaveBeenCalled();
  });

  it('forces noopener for viewing mode blank-target links without rel features', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { popover, manager } = createSubject();

    popover.handleLinkClick(createPayload({ documentMode: 'viewing', target: '_blank', rel: null }));
    await tick();

    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener');
    expect(manager.open).not.toHaveBeenCalled();
  });

  it('preserves noreferrer when forcing noopener for viewing mode blank-target links', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { popover, manager } = createSubject();

    popover.handleLinkClick(createPayload({ documentMode: 'viewing', target: '_blank', rel: 'noreferrer' }));
    await tick();

    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
    expect(manager.open).not.toHaveBeenCalled();
  });

  it('opens viewing mode external links with the clicked target and rel features', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { popover, manager } = createSubject();

    popover.handleLinkClick(
      createPayload({ documentMode: 'viewing', target: 'report-frame', rel: 'nofollow noopener' }),
    );
    await tick();

    expect(open).toHaveBeenCalledWith('https://example.com', 'report-frame', 'noopener');
    expect(manager.open).not.toHaveBeenCalled();
  });

  it('opens viewing mode external links in the same browsing context by default', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { popover, manager } = createSubject();

    popover.handleLinkClick(createPayload({ documentMode: 'viewing', target: null, rel: null }));
    await tick();

    expect(open).toHaveBeenCalledWith('https://example.com', '_self');
    expect(manager.open).not.toHaveBeenCalled();
  });

  it('navigates viewing mode anchor links without opening an external tab or surface', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const host = document.createElement('div');
    host.innerHTML = '<a name="section-one"></a>';
    const scrollTo = vi.fn();
    Object.defineProperty(host, 'scrollHeight', { configurable: true, value: 100 });
    Object.defineProperty(host, 'clientHeight', { configurable: true, value: 50 });
    host.scrollTo = scrollTo;
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ overflowY: 'auto' });
    const { popover, manager } = createSubject({
      ui: {
        viewport: {
          getHost: () => host,
        },
      },
    });

    popover.handleLinkClick(createPayload({ href: '#section-one', documentMode: 'viewing' }));
    await tick();

    expect(open).not.toHaveBeenCalled();
    expect(manager.open).not.toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('navigates viewing mode anchor links to a bookmark target already painted by paraId', async () => {
    // Bookmark-marker spans (`data-bookmark-marker`/`data-bookmark-name`) are
    // NOT a reliable DOM signal: layout-engine measuring drops them from
    // paint whenever the wrapping paragraph has visible content (the
    // standard TOC-bookmark shape). The real signal is the paragraph's own
    // `paraId`-identifying attribute (e.g. `data-source-node-id`).
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const host = document.createElement('div');
    host.innerHTML = '<div data-source-node-id="w14:para-target">Target Heading</div>';
    const scrollTo = vi.fn();
    Object.defineProperty(host, 'scrollHeight', { configurable: true, value: 100 });
    Object.defineProperty(host, 'clientHeight', { configurable: true, value: 50 });
    host.scrollTo = scrollTo;
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ overflowY: 'auto' });
    const editor = {
      id: 'editor',
      doc: {
        bookmarks: {
          get: vi.fn(async ({ target }) =>
            target.name === 'targetSection' ? { range: { from: { blockId: 'w14:para-target' } } } : null,
          ),
        },
      },
      pageMetrics: {},
    };
    const { popover, manager } = createSubject({
      editor,
      ui: {
        viewport: {
          getHost: () => host,
        },
      },
    });

    popover.handleLinkClick(createPayload({ href: '#targetSection', documentMode: 'viewing' }));
    await tick();
    await tick();

    expect(open).not.toHaveBeenCalled();
    expect(manager.open).not.toHaveBeenCalled();
    expect(editor.doc.bookmarks.get).toHaveBeenCalledWith({
      target: { kind: 'entity', entityType: 'bookmark', name: 'targetSection' },
    });
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('navigates a TOC entry link directly in editing mode (no link popover)', async () => {
    const anchor = document.createElement('a');
    anchor.href = '#_Toc228451583';
    const entry = document.createElement('div');
    entry.className = 'superdoc-toc-entry';
    entry.appendChild(anchor);
    const host = document.createElement('div');
    const bookmarkGet = vi.fn(async () => ({ range: { from: { blockId: 'w14:para-h1' } } }));
    const editor = {
      id: 'editor',
      doc: { bookmarks: { get: bookmarkGet } },
      pageMetrics: { revealBodyTarget: vi.fn(async () => ({ status: 'rejected', reason: 'editing-not-mounted' })) },
    };
    const { popover, manager } = createSubject({
      editor,
      ui: { viewport: { getHost: () => host } },
    });

    popover.handleLinkClick(createPayload({ href: '#_Toc228451583', element: anchor, documentMode: 'editing' }));
    await tick();
    await tick();

    // A TOC entry link is navigational: the click resolves the heading bookmark
    // and navigates instead of opening the link editor.
    expect(manager.open).not.toHaveBeenCalled();
    expect(bookmarkGet).toHaveBeenCalledWith({
      target: { kind: 'entity', entityType: 'bookmark', name: '_Toc228451583' },
    });
  });

  it('still opens the link popover for a non-TOC anchor link in editing mode', async () => {
    const anchor = document.createElement('a');
    anchor.href = '#section-two';
    const { popover, manager } = createSubject();

    popover.handleLinkClick(createPayload({ href: '#section-two', element: anchor, documentMode: 'editing' }));
    await tick();
    await tick();

    expect(manager.open).toHaveBeenCalled();
  });

  it('falls back to revealBodyTarget in editing mode when the bookmark is not in the mounted DOM window', async () => {
    const host = document.createElement('div');
    const scrollTo = vi.fn();
    Object.defineProperty(host, 'scrollHeight', { configurable: true, value: 100 });
    Object.defineProperty(host, 'clientHeight', { configurable: true, value: 50 });
    host.scrollTo = scrollTo;
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ overflowY: 'auto' });

    const revealBodyTarget = vi.fn(async ({ paraId }) => {
      // Simulate the host mounting the target page as part of the reveal.
      const paragraph = document.createElement('div');
      paragraph.dataset.sourceNodeId = paraId;
      host.appendChild(paragraph);
      return { status: 'revealed', resolvedOrdinal: 3, paintedParaId: paraId, covered: true, pinnedPageIndex: 4 };
    });
    const editor = {
      id: 'editor',
      doc: {
        bookmarks: {
          get: vi.fn(async ({ target }) =>
            target.name === 'section-far' ? { range: { from: { blockId: 'w14:para-far' } } } : null,
          ),
        },
      },
      pageMetrics: { revealBodyTarget },
    };
    const { popover, manager } = createSubject({
      editor,
      ui: { viewport: { getHost: () => host } },
    });

    popover.handleLinkClick(createPayload({ href: '#section-far' }));
    await tick();

    manager.open.mock.calls[0][0].props.goToAnchor('#section-far');
    await tick();
    await tick();

    expect(editor.doc.bookmarks.get).toHaveBeenCalledWith({
      target: { kind: 'entity', entityType: 'bookmark', name: 'section-far' },
    });
    expect(revealBodyTarget).toHaveBeenCalledWith({ paraId: 'w14:para-far' });
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('falls back to pageIndexForBodyTarget + scrollToPage in viewing mode when revealBodyTarget is unavailable', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const host = document.createElement('div');
    const scrollTo = vi.fn();
    Object.defineProperty(host, 'scrollHeight', { configurable: true, value: 100 });
    Object.defineProperty(host, 'clientHeight', { configurable: true, value: 50 });
    host.scrollTo = scrollTo;
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ overflowY: 'auto' });
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((cb) => {
        setTimeout(cb, 0);
        return 1;
      }),
    );

    const scrollToPage = vi.fn((pageIndex) => {
      // Simulate the deep-jumped page settling and painting asynchronously
      // (no promise-based paint signal exists in review/viewing mode).
      setTimeout(() => {
        const paragraph = document.createElement('div');
        paragraph.dataset.sourceNodeId = 'w14:para-view-far';
        host.appendChild(paragraph);
      }, 0);
      return pageIndex >= 0;
    });
    const pageIndexForBodyTarget = vi.fn(() => 7);
    const editor = {
      id: 'editor',
      doc: {
        bookmarks: {
          get: vi.fn(async ({ target }) =>
            target.name === 'view-far' ? { range: { from: { blockId: 'w14:para-view-far' } } } : null,
          ),
        },
      },
      pageMetrics: { pageIndexForBodyTarget, scrollToPage },
    };
    const { popover, manager } = createSubject({
      editor,
      ui: { viewport: { getHost: () => host } },
    });

    popover.handleLinkClick(createPayload({ href: '#view-far', documentMode: 'viewing' }));
    await tick();
    await tick();
    await tick();

    vi.unstubAllGlobals();

    expect(open).not.toHaveBeenCalled();
    expect(manager.open).not.toHaveBeenCalled();
    expect(pageIndexForBodyTarget).toHaveBeenCalledWith({ paraId: 'w14:para-view-far' });
    expect(scrollToPage).toHaveBeenCalledWith(7);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('no-ops when the bookmark is outside the body story', async () => {
    const host = document.createElement('div');
    const editor = {
      id: 'editor',
      doc: {
        bookmarks: {
          get: vi.fn(async () => ({
            address: { story: { kind: 'story', storyType: 'headerFooterSlot' } },
            range: { from: { blockId: 'w14:para-in-footer' } },
          })),
        },
      },
      pageMetrics: { revealBodyTarget: vi.fn() },
    };
    const { popover, manager } = createSubject({
      editor,
      ui: { viewport: { getHost: () => host } },
    });

    popover.handleLinkClick(createPayload({ href: '#footer-bookmark' }));
    await tick();

    manager.open.mock.calls[0][0].props.goToAnchor('#footer-bookmark');
    await tick();

    expect(editor.pageMetrics.revealBodyTarget).not.toHaveBeenCalled();
  });

  it('no-ops when the bookmark cannot be resolved through the Document API', async () => {
    const host = document.createElement('div');
    const editor = {
      id: 'editor',
      doc: {
        bookmarks: {
          get: vi.fn(() => {
            throw new Error('TARGET_NOT_FOUND');
          }),
        },
      },
      pageMetrics: { revealBodyTarget: vi.fn() },
    };
    const { popover, manager } = createSubject({
      editor,
      ui: { viewport: { getHost: () => host } },
    });

    popover.handleLinkClick(createPayload({ href: '#missing-bookmark' }));
    await tick();

    manager.open.mock.calls[0][0].props.goToAnchor('#missing-bookmark');
    await tick();

    expect(editor.pageMetrics.revealBodyTarget).not.toHaveBeenCalled();
  });

  it('no-ops when revealBodyTarget rejects the reveal and no viewing-mode fallback is available', async () => {
    const host = document.createElement('div');
    const scrollTo = vi.fn();
    host.scrollTo = scrollTo;
    const editor = {
      id: 'editor',
      doc: {
        bookmarks: {
          get: vi.fn(() => ({ range: { from: { blockId: 'w14:para-gone' } } })),
        },
      },
      pageMetrics: {
        revealBodyTarget: vi.fn(async () => ({
          status: 'rejected',
          reason: 'not-found',
          resolvedOrdinal: null,
          paintedParaId: null,
          covered: false,
          pinnedPageIndex: null,
        })),
      },
    };
    const { popover, manager } = createSubject({
      editor,
      ui: { viewport: { getHost: () => host } },
    });

    popover.handleLinkClick(createPayload({ href: '#stale-anchor' }));
    await tick();

    manager.open.mock.calls[0][0].props.goToAnchor('#stale-anchor');
    await tick();

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('does not degrade to the viewing-mode fallback when revealBodyTarget rejects for a real editing-mode reason', async () => {
    // A rejection reason other than `editing-not-mounted` means the strong,
    // paint-confirmed path genuinely failed (e.g. the target paragraph
    // still isn't mounted after the deep jump) — it must stay a no-op even
    // though `pageIndexForBodyTarget`/`scrollToPage` are available, rather
    // than silently degrading to the weaker scroll-and-poll path.
    const host = document.createElement('div');
    const scrollTo = vi.fn();
    host.scrollTo = scrollTo;
    const scrollToPage = vi.fn(() => true);
    const pageIndexForBodyTarget = vi.fn(() => 9);
    const editor = {
      id: 'editor',
      doc: {
        bookmarks: {
          get: vi.fn(async () => ({ range: { from: { blockId: 'w14:para-real-fail' } } })),
        },
      },
      pageMetrics: {
        revealBodyTarget: vi.fn(async () => ({
          status: 'rejected',
          reason: 'target-paragraph-not-mounted',
          resolvedOrdinal: 12,
          paintedParaId: null,
          covered: true,
          pinnedPageIndex: 9,
        })),
        pageIndexForBodyTarget,
        scrollToPage,
      },
    };
    const { popover, manager } = createSubject({
      editor,
      ui: { viewport: { getHost: () => host } },
    });

    popover.handleLinkClick(createPayload({ href: '#real-fail' }));
    await tick();

    manager.open.mock.calls[0][0].props.goToAnchor('#real-fail');
    await tick();
    await tick();

    expect(pageIndexForBodyTarget).not.toHaveBeenCalled();
    expect(scrollToPage).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
