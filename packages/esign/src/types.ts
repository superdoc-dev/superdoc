import type { SuperDoc } from 'superdoc'; // eslint-disable-line

export type FieldValue = string | boolean | number | null | undefined;

export interface FieldReference {
  id: string;
}

export interface DocumentField extends FieldReference {
  value: FieldValue;
}

export interface SignerField extends FieldReference {
  type: 'signature' | 'checkbox' | 'text';
  label?: string;
  value?: FieldValue;
  validation?: {
    required?: boolean;
  };
  component?: React.ComponentType<FieldComponentProps>;
}

export interface FieldComponentProps {
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  isDisabled: boolean;
  isValid?: boolean;
  label?: string;
  error?: string;
}

export interface DownloadButtonProps {
  onClick: () => void;
  fileName?: string;
  isDisabled: boolean;
  isDownloading: boolean;
}

export interface SubmitButtonProps {
  onClick: () => void;
  isValid: boolean;
  isDisabled: boolean;
  isSubmitting: boolean;
}

export interface DownloadConfig {
  fileName?: string;
  label?: string;
  component?: React.ComponentType<DownloadButtonProps>;
}

export interface SubmitConfig {
  label?: string;
  component?: React.ComponentType<SubmitButtonProps>;
}

export interface LayoutMargins {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

export interface DocumentConfig {
  source: string | File | Blob;
  mode?: 'full' | 'download';
  validation?: {
    scroll?: {
      required?: boolean;
    };
  };
  /**
   * Document layout mode:
   * - 'paginated' (default): Fixed page width, shows page breaks
   * - 'responsive': 100% width, text reflows to fit container (useful for mobile/accessibility)
   * Note: 'responsive' takes precedence over pagination - pagination is ignored when layoutMode is 'responsive'
   */
  layoutMode?: 'responsive' | 'paginated';
  /**
   * Custom margins in pixels for responsive layout mode.
   * Only applies when layoutMode is 'responsive'.
   */
  layoutMargins?: LayoutMargins;
}

export interface SuperDocESignProps {
  eventId: string;

  document: DocumentConfig;

  fields?: {
    document?: DocumentField[];
    signer?: SignerField[];
  };

  download?: DownloadConfig;
  submit?: SubmitConfig;

  // Events
  onSubmit: (data: SubmitData) => void | Promise<void>;
  onDownload?: (data: DownloadData) => void | Promise<void>;
  onStateChange?: (state: SigningState) => void;
  onFieldChange?: (field: FieldChange) => void;
  onFieldsDiscovered?: (fields: FieldInfo[]) => void;

  isDisabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  documentHeight?: string;
}

export interface SigningState {
  scrolled: boolean;
  fields: Map<string, FieldValue>;
  isValid: boolean;
  isSubmitting: boolean;
}

export interface SuperDocESignHandle {
  getState: () => SigningState;
  getAuditTrail: () => AuditEvent[];
  reset: () => void;
  updateFieldInDocument: (field: FieldUpdate) => void;
}

export interface DownloadData {
  eventId: string;
  documentSource: string | File | Blob;
  fields: {
    document: DocumentField[];
    signer: SignerFieldValue[];
  };
  fileName: string;
}

export interface SubmitData {
  eventId: string;
  timestamp: string;
  duration: number;
  auditTrail: AuditEvent[];
  documentFields: Array<DocumentField>;
  signerFields: Array<SignerFieldValue>;
  isFullyCompleted: boolean;
}

export interface AuditEvent {
  timestamp: string;
  type: 'ready' | 'scroll' | 'field_change' | 'submit';
  data?: Record<string, unknown>;
}

export type FieldInfo = DocumentField & { label?: string };
export type FieldUpdate = DocumentField;
export type FieldChange = DocumentField & { previousValue?: FieldValue };

export interface SignerFieldValue {
  id: string;
  value: FieldValue;
}
