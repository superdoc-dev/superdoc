/**
 * SuperDoc Telemetry - Document Open Tracking
 *
 * Tracks document opens for usage-based billing.
 * Sends immediately on each document open/import.
 * Fails silently - never breaks the app.
 */

declare const __APP_VERSION__: string;

export interface TelemetryConfig {
  enabled: boolean;
  endpoint?: string;
  licenseKey?: string | null;
  metadata?: Record<string, unknown>;
}

export interface BrowserInfo {
  userAgent: string;
  currentUrl: string;
  hostname: string;
  screenSize: {
    width: number;
    height: number;
  };
}

export interface DocumentOpenEvent {
  timestamp: string;
  documentId: string | null;
  documentCreatedAt: string | null;
}

export interface TelemetryPayload {
  superdocVersion: string;
  browserInfo: BrowserInfo;
  metadata?: Record<string, unknown>;
  events: DocumentOpenEvent[];
}

const DEFAULT_ENDPOINT = 'https://ingest.superdoc.dev/v1/collect';

/**
 * Community license key for AGPLv3 / evaluation usage.
 */
export const COMMUNITY_LICENSE_KEY = 'community-and-eval-agplv3';

function getSuperdocVersion(): string {
  try {
    return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown';
  } catch {
    return 'unknown';
  }
}

export class Telemetry {
  private enabled: boolean;
  private endpoint: string;
  private superdocVersion: string;
  private licenseKey: string;
  private metadata?: Record<string, unknown>;

  constructor(config: TelemetryConfig) {
    this.enabled = config.enabled;
    this.endpoint = config.endpoint || DEFAULT_ENDPOINT;
    this.licenseKey = config.licenseKey || '';
    this.metadata = config.metadata;
    this.superdocVersion = getSuperdocVersion();
  }

  private getBrowserInfo(): BrowserInfo {
    if (typeof window === 'undefined') {
      return {
        userAgent: '',
        currentUrl: '',
        hostname: '',
        screenSize: { width: 0, height: 0 },
      };
    }

    return {
      userAgent: window.navigator.userAgent,
      currentUrl: window.location.href,
      hostname: window.location.hostname,
      screenSize: {
        width: window.screen.width,
        height: window.screen.height,
      },
    };
  }

  /**
   * Track a document open event - sends immediately
   * @param documentId - Unique document identifier (GUID or hash), or null if unavailable
   * @param documentCreatedAt - Document creation timestamp (dcterms:created), or null if unavailable
   */
  trackDocumentOpen(documentId: string | null, documentCreatedAt: string | null = null): void {
    if (!this.enabled) return;

    const event: DocumentOpenEvent = {
      timestamp: new Date().toISOString(),
      documentId,
      documentCreatedAt,
    };

    this.sendEvent(event);
  }

  /**
   * Send event via fetch (fire and forget)
   */
  private async sendEvent(event: DocumentOpenEvent): Promise<void> {
    const payload: TelemetryPayload = {
      superdocVersion: this.superdocVersion,
      browserInfo: this.getBrowserInfo(),
      ...(this.metadata && { metadata: this.metadata }),
      events: [event],
    };

    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-License-Key': this.licenseKey,
        },
        body: JSON.stringify(payload),
        credentials: 'omit',
      });
    } catch {
      // Fail silently - telemetry should never break the app
    }
  }
}
