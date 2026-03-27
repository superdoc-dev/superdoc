import type { Schema, MarkType } from 'prosemirror-model';

export function getMarkType(nameOrType: string | MarkType, schema: Schema): MarkType;
