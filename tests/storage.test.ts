import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hostStorageKey, pinStorageKey, readStoredValue, saveStoredValue, type KeyValueStore } from '../src/storage.ts';

test('saves and restores the radio host and PIN', () => {
  const values = new Map<string, string>();
  const store: KeyValueStore = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };

  saveStoredValue(store, hostStorageKey, '192.168.1.5');
  saveStoredValue(store, pinStorageKey, '4321');

  assert.equal(readStoredValue(store, hostStorageKey), '192.168.1.5');
  assert.equal(readStoredValue(store, pinStorageKey), '4321');
});

test('returns null for a missing key', () => {
  const store: KeyValueStore = {
    getItem: () => null,
    setItem: () => undefined
  };

  assert.equal(readStoredValue(store, 'missing'), null);
});

test('keeps working when storage is unavailable', () => {
  assert.equal(readStoredValue(null, hostStorageKey), null);
  assert.doesNotThrow(() => saveStoredValue(null, pinStorageKey, '1234'));
});

test('handles a store whose methods throw', () => {
  const store: KeyValueStore = {
    getItem: () => { throw new Error('storage read failed'); },
    setItem: () => { throw new Error('storage write failed'); }
  };

  assert.equal(readStoredValue(store, hostStorageKey), null);
  assert.doesNotThrow(() => saveStoredValue(store, pinStorageKey, '1234'));
});