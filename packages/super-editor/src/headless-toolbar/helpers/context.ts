import { findParentNode } from '../../editors/v1/core/helpers/findParentNode.js';
import { calculateResolvedParagraphProperties } from '../../editors/v1/extensions/paragraph/resolvedPropertiesCache.js';
import { isContentLockedMode } from '../../editors/v1/extensions/structured-content/lockModes.js';
import { isStructuredContentNodeType } from '../../editors/v1/extensions/structured-content/nodeTypes.js';
import { NodeSelection } from 'prosemirror-state';
import type { ToolbarContext } from '../types.js';

export const resolveStateEditor = (context: ToolbarContext | null) => {
  if (!context) return null;
  return context.editor ?? context.presentationEditor?.getActiveEditor() ?? null;
};

export const getCurrentParagraphParent = (context: ToolbarContext | null) => {
  const stateEditor = resolveStateEditor(context);
  const selection = stateEditor?.state?.selection;
  if (!stateEditor || !selection) return null;
  const paragraph = findParentNode((node) => node.type.name === 'paragraph')(selection);
  return paragraph;
};

export const getCurrentResolvedParagraphProperties = (context: ToolbarContext | null) => {
  const paragraphParent = getCurrentParagraphParent(context);
  const stateEditor = resolveStateEditor(context);
  if (!stateEditor || !paragraphParent) return null;
  const paragraphProperties = calculateResolvedParagraphProperties(
    stateEditor,
    paragraphParent.node,
    stateEditor.state.doc.resolve(paragraphParent.pos),
  );
  return paragraphProperties;
};

export const isFieldAnnotationSelection = (context: ToolbarContext | null) => {
  const selection = resolveStateEditor(context)?.state?.selection;
  return selection instanceof NodeSelection && selection?.node?.type?.name === 'fieldAnnotation';
};

const isContentLockedStructuredContentNode = (node: any) => {
  return isStructuredContentNodeType(node?.type?.name) && isContentLockedMode(node?.attrs?.lockMode);
};

const resolvedPositionHasContentLockedStructuredContent = ($pos: any) => {
  if (!$pos || typeof $pos.depth !== 'number' || typeof $pos.node !== 'function') return false;

  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (isContentLockedStructuredContentNode($pos.node(depth))) return true;
  }

  return false;
};

export const hasContentLockedStructuredContentSelection = (context: ToolbarContext | null) => {
  const state = resolveStateEditor(context)?.state;
  const selection = state?.selection;
  const doc = state?.doc;
  if (!selection || !doc) return false;

  if (selection instanceof NodeSelection && isContentLockedStructuredContentNode(selection.node)) {
    return true;
  }

  if (
    resolvedPositionHasContentLockedStructuredContent(selection.$from) ||
    resolvedPositionHasContentLockedStructuredContent(selection.$to)
  ) {
    return true;
  }

  if (typeof doc.nodesBetween !== 'function' || selection.from == null || selection.to == null) {
    return false;
  }

  let hasLockedNode = false;
  doc.nodesBetween(selection.from, selection.to, (node: any) => {
    if (isContentLockedStructuredContentNode(node)) {
      hasLockedNode = true;
      return false;
    }
    return !hasLockedNode;
  });

  return hasLockedNode;
};
