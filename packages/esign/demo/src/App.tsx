import { useState, useRef } from 'react';
import SuperDocESign, { textToImageDataUrl } from '@superdoc-dev/esign';
import type { SubmitData, SigningState, FieldChange, DownloadData, SuperDocESignHandle } from '@superdoc-dev/esign';
import CustomSignature from './CustomSignature';
import 'superdoc/style.css';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const documentSource =
  'https://storage.googleapis.com/public_static_hosting/public_demo_docs/service_agreement_with_table.docx';

// Document field definitions with labels
interface DocumentFieldConfig {
  id: string;
  value: string | string[][];
  type?: 'text' | 'table';
  label?: string;
  readOnly?: boolean;
}

const signerFieldsConfig = [
  {
    id: '789012',
    type: 'signature' as const,
    label: 'Your Signature',
    validation: { required: true },
    component: CustomSignature,
  },
  {
    id: '1',
    type: 'checkbox' as const,
    label: 'I accept the terms and conditions',
    validation: { required: true },
  },
  {
    id: '2',
    type: 'checkbox' as const,
    label: 'Send me a copy of the agreement',
    validation: { required: false },
  },
];

const signatureFieldIds = new Set(
  signerFieldsConfig.filter((field) => field.type === 'signature').map((field) => field.id),
);

const toSignatureImageValue = (value: SubmitData['signerFields'][number]['value']) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.startsWith('data:image/')) return value;
  return textToImageDataUrl(String(value));
};

const mapSignerFieldsWithType = (
  fields: Array<{ id: string; value: SubmitData['signerFields'][number]['value'] }>,
  signatureType: 'signature' | 'image',
) =>
  fields.map((field) => {
    if (!signatureFieldIds.has(field.id)) {
      return field;
    }

    return {
      ...field,
      type: signatureType,
      value: toSignatureImageValue(field.value),
    };
  });

// Helper to download a response blob as a file
const downloadBlob = async (response: Response, fileName: string) => {
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
};

// Document field definitions with labels
const documentFieldsConfig: DocumentFieldConfig[] = [
  {
    id: '123456',
    label: 'Date',
    value: new Date().toLocaleDateString(),
    readOnly: true,
    type: 'text',
  },
  {
    id: '234567',
    label: 'Full Name',
    value: 'John Doe',
    readOnly: false,
    type: 'text',
  },
  {
    id: '345678',
    label: 'Company',
    value: 'SuperDoc',
    readOnly: false,
    type: 'text',
  },
  { id: '456789', label: 'Plan', value: 'Premium', readOnly: false, type: 'text' as const },
  { id: '567890', label: 'State', value: 'CA', readOnly: false, type: 'text' as const },
  {
    id: '678901',
    label: 'Address',
    value: '123 Main St, Anytown, USA',
    readOnly: false,
    type: 'text',
  },
  {
    id: '238312460',
    label: 'User responsibilities',
    value: [['  - Provide accurate and complete information']],
    readOnly: false,
    type: 'table',
  },
];

export function App() {
  const [submitted, setSubmitted] = useState(false);
  const [submitData, setSubmitData] = useState<SubmitData | null>(null);
  const [events, setEvents] = useState<string[]>([]);

  // Stable eventId that persists across renders
  const [eventId] = useState(() => `demo-${Date.now()}`);

  // Ref to the esign component
  const esignRef = useRef<SuperDocESignHandle>(null);

  // State for document field values
  const [documentFields, setDocumentFields] = useState<Record<string, string | string[][]>>(() =>
    Object.fromEntries(documentFieldsConfig.map((f) => [f.id, f.value])),
  );

  const updateDocumentField = (id: string, value: string | string[][]) => {
    const fieldConfig = documentFieldsConfig.find((f) => f.id === id);
    setDocumentFields((prev) => ({ ...prev, [id]: value }));
    esignRef.current?.updateFieldInDocument({ id, value, type: fieldConfig?.type });
  };

  // Helper to get table rows as 2D array (for table fields)
  const getTableRows = (fieldId: string): string[][] => {
    const value = documentFields[fieldId];
    return Array.isArray(value) ? value : [];
  };

  const log = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] ${msg}`);
    setEvents((prev) => [...prev.slice(-4), `${time} - ${msg}`]);
  };

  const handleSubmit = async (data: SubmitData) => {
    log('⏳ Signing document...');
    console.log('Submit data:', data);

    try {
      const signerFields = mapSignerFieldsWithType(data.signerFields, 'signature');

      const response = await fetch(`${API_BASE_URL}/v1/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document: { url: documentSource },
          documentFields: data.documentFields,
          signerFields,
          auditTrail: data.auditTrail,
          eventId: data.eventId,
          certificate: { enable: true },
          metadata: {
            company: documentFields['345678'],
            plan: documentFields['456789'],
          },
          fileName: `signed_agreement_${data.eventId}.pdf`,
          signatureMode: 'sign',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to sign document');
      }

      await downloadBlob(response, `signed_agreement_${data.eventId}.pdf`);

      log('✓ Document signed and downloaded!');
      setSubmitted(true);
      setSubmitData(data);
    } catch (error) {
      console.error('Error signing document:', error);
      log(`✗ Signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDownload = async (data: DownloadData) => {
    try {
      if (typeof data.documentSource !== 'string') {
        log('Download requires a document URL.');
        return;
      }

      const signerFields = mapSignerFieldsWithType(data.fields.signer, 'image');

      const response = await fetch(`${API_BASE_URL}/v1/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document: { url: data.documentSource },
          fields: {
            ...data.fields,
            signer: signerFields,
          },
          fileName: data.fileName,
          signatureMode: 'annotate',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to annotate document');
      }

      await downloadBlob(response, data.fileName || 'document.pdf');
      log('✓ Downloaded PDF');
    } catch (error) {
      console.error('Error processing document:', error);
      log('Download failed');
    }
  };

  const handleStateChange = (state: SigningState) => {
    if (state.scrolled && !events.some((e) => e.includes('Scrolled'))) {
      log('↓ Scrolled to bottom');
    }
    if (state.isValid && !events.some((e) => e.includes('Ready'))) {
      log('✓ Ready to submit');
    }
    console.log('State:', state);
  };

  const handleFieldChange = (field: FieldChange) => {
    const displayValue =
      typeof field.value === 'string' && field.value.startsWith('data:image/')
        ? `${field.value.slice(0, 30)}... (base64 image)`
        : field.value;
    log(`Field "${field.id}": ${displayValue}`);
    console.log('Field change:', field);
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '40px auto', padding: '20px' }}>
      <header style={{ marginBottom: '40px', textAlign: 'center' }}>
        <h1>
          <a href='https://www.npmjs.com/package/@superdoc-dev/esign' target='_blank' rel='noopener'>
            @superdoc-dev/esign
          </a>
        </h1>
        <p style={{ color: '#666' }}>
          React eSign component from{' '}
          <a href='https://superdoc.dev' target='_blank' rel='noopener'>
            SuperDoc
          </a>
        </p>
      </header>

      {submitted ? (
        <div
          style={{
            textAlign: 'center',
            padding: '40px',
            background: '#f0fdf4',
            borderRadius: '8px',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>✅</div>
          <h2>Agreement Signed!</h2>
          <p style={{ color: '#666', marginTop: '10px' }}>Event ID: {submitData?.eventId}</p>
          {submitData?.signerFields.find((f) => f.id === 'signature') && (
            <div style={{ marginTop: '20px' }}>
              <p style={{ color: '#666', marginBottom: '8px' }}>Signature:</p>
              <div
                style={{
                  fontFamily: 'cursive',
                  fontSize: '24px',
                  padding: '16px',
                  background: 'white',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                }}
              >
                {submitData.signerFields.find((f) => f.id === 'signature')?.value}
              </div>
            </div>
          )}
          <button
            onClick={() => {
              setSubmitted(false);
              setEvents([]);
            }}
            style={{
              marginTop: '30px',
              padding: '12px 24px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            Try Again
          </button>
        </div>
      ) : (
        <>
          <h2 style={{ marginBottom: '20px' }}>Employment Agreement</h2>
          <p style={{ marginBottom: '16px', color: '#666' }}>
            Use the document toolbar to download the current agreement at any time.
          </p>

          <div className='main-layout-container'>
            {/* Main content */}
            <div className='main-content-area'>
              <SuperDocESign
                ref={esignRef}
                eventId={eventId}
                telemetry={{ enabled: true, metadata: { source: 'esign-demo' } }}
                document={{
                  source: documentSource,
                  mode: 'full',
                  viewOptions: { layout: 'web' },
                  validation: {
                    scroll: { required: true },
                  },
                }}
                fields={{
                  document: documentFieldsConfig.map((f) => ({
                    id: f.id,
                    value: documentFields[f.id],
                    type: f.type,
                  })),
                  signer: signerFieldsConfig,
                }}
                download={{ label: 'Download PDF' }}
                onSubmit={handleSubmit}
                onDownload={handleDownload}
                onStateChange={handleStateChange}
                onFieldChange={handleFieldChange}
                documentHeight='500px'
              />

              {/* Event Log */}
              {events.length > 0 && (
                <div
                  style={{
                    marginTop: '20px',
                    padding: '12px',
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                  }}
                >
                  <div
                    style={{
                      fontWeight: 'bold',
                      marginBottom: '8px',
                      fontSize: '12px',
                      color: '#6b7280',
                    }}
                  >
                    EVENT LOG
                  </div>
                  {events.map((evt, i) => (
                    <div key={i} style={{ padding: '2px 0', color: '#374151' }}>
                      {evt}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right Sidebar - Document Fields */}
            <div className='document-fields-sidebar'>
              <h3>Document Fields</h3>
              <div className='document-fields-list'>
                {documentFieldsConfig.map((field) => (
                  <div key={field.id}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: '#6b7280',
                        marginBottom: '4px',
                      }}
                    >
                      {field.label} {field.type === 'table' && <span style={{ color: '#9ca3af' }}>(table)</span>}
                    </label>
                    {field.type === 'table' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {getTableRows(field.id).map((row, rowIndex) => (
                          <div key={rowIndex} style={{ display: 'flex', gap: '4px' }}>
                            {row.map((cellValue, cellIndex) => (
                              <input
                                key={cellIndex}
                                type='text'
                                value={cellValue}
                                onChange={(e) => {
                                  const rows = [...getTableRows(field.id)];
                                  rows[rowIndex] = [...rows[rowIndex]];
                                  rows[rowIndex][cellIndex] = e.target.value;
                                  updateDocumentField(field.id, rows);
                                }}
                                style={{
                                  flex: 1,
                                  padding: '8px 10px',
                                  fontSize: '14px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '6px',
                                  boxSizing: 'border-box',
                                }}
                              />
                            ))}
                            <button
                              onClick={() => {
                                const rows = [...getTableRows(field.id)];
                                if (rows.length > 1) {
                                  rows.splice(rowIndex, 1);
                                  updateDocumentField(field.id, rows);
                                }
                              }}
                              style={{
                                padding: '4px 8px',
                                fontSize: '14px',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                background: '#f9fafb',
                                cursor: 'pointer',
                              }}
                            >
                              -
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => {
                            const rows = [...getTableRows(field.id)];
                            // Add new row with same column count as first row
                            const colCount = rows[0]?.length || 1;
                            rows.push(Array(colCount).fill(''));
                            updateDocumentField(field.id, rows);
                          }}
                          style={{
                            padding: '6px 10px',
                            fontSize: '13px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            background: '#f9fafb',
                            cursor: 'pointer',
                            alignSelf: 'flex-start',
                          }}
                        >
                          + Add row
                        </button>
                      </div>
                    ) : (
                      <input
                        type='text'
                        value={documentFields[field.id] as string}
                        onChange={(e) => updateDocumentField(field.id, e.target.value)}
                        readOnly={field.readOnly}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          fontSize: '14px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          background: field.readOnly ? '#f3f4f6' : 'white',
                          color: field.readOnly ? '#6b7280' : '#111827',
                          cursor: field.readOnly ? 'not-allowed' : 'text',
                          boxSizing: 'border-box',
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
