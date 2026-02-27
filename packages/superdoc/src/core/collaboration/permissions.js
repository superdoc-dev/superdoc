export const PERMISSIONS = Object.freeze({
  RESOLVE_OWN: 'RESOLVE_OWN',
  RESOLVE_OTHER: 'RESOLVE_OTHER',
  REJECT_OWN: 'REJECT_OWN',
  REJECT_OTHER: 'REJECT_OTHER',
  COMMENTS_OVERFLOW_OWN: 'COMMENTS_OVERFLOW',
  COMMENTS_OVERFLOW_OTHER: 'COMMENTS_OVERFLOW_OTHER',
  COMMENTS_DELETE_OWN: 'COMMENTS_DELETE_OWN',
  COMMENTS_DELETE_OTHER: 'COMMENTS_DELETE_OTHER',
  UPLOAD_VERSION: 'UPLOAD_VERSION',
  VERSION_HISTORY: 'VERSION_HISTORY',
});

const ROLES = Object.freeze({
  EDITOR: 'editor',
  SUGGESTER: 'suggester',
  VIEWER: 'viewer',
});

const PERMISSION_MATRIX = Object.freeze({
  [PERMISSIONS.RESOLVE_OWN]: {
    internal: [ROLES.EDITOR],
    external: [ROLES.EDITOR],
  },
  [PERMISSIONS.RESOLVE_OTHER]: {
    internal: [ROLES.EDITOR],
    external: [ROLES.EDITOR],
  },
  [PERMISSIONS.REJECT_OWN]: {
    internal: [ROLES.EDITOR, ROLES.SUGGESTER],
    external: [ROLES.EDITOR, ROLES.SUGGESTER],
  },
  [PERMISSIONS.REJECT_OTHER]: {
    internal: [ROLES.EDITOR],
    external: [ROLES.EDITOR],
  },
  [PERMISSIONS.COMMENTS_OVERFLOW_OWN]: {
    internal: [ROLES.EDITOR, ROLES.SUGGESTER],
    external: [ROLES.EDITOR, ROLES.SUGGESTER],
  },
  [PERMISSIONS.COMMENTS_OVERFLOW_OTHER]: {
    internal: [ROLES.EDITOR],
    external: [ROLES.EDITOR],
  },
  [PERMISSIONS.COMMENTS_DELETE_OWN]: {
    internal: [ROLES.EDITOR, ROLES.SUGGESTER],
    external: [ROLES.EDITOR, ROLES.SUGGESTER],
  },
  [PERMISSIONS.COMMENTS_DELETE_OTHER]: {
    internal: [ROLES.EDITOR],
    external: [ROLES.EDITOR],
  },
  [PERMISSIONS.UPLOAD_VERSION]: {
    internal: [ROLES.EDITOR],
    external: [],
  },
  [PERMISSIONS.VERSION_HISTORY]: {
    internal: [ROLES.EDITOR],
    external: [],
  },
});

const pickResolver = (context = {}) => {
  if (typeof context.permissionResolver === 'function') return context.permissionResolver;
  if (context.superdoc?.config?.modules?.comments?.permissionResolver) {
    const resolver = context.superdoc.config.modules.comments.permissionResolver;
    if (typeof resolver === 'function') return resolver;
  }
  if (typeof context.superdoc?.config?.permissionResolver === 'function') {
    return context.superdoc.config.permissionResolver;
  }
  return null;
};

const defaultDecisionFor = (permission, role, isInternal) => {
  const internalExternal = isInternal ? 'internal' : 'external';
  return PERMISSION_MATRIX[permission]?.[internalExternal]?.includes(role) ?? false;
};

/**
 * Check if a role is allowed to perform a permission
 *
 * @param {String} permission The permission to check
 * @param {String} role The role to check
 * @param {Boolean} isInternal The internal/external flag
 * @param {Object} [context] Optional context used by the permission resolver
 * @param {Object} [context.comment] The comment/tracked change being evaluated
 * @param {Object} [context.superdoc] The superdoc instance
 * @param {Object} [context.currentUser] The active user object performing the action
 * @param {Function} [context.permissionResolver] Explicit resolver override
 * @param {Object} [context.trackedChange] Tracked change metadata (for tracked-change permissions)
 * @returns {Boolean} True if the role is allowed to perform the permission
 */
export const isAllowed = (permission, role, isInternal, context = {}) => {
  const defaultDecision = defaultDecisionFor(permission, role, isInternal);
  const resolver = pickResolver(context);

  if (typeof resolver !== 'function') return defaultDecision;

  const decision = resolver({
    permission,
    role,
    isInternal,
    defaultDecision,
    comment: context.comment ?? null,
    currentUser: context.currentUser ?? context.superdoc?.config?.user ?? null,
    superdoc: context.superdoc ?? null,
    trackedChange: context.trackedChange ?? null,
  });

  return typeof decision === 'boolean' ? decision : defaultDecision;
};
