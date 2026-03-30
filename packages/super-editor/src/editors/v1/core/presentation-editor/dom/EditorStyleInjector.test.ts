import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureEditorNativeSelectionStyles,
  ensureEditorFieldAnnotationInteractionStyles,
  _resetEditorStyleFlags,
} from './EditorStyleInjector.js';

afterEach(() => {
  // Clean up injected styles and reset flags between tests
  document.querySelectorAll('[data-superdoc-editor-native-selection-styles]').forEach((el) => el.remove());
  document.querySelectorAll('[data-superdoc-editor-field-annotation-interaction-styles]').forEach((el) => el.remove());
  _resetEditorStyleFlags();
});

describe('ensureEditorNativeSelectionStyles', () => {
  it('injects styles into document head', () => {
    ensureEditorNativeSelectionStyles(document);
    const styleEl = document.querySelector('[data-superdoc-editor-native-selection-styles="true"]');
    expect(styleEl).not.toBeNull();
    expect(styleEl?.tagName).toBe('STYLE');
    expect(styleEl?.parentElement).toBe(document.head);
  });

  it('is idempotent — only one style element after multiple calls', () => {
    ensureEditorNativeSelectionStyles(document);
    ensureEditorNativeSelectionStyles(document);
    ensureEditorNativeSelectionStyles(document);
    const els = document.querySelectorAll('[data-superdoc-editor-native-selection-styles]');
    expect(els.length).toBe(1);
  });

  it('does nothing when document is null', () => {
    expect(() => ensureEditorNativeSelectionStyles(null)).not.toThrow();
  });

  it('does nothing when document is undefined', () => {
    expect(() => ensureEditorNativeSelectionStyles(undefined)).not.toThrow();
  });

  it('CSS contains ::selection and ::-moz-selection rules', () => {
    ensureEditorNativeSelectionStyles(document);
    const css = document.querySelector('[data-superdoc-editor-native-selection-styles]')?.textContent ?? '';
    expect(css).toContain('.superdoc-layout *::selection');
    expect(css).toContain('.superdoc-layout *::-moz-selection');
    expect(css).toContain('background: transparent');
  });
});

describe('ensureEditorFieldAnnotationInteractionStyles', () => {
  it('injects styles into document head', () => {
    ensureEditorFieldAnnotationInteractionStyles(document);
    const styleEl = document.querySelector('[data-superdoc-editor-field-annotation-interaction-styles="true"]');
    expect(styleEl).not.toBeNull();
    expect(styleEl?.tagName).toBe('STYLE');
  });

  it('is idempotent', () => {
    ensureEditorFieldAnnotationInteractionStyles(document);
    ensureEditorFieldAnnotationInteractionStyles(document);
    const els = document.querySelectorAll('[data-superdoc-editor-field-annotation-interaction-styles]');
    expect(els.length).toBe(1);
  });

  it('CSS contains drag affordance rules', () => {
    ensureEditorFieldAnnotationInteractionStyles(document);
    const css = document.querySelector('[data-superdoc-editor-field-annotation-interaction-styles]')?.textContent ?? '';
    expect(css).toContain('[data-draggable="true"]');
    expect(css).toContain('cursor: grabbing');
    expect(css).toContain('.superdoc-drop-indicator');
  });
});
