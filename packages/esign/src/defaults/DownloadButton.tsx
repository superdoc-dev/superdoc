import React from 'react';
import type { DownloadButtonProps, DownloadConfig } from '../types';

export const createDownloadButton = (config?: DownloadConfig) => {
  const Component: React.FC<DownloadButtonProps> = ({
    onClick,
    fileName,
    isDisabled,
    isDownloading,
  }) => {
    const label = config?.label || 'Download';
    const disabled = isDisabled || isDownloading;

    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={`superdoc-esign-btn superdoc-esign-btn--download${isDownloading ? ' superdoc-esign-btn--loading' : ''}`}
        style={{
          padding: '8px 16px',
          borderRadius: '6px',
          border: '1px solid #d0d5dd',
          background: '#ffffff',
          color: '#333',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.7 : 1,
          fontSize: '16px',
          fontWeight: 'bold',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          transition: 'opacity 0.2s ease',
        }}
      >
        {isDownloading && <span className="superdoc-esign-spinner" />}
        {isDownloading ? 'Downloading...' : label}
        {!isDownloading && fileName && ` (${fileName})`}
      </button>
    );
  };

  return Component;
};
