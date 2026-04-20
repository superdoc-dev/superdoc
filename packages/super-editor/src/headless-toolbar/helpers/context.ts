import { findParentNode } from '../../editors/v1/core/helpers/findParentNode.js';
import { calculateResolvedParagraphProperties } from '../../editors/v1/extensions/paragraph/resolvedPropertiesCache.js';
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
