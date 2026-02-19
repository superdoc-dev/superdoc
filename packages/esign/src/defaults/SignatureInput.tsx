import type { FC } from 'react';
import type { FieldComponentProps } from '../types';

export const SignatureInput: FC<FieldComponentProps> = ({ value, onChange, isDisabled, label }) => {
  return (
    <div className={`superdoc-esign-signature-input`} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {label && <label>{label}</label>}
      <input
        type='text'
        value={String(value || '')}
        onChange={(e) => onChange(e.target.value)}
        disabled={isDisabled}
        placeholder='Type your full name'
        style={{
          fontFamily: 'cursive',
          fontSize: '18px',
        }}
      />
    </div>
  );
};
