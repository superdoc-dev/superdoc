/**
 * Consumer typecheck: "superdoc/types" sub-export.
 *
 * The `superdoc/types` entry is a type-only sub-path that re-exports the
 * editor's type contract (commands, node attributes, mark attributes,
 * paragraph and table attribute shapes). Consumers reach for it when they
 * want type-only imports without pulling the runtime entry.
 *
 * The assertions below verify a representative slice of those types
 * resolves to a real interface, not `any`. A regression where the type
 * subpath collapses through a shim would fail this fixture.
 */
import type {
  EditorCommands,
  CommandProps,
  Command,
  NodeAttrs,
  NodeAttributesMap,
  NodeName,
  isNodeType,
  MarkAttrs,
  MarkAttributesMap,
  MarkName,
  isMarkType,
  BlockNodeAttributes,
  TableNodeAttributes,
  ParagraphAttrs,
  ParagraphProperties,
} from 'superdoc/types';

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertNotAny<T> = IsAny<T> extends true ? never : true;

const _real_EditorCommands: AssertNotAny<EditorCommands> = true;
const _real_CommandProps: AssertNotAny<CommandProps> = true;
const _real_Command: AssertNotAny<Command> = true;
const _real_NodeAttributesMap: AssertNotAny<NodeAttributesMap> = true;
const _real_NodeName: AssertNotAny<NodeName> = true;
const _real_NodeAttrs: AssertNotAny<NodeAttrs<'paragraph'>> = true;
const _real_isNodeType: AssertNotAny<typeof isNodeType> = true;
const _real_MarkAttributesMap: AssertNotAny<MarkAttributesMap> = true;
const _real_MarkName: AssertNotAny<MarkName> = true;
const _real_MarkAttrs: AssertNotAny<MarkAttrs<'bold'>> = true;
const _real_isMarkType: AssertNotAny<typeof isMarkType> = true;
const _real_BlockNodeAttributes: AssertNotAny<BlockNodeAttributes> = true;
const _real_TableNodeAttributes: AssertNotAny<TableNodeAttributes> = true;
const _real_ParagraphAttrs: AssertNotAny<ParagraphAttrs> = true;
const _real_ParagraphProperties: AssertNotAny<ParagraphProperties> = true;

void _real_EditorCommands;
void _real_CommandProps;
void _real_Command;
void _real_NodeAttributesMap;
void _real_NodeName;
void _real_NodeAttrs;
void _real_isNodeType;
void _real_MarkAttributesMap;
void _real_MarkName;
void _real_MarkAttrs;
void _real_isMarkType;
void _real_BlockNodeAttributes;
void _real_TableNodeAttributes;
void _real_ParagraphAttrs;
void _real_ParagraphProperties;
