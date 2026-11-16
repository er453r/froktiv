export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const hostStorageKey = 'radio-host';
export const pinStorageKey = 'radio-pin';

export function readStoredValue(store: KeyValueStore | null, key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function saveStoredValue(store: KeyValueStore | null, key: string, value: string): void {
  try {
    store?.setItem(key, value);
  } catch {
    // The page remains usable when storage is unavailable, such as in restricted file contexts.
  }
}