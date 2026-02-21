import { useState } from 'react';
import type { SubmitData, SigningState, FieldChange } from '@superdoc-dev/esign';
import DocxTab from './DocxTab';
import PdfTab from './PdfTab';
import 'superdoc/style.css';
import './App.css';

type DemoTab = 'docx' | 'pdf';

export function App() {
  const [activeTab, setActiveTab] = useState<DemoTab>('docx');
  const [submitted, setSubmitted] = useState(false);
  const [submitData, setSubmitData] = useState<SubmitData | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [eventId] = useState(() => `demo-${Date.now()}`);

  const log = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] ${msg}`);
    setEvents((prev) => [...prev.slice(-4), `${time} - ${msg}`]);
  };

  const handleStateChange = (state: SigningState) => {
    if (state.scrolled && !events.some((e) => e.includes('Scrolled'))) {
      log('Scrolled to bottom');
    }
    if (state.isValid && !events.some((e) => e.includes('Ready'))) {
      log('Ready to submit');
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

  const handleSubmitted = (data: SubmitData) => {
    setSubmitted(true);
    setSubmitData(data);
  };

  const switchTab = (tab: DemoTab) => {
    setActiveTab(tab);
    setSubmitted(false);
    setEvents([]);
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
          <h2>Submitted!</h2>
          <p style={{ color: '#666', marginTop: '10px' }}>Event ID: {submitData?.eventId}</p>
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
      ) : activeTab === 'docx' ? (
        <DocxTab
          eventId={eventId}
          events={events}
          log={log}
          activeTab={activeTab}
          onSwitchTab={switchTab}
          onSubmitted={handleSubmitted}
          onStateChange={handleStateChange}
          onFieldChange={handleFieldChange}
        />
      ) : (
        <PdfTab
          eventId={eventId}
          events={events}
          log={log}
          activeTab={activeTab}
          onSwitchTab={switchTab}
          onSubmitted={handleSubmitted}
          onStateChange={handleStateChange}
          onFieldChange={handleFieldChange}
        />
      )}
    </div>
  );
}
