import type { IncomingHttpHeaders } from 'node:http';
import type { SharedSuperDoc } from '../shared-doc/shared-doc.js';
export type UserContext = Record<string, unknown> | null | undefined;
export interface CollaborationParams {
  documentId: string;
  token?: string;
  params?: Record<string, string>;
  headers?: IncomingHttpHeaders;
  cookies?: Record<string, string>;
  connection?: Record<string, unknown>;
  instance?: unknown;
  document?: SharedSuperDoc;
  userContext?: UserContext;
  [key: string]: unknown;
}
export interface CollaborationWebSocket {
  readyState: number;
  send(data: Uint8Array | ArrayBufferLike | string, options?: unknown, cb?: (err?: Error | null) => void): void;
  close(code?: number, reason?: string | Buffer): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
}
export interface SocketRequest {
  url: string;
  params: Record<string, string>;
  headers?: IncomingHttpHeaders;
}
export type HookFn<HookFnResponse = void> = (
  params: CollaborationParams
) => Promise<HookFnResponse> | HookFnResponse | void;
export type ConfigureFn = (config: ServiceConfig) => void;
export type AuthenticateFn = HookFn<UserContext | boolean>;
export type LoadFn = HookFn<Uint8Array | null | undefined>;
export type BeforeChangeFn = HookFn<void>;
export type ChangeFn = HookFn<void>;
export type AutoSaveFn = HookFn<void>;
export interface Hooks {
  configure?: ConfigureFn;
  authenticate?: AuthenticateFn;
  load?: LoadFn;
  beforeChange?: BeforeChangeFn;
  change?: ChangeFn;
  autoSave?: AutoSaveFn;
}
/**
 * Extension type for Yjs extensions (e.g., y-websocket, y-indexeddb).
 * Allows any key-value pairs to support various extension configurations.
 */
export type Extension = Record<string, unknown>;
export interface ServiceConfig {
  name?: string;
  debounce?: number;
  documentExpiryMs?: number;
  hooks?: Hooks;
  extensions?: Extension[];
}
//# sourceMappingURL=service-types.d.ts.map
