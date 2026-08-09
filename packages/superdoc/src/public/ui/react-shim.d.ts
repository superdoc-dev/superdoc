/**
 * Minimal ambient typings for the `react` peer dependency, scoped to exactly
 * the surface `./react.ts` uses.
 *
 * `react` is an optional peer of this package and ships no bundled types, so
 * this workspace intentionally does not depend on `@types/react` here. Without
 * a declaration, every `react` import is an implicit `any` under
 * `noImplicitAny`. This shim types the handful of APIs the bindings consume so
 * the file is genuinely type-checked, while the names used in emitted public
 * declarations (`ReactNode`, `ReactElement`) match `@types/react`, so
 * consumers who install the real typings resolve them correctly.
 *
 * If this package ever takes a direct `@types/react` devDependency (as
 * `packages/react` does), delete this file — the two declarations would merge
 * and conflict.
 */
declare module 'react' {
  /** Opaque renderable content; matches the `@types/react` name. */
  export type ReactNode = unknown;

  /** Opaque element result; matches the `@types/react` name. */
  export interface ReactElement {
    type: unknown;
    props: unknown;
    key: string | null;
  }

  export interface ProviderProps<T> {
    value: T;
    children?: ReactNode;
  }

  export interface Context<T> {
    Provider: (props: ProviderProps<T>) => ReactElement | null;
  }

  export function createContext<T>(defaultValue: T): Context<T>;

  export function createElement<P>(
    type: (props: P) => ReactElement | null,
    props: P | null,
    ...children: ReactNode[]
  ): ReactElement;

  export function useCallback<T extends (...args: never[]) => unknown>(callback: T, deps: readonly unknown[]): T;

  export function useContext<T>(context: Context<T>): T;

  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;

  export interface MutableRefObject<T> {
    current: T;
  }

  export function useRef<T>(initialValue: T): MutableRefObject<T>;

  export function useState<T>(initialState: T | (() => T)): [T, (value: T | ((previous: T) => T)) => void];
}
