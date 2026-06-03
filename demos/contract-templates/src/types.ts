/**
 * Local type declarations for the Document API surface used by this
 * example. SuperDoc's published types do not yet expose the
 * `editor.doc.*` shape; declare only what we use.
 */

export type NodeKind = 'block' | 'inline';
export type LockMode = 'unlocked' | 'sdtLocked' | 'contentLocked' | 'sdtContentLocked';
export type SectionVersion = 'v1' | 'v2';

type SelectionPoint =
  | { kind: 'text'; blockId: string; offset: number }
  | { kind: 'nodeEdge'; node: { kind: 'block'; nodeType: string; nodeId: string }; edge: 'before' | 'after' };

export type SelectionTarget = {
  kind: 'selection';
  start: SelectionPoint;
  end: SelectionPoint;
};

export type ContentControlTarget = {
  kind: NodeKind;
  nodeType: 'sdt';
  nodeId: string;
};

export type ContentControlInfo = {
  target: ContentControlTarget;
  controlType: string;
  lockMode: LockMode;
  properties?: { tag?: string; alias?: string };
  text?: string;
};

export type ContentControlsListResult = {
  items: ContentControlInfo[];
  total: number;
};

export type MutationResult =
  | { success: true; contentControl: ContentControlTarget; updatedRef?: ContentControlTarget }
  | { success: false; failure: { code: string; message: string } };

export type ExtractBlock = { nodeId: string; type: string; text: string };

export type DocumentApi = {
  clearContent(input: Record<string, never>): { success: boolean; failure?: { code: string; message: string } };
  insert(input: { value: string; type: 'markdown' }): { success: boolean; failure?: { code: string; message: string } };
  extract(input: Record<string, never>): { blocks: ExtractBlock[] };
  create: {
    contentControl(input: {
      kind: NodeKind;
      controlType: 'text';
      at: SelectionTarget;
      tag: string;
      alias: string;
      lockMode: LockMode;
    }): MutationResult;
  };
  contentControls: {
    list(input?: Record<string, unknown>): ContentControlsListResult;
    selectByTag(input: { tag: string }): ContentControlsListResult;
    patch(input: { target: ContentControlTarget; tag?: string; alias?: string }): MutationResult;
    setLockMode(input: { target: ContentControlTarget; lockMode: LockMode }): MutationResult;
    replaceContent(input: { target: ContentControlTarget; content: string; format?: 'text' }): MutationResult;
    text: {
      setValue(input: { target: ContentControlTarget; value: string }): MutationResult;
    };
  };
};

export type FieldKey = 'customerName' | 'jurisdiction' | 'effectiveDate';

export type TagPayload =
  | { kind: 'smartField'; key: FieldKey }
  | { kind: 'reusableSection'; sectionId: string; version: SectionVersion };
