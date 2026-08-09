'use client';

import { useState } from 'react';
import styles from './copy-command.module.css';

type CopyCommandProps = {
  command: string;
};

export function CopyCommand({ command }: CopyCommandProps) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command);
      setStatus('copied');
    } catch {
      setStatus('error');
    }

    window.setTimeout(() => setStatus('idle'), 1600);
  }

  const label = status === 'copied' ? 'Copied' : status === 'error' ? 'Copy failed' : command;

  return (
    <button className={styles.button} onClick={copyCommand} type='button'>
      <span aria-hidden='true'>$</span>
      <span aria-live='polite'>{label}</span>
    </button>
  );
}
