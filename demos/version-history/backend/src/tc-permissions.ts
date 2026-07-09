/**
 * Tracked Changes Permissions
 *
 * Simple server-side gating for accept/reject tracked changes.
 * For demo purposes, just a global allowed/disallowed toggle.
 */

import { FastifyRequest, FastifyReply } from 'fastify';

// =============================================================================
// STATE
// =============================================================================

// Simple global toggle. In production, this would be per-document or per-user.
let tcActionsAllowed = true;

// =============================================================================
// API HANDLERS
// =============================================================================

export const TCPermissions = {
  /**
   * GET /api/tc-permissions
   * Returns current permission state.
   */
  async get(_req: FastifyRequest, reply: FastifyReply) {
    return reply.send({ allowed: tcActionsAllowed });
  },

  /**
   * POST /api/tc-permissions
   * Set permission state. Body: { allowed: boolean }
   */
  async set(req: FastifyRequest<{ Body: { allowed: boolean } }>, reply: FastifyReply) {
    const { allowed } = req.body ?? {};
    if (typeof allowed !== 'boolean') {
      return reply.status(400).send({ error: 'allowed must be a boolean' });
    }
    tcActionsAllowed = allowed;
    req.log.info({ allowed }, 'TC permissions updated');
    return reply.send({ allowed: tcActionsAllowed });
  },

  /**
   * POST /api/tc-permissions/check
   * Check if a specific action is allowed.
   * Body: { permission: string, trackedChange: object }
   *
   * For demo, just returns the global toggle.
   * In production, you'd check user roles, change ownership, etc.
   */
  async check(
    req: FastifyRequest<{ Body: { permission: string; trackedChange?: object } }>,
    reply: FastifyReply,
  ) {
    const { permission, trackedChange } = req.body ?? {};
    req.log.info({ permission, changeId: (trackedChange as any)?.id }, '→ TC permission check');

    // Simple demo logic: just return global toggle
    const allowed = tcActionsAllowed;

    req.log.info({ allowed }, '← TC permission result');
    return reply.send({ allowed });
  },
};

// =============================================================================
// ROUTES
// =============================================================================

export const tcPermissionRoutes = [
  { method: 'get' as const, path: '/api/tc-permissions', handler: TCPermissions.get },
  { method: 'post' as const, path: '/api/tc-permissions', handler: TCPermissions.set },
  { method: 'post' as const, path: '/api/tc-permissions/check', handler: TCPermissions.check },
];
