import { getActorIdentityKey } from '../identity';

type ReadonlyLooseRecord = Readonly<Record<string, unknown>>;

/**
 * Hex color string (e.g., "#FF0000")
 */
export type HexColor = `#${string}`;

export interface User extends ReadonlyLooseRecord {
  readonly id?: string | null;
  readonly email?: string | null;
  readonly name?: string | null;
  readonly color?: HexColor | string;
}

export interface AwarenessState extends ReadonlyLooseRecord {
  user?: User;
}

export interface AwarenessContext {
  userColorMap: Map<string, HexColor>;
  colorIndex: number;
  config: {
    readonly colors: readonly HexColor[];
  };
}

export interface UserWithColor extends User {
  readonly clientId: number;
  readonly color: HexColor;
}

/**
 * Type guard to check if an awareness state has a valid user
 */
function hasUser(entry: [number, AwarenessState]): entry is [number, AwarenessState & { user: User }] {
  return entry[1].user !== undefined;
}

/**
 * Convert provider awareness to an array of users
 *
 * @param context - Awareness context with color configuration
 * @param states - The provider's awareness states object
 * @returns Array of users with assigned colors
 */
export const awarenessStatesToArray = (
  context: AwarenessContext,
  states: Map<number, AwarenessState>,
): UserWithColor[] => {
  const seenUsers = new Set<string>();

  return Array.from(states.entries())
    .filter(hasUser)
    .filter(([clientId, value]) => {
      const identityKey = getActorIdentityKey({ actor: value.user, fallbackKey: clientId });
      if (!identityKey) return false;
      if (seenUsers.has(identityKey)) return false;
      seenUsers.add(identityKey);
      return true;
    })
    .map(([key, value]) => {
      const identityKey = getActorIdentityKey({ actor: value.user, fallbackKey: key });

      let color = context.userColorMap.get(identityKey);
      if (!color) {
        // Prefer the color already set on the user's awareness state (e.g. hash-assigned by SuperDoc).
        // Fall back to the configured palette if available.
        const userColor = (value.user as Record<string, unknown>).color as HexColor | undefined;
        color =
          userColor ||
          (context.config.colors.length > 0
            ? context.config.colors[context.colorIndex % context.config.colors.length]
            : (undefined as unknown as HexColor));
        context.userColorMap.set(identityKey, color);
        context.colorIndex++;
      }

      return {
        clientId: key,
        ...value.user,
        color,
      };
    });
};

/**
 * Shuffle an array of hex colors
 * @param array - List of hex colors
 * @returns Shuffled array of hex colors
 */
export const shuffleArray = (array: HexColor[]): HexColor[] => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};
