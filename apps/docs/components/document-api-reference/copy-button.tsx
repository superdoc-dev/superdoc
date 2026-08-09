'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  const copy = async () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    try {
      await navigator.clipboard.writeText(value);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
    resetTimer.current = window.setTimeout(() => {
      setStatus('idle');
      resetTimer.current = null;
    }, 1600);
  };

  const statusLabel = status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : 'Copy';

  return (
    <button className='sd-docapi-copy' type='button' onClick={copy} aria-label={label}>
      {status === 'copied' ? <Check aria-hidden='true' size={14} /> : <Copy aria-hidden='true' size={14} />}
      <span aria-live='polite'>{statusLabel}</span>
    </button>
  );
}
