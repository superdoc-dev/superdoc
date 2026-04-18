import type { Schema } from 'prosemirror-model';

export function getSchemaTypeNameByName(name: string, schema: Schema): 'node' | 'mark' | null;
