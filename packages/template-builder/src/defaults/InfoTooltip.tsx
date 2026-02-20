import { useState } from 'react';

export const InfoTooltip: React.FC<{ text: string }> = ({ text }) => {
  const [visible, setVisible] = useState(false);

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onClick={(e) => e.stopPropagation()}
    >
      <svg
        width='14'
        height='14'
        viewBox='0 0 16 16'
        fill='none'
        xmlns='http://www.w3.org/2000/svg'
        style={{ cursor: 'help', flexShrink: 0 }}
      >
        <circle cx='8' cy='8' r='7' stroke='#9ca3af' strokeWidth='1.5' />
        <text
          x='8'
          y='11.5'
          textAnchor='middle'
          fontSize='10'
          fontWeight='600'
          fontFamily='system-ui, sans-serif'
          fill='#6b7280'
        >
          ?
        </text>
      </svg>
      {visible && (
        <span
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: '6px',
            padding: '6px 10px',
            background: '#1f2937',
            color: '#fff',
            fontSize: '11px',
            lineHeight: '1.4',
            borderRadius: '4px',
            whiteSpace: 'normal',
            width: '200px',
            textAlign: 'center',
            zIndex: 1001,
            pointerEvents: 'none',
            fontWeight: 400,
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
};
