import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorOverlayManager, type HeaderFooterRegion } from './EditorOverlayManager';

describe('EditorOverlayManager', () => {
  let painterHost: HTMLElement;
  let visibleHost: HTMLElement;

  beforeEach(() => {
    painterHost = document.createElement('div');
    visibleHost = document.createElement('div');
    document.body.append(painterHost, visibleHost);
  });

  afterEach(() => {
    painterHost.remove();
    visibleHost.remove();
  });

  it('resets footer editor container positioning when hiding the overlay', () => {
    const overlay = new EditorOverlayManager(painterHost, visibleHost, null);

    const pageElement = document.createElement('div');
    painterHost.appendChild(pageElement);

    const footerDecoration = document.createElement('div');
    footerDecoration.className = 'superdoc-page-footer';
    pageElement.appendChild(footerDecoration);

    const region: HeaderFooterRegion = {
      kind: 'footer',
      pageIndex: 0,
      pageNumber: 1,
      localX: 0,
      localY: 0,
      width: 200,
      height: 50,
    };

    const { editorHost } = overlay.showEditingOverlay(pageElement, region, 1);
    expect(editorHost).toBeTruthy();

    const editorContainer = document.createElement('div');
    editorContainer.className = 'super-editor';
    editorContainer.style.top = '12px';
    editorContainer.style.transform = 'translateY(24px)';
    editorHost?.appendChild(editorContainer);

    overlay.hideEditingOverlay();

    expect(editorContainer.style.top).toBe('0px');
    expect(editorContainer.style.transform).toBe('');
  });
});
