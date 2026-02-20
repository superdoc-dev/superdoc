import { useMemo } from 'react';
import SuperDocESign from '@superdoc-dev/esign';
import type { SubmitData, SigningState, FieldChange, DownloadData, PdfModuleConfig } from '@superdoc-dev/esign';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import TabHeader from './TabHeader';

const pathToPDFWorker = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
const pdfDocumentSource = 'https://storage.googleapis.com/public_static_hosting/public_demo_docs/demo%20pdf.pdf';

interface PdfTabProps {
  eventId: string;
  events: string[];
  log: (msg: string) => void;
  activeTab: 'docx' | 'pdf';
  onSwitchTab: (tab: 'docx' | 'pdf') => void;
  onSubmitted: (data: SubmitData) => void;
  onStateChange: (state: SigningState) => void;
  onFieldChange: (field: FieldChange) => void;
}

export default function PdfTab({
  eventId,
  events,
  log,
  activeTab,
  onSwitchTab,
  onSubmitted,
  onStateChange,
  onFieldChange,
}: PdfTabProps) {
  const pdfConfig = useMemo<PdfModuleConfig>(
    () => ({
      pdfLib: pdfjsLib,
      workerSrc: pathToPDFWorker as string,
      setWorker: true,
      outputScale: 2,
    }),
    [],
  );

  return (
    <>
      <TabHeader
        title='Consent of Rules'
        subtitle='Use the document toolbar to download the current agreement at any time.'
        activeTab={activeTab}
        onSwitchTab={onSwitchTab}
      />

      <SuperDocESign
        eventId={eventId}
        document={{
          source: pdfDocumentSource,
          mode: 'full',
          viewOptions: { layout: 'print' },
          validation: { scroll: { required: true } },
        }}
        pdf={pdfConfig}
        download={{ label: 'Download' }}
        onDownload={async (data: DownloadData) => {
          const source = data.documentSource;
          if (typeof source !== 'string') return;
          const response = await fetch(source);
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = data.fileName || 'document.pdf';
          a.click();
          URL.revokeObjectURL(url);
          log('Downloaded PDF');
        }}
        fields={{
          signer: [
            {
              id: 'pdf-accept',
              type: 'checkbox' as const,
              label: 'I have read and agree to these rules',
              validation: { required: true },
            },
          ],
        }}
        onSubmit={async (data) => {
          log('PDF submit received');
          console.log('PDF submit data:', data);
          onSubmitted(data);
        }}
        onStateChange={onStateChange}
        onFieldChange={onFieldChange}
        documentHeight='500px'
      />

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
          <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '12px', color: '#6b7280' }}>EVENT LOG</div>
          {events.map((evt, i) => (
            <div key={i} style={{ padding: '2px 0', color: '#374151' }}>
              {evt}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
