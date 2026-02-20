import type { SuperDoc } from 'superdoc';

/** Field definition for template builder */
export interface FieldDefinition {
  id: string;
  label: string;
  defaultValue?: string;
  metadata?: Record<string, any>;
  mode?: 'inline' | 'block';
  group?: string;
}

/** Field instance in a template document */
export interface TemplateField {
  id: string | number;
  alias: string;
  tag?: string;
  position?: number;
  mode?: 'inline' | 'block';
  group?: string;
}

export interface TriggerEvent {
  position: { from: number; to: number };
  bounds?: DOMRect;
  cleanup: () => void;
}

export interface ExportEvent {
  fields: TemplateField[];
  blob?: Blob;
  fileName: string;
}

export interface FieldMenuProps {
  isVisible: boolean;
  position?: DOMRect;
  availableFields: FieldDefinition[];
  filteredFields?: FieldDefinition[];
  filterQuery?: string;
  allowCreate?: boolean;
  onSelect: (field: FieldDefinition) => void;
  onClose: () => void;
  onCreateField?: (field: FieldDefinition) => void | Promise<FieldDefinition | void>;
  existingFields?: TemplateField[];
  onSelectExisting?: (field: TemplateField) => void;
}

export interface FieldListProps {
  fields: TemplateField[];
  onSelect: (field: TemplateField) => void;
  onDelete: (fieldId: string | number) => void;
  onUpdate?: (field: TemplateField) => void;
  selectedFieldId?: string | number;
}

export interface DocumentConfig {
  source?: string | File | Blob;
  mode?: 'editing' | 'viewing';
}

export interface FieldsConfig {
  available?: FieldDefinition[];
  initial?: TemplateField[];
  allowCreate?: boolean;
}

export interface MenuConfig {
  component?: React.ComponentType<FieldMenuProps>;
  trigger?: string;
}

export interface ListConfig {
  component?: React.ComponentType<FieldListProps>;
  position?: 'left' | 'right';
}

export interface ToolbarConfig {
  selector?: string;
  toolbarGroups?: string[];
  groups?: Record<string, string[]>;
  fonts?: string[] | null;
  hideButtons?: boolean;
  responsiveToContainer?: boolean;
  excludeItems?: string[];
  texts?: Record<string, string>;
  icons?: Record<string, any>;
}

/**
 * Configuration options for exporting templates
 */
export interface ExportConfig {
  /**
   * The name of the exported file (without extension)
   * @default "document"
   */
  fileName?: string;
  /**
   * Whether to trigger an automatic download in the browser
   * - true: Automatically downloads the file
   * - false: Returns the Blob data for manual handling (e.g., saving to database)
   * @default true
   */
  triggerDownload?: boolean;
}

export interface SuperDocTemplateBuilderProps {
  document?: DocumentConfig;
  fields?: FieldsConfig;
  menu?: MenuConfig;
  list?: ListConfig;
  toolbar?: boolean | string | ToolbarConfig;

  /** Content Security Policy nonce for dynamically injected styles */
  cspNonce?: string;

  /** Telemetry configuration for SuperDoc */
  telemetry?: { enabled: boolean; metadata?: Record<string, any> };

  /** License key for SuperDoc */
  licenseKey?: string;

  // Events
  onReady?: () => void;
  onTrigger?: (event: TriggerEvent) => void;
  onFieldInsert?: (field: TemplateField) => void;
  onFieldUpdate?: (field: TemplateField) => void;
  onFieldDelete?: (fieldId: string | number) => void;
  onFieldsChange?: (fields: TemplateField[]) => void;
  onFieldSelect?: (field: TemplateField | null) => void;
  onFieldCreate?: (field: FieldDefinition) => void | Promise<FieldDefinition | void>;
  onExport?: (event: ExportEvent) => void;

  // UI
  className?: string;
  style?: React.CSSProperties;
  documentHeight?: string;
}

export interface SuperDocTemplateBuilderHandle {
  insertField: (field: Partial<FieldDefinition> & { alias: string }) => boolean;
  insertBlockField: (field: Partial<FieldDefinition> & { alias: string }) => boolean;
  updateField: (id: string | number, updates: Partial<TemplateField>) => boolean;
  deleteField: (id: string | number) => boolean;
  selectField: (id: string | number) => void;
  nextField: () => void;
  previousField: () => void;
  getFields: () => TemplateField[];
  exportTemplate: (config?: ExportConfig) => Promise<void | Blob>;
  /**
   * Returns the SuperDoc instance.
   * Use this to access the full SuperDoc API, including:
   * - The active editor: `getSuperDoc()?.activeEditor`
   * - Editor commands: `getSuperDoc()?.activeEditor?.commands.*`
   * - Editor state and helpers: `getSuperDoc()?.activeEditor?.state`
   *
   * Note: Full TypeScript types for SuperDoc will be available in a future update.
   */
  getSuperDoc: () => SuperDoc | null;
}
