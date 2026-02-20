import './style.css';

// Load type augmentations (side-effect import for command/attribute types)
import './extensions/types/index.js';

// Type guard functions and extension helpers
import { isNodeType, assertNodeType } from './core/types/NodeAttributesMap.js';
import { isMarkType } from './core/types/MarkAttributesMap.js';
import { defineNode } from './core/defineNode.js';
import { defineMark } from './core/defineMark.js';

import { SuperConverter } from './core/super-converter/SuperConverter';
import { getMarksFromSelection } from './core/helpers/getMarksFromSelection.js';
import { getActiveFormatting } from './core/helpers/getActiveFormatting.js';
import { getStarterExtensions, getRichTextExtensions } from './extensions/index.js';
import { SuperToolbar } from './components/toolbar/super-toolbar.js';
import { DocxZipper, helpers } from './core/index.js';
import { Editor } from './core/Editor.js';
import { PresentationEditor } from './core/presentation-editor/index.js';
import { createZip } from './core/super-converter/zipper.js';
import { getAllowedImageDimensions } from './extensions/image/imageHelpers/processUploadedImage.js';
import { Node, Attribute } from '@core/index.js';
import { Extension } from '@core/Extension.js';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Mark } from '@core/Mark.js';
import ContextMenu from './components/context-menu/ContextMenu.vue';
/** @deprecated Use ContextMenu instead */
const SlashMenu = ContextMenu;
import BasicUpload from '@superdoc/common/components/BasicUpload.vue';

import SuperEditor from './components/SuperEditor.vue';
import Toolbar from './components/toolbar/Toolbar.vue';
import SuperInput from './components/SuperInput.vue';
import AIWriter from './components/toolbar/AIWriter.vue';
import * as fieldAnnotationHelpers from './extensions/field-annotation/fieldAnnotationHelpers/index.js';
import * as trackChangesHelpers from './extensions/track-changes/trackChangesHelpers/index.js';
import { TrackChangesBasePluginKey } from './extensions/track-changes/plugins/index.js';
import { CommentsPluginKey } from './extensions/comment/comments-plugin.js';
import { AnnotatorHelpers } from '@helpers/annotator.js';
import { SectionHelpers } from '@extensions/structured-content/document-section/index.js';
import { registeredHandlers } from './core/super-converter/v3/handlers/index.js';
import { Decoration, DecorationSet } from 'prosemirror-view';

const Extensions = {
  Node,
  Attribute,
  Extension,
  Mark,
  //
  Plugin,
  PluginKey,
  Decoration,
  DecorationSet,
};

/**
 * Exported classes and components.
 * @module exports
 * @see SuperConverter
 * @see SuperEditor
 * @see Toolbar
 * @see AIWriter
 */
export {
  // Classes
  /** @internal */
  SuperConverter,
  /** @internal */
  DocxZipper,
  SuperToolbar,
  Editor,
  /** @internal */
  PresentationEditor,

  // Components
  SuperEditor,
  /** @internal */
  SuperInput,
  /** @internal */
  BasicUpload,
  Toolbar,
  AIWriter,
  ContextMenu,
  SlashMenu,

  // Helpers
  helpers,
  fieldAnnotationHelpers,
  trackChangesHelpers,
  /** @internal */
  AnnotatorHelpers,
  SectionHelpers,
  /** @internal */
  getMarksFromSelection,
  /** @internal */
  getActiveFormatting,
  getStarterExtensions,
  /** @internal */
  getRichTextExtensions,
  createZip,
  /** @internal */
  getAllowedImageDimensions,
  /** @internal */
  registeredHandlers,

  // External extensions classes
  Extensions,
  /** @internal */
  TrackChangesBasePluginKey,
  /** @internal */
  CommentsPluginKey,

  // Type guards and extension helpers
  isNodeType,
  assertNodeType,
  isMarkType,
  defineNode,
  defineMark,
};
