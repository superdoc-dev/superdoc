import type { ToolProvider } from '../tools.js';

export const WORKFLOW_POC_TOOL_NAMES = [
  'superdoc_do',
  'superdoc_context',
  'superdoc_text_transform',
  'superdoc_list_transform',
  'superdoc_table_transform',
  'superdoc_structure_insert',
  'superdoc_media_insert',
  'superdoc_comment_pass',
  'superdoc_comment_transform',
  'superdoc_format_transform',
  'superdoc_section_transform',
  'superdoc_style_clone',
  'superdoc_track_changes',
] as const;

export type WorkflowPocToolName = (typeof WORKFLOW_POC_TOOL_NAMES)[number];

export type WorkflowPocInputSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  allOf?: Array<Record<string, unknown>>;
  additionalProperties: boolean;
};

export type WorkflowPocToolDefinition = {
  name: WorkflowPocToolName;
  description: string;
  inputSchema: WorkflowPocInputSchema;
};

export type WorkflowPocOpenAiTool = {
  type: 'function';
  function: {
    name: WorkflowPocToolName;
    description: string;
    parameters: WorkflowPocInputSchema;
  };
};

export type WorkflowPocAnthropicTool = {
  name: WorkflowPocToolName;
  description: string;
  input_schema: WorkflowPocInputSchema;
};

export type WorkflowPocGenericTool = {
  name: WorkflowPocToolName;
  description: string;
  parameters: WorkflowPocInputSchema;
};

export type WorkflowPocProviderTool = WorkflowPocOpenAiTool | WorkflowPocAnthropicTool | WorkflowPocGenericTool;

export type WorkflowPocProvider = ToolProvider;
