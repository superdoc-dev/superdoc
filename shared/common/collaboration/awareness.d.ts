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
 * Convert provider awareness to an array of users
 *
 * @param context - Awareness context with color configuration
 * @param states - The provider's awareness states object
 * @returns Array of users with assigned colors
 */
export declare const awarenessStatesToArray: (
  context: AwarenessContext,
  states: Map<number, AwarenessState>,
) => UserWithColor[];
/**
 * Shuffle an array of hex colors
 * @param array - List of hex colors
 * @returns Shuffled array of hex colors
 */
export declare const shuffleArray: (array: HexColor[]) => HexColor[];
export {};
