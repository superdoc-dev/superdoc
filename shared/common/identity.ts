type IdentityFields = Readonly<{
  id?: unknown;
  email?: unknown;
  name?: unknown;
}>;

type IdentityLike = IdentityFields | Readonly<Record<string, unknown>> | null | undefined;

export interface NormalizedActorIdentity {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly hasId: boolean;
  readonly hasEmail: boolean;
}

/**
 * Trim a principal id. Actor ids are treated as opaque, case-sensitive values.
 */
export const normalizeActorId = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

/**
 * Trim and lowercase an email value.
 */
export const normalizeActorEmail = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.toLowerCase();
};

/**
 * Trim and lowercase a display-name value.
 */
export const normalizeActorName = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.toLowerCase();
};

export const getActorIdentity = (value: IdentityLike): NormalizedActorIdentity => {
  const record = value ?? {};
  const id = normalizeActorId(record.id);
  const email = normalizeActorEmail(record.email);
  const name = typeof record.name === 'string' ? record.name : '';
  return {
    id,
    email,
    name,
    hasId: id.length > 0,
    hasEmail: email.length > 0,
  };
};

/**
 * Principal-first actor comparison.
 *
 * - If both sides have ids, ids decide.
 * - Otherwise, when both sides have emails, emails decide.
 * - Missing comparable identifiers means "not provably same actor".
 */
export const actorIdentitiesMatch = ({ current, other }: { current?: IdentityLike; other?: IdentityLike }): boolean => {
  const currentIdentity = getActorIdentity(current);
  const otherIdentity = getActorIdentity(other);

  if (currentIdentity.hasId && otherIdentity.hasId) {
    return currentIdentity.id === otherIdentity.id;
  }

  if (currentIdentity.hasEmail && otherIdentity.hasEmail) {
    return currentIdentity.email === otherIdentity.email;
  }

  return false;
};

/**
 * Stable identity key for dedupe/color assignment.
 *
 * Id wins over email. Callers may supply a per-session fallback key when no
 * durable principal data exists.
 */
export const getActorIdentityKey = ({
  actor,
  fallbackKey = '',
}: {
  actor?: IdentityLike;
  fallbackKey?: string | number | null | undefined;
}): string => {
  const identity = getActorIdentity(actor);
  if (identity.hasId) return `id:${identity.id}`;
  if (identity.hasEmail) return `email:${identity.email}`;

  const fallback =
    typeof fallbackKey === 'number' ? String(fallbackKey) : typeof fallbackKey === 'string' ? fallbackKey.trim() : '';
  if (fallback) return `fallback:${fallback}`;
  return '';
};
