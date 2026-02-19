/**
 * Helper functions for editor operations
 * Shared utilities for working with ProseMirror editors
 * @module editor-helpers
 */

import type { Editor } from '../../shared';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { safeTextBetween, LOG_PREFIXES } from '../../shared';
import { Logger } from '../../shared/logger';

/**
 * Result of extracting selection from editor
 */
export interface SelectionExtractionResult {
  text: string;
  from: number;
  to: number;
  isEmpty: boolean;
}

/**
 * Extracts the current selection text from the editor
 * @param editor - Editor instance
 * @param enableLogging - Whether to log warnings on errors
 * @returns Extracted selection text or empty string
 */
export function extractSelectionText(editor: Editor | null, enableLogging = false): string {
  if (!editor || !editor.view?.state) {
    return '';
  }

  const { state } = editor.view;
  const { selection, doc } = state;

  if (!doc || !selection || selection.empty) {
    return '';
  }

  try {
    return safeTextBetween(doc, selection.from, selection.to);
  } catch (error) {
    if (enableLogging) {
      const logger = new Logger(enableLogging);
      logger.warn(`${LOG_PREFIXES.SERVICE} Failed to extract selection:`, error);
    }
    return '';
  }
}

/**
 * Extracts detailed selection information from the editor
 * @param editor - Editor instance
 * @param enableLogging - Whether to log warnings on errors
 * @returns Selection extraction result with position info
 */
export function extractSelection(editor: Editor | null, enableLogging = false): SelectionExtractionResult {
  const emptyResult: SelectionExtractionResult = {
    text: '',
    from: 0,
    to: 0,
    isEmpty: true,
  };

  if (!editor || !editor.view?.state) {
    return emptyResult;
  }

  const { state } = editor.view;
  const { selection, doc } = state;

  if (!doc || !selection) {
    return emptyResult;
  }

  if (selection.empty) {
    return {
      ...emptyResult,
      from: selection.from,
      to: selection.to,
    };
  }

  try {
    const text = safeTextBetween(doc, selection.from, selection.to);
    return {
      text,
      from: selection.from,
      to: selection.to,
      isEmpty: text.length === 0,
    };
  } catch (error) {
    if (enableLogging) {
      const logger = new Logger(enableLogging);
      logger.warn(`${LOG_PREFIXES.SERVICE} Failed to extract selection:`, error);
    }
    return emptyResult;
  }
}

/**
 * Gets the full document text content from the editor
 * @param editor - Editor instance
 * @param enableLogging - Whether to log warnings on errors
 * @returns Document text content or empty string
 */
export function getDocumentText(editor: Editor | null, enableLogging = false): string {
  if (!editor) {
    return '';
  }

  try {
    const viewState = editor.view?.state ?? editor.state;
    const doc = viewState?.doc;
    if (!doc) {
      return '';
    }

    // Try to serialize with list support, but fall back to textContent if it fails
    try {
      const serialized = serializeDocumentWithLists(doc);
      if (serialized.trim().length > 0) {
        return serialized.trim();
      }
    } catch {
      // Fall through to textContent if serialization fails
    }

    return doc.textContent?.trim() ?? '';
  } catch (error) {
    if (enableLogging) {
      const logger = new Logger(enableLogging);
      logger.warn(`${LOG_PREFIXES.SERVICE} Failed to get document text:`, error);
    }
    return '';
  }
}

/**
 * Gets document context with priority to selection over full document
 * @param editor - Editor instance
 * @param enableLogging - Whether to log warnings on errors
 * @returns Document context (selection if available, otherwise full document)
 */
export function getDocumentContext(editor: Editor | null, enableLogging = false): string {
  const selectionText = extractSelectionText(editor, enableLogging);
  if (selectionText) {
    return selectionText;
  }
  return getDocumentText(editor, enableLogging);
}

/**
 * Checks if the editor has an active selection
 * @param editor - Editor instance
 * @returns True if selection exists and is not empty
 */
export function hasSelection(editor: Editor | null): boolean {
  if (!editor || !editor.view?.state) {
    return false;
  }

  const { selection } = editor.view.state;
  return selection ? !selection.empty : false;
}

/**
 * Validates that an editor instance is ready for operations
 * @param editor - Editor instance to validate
 * @returns True if editor is ready, false otherwise
 */
export function isEditorReady(editor: Editor | null | undefined): editor is Editor {
  return Boolean(editor && (editor.view?.state || editor.state));
}

interface NumberingPropertiesAttrs {
  numId?: number | string;
  ilvl?: number | string;
}

interface ParagraphPropertiesAttrs {
  numberingProperties?: NumberingPropertiesAttrs | null;
}

interface ListRenderingAttrs {
  markerText?: string | null;
  numberingType?: string | null;
  path?: number[] | null;
}

interface ParagraphNodeAttrs {
  paragraphProperties?: ParagraphPropertiesAttrs | null;
  listRendering?: ListRenderingAttrs | null;
}

const SECTION_NUMBER_NO_SPACE_REGEX = /^(\s*\d+(?:\.\d+)*)(?=[A-Za-z])/;

export function serializeDocumentWithLists(doc: ProseMirrorNode): string {
  const lines: string[] = [];

  const processOrderedList = (node: ProseMirrorNode, prefix: number[]) => {
    const start = typeof node.attrs?.start === 'number' ? node.attrs.start : 1;
    node.forEach((listItem, _offset, index) => {
      if (listItem.type.name !== 'listItem') {
        return;
      }
      const currentPrefix = [...prefix, start + index];
      processOrderedListItem(listItem, currentPrefix);
    });
  };

  const processOrderedListItem = (listItem: ProseMirrorNode, prefix: number[]) => {
    const textParts: string[] = [];

    listItem.forEach((child) => {
      const typeName = child.type.name;
      if (typeName === 'orderedList') {
        processOrderedList(child, prefix);
      } else if (typeName === 'bulletList') {
        processBulletList(child, prefix.length);
      } else {
        const text = child.textContent?.trim();
        if (text) {
          textParts.push(text);
        }
      }
    });

    if (textParts.length) {
      lines.push(`${prefix.join('.')}. ${textParts.join(' ')}`);
    }
  };

  const processBulletList = (node: ProseMirrorNode, depth: number) => {
    node.forEach((listItem) => {
      if (listItem.type.name !== 'listItem') {
        return;
      }
      processBulletListItem(listItem, depth);
    });
  };

  const processBulletListItem = (listItem: ProseMirrorNode, depth: number) => {
    const textParts: string[] = [];

    listItem.forEach((child) => {
      const typeName = child.type.name;
      if (typeName === 'orderedList') {
        processOrderedList(child, []);
      } else if (typeName === 'bulletList') {
        processBulletList(child, depth + 1);
      } else {
        const text = child.textContent?.trim();
        if (text) {
          textParts.push(text);
        }
      }
    });

    if (textParts.length) {
      const indent = '  '.repeat(depth);
      lines.push(`${indent}- ${textParts.join(' ')}`);
    }
  };

  const appendWordStyleListParagraph = (node: ProseMirrorNode): boolean => {
    if (node.type.name !== 'paragraph') {
      return false;
    }

    const attrs = (node.attrs as ParagraphNodeAttrs | undefined) ?? undefined;
    const listRendering = attrs?.listRendering ?? undefined;

    if (!listRendering) {
      return false;
    }

    const text = node.textContent?.trim();
    if (!text) {
      return false;
    }

    const numberingProps = attrs?.paragraphProperties?.numberingProperties ?? null;
    const indentDepth = getListDepth(listRendering, numberingProps);
    const indent = indentDepth > 0 ? '  '.repeat(indentDepth) : '';

    if (isBulletList(listRendering)) {
      lines.push(`${indent}- ${text}`);
      return true;
    }

    const marker = getMarkerText(listRendering, numberingProps);
    if (marker) {
      lines.push(`${indent}${marker} ${text}`);
      return true;
    }

    return false;
  };

  doc.forEach((node) => {
    if (node.type.name === 'orderedList') {
      processOrderedList(node, []);
    } else if (node.type.name === 'bulletList') {
      processBulletList(node, 0);
    } else if (appendWordStyleListParagraph(node)) {
      // handled by word-style paragraph serializer
    } else {
      const text = node.textContent?.trim();
      if (text) {
        lines.push(text);
      }
    }
  });

  return lines.map((line) => line.replace(SECTION_NUMBER_NO_SPACE_REGEX, '$1 ')).join('\n');
}

function getMarkerText(
  listRendering: ListRenderingAttrs,
  numberingProps?: NumberingPropertiesAttrs | null,
): string | null {
  if (typeof listRendering.markerText === 'string' && listRendering.markerText.trim()) {
    return listRendering.markerText.trim();
  }

  const path = Array.isArray(listRendering.path) ? listRendering.path : null;
  if (path && path.length) {
    return `${path.join('.')}.`;
  }

  const level = parseListLevel(numberingProps?.ilvl);
  if (!Number.isNaN(level)) {
    return `${level + 1}.`;
  }

  return null;
}

function getListDepth(listRendering: ListRenderingAttrs, numberingProps?: NumberingPropertiesAttrs | null): number {
  if (Array.isArray(listRendering.path) && listRendering.path.length) {
    return Math.max(listRendering.path.length - 1, 0);
  }

  const level = parseListLevel(numberingProps?.ilvl);
  return Number.isNaN(level) ? 0 : Math.max(level, 0);
}

function parseListLevel(ilvl?: number | string | null): number {
  if (typeof ilvl === 'number') {
    return ilvl;
  }
  if (typeof ilvl === 'string') {
    const parsed = Number.parseInt(ilvl, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function isBulletList(listRendering: ListRenderingAttrs): boolean {
  if (typeof listRendering.numberingType === 'string') {
    return listRendering.numberingType === 'bullet';
  }
  if (typeof listRendering.markerText === 'string') {
    return ['•', '◦', '▪'].some((symbol) => listRendering.markerText?.includes(symbol));
  }
  return false;
}
