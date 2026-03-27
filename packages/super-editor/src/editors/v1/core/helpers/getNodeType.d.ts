import type { Schema, NodeType } from 'prosemirror-model';

export function getNodeType(nameOrType: string | NodeType, schema: Schema): NodeType;
