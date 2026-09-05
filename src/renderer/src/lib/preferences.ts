export function readPreference<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(`pgstudio:${key}`) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function writePreference(key: string, value: unknown): void {
  try {
    localStorage.setItem(`pgstudio:${key}`, JSON.stringify(value));
  } catch {
    /* Preferences remain usable for this session if storage is unavailable. */
  }
}
export const tableId = (schema: string, name: string): string => JSON.stringify([schema, name]);
