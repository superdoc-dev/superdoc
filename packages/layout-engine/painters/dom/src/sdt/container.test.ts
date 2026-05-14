import { describe, expect, it } from 'vitest';
import type { SdtMetadata } from '@superdoc/contracts';
import {
  applySdtContainerChrome,
  getSdtContainerKey,
  getSdtSiblingBoundaries,
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
    });

    expect(el.classList.contains('superdoc-structured-content-block')).toBe(true);
    expect(el.querySelector('.superdoc-structured-content__label')?.textContent).toBe('Container');
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

  it('computes stable sibling start and end boundaries', () => {
    expect(getSdtSiblingBoundaries(['a', 'a', 'b', null, 'b'])).toEqual([
      { isStart: true, isEnd: false },
      { isStart: false, isEnd: true },
      { isStart: true, isEnd: true },
      undefined,
      { isStart: true, isEnd: true },
    ]);
  });
});
