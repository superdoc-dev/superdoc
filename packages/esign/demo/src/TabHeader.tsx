type DemoTab = 'docx' | 'pdf';

interface TabHeaderProps {
  title: string;
  subtitle?: string;
  activeTab: DemoTab;
  onSwitchTab: (tab: DemoTab) => void;
}

export default function TabHeader({ title, subtitle, activeTab, onSwitchTab }: TabHeaderProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
      <div>
        <h2 style={{ margin: 0 }}>{title}</h2>
        {subtitle && <p style={{ marginTop: '8px', color: '#666' }}>{subtitle}</p>}
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {(['docx', 'pdf'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => onSwitchTab(tab)}
            style={{
              padding: '6px 16px',
              fontSize: '13px',
              fontWeight: 600,
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              background: activeTab === tab ? '#3b82f6' : '#fff',
              color: activeTab === tab ? '#fff' : '#374151',
              cursor: 'pointer',
              textTransform: 'uppercase',
            }}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>
  );
}
