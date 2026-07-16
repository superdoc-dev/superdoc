import { describe, expect, it } from 'vitest';
import type { SdtMetadata } from '@superdoc/contracts';
import {
  applySdtContainerChrome,
  getSdtContainerKey,
  getSdtContainerKeyForBlock,
  getSdtSiblingBoundaries,
  getSdtSiblingBoundariesWithOwnContainers,
  shouldRenderSdtContainerChrome,
} from './container.js';

describe('SDT container chrome', () => {
  it('renders block structuredContent chrome', () => {
    const doc = document.implementation.createHTMLDocument('sdt-container');
    const el = doc.createElement('div');
    const sdt: SdtMetadata = {
      type: 'structuredContent',
      scope: 'block',
      id: 'block-sdt',
      alias: 'Signer',
    };

    applySdtContainerChrome(doc, el, sdt);

    expect(el.classList.contains('superdoc-structured-content-block')).toBe(true);
    expect(el.dataset.sdtContainerStart).toBe('true');
    expect(el.dataset.sdtContainerEnd).toBe('true');
    expect(el.querySelector('.superdoc-structured-content__label')?.textContent).toBe('Signer');
  });

  it('exposes inter-fragment SDT chrome extension', () => {
    const doc = document.implementation.createHTMLDocument('sdt-container');
    const el = doc.createElement('div');
    const sdt: SdtMetadata = {
      type: 'structuredContent',
      scope: 'block',
      id: 'block-sdt',
      alias: 'Signer',
    };

    applySdtContainerChrome(doc, el, sdt, null, { isStart: true, isEnd: false, paddingBottomOverride: 12 });

    expect(el.style.paddingBottom).toBe('12px');
    expect(el.style.getPropertyValue('--sd-sdt-chrome-bottom-extension')).toBe('12px');
  });

  it('does not render block chrome for inline structuredContent', () => {
    const doc = document.implementation.createHTMLDocument('sdt-container');
    const el = doc.createElement('div');

    applySdtContainerChrome(doc, el, {
      type: 'structuredContent',
      scope: 'inline',
      id: 'inline-sdt',
      alias: 'Inline',
    });

    expect(el.classList.contains('superdoc-structured-content-block')).toBe(false);
    expect(el.dataset.sdtContainerStart).toBeUndefined();
  });

  it('renders documentSection chrome', () => {
    const doc = document.implementation.createHTMLDocument('sdt-container');
    const el = doc.createElement('div');

    applySdtContainerChrome(doc, el, {
      type: 'documentSection',
      id: 'section-1',
      title: 'Locked Section',
    });

    expect(el.classList.contains('superdoc-document-section')).toBe(true);
    expect(el.querySelector('.superdoc-document-section__tooltip')?.textContent).toBe('Locked Section');
  });

  it('uses containerSdt as a fallback', () => {
    const doc = document.implementation.createHTMLDocument('sdt-container');
    const el = doc.createElement('div');

    applySdtContainerChrome(doc, el, null, {
      type: 'structuredContent',
      scope: 'block',
      id: 'container-sdt',
      alias: 'Container',
      lockMode: 'contentLocked',
    });

    expect(el.classList.contains('superdoc-structured-content-block')).toBe(true);
    expect(el.querySelector('.superdoc-structured-content__label')?.textContent).toBe('Container');
    expect(el.dataset.lockMode).toBe('contentLocked');
  });

  it('uses the rendered container metadata for lock mode', () => {
    const doc = document.implementation.createHTMLDocument('sdt-container');
    const el = doc.createElement('div');

    applySdtContainerChrome(
      doc,
      el,
      {
        type: 'structuredContent',
        scope: 'inline',
        id: 'inline-sdt',
        alias: 'Inline',
        lockMode: 'contentLocked',
      },
      {
        type: 'structuredContent',
        scope: 'block',
        id: 'container-sdt',
        alias: 'Container',
        lockMode: 'sdtLocked',
      },
    );

    expect(el.classList.contains('superdoc-structured-content-block')).toBe(true);
    expect(el.dataset.lockMode).toBe('sdtLocked');
  });

  it('suppresses same-key ancestor chrome', () => {
    const childSdt: SdtMetadata = {
      type: 'structuredContent',
      scope: 'block',
      id: 'shared-sdt',
      alias: 'Child',
    };
    const ancestorSdt: SdtMetadata = {
      type: 'structuredContent',
      scope: 'block',
      id: 'shared-sdt',
      alias: 'Ancestor',
    };

    expect(
      shouldRenderSdtContainerChrome(childSdt, null, {
        ancestorContainerKey: getSdtContainerKey(ancestorSdt),
      }),
    ).toBe(false);

    const doc = document.implementation.createHTMLDocument('sdt-container');
    const el = doc.createElement('div');
    applySdtContainerChrome(doc, el, childSdt, null, undefined, {
      ancestorContainerKey: getSdtContainerKey(ancestorSdt),
    });
    expect(el.classList.contains('superdoc-structured-content-block')).toBe(false);
  });

  it('does not suppress distinct primary chrome when fallback container metadata matches ancestor', () => {
    const ancestorSdt: SdtMetadata = {
      type: 'structuredContent',
      scope: 'block',
      alias: 'Ancestor',
    };
    const childSdt: SdtMetadata = {
      type: 'structuredContent',
      scope: 'block',
      alias: 'Child',
    };

    expect(
      shouldRenderSdtContainerChrome(childSdt, ancestorSdt, {
        ancestorContainerSdt: ancestorSdt,
      }),
    ).toBe(true);
  });

  it('suppresses pure id-less container metadata by reference', () => {
    const sharedSdt: SdtMetadata = {
      type: 'structuredContent',
      scope: 'block',
      alias: 'Shared',
    };

    expect(
      shouldRenderSdtContainerChrome(null, sharedSdt, {
        ancestorContainerSdt: sharedSdt,
      }),
    ).toBe(false);
  });

  it('computes stable sibling start and end boundaries', () => {
    expect(getSdtSiblingBoundaries(['a', 'a', 'b', null, 'b'])).toEqual([
      { isStart: true, isEnd: false },
      { isStart: false, isEnd: true },
      { isStart: true, isEnd: true },
      undefined,
      { isStart: true, isEnd: true },
    ]);
  });

  it('computes merged boundaries for shared id-less sibling metadata', () => {
    const sharedSdt: SdtMetadata = {
      type: 'structuredContent',
      scope: 'block',
      alias: 'Shared',
    };

    expect(getSdtSiblingBoundaries([getSdtContainerKey(sharedSdt), getSdtContainerKey(sharedSdt)])).toEqual([
      { isStart: true, isEnd: false },
      { isStart: false, isEnd: true },
    ]);
  });

  it('preserves own nested container boundaries within shared parent sibling boundaries', () => {
    expect(getSdtSiblingBoundariesWithOwnContainers(['parent', 'parent'], ['parent', 'child'], new Set())).toEqual([
      {
        isStart: true,
        isEnd: false,
        showLabel: true,
        ownIsStart: true,
        ownIsEnd: true,
        ownShowLabel: false,
        ownIsNested: false,
        nextOwnContainerStartsNested: true,
      },
      {
        isStart: false,
        isEnd: true,
        showLabel: false,
        ownIsStart: true,
        ownIsEnd: true,
        ownShowLabel: true,
        ownIsNested: true,
        nextOwnContainerStartsNested: false,
      },
    ]);
  });

  it('gets container keys for image and drawing blocks', () => {
    const sdt: SdtMetadata = {
      type: 'structuredContent',
      scope: 'block',
      id: 'media-sdt',
      alias: 'Media',
    };

    expect(getSdtContainerKeyForBlock({ kind: 'image', attrs: { sdt } })).toBe('structuredContent:media-sdt');
    expect(getSdtContainerKeyForBlock({ kind: 'drawing', attrs: { containerSdt: sdt } })).toBe(
      'structuredContent:media-sdt',
    );
  });
});
