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
  licenseKey?: string;
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

interface TelemetryOptions {
  config: TelemetryConfig;
}

export declare class Telemetry {
  constructor(options: TelemetryOptions);

  /**
   * Track a document open event - sends immediately
   * @param documentId - Unique document identifier (GUID or hash), or null if unavailable
   * @param documentCreatedAt - Document creation timestamp (dcterms:created), or null if unavailable
   */
  trackDocumentOpen(documentId: string | null, documentCreatedAt?: string | null): void;

  /**
   * Disable telemetry
   */
  disable(): void;

  /**
   * Enable telemetry
   */
  enable(): void;

  /**
   * Check if telemetry is enabled
   */
  isEnabled(): boolean;
}
