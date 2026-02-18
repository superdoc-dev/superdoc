type ReadonlyLooseRecord = Readonly<Record<string, unknown>>;

/**
 * Hex color string (e.g., "#FF0000")
 */
export type HexColor = `#${string}`;

export interface User extends ReadonlyLooseRecord {
  readonly email: string;
  readonly name?: string;
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
    .filter(([, value]) => {
      const userEmail = value.user.email;
      if (seenUsers.has(userEmail)) return false;
      seenUsers.add(userEmail);
      return true;
    })
    .map(([key, value]) => {
      // Type narrowing guarantees user exists here
      const email = value.user.email;

      let color = context.userColorMap.get(email);
      if (!color) {
        // Prefer the color already set on the user's awareness state (e.g. hash-assigned by SuperDoc).
        // Fall back to the configured palette if available.
        const userColor = (value.user as Record<string, unknown>).color as HexColor | undefined;
        color =
          userColor ||
          (context.config.colors.length > 0
            ? context.config.colors[context.colorIndex % context.config.colors.length]
            : (undefined as unknown as HexColor));
        context.userColorMap.set(email, color);
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
