import type { PreviewServer } from './server';

// ---------------------------------------------------------------------------
// Global Preview Manager
// ---------------------------------------------------------------------------

/**
 * Simple manager to track active preview servers by session ID.
 * This allows cleanup when sessions are closed.
 */
class PreviewManager {
  private servers = new Map<string, PreviewServer>();

  /**
   * Register a preview server for a session.
   */
  register(sessionId: string, server: PreviewServer): void {
    // Stop any existing server for this session
    const existing = this.servers.get(sessionId);
    if (existing) {
      existing.stop().catch(() => {
        // Ignore errors during cleanup
      });
    }
    this.servers.set(sessionId, server);
  }

  /**
   * Get the preview server for a session.
   */
  get(sessionId: string): PreviewServer | undefined {
    return this.servers.get(sessionId);
  }

  /**
   * Check if a session has an active preview server.
   */
  has(sessionId: string): boolean {
    return this.servers.has(sessionId);
  }

  /**
   * Stop and remove the preview server for a session.
   */
  async stop(sessionId: string): Promise<boolean> {
    const server = this.servers.get(sessionId);
    if (!server) {
      return false;
    }
    await server.stop();
    this.servers.delete(sessionId);
    return true;
  }

  /**
   * Stop all preview servers.
   */
  async stopAll(): Promise<void> {
    const stops = Array.from(this.servers.values()).map((server) =>
      server.stop().catch(() => {
        // Ignore errors during cleanup
      })
    );
    await Promise.all(stops);
    this.servers.clear();
  }

  /**
   * Get all active session IDs with preview servers.
   */
  getActiveSessions(): string[] {
    return Array.from(this.servers.keys());
  }
}

// Global singleton instance
export const previewManager = new PreviewManager();
