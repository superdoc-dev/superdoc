// Extensions
import { History } from './history/index.js';
import { Color } from './color/index.js';
import { FontFamily } from './font-family/index.js';
import { FontSize } from './font-size/index.js';
import { TextAlign } from './text-align/index.js';
import { FormatCommands } from './format-commands/index.js';
import { DropCursor } from './dropcursor/index.js';
import { Gapcursor } from './gapcursor/index.js';
import { Collaboration } from './collaboration/index.js';
import { CollaborationCursor } from './collaboration-cursor/index.js';
import { AiPlugin, AiMark, AiAnimationMark, AiLoaderNode } from './ai/index.js';
import { SlashMenu } from './slash-menu';
import {
  StructuredContentCommands,
  StructuredContent,
  StructuredContentBlock,
  DocumentSection,
  DocumentPartObject,
} from './structured-content/index.js';

// Nodes extensions
import { Document } from './document/index.js';
import { Text } from './text/index.js';
import { Run } from './run/index.js';
import { Paragraph } from './paragraph/index.js';
import { Heading } from './heading/index.js';
import { CommentRangeStart, CommentRangeEnd, CommentReference, CommentsMark } from './comment/index.js';
import { FootnoteReference } from './footnote/index.js';
import { TabNode } from './tab/index.js';
import { LineBreak, HardBreak } from './line-break/index.js';
import { Table } from './table/index.js';
import { TableHeader } from './table-header/index.js';
import { TableRow } from './table-row/index.js';
import { TableCell } from './table-cell/index.js';
import { FieldAnnotation, fieldAnnotationHelpers } from './field-annotation/index.js';
import { Image } from './image/index.js';
import { BookmarkStart, BookmarkEnd } from './bookmarks/index.js';
import { Mention } from './mention/index.js';
import { PageNumber, TotalPageCount } from './page-number/index.js';
import { PageReference } from './page-reference/index.js';
import { ShapeContainer } from './shape-container/index.js';
import { ShapeTextbox } from './shape-textbox/index.js';
import { ContentBlock } from './content-block/index.js';
import { BlockNode } from './block-node/index.js';
import { TableOfContents } from './table-of-contents/index.js';
import { DocumentIndex } from './document-index/index.js';
import { VectorShape } from './vector-shape/index.js';
import { ShapeGroup } from './shape-group/index.js';
import { PassthroughBlock, PassthroughInline } from '@extensions/passthrough/index.js';
import { IndexEntry } from './index-entry/index.js';

// Marks extensions
import { TextStyle } from './text-style/text-style.js';
import { Bold } from './bold/index.js';
import { Italic } from './italic/index.js';
import { Underline } from './underline/index.js';
import { Highlight } from './highlight/index.js';
import { Strike } from './strike/index.js';
import { Link } from './link/index.js';
import { TrackInsert, TrackDelete, TrackFormat, TrackChanges } from './track-changes/index.js';
import { TextTransform } from './text-transform/index.js';

// Plugins
import { CommentsPlugin } from './comment/index.js';
import { Placeholder } from './placeholder/index.js';
import { PopoverPlugin } from './popover-plugin/index.js';
import { LinkedStyles } from './linked-styles/linked-styles.js';
import { Search } from './search/index.js';
import { NodeResizer } from './noderesizer/index.js';
import { CustomSelection } from './custom-selection/index.js';
import { PermissionRanges } from './permission-ranges/index.js';

// Permissions
import { PermStart } from './perm-start/index.js';
import { PermEnd } from './perm-end/index.js';

// Helpers
import { trackChangesHelpers } from './track-changes/index.js';

const getRichTextExtensions = () => {
  return [
    Bold,
    Color,
    Document,
    FontFamily,
    FontSize,
    History,
    Heading,
    Italic,
    Link,
    Paragraph,
    Strike,
    Text,
    TextAlign,
    TextStyle,
    Underline,
    Placeholder,
    PopoverPlugin,
    Mention,
    Highlight,
    FormatCommands,
    Table,
    TableRow,
    TableCell,
    TableHeader,
    FieldAnnotation,
    DropCursor,
    TrackInsert,
    TrackDelete,
    TrackFormat,
    AiPlugin,
    Image,
    NodeResizer,
    CustomSelection,
    PassthroughInline,
    PassthroughBlock,
  ];
};

const getStarterExtensions = () => {
  return [
    Bold,
    BlockNode,
    Color,
    CommentRangeStart,
    CommentRangeEnd,
    CommentReference,
    FootnoteReference,
    Document,
    FontFamily,
    FontSize,
    History,
    Heading,
    Italic,
    Link,
    Paragraph,
    LineBreak,
    HardBreak,
    Run,
    SlashMenu,
    Strike,
    TabNode,
    TableOfContents,
    DocumentIndex,
    Text,
    TextAlign,
    TextStyle,
    Underline,
    FormatCommands,
    CommentsPlugin,
    Gapcursor,
    Table,
    TableRow,
    TableCell,
    TableHeader,
    FieldAnnotation,
    DropCursor,
    Image,
    BookmarkStart,
    BookmarkEnd,
    Mention,
    Collaboration,
    CollaborationCursor,
    TrackChanges,
    TrackInsert,
    TrackDelete,
    TrackFormat,
    CommentsMark,
    Highlight,
    LinkedStyles,
    AiPlugin,
    AiMark,
    AiAnimationMark,
    AiLoaderNode,
    PageNumber,
    TotalPageCount,
    PageReference,
    IndexEntry,
    ShapeContainer,
    ShapeTextbox,
    ContentBlock,
    Search,
    StructuredContent,
    StructuredContentBlock,
    StructuredContentCommands,
    DocumentSection,
    DocumentPartObject,
    NodeResizer,
    CustomSelection,
    TextTransform,
    VectorShape,
    ShapeGroup,
    PermStart,
    PermEnd,
    PermissionRanges,
    PassthroughInline,
    PassthroughBlock,
  ];
};

export {
  History,
  Heading,
  Document,
  Text,
  Run,
  Paragraph,
  CommentRangeStart,
  CommentRangeEnd,
  CommentReference,
  FootnoteReference,
  TabNode,
  LineBreak,
  HardBreak,
  Bold,
  Italic,
  Underline,
  Highlight,
  Strike,
  Color,
  FontFamily,
  FontSize,
  TextAlign,
  TextStyle,
  FormatCommands,
  CommentsPlugin,
  Gapcursor,
  Table,
  TableRow,
  TableCell,
  TableHeader,
  DocumentIndex,
  IndexEntry,
  Placeholder,
  DropCursor,
  BlockNode,
  FieldAnnotation,
  fieldAnnotationHelpers,
  Image,
  BookmarkStart,
  BookmarkEnd,
  PopoverPlugin,
  Mention,
  Collaboration,
  CollaborationCursor,
  TrackChanges,
  TrackInsert,
  TrackDelete,
  TrackFormat,
  CommentsMark,
  trackChangesHelpers,
  getStarterExtensions,
  getRichTextExtensions,
  AiMark,
  AiAnimationMark,
  AiLoaderNode,
  AiPlugin,
  Search,
  StructuredContent,
  StructuredContentBlock,
  StructuredContentCommands,
  DocumentSection,
  NodeResizer,
  CustomSelection,
  TextTransform,
  VectorShape,
  ShapeGroup,
  PassthroughInline,
  PassthroughBlock,
  PermissionRanges,
};
