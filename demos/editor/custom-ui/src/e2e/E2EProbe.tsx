import { useEffect } from 'react';
import { useSuperDocHost, useSuperDocUI } from 'superdoc/ui/react';

declare global {
  interface Window {
    __superdocCustomUIDemoE2E?: {
      ready: boolean;
      host: unknown;
      ui: unknown;
    };
  }
}

/**
 * Playwright-only handle for the custom UI demo.
 *
 * The demo does not need this at runtime; tests opt in with `?e2e=1`
 * so they can exercise the public UI controller without brittle DOM
 * traversal.
 */
export function E2EProbe() {
  const ui = useSuperDocUI();
  const host = useSuperDocHost();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('e2e') !== '1') return;
    window.__superdocCustomUIDemoE2E = {
      ready: Boolean(ui && host),
      host,
      ui,
    };
  }, [host, ui]);

  return null;
}
