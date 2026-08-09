/**
 * Convert a string to snake_case
 */
export const snakeCase = (str: string): string => str.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);

/**
 * Convert a string to kebab-case
 */
export const kebabCase = (str: string): string => str.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);

/**
 * Convert a string to camelCase
 */
const camelize = (str: string): string =>
  str
    .toLowerCase()
    .replace(/[-_\s]+(.)?/g, (_, chr) => (chr ? chr.toUpperCase() : ''))
    .replace(/^([A-Z])/, (match) => match.toLowerCase());

type UnknownDict = Record<string, unknown>;

/**
 * Recursive type to convert snake_case string to camelCase at type level
 */
export type CamelCase<S extends string> = S extends `${infer P1}_${infer P2}${infer P3}`
  ? `${Lowercase<P1>}${Uppercase<P2>}${CamelCase<P3>}`
  : S extends `${infer P1}-${infer P2}${infer P3}`
    ? `${Lowercase<P1>}${Uppercase<P2>}${CamelCase<P3>}`
    : Lowercase<S>;

/**
 * Recursive type to convert camelCase string to snake_case at type level
 */
export type SnakeCase<S extends string> = S extends `${infer C}${infer T}`
  ? C extends Lowercase<C>
    ? `${C}${SnakeCase<T>}`
    : `_${Lowercase<C>}${SnakeCase<T>}`
  : S;

/**
 * Transform object keys to camelCase while preserving value types
 */
export type CamelizeKeys<T extends UnknownDict> = {
  [K in keyof T as CamelCase<K & string>]: T[K];
};

/**
 * Transform object keys to snake_case while preserving value types
 */
export type SnakeCaseKeys<T extends UnknownDict> = {
  [K in keyof T as SnakeCase<K & string>]: T[K];
};

/**
 * Convert all keys in an array of objects to camelCase
 * @param linkComments - Array of objects with snake_case or kebab-case keys
 * @returns Array of objects with camelCase keys, preserving value types
 */
export const camelizeKeys = <T extends UnknownDict>(linkComments: T[]): CamelizeKeys<T>[] => {
  return linkComments.map((comment) =>
    Object.keys(comment).reduce((camelized, key) => {
      (camelized as UnknownDict)[camelize(key)] = comment[key];
      return camelized;
    }, {} as CamelizeKeys<T>),
  );
};

/**
 * Convert all keys in an array of objects to snake_case
 * @param comments - Array of objects with camelCase keys
 * @returns Array of objects with snake_case keys, preserving value types
 */
export const snakeCaseKeys = <T extends UnknownDict>(comments: T[]): SnakeCaseKeys<T>[] => {
  return comments.map((comment) =>
    Object.keys(comment).reduce((snaked, key) => {
      (snaked as UnknownDict)[snakeCase(key)] = comment[key];
      return snaked;
    }, {} as SnakeCaseKeys<T>),
  );
};

export const toKebabCase = (str: string): string => {
  return kebabCase(str);
};
