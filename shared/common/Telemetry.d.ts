/**
 * SuperDoc Telemetry - Document Open Tracking
 *
 * Tracks document opens for usage-based billing.
 * Sends immediately on each document open/import.
 * Fails silently - never breaks the app.
 */

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

/**
 * Community license key for AGPLv3 / evaluation usage.
 */
export declare const COMMUNITY_LICENSE_KEY: 'community-and-eval-agplv3';

export declare class Telemetry {
  constructor(config: TelemetryConfig);

  /**
   * Track a document open event - sends immediately
   * @param documentId - Unique document identifier (GUID or hash), or null if unavailable
   * @param documentCreatedAt - Document creation timestamp (dcterms:created), or null if unavailable
   */
  trackDocumentOpen(documentId: string | null, documentCreatedAt?: string | null): void;
}
