import React, { useEffect, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';
import type { FieldComponentProps } from '@superdoc-dev/esign';

// Trim whitespace around strokes by tightening the SVG viewBox.
const cropSVG = (svgText: string): string => {
  const container = document.createElement('div');
  container.setAttribute('style', 'visibility: hidden; position: absolute; left: -9999px;');
  document.body.appendChild(container);

  try {
    container.innerHTML = svgText;
    const svgElement = container.getElementsByTagName('svg')[0];
    if (!svgElement) return svgText;

    const bbox = svgElement.getBBox();
    if (bbox.width === 0 || bbox.height === 0) return svgText;

    const padding = 5;
    const viewBox = [
      bbox.x - padding,
      bbox.y - padding,
      bbox.width + padding * 2,
      bbox.height + padding * 2,
    ].join(' ');
    svgElement.setAttribute('viewBox', viewBox);
    svgElement.setAttribute('width', String(Math.ceil(bbox.width + padding * 2)));
    svgElement.setAttribute('height', String(Math.ceil(bbox.height + padding * 2)));

    return svgElement.outerHTML;
  } finally {
    container.remove();
  }
};

// Rasterize a cropped SVG into a PNG data URL.
const svgToPngDataUrl = (svgText: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load SVG for rasterization'));
    img.src = svgDataUrl;
  });

const CustomSignature: React.FC<FieldComponentProps> = ({ value, onChange, isDisabled, label }) => {
  const [mode, setMode] = useState<'type' | 'draw'>('type');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signaturePadRef = useRef<SignaturePad | null>(null);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDataUrlRef = useRef<string | null>(null);
  const conversionIdRef = useRef(0);

  const clearCommitTimer = () => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
  };

  // Debounced export to avoid re-rendering during active drawing.
  const commitSignature = () => {
    if (!signaturePadRef.current) return;
    if (signaturePadRef.current.isEmpty()) {
      latestDataUrlRef.current = null;
      onChange('');
      return;
    }

    const svgText = signaturePadRef.current.toSVG();
    const croppedSvg = cropSVG(svgText);
    const conversionId = ++conversionIdRef.current;

    svgToPngDataUrl(croppedSvg)
      .then((dataUrl) => {
        if (conversionIdRef.current !== conversionId) return;
        latestDataUrlRef.current = dataUrl;
        onChange(dataUrl);
      })
      .catch((error) => {
        console.error('Failed to convert signature to PNG:', error);
      });
  };

  const switchMode = (newMode: 'type' | 'draw') => {
    clearCommitTimer();
    latestDataUrlRef.current = null;
    conversionIdRef.current += 1;
    setMode(newMode);
    onChange('');
    if (newMode === 'draw' && signaturePadRef.current) {
      signaturePadRef.current.clear();
    }
  };

  const clearCanvas = () => {
    if (signaturePadRef.current) {
      signaturePadRef.current.clear();
      clearCommitTimer();
      latestDataUrlRef.current = null;
      conversionIdRef.current += 1;
      onChange('');
    }
  };

  useEffect(() => {
    if (!canvasRef.current || mode !== 'draw') return;

    const canvas = canvasRef.current;
    // Match canvas pixels to display size for correct pointer mapping.
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = Math.floor(rect.width * ratio);
      canvas.height = Math.floor(rect.height * ratio);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(ratio, ratio);
      }
      signaturePadRef.current?.clear();
    };

    resizeCanvas();

    signaturePadRef.current = new SignaturePad(canvasRef.current, {
      backgroundColor: 'rgb(255, 255, 255)',
      penColor: 'rgb(0, 0, 0)',
    });

    if (isDisabled) {
      signaturePadRef.current.off();
    }

    signaturePadRef.current.addEventListener('endStroke', () => {
      if (signaturePadRef.current) {
        clearCommitTimer();
        commitTimerRef.current = setTimeout(() => {
          commitSignature();
        }, 1000);
      }
    });

    window.addEventListener('resize', resizeCanvas);

    return () => {
      if (signaturePadRef.current) {
        signaturePadRef.current.off();
      }
      clearCommitTimer();
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [mode, isDisabled, onChange]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {label && (
        <label style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937' }}>{label}</label>
      )}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
        <button
          type="button"
          onClick={() => switchMode('type')}
          disabled={isDisabled}
          style={{
            padding: '6px 12px',
            background: mode === 'type' ? '#14b8a6' : 'white',
            color: mode === 'type' ? 'white' : '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '13px',
            cursor: isDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          Type
        </button>
        <button
          type="button"
          onClick={() => switchMode('draw')}
          disabled={isDisabled}
          style={{
            padding: '6px 12px',
            background: mode === 'draw' ? '#14b8a6' : 'white',
            color: mode === 'draw' ? 'white' : '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '13px',
            cursor: isDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          Draw
        </button>
      </div>
      {mode === 'type' ? (
        <input
          type="text"
          value={String(value || '')}
          onChange={(e) => onChange(e.target.value)}
          disabled={isDisabled}
          placeholder="Type your full name"
          style={{
            fontFamily: 'cursive',
            fontSize: '20px',
            padding: '14px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            outline: 'none',
            transition: 'border-color 0.2s',
          }}
          onFocus={(e) => (e.target.style.borderColor = '#14b8a6')}
          onBlur={(e) => (e.target.style.borderColor = '#d1d5db')}
        />
      ) : (
        <div>
          <canvas
            ref={canvasRef}
            style={{
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              cursor: isDisabled ? 'not-allowed' : 'crosshair',
              background: 'white',
              width: '100%',
              height: '150px',
            }}
          />
          <button
            type="button"
            onClick={clearCanvas}
            disabled={isDisabled}
            style={{
              marginTop: '8px',
              padding: '6px 12px',
              background: 'white',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
            }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
};

export default CustomSignature;
