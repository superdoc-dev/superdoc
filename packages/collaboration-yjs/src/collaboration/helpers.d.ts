import type { CollaborationParams, SocketRequest } from '../types/service-types.js';
import type { SuperDocCollaboration } from './collaboration.js';
export declare const generateParams: (request: SocketRequest, instance?: SuperDocCollaboration) => CollaborationParams;
export declare function parseCookie(rawCookie?: string): Record<string, string>;
//# sourceMappingURL=helpers.d.ts.map
