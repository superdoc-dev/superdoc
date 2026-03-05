export interface LayoutErrorBannerDeps {
  host: HTMLElement;
  getDebugLabel: () => string | undefined;
  onRetry: () => void;
}

/**
 * Manages the layout error banner UI: a dismissible warning bar shown at the
 * top of the visible host when the layout engine encounters an error.
 */
export class LayoutErrorBanner {
  #deps: LayoutErrorBannerDeps;
  #banner: HTMLElement | null = null;
  #message: HTMLElement | null = null;

  constructor(deps: LayoutErrorBannerDeps) {
    this.#deps = deps;
  }

  show(error: Error): void {
    const doc = this.#deps.host.ownerDocument ?? document;
    if (!this.#banner) {
      const banner = doc.createElement('div');
      banner.className = 'presentation-editor__layout-error';
      banner.style.display = 'flex';
      banner.style.alignItems = 'center';
      banner.style.justifyContent = 'space-between';
      banner.style.gap = '8px';
      banner.style.padding = '8px 12px';
      banner.style.background = '#FFF6E5';
      banner.style.border = '1px solid #F5B971';
      banner.style.borderRadius = '6px';
      banner.style.marginBottom = '8px';

      const message = doc.createElement('span');
      banner.appendChild(message);

      const retry = doc.createElement('button');
      retry.type = 'button';
      retry.textContent = 'Reload layout';
      retry.style.border = 'none';
      retry.style.borderRadius = '4px';
      retry.style.background = '#F5B971';
      retry.style.color = '#3F2D00';
      retry.style.padding = '6px 10px';
      retry.style.cursor = 'pointer';
      retry.addEventListener('click', () => {
        this.dismiss();
        this.#deps.onRetry();
      });

      banner.appendChild(retry);
      this.#deps.host.prepend(banner);

      this.#banner = banner;
      this.#message = message;
    }

    if (this.#message) {
      this.#message.textContent = 'Layout engine hit an error. Your document is safe — try reloading layout.';
      const debugLabel = this.#deps.getDebugLabel();
      if (debugLabel) {
        this.#message.textContent += ` (${debugLabel}: ${error.message})`;
      }
    }
  }

  dismiss(): void {
    this.#banner?.remove();
    this.#banner = null;
    this.#message = null;
  }

  destroy(): void {
    this.dismiss();
  }
}
