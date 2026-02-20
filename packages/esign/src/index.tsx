import { useRef, useState, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import type { SuperDoc } from 'superdoc';
import type * as Types from './types';
import { textToImageDataUrl } from './utils/signature';
import { SignatureInput, CheckboxInput, createDownloadButton, createSubmitButton } from './defaults';

export * from './types';
export { textToImageDataUrl };
export { SignatureInput, CheckboxInput };

type Editor = NonNullable<SuperDoc['activeEditor']>;

const SuperDocESign = forwardRef<Types.SuperDocESignHandle, Types.SuperDocESignProps>((props, ref) => {
  const {
    eventId,
    document,
    fields = {},
    download,
    submit,
    onSubmit,
    onDownload,
    onStateChange,
    onFieldChange,
    onFieldsDiscovered,
    telemetry,
    licenseKey,
    isDisabled = false,
    className,
    style,
    documentHeight = '600px',
  } = props;

  const [scrolled, setScrolled] = useState(!document.validation?.scroll?.required);
  const [fieldValues, setFieldValues] = useState<Map<string, Types.FieldValue>>(new Map());
  const [isValid, setIsValid] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [auditTrail, setAuditTrail] = useState<Types.AuditEvent[]>([]);
  const [isReady, setIsReady] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const superdocRef = useRef<SuperDoc | null>(null);
  const startTimeRef = useRef(Date.now());
  const fieldsRef = useRef(fields);
  const auditTrailRef = useRef<Types.AuditEvent[]>([]);
  const onFieldsDiscoveredRef = useRef(onFieldsDiscovered);
  fieldsRef.current = fields;
  onFieldsDiscoveredRef.current = onFieldsDiscovered;

  useEffect(() => {
    auditTrailRef.current = auditTrail;
  }, [auditTrail]);

  const updateFieldInDocument = useCallback((field: Types.FieldUpdate) => {
    if (!superdocRef.current?.activeEditor) return;
    const editor = superdocRef.current.activeEditor;

    const signerField = fieldsRef.current.signer?.find((f) => f.id === field.id);

    // Handle table fields
    if (field.type === 'table' && Array.isArray(field.value)) {
      const helpers = (editor.helpers as any)?.structuredContentCommands;
      const tables = helpers?.getStructuredContentTablesById?.(field.id, editor.state) || [];

      if (tables.length) {
        const { node: tableNode, pos: tablePos } = tables[0];
        const rowCount = tableNode.childCount;

        // Delete all rows except the first one (template/header row) in a single transaction
        if (rowCount > 1) {
          let tr = editor.state.tr;

          // Delete from bottom to top to ensure position mapping works correctly
          for (let i = rowCount - 1; i >= 1; i--) {
            let rowOffset = 1; // Start after table opening
            for (let j = 0; j < i; j++) {
              rowOffset += tableNode.child(j).nodeSize;
            }

            const rowNode = tableNode.child(i);
            const rowStart = tablePos + rowOffset;
            const rowEnd = rowStart + rowNode.nodeSize;

            tr = tr.delete(tr.mapping.map(rowStart), tr.mapping.map(rowEnd));
          }

          editor.view?.dispatch(tr);
        }

        // Append new rows after row 0 (copies style from row 0)
        (editor.commands as any)?.appendRowsToStructuredContentTable?.({
          id: field.id,
          rows: field.value,
          copyRowStyle: true,
        });
      }

      return;
    }

    let updatePayload;

    if (signerField?.type === 'signature' && field.value) {
      const imageUrl =
        typeof field.value === 'string' && field.value.startsWith('data:image/')
          ? field.value
          : textToImageDataUrl(String(field.value));

      updatePayload = {
        json: {
          type: 'image',
          attrs: { src: imageUrl, alt: 'Signature' },
        },
      };
    } else {
      updatePayload = { text: String(field.value ?? '') };
    }

    if (field.id) {
      editor.commands?.updateStructuredContentById?.(field.id, updatePayload);
    }
  }, []);

  const discoverAndApplyFields = useCallback(
    (editor: Editor) => {
      if (!editor) return;

      const tags = editor.helpers.structuredContentCommands.getStructuredContentTags(editor.state);

      const configValues = new Map<string, Types.FieldValue | Types.TableFieldValue>();

      fieldsRef.current.document?.forEach((f) => {
        if (f.id) configValues.set(f.id, f.value);
      });

      fieldsRef.current.signer?.forEach((f) => {
        if (f.value !== undefined) {
          configValues.set(f.id, f.value);
        }
      });

      const discovered: Types.FieldInfo[] = tags
        .map(({ node }: any) => ({
          id: node.attrs.id,
          label: node.attrs.label,
          value: configValues.get(node.attrs.id) ?? node.textContent ?? '',
        }))
        .filter((f: Types.FieldInfo) => f.id);

      if (discovered.length > 0) {
        onFieldsDiscoveredRef.current?.(discovered);

        // Apply document fields (with type for table support)
        (fieldsRef.current.document || [])
          .filter((field) => field.value !== undefined)
          .forEach((field) =>
            updateFieldInDocument({
              id: field.id,
              value: field.value,
              type: field.type,
            }),
          );

        // Apply signer fields
        (fieldsRef.current.signer || [])
          .filter((field) => field.value !== undefined)
          .forEach((field) =>
            updateFieldInDocument({
              id: field.id,
              value: field.value!,
            }),
          );
      }
    },
    [updateFieldInDocument],
  );

  const addAuditEvent = (event: Omit<Types.AuditEvent, 'timestamp'>): Types.AuditEvent[] => {
    const auditEvent: Types.AuditEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };
    const auditMock = (globalThis as any)?.__SUPERDOC_AUDIT_MOCK__;
    if (auditMock) {
      auditMock(auditEvent);
    }
    const nextTrail = [...auditTrailRef.current, auditEvent];
    auditTrailRef.current = nextTrail;
    setAuditTrail(nextTrail);
    return nextTrail;
  };

  const stableTelemetry = useMemo(
    () => ({
      enabled: telemetry?.enabled ?? true,
      metadata: { source: 'esign', ...telemetry?.metadata },
    }),
    [telemetry?.enabled, JSON.stringify(telemetry?.metadata)],
  );

  // Initialize SuperDoc - uses abort pattern to handle React 18 Strict Mode
  // which intentionally double-invokes effects to help identify cleanup issues
  useEffect(() => {
    if (!containerRef.current) return;

    let aborted = false;
    let instance: SuperDoc | null = null;

    const initSuperDoc = async () => {
      const { SuperDoc } = await import('superdoc');

      // If cleanup ran while we were importing, abort
      if (aborted) return;

      instance = new SuperDoc({
        selector: containerRef.current!,
        document: document.source,
        documentMode: 'viewing',
        modules: {
          comments: false,
        },
        viewOptions: {
          layout: document.viewOptions?.layout ?? (document.layoutMode === 'responsive' ? 'web' : 'print'),
        },
        telemetry: stableTelemetry,
        ...(licenseKey && { licenseKey }),
        onReady: () => {
          // Guard callback execution if cleanup already ran
          if (aborted) return;
          if (instance?.activeEditor) {
            discoverAndApplyFields(instance.activeEditor);
          }
          addAuditEvent({ type: 'ready' });
          setIsReady(true);
        },
      });

      superdocRef.current = instance;
    };

    initSuperDoc();

    return () => {
      aborted = true;
      if (instance) {
        if (typeof instance.destroy === 'function') {
          instance.destroy();
        }
      }
      superdocRef.current = null;
    };
    // Use primitives to avoid re-init on every render when object references change
  }, [
    document.source,
    document.mode,
    document.layoutMode,
    document.viewOptions?.layout,
    discoverAndApplyFields,
    stableTelemetry,
    licenseKey,
  ]);

  useEffect(() => {
    if (!document.validation?.scroll?.required || !isReady) return;

    const scrollContainer = containerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const scrollPercentage = scrollTop / (scrollHeight - clientHeight);

      if (scrollPercentage >= 0.95 || scrollHeight <= clientHeight) {
        setScrolled(true);
        addAuditEvent({
          type: 'scroll',
          data: { percent: Math.round(scrollPercentage * 100) },
        });
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    handleScroll();

    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [document.validation?.scroll?.required, isReady]);

  const handleFieldChange = useCallback(
    (fieldId: string, value: Types.FieldValue) => {
      setFieldValues((prev) => {
        const previousValue = prev.get(fieldId);
        const newMap = new Map(prev);
        newMap.set(fieldId, value);

        updateFieldInDocument({
          id: fieldId,
          value: value,
        });

        addAuditEvent({
          type: 'field_change',
          data: { fieldId, value, previousValue },
        });

        onFieldChange?.({
          id: fieldId,
          value,
          previousValue,
        });

        return newMap;
      });
    },
    [onFieldChange, updateFieldInDocument],
  );
  const checkIsValid = useCallback((): boolean => {
    if (document.validation?.scroll?.required && !scrolled) {
      return false;
    }

    return (fields.signer || []).every((field) => {
      if (!field.validation?.required) return true;
      const value = fieldValues.get(field.id);
      return value && (typeof value !== 'string' || value.trim());
    });
  }, [scrolled, fields.signer, fieldValues, document.validation?.scroll?.required]);
  useEffect(() => {
    const valid = checkIsValid();
    setIsValid(valid);

    const state: Types.SigningState = {
      scrolled,
      fields: fieldValues,
      isValid: valid,
      isSubmitting,
    };
    onStateChange?.(state);
  }, [scrolled, fieldValues, isSubmitting, checkIsValid, onStateChange]);

  const handleDownload = useCallback(async () => {
    if (isDisabled || isDownloading) return;

    setIsDownloading(true);

    const downloadData: Types.DownloadData = {
      eventId,
      documentSource: document.source,
      fields: {
        document: fields.document || [],
        signer: (fields.signer || []).map((field) => ({
          id: field.id,
          value: fieldValues.get(field.id) ?? null,
        })),
      },
      fileName: download?.fileName || 'document.pdf',
    };

    try {
      await onDownload?.(downloadData);
    } finally {
      setIsDownloading(false);
    }
  }, [isDisabled, isDownloading, eventId, document.source, fields, fieldValues, download, onDownload]);

  const handleSubmit = useCallback(async () => {
    if (!isValid || isDisabled || isSubmitting) return;

    setIsSubmitting(true);
    addAuditEvent({ type: 'submit' });

    const nextAuditTrail = addAuditEvent({ type: 'submit' });

    const submitData: Types.SubmitData = {
      eventId,
      timestamp: new Date().toISOString(),
      duration: Math.floor((Date.now() - startTimeRef.current) / 1000),
      auditTrail: nextAuditTrail,
      documentFields: fields.document || [],
      signerFields: (fields.signer || []).map((field) => ({
        id: field.id,
        value: fieldValues.get(field.id) ?? null,
      })),
      isFullyCompleted: isValid,
    };

    try {
      await onSubmit(submitData);
    } finally {
      setIsSubmitting(false);
    }
  }, [isValid, isDisabled, isSubmitting, eventId, fields, fieldValues, onSubmit]);

  const renderField = (field: Types.SignerField) => {
    const Component = field.component || getDefaultComponent(field.type);

    return (
      <Component
        key={field.id}
        value={fieldValues.get(field.id) ?? null}
        onChange={(value) => handleFieldChange(field.id, value)}
        isDisabled={isDisabled}
        label={field.label}
      />
    );
  };

  const getDefaultComponent = (type: 'signature' | 'checkbox' | 'text') => {
    switch (type) {
      case 'signature':
      case 'text':
        return SignatureInput;
      case 'checkbox':
        return CheckboxInput;
    }
  };

  const renderDocumentControls = () => {
    const DownloadButton = download?.component || createDownloadButton(download);

    if (!DownloadButton) return null;

    return (
      <DownloadButton
        onClick={handleDownload}
        fileName={download?.fileName}
        isDisabled={isDisabled}
        isDownloading={isDownloading}
      />
    );
  };

  const renderFormActions = () => {
    if (document.mode === 'download') {
      return null;
    }

    const SubmitButton = submit?.component || createSubmitButton(submit);

    return (
      <div className='superdoc-esign-actions superdoc-esign-form-actions'>
        <SubmitButton onClick={handleSubmit} isValid={isValid} isDisabled={isDisabled} isSubmitting={isSubmitting} />
      </div>
    );
  };

  const documentControls = renderDocumentControls();
  const formActions = renderFormActions();

  useImperativeHandle(
    ref,
    () => ({
      getState: () => ({
        scrolled,
        fields: fieldValues,
        isValid,
        isSubmitting,
      }),
      getAuditTrail: () => auditTrailRef.current,
      reset: () => {
        setScrolled(!document.validation?.scroll?.required);
        setFieldValues(new Map());
        setIsValid(false);
        auditTrailRef.current = [];
        setAuditTrail([]);
      },
      updateFieldInDocument,
    }),
    [scrolled, fieldValues, isValid, isSubmitting, document.validation?.scroll?.required, updateFieldInDocument],
  );

  return (
    <div className={`superdoc-esign-container ${className || ''}`} style={style}>
      {/* Document viewer section */}
      <div className='superdoc-esign-document' data-testid='superdoc-esign-document'>
        {documentControls && (
          <div className='superdoc-esign-document-toolbar'>
            <div className='superdoc-esign-document-controls'>{documentControls}</div>
          </div>
        )}
        <div
          ref={containerRef}
          className='superdoc-esign-document-viewer'
          data-testid='superdoc-scroll-container'
          style={{ height: documentHeight, overflow: 'auto' }}
        />
      </div>

      {/* Controls section - separate from document */}
      <div className='superdoc-esign-controls' data-testid='superdoc-esign-controls'>
        {/* Signer fields */}
        {fields.signer && fields.signer.length > 0 && (
          <div className='superdoc-esign-fields' data-testid='superdoc-esign-fields'>
            {fields.signer.map(renderField)}
          </div>
        )}

        {/* Action buttons */}
        {formActions}
      </div>
    </div>
  );
});

SuperDocESign.displayName = 'SuperDocESign';

export default SuperDocESign;
