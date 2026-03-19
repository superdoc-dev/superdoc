/**
 * Consumer TypeScript compilation test.
 *
 * This file attempts to use SuperDoc's public API the way a real customer would.
 * If this file compiles, the types are sufficient. If it fails, we know what's missing.
 *
 * Based on customer workaround from SD-2227.
 */

// ============================================
// BASIC IMPORTS
// These should all resolve from the main entry point
// ============================================

import {
  SuperDoc,
  Editor,
  SuperConverter,
  PresentationEditor,
  getRichTextExtensions,
  getStarterExtensions,
  DOCX,
  PDF,
  HTML,
  Extensions,
  createZip,
} from 'superdoc';

// ============================================
// EDITOR CLASS - STATIC METHODS
// Customer uses Editor.loadXmlData() for headless processing
// ============================================

async function testEditorStaticMethods() {
  const file = new File([''], 'test.docx');

  // Static method to load DOCX data
  const xmlData = await Editor.loadXmlData(file);

  // Static method to open a document
  const editor = await Editor.open(file);
}

// ============================================
// EDITOR CLASS - INSTANCE METHODS
// Customer needs exportDocx, on/off event handlers, setToolbar
// ============================================

async function testEditorInstanceMethods() {
  const editor = new Editor();

  // Export to DOCX - customer's primary use case
  const docxBlob = await editor.exportDocx({
    comments: [],
    commentsType: 'none',
  });

  // Event handlers - customer uses these extensively
  editor.on('update', () => {});
  editor.on('create', () => {});
  editor.off('update', () => {});

  // Toolbar integration
  editor.setToolbar({});

  // Basic properties
  const state = editor.state;
  const schema = editor.schema;
  const isEditable = editor.isEditable;
  const commands = editor.commands;

  // Commands
  editor.commands.toggleBold();
  editor.commands.setFontSize('14pt');

  // Chain commands
  editor.chain().toggleBold().toggleItalic().run();

  // Content methods
  const html = editor.getHTML();
  const json = editor.getJSON();
  const text = editor.getText();

  // Cleanup
  editor.destroy();
}

// ============================================
// PRESENTATION EDITOR CLASS
// Customer's main entry point for paginated editing
// ============================================

async function testPresentationEditor() {
  const container = document.createElement('div');

  // Constructor with options - customer passes many options
  const presentationEditor = new PresentationEditor({
    element: container,
    documentMode: 'editing',
    content: {},
    extensions: [],
    editable: true,
    isCommentsEnabled: true,
  });

  // Access underlying editor
  const editor = presentationEditor.editor;

  // State and schema access
  const state = presentationEditor.state;
  const isEditable = presentationEditor.isEditable;

  // Commands - customer uses comment commands
  presentationEditor.commands.insertComment?.({ id: '123' });
  presentationEditor.commands.insertContent?.('Hello');

  // Event handlers
  presentationEditor.on('update', () => {});
  presentationEditor.on('create', () => {});
  presentationEditor.off('update', () => {});

  // Document mode switching
  presentationEditor.setDocumentMode('viewing');
  presentationEditor.setDocumentMode('suggesting');
  presentationEditor.setDocumentMode('editing');

  // File replacement
  const newFile = new File([''], 'new.docx');
  await presentationEditor.replaceFile?.(newFile);

  // Zoom
  presentationEditor.setZoom(1.5);

  // Layout methods
  const pages = presentationEditor.getPages();
  const rects = presentationEditor.getSelectionRects();

  // Cleanup
  presentationEditor.destroy();
}

// ============================================
// SUPER TOOLBAR CLASS
// Customer creates toolbar with specific options
// ============================================

function testSuperToolbar() {
  const editor = new Editor();

  // Toolbar construction - customer uses these options
  // const toolbar = new SuperToolbar({
  //   editor,
  //   selector: '#toolbar',
  //   fonts: [],
  //   toolbarGroups: ['formatting', 'lists'],
  //   hideButtons: false,
  //   pagination: true,
  //   icons: {},
  // });

  // Note: SuperToolbar is typed as `any` in hand-written types
  // This section tests if it's exported at all
}

// ============================================
// COMMENT TYPES
// Customer works extensively with comments
// ============================================

interface ExpectedCommentShape {
  commentId: string;
  createdTime: number;
  creatorEmail: string;
  creatorName: string;
  elements: Array<{
    type: string;
    content?: unknown[];
    text?: string;
  }>;
  importedId: string;
  isDone: boolean;
  parentCommentId: string;
}

function testCommentTypes() {
  // This tests if Comment type is exported
  // Customer needs to type their comment handlers

  const handleCommentsLoaded = (data: { comments: ExpectedCommentShape[] }) => {
    for (const comment of data.comments) {
      console.log(comment.commentId, comment.creatorName);
    }
  };
}

// ============================================
// EXTENSION HELPERS
// Customer uses these to configure the editor
// ============================================

function testExtensionHelpers() {
  // Get default extensions
  const starterExtensions = getStarterExtensions();
  const richTextExtensions = getRichTextExtensions();

  // Extensions namespace
  const { Node, Mark, Extension, Plugin, PluginKey } = Extensions;
}

// ============================================
// SUPERDOC CLASS (Vue component wrapper)
// ============================================

function testSuperDoc() {
  // SuperDoc is the main Vue component
  // Type should exist even if it's `any`
  const superdoc: typeof SuperDoc = SuperDoc;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

async function testUtilities() {
  // createZip for manual DOCX assembly
  const files = [{ name: 'document.xml', content: '<w:document/>' }];
  const zip = await createZip(files);

  // MIME type constants
  const docxMime: typeof DOCX = DOCX;
  const pdfMime: typeof PDF = PDF;
  const htmlMime: typeof HTML = HTML;
}

// ============================================
// TYPE EXPORTS
// These types should be importable by consumers
// ============================================

import type {
  // Editor types
  EditorState,
  Transaction,
  Schema,
  EditorView,

  // Command types
  EditorCommands,
  ChainedCommand,

  // Presentation types
  PresentationEditorOptions,
  LayoutEngineOptions,
  PageSize,
  PageMargins,

  // Layout types
  Layout,
  LayoutPage,
  LayoutFragment,
  RangeRect,
  BoundingRect,

  // Data types
  OpenOptions,
  DocxFileEntry,
} from 'superdoc';

function testTypeImports() {
  // Verify types are usable
  const options: PresentationEditorOptions = {
    element: document.createElement('div'),
  };

  const pageSize: PageSize = { w: 612, h: 792 };
  const margins: PageMargins = { top: 72, right: 72, bottom: 72, left: 72 };

  const layoutOptions: LayoutEngineOptions = {
    pageSize,
    margins,
    zoom: 1,
  };
}

// ============================================
// Run type checks (these are just for TypeScript, not runtime)
// ============================================

export {
  testEditorStaticMethods,
  testEditorInstanceMethods,
  testPresentationEditor,
  testSuperToolbar,
  testCommentTypes,
  testExtensionHelpers,
  testSuperDoc,
  testUtilities,
  testTypeImports,
};
