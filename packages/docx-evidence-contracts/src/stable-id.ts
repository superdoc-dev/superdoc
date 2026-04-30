type JsonPrimitive = string | number | boolean | null;
type StableJsonValue = JsonPrimitive | StableJsonValue[] | { [key: string]: StableJsonValue };

export function stableStringify(value: unknown): string {
  return JSON.stringify(toStableJsonValue(value));
}

export function createStableId(prefix: string, value: unknown): string {
  return `${prefix}_${hashString(stableStringify(value))}`;
}

function toStableJsonValue(value: unknown): StableJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }

  if (Array.isArray(value)) {
    return value.map(toStableJsonValue);
  }

  if (typeof value === 'object' && value) {
    return Object.keys(value as Record<string, unknown>)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .reduce<Record<string, StableJsonValue>>((accumulator, key) => {
        accumulator[key] = toStableJsonValue((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }

  return String(value);
}

function hashString(value: string): string {
  let h1 = 0xdeadbeef ^ value.length;
  let h2 = 0x41c6ce57 ^ value.length;

  for (let index = 0; index < value.length; index += 1) {
    const character = value.charCodeAt(index);
    h1 = Math.imul(h1 ^ character, 2654435761);
    h2 = Math.imul(h2 ^ character, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hash.toString(36).padStart(10, '0');
}
