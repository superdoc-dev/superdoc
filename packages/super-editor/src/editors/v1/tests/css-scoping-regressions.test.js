import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STYLE_ISOLATION_CLASS } from '../utils/styleIsolation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const NODE_RESIZER_CSS_PATH = resolve(__dirname, '../assets/styles/extensions/noderesizer.css');
const PROSEMIRROR_CSS_PATH = resolve(__dirname, '../assets/styles/elements/prosemirror.css');

function extractTopLevelSelectors(cssText) {
  const selectors = [];
  let depth = 0;
  let current = '';
  let inComment = false;
  let inAtRule = false;

  for (let i = 0; i < cssText.length; i++) {
    const char = cssText[i];
    const next = cssText[i + 1];

    if (!inComment && char === '/' && next === '*') {
      inComment = true;
      i++;
      continue;
    }
    if (inComment && char === '*' && next === '/') {
      inComment = false;
      i++;
      continue;
    }
    if (inComment) continue;

    if (depth === 0 && char === '@') {
      inAtRule = true;
      current = '@';
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        const trimmed = current.trim();
        if (trimmed && !inAtRule) {
          selectors.push(...trimmed.split(',').map((selector) => selector.trim()));
        }
        current = '';
      }
      depth++;
      continue;
    }

    if (char === '}') {
      depth--;
      if (depth === 0) {
        inAtRule = false;
        current = '';
      }
      continue;
    }

    if (depth === 0) {
      current += char;
    }
  }

  return selectors;
}

function selectorMatchesElement(selector, element) {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}

function findMatchingSelectors(selectors, selectorFilter, element) {
  return selectors.filter((selector) => selectorFilter(selector) && selectorMatchesElement(selector, element));
}

function targetsProseMirrorRoot(selector) {
  const token = '.ProseMirror';
  const tokenIndex = selector.indexOf(token);
  if (tokenIndex === -1) return false;

  const afterToken = selector.slice(tokenIndex + token.length).trimStart();
  if (afterToken.length === 0) return true;
  if (afterToken.startsWith(':') || afterToken.startsWith('.') || afterToken.startsWith('[')) return true;

  return false;
}

describe('CSS Scoping Regressions', () => {
  it('noderesizer container selectors should match a body-mounted overlay container', () => {
    const cssText = readFileSync(NODE_RESIZER_CSS_PATH, 'utf8');
    const selectors = extractTopLevelSelectors(cssText);
    const overlayContainer = document.createElement('div');

    overlayContainer.className = `sd-editor-resize-container ${STYLE_ISOLATION_CLASS}`;
    document.body.appendChild(overlayContainer);

    try {
      const matchingSelectors = findMatchingSelectors(
        selectors,
        (selector) =>
          selector.includes('.sd-editor-resize-container') && !selector.includes(':hover') && !selector.includes('::'),
        overlayContainer,
      );

      expect(matchingSelectors.length).toBeGreaterThan(0);
    } finally {
      overlayContainer.remove();
    }
  });

  it('noderesizer handle selectors should match handles in a body-mounted overlay', () => {
    const cssText = readFileSync(NODE_RESIZER_CSS_PATH, 'utf8');
    const selectors = extractTopLevelSelectors(cssText);
    const overlayContainer = document.createElement('div');
    const handle = document.createElement('div');

    overlayContainer.className = `sd-editor-resize-container ${STYLE_ISOLATION_CLASS}`;
    handle.className = 'sd-editor-resize-handle sd-editor-resize-handle-ne';
    overlayContainer.appendChild(handle);
    document.body.appendChild(overlayContainer);

    try {
      const matchingSelectors = findMatchingSelectors(
        selectors,
        (selector) =>
          selector.includes('.sd-editor-resize-handle') && !selector.includes(':hover') && !selector.includes('::'),
        handle,
      );

      expect(matchingSelectors.length).toBeGreaterThan(0);
    } finally {
      overlayContainer.remove();
    }
  });

  it('prosemirror base selectors should match a core host that only has sd-editor-scoped', () => {
    const cssText = readFileSync(PROSEMIRROR_CSS_PATH, 'utf8');
    const selectors = extractTopLevelSelectors(cssText);
    const host = document.createElement('div');
    const proseMirror = document.createElement('div');
    const list = document.createElement('ol');
    const selectedNode = document.createElement('div');

    host.className = STYLE_ISOLATION_CLASS;
    proseMirror.className = 'ProseMirror';
    selectedNode.className = 'ProseMirror-selectednode';

    proseMirror.appendChild(list);
    proseMirror.appendChild(selectedNode);
    host.appendChild(proseMirror);
    document.body.appendChild(host);

    try {
      const rootMatches = findMatchingSelectors(selectors, targetsProseMirrorRoot, proseMirror);
      const listMatches = findMatchingSelectors(
        selectors,
        (selector) => selector.includes('.ProseMirror ol') || selector.includes('.ProseMirror ul'),
        list,
      );
      const selectedNodeMatches = findMatchingSelectors(
        selectors,
        (selector) => selector.includes('.ProseMirror-selectednode'),
        selectedNode,
      );

      expect(rootMatches.length).toBeGreaterThan(0);
      expect(listMatches.length).toBeGreaterThan(0);
      expect(selectedNodeMatches.length).toBeGreaterThan(0);
    } finally {
      host.remove();
    }
  });

  it('noderesizer stylesheet should define overlay selectors that do not require .super-editor ancestry', () => {
    const cssText = readFileSync(NODE_RESIZER_CSS_PATH, 'utf8');
    const selectors = extractTopLevelSelectors(cssText);

    const overlayContainerSelectors = selectors.filter(
      (selector) =>
        selector.includes('.sd-editor-resize-container') && !selector.includes(':hover') && !selector.includes('::'),
    );
    const overlayHandleSelectors = selectors.filter(
      (selector) =>
        selector.includes('.sd-editor-resize-handle') && !selector.includes(':hover') && !selector.includes('::'),
    );

    expect(overlayContainerSelectors.length).toBeGreaterThan(0);
    expect(overlayHandleSelectors.length).toBeGreaterThan(0);
    expect(overlayContainerSelectors.some((selector) => !selector.includes('.super-editor'))).toBe(true);
    expect(overlayHandleSelectors.some((selector) => !selector.includes('.super-editor'))).toBe(true);
  });

  it('prosemirror stylesheet should define core selectors that do not require .super-editor ancestry', () => {
    const cssText = readFileSync(PROSEMIRROR_CSS_PATH, 'utf8');
    const selectors = extractTopLevelSelectors(cssText);

    const proseMirrorRootSelectors = selectors.filter(targetsProseMirrorRoot);
    const proseMirrorListSelectors = selectors.filter(
      (selector) => selector.includes('.ProseMirror ol') || selector.includes('.ProseMirror ul'),
    );
    const proseMirrorSelectedNodeSelectors = selectors.filter((selector) =>
      selector.includes('.ProseMirror-selectednode'),
    );

    expect(proseMirrorRootSelectors.length).toBeGreaterThan(0);
    expect(proseMirrorListSelectors.length).toBeGreaterThan(0);
    expect(proseMirrorSelectedNodeSelectors.length).toBeGreaterThan(0);
    expect(proseMirrorRootSelectors.some((selector) => !selector.includes('.super-editor'))).toBe(true);
    expect(proseMirrorListSelectors.some((selector) => !selector.includes('.super-editor'))).toBe(true);
    expect(proseMirrorSelectedNodeSelectors.some((selector) => !selector.includes('.super-editor'))).toBe(true);
  });
});
