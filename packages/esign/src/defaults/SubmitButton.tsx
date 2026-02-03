import React from 'react';
import type { SubmitButtonProps, SubmitConfig } from '../types';

export const createSubmitButton = (config?: SubmitConfig) => {
  const Component: React.FC<SubmitButtonProps> = ({
    onClick,
    isValid,
    isDisabled,
    isSubmitting,
  }) => {
    const label = config?.label || 'Submit';
    const disabled = !isValid || isDisabled || isSubmitting;

    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={`superdoc-esign-btn superdoc-esign-btn--submit${isSubmitting ? ' superdoc-esign-btn--loading' : ''}`}
        style={{
          padding: '12px 24px',
          borderRadius: '6px',
          border: 'none',
          background: '#007bff',
          color: '#fff',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled && !isSubmitting ? 0.5 : 1,
          fontSize: '16px',
          fontWeight: 'bold',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          transition: 'opacity 0.2s ease',
        }}
      >
        {isSubmitting && <span className="superdoc-esign-spinner superdoc-esign-spinner--light" />}
        {isSubmitting ? 'Submitting...' : label}
      </button>
    );
  };

  return Component;
};
