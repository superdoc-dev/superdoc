'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { archiveOrigin } from '@/lib/site-url';

/**
 * The version this documentation covers, and a way to reach the older one.
 *
 * A reader who arrives from a search result has no way to tell which major
 * version they are reading, and the two versions have different APIs. The pill
 * answers that on every page.
 *
 * The panel holds only the action. Naming the current version under a wordmark
 * that already reads SuperDoc, beside a pill that already reads v2, would
 * repeat what is on screen; and with one archived version, a list of versions
 * is a list of one.
 *
 * This is a disclosure, not a menu. `role="menu"` would promise arrow-key
 * navigation between items, which a single link does not need.
 */
export function VersionMenu() {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      // Without this, dismissing the panel drops focus wherever it was and a
      // keyboard reader has to tab back from the top of the page.
      trigger.current?.focus();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className='sd-version' ref={container}>
      <button
        className='sd-version-trigger'
        ref={trigger}
        type='button'
        aria-expanded={open}
        aria-label='Documentation version: SuperDoc v2'
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        v2
        <ChevronDown className='sd-version-chevron' aria-hidden='true' />
      </button>

      {open ? (
        <div className='sd-version-panel'>
          <a className='sd-version-link' href={archiveOrigin}>
            Switch to v1 docs
            <ExternalLink className='sd-version-external' aria-hidden='true' />
          </a>
        </div>
      ) : null}
    </div>
  );
}
