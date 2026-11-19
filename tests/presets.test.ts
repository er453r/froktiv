import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  presetCapabilities,
  shortenUrl,
  shouldReloadPresets,
  validatePresetInput,
  type PresetContext
} from '../src/presets.ts';

test('reads preset support and edit capability bits', () => {
  assert.deepEqual(presetCapabilities(7), { supported: true, editable: true });
  assert.deepEqual(presetCapabilities(2), { supported: true, editable: false });
  assert.deepEqual(presetCapabilities(4), { supported: false, editable: true });
  assert.deepEqual(presetCapabilities(0), { supported: false, editable: false });
});

test('validates preset names and HTTP URLs', () => {
  assert.deepEqual(validatePresetInput('  Radio 357  ', ' https://radio.example/stream '), {
    ok: true,
    name: 'Radio 357',
    url: 'https://radio.example/stream'
  });
  assert.deepEqual(validatePresetInput('Name', 'http://example.test'), {
    ok: true,
    name: 'Name',
    url: 'http://example.test'
  });
  assert.equal(validatePresetInput('x'.repeat(128), 'https://example.test').ok, true);
  assert.deepEqual(validatePresetInput('   ', 'http://example.test'), { ok: false, error: 'Name is required.' });
  assert.deepEqual(validatePresetInput('x'.repeat(129), 'http://example.test'), {
    ok: false,
    error: 'Name must be 128 characters or fewer.'
  });
  assert.equal(validatePresetInput('Name', 'ftp://example.test').ok, false);
  assert.equal(validatePresetInput('Name', 'not a URL').ok, false);
});

test('reloads only when an online radio is first seen or its target, power or mode changes', () => {
  const online: PresetContext = { target: '192.168.1.5\u00001234', power: true, modeKey: 0 };
  assert.equal(shouldReloadPresets(null, online), true);
  assert.equal(shouldReloadPresets(online, online), false);
  assert.equal(shouldReloadPresets(online, { ...online, modeKey: 1 }), true);
  assert.equal(shouldReloadPresets(online, { ...online, target: '192.168.1.6\u00001234' }), true);
  assert.equal(shouldReloadPresets(online, { ...online, target: '192.168.1.5\u00004321' }), true);
  assert.equal(shouldReloadPresets({ ...online, power: false }, online), true);
  assert.equal(shouldReloadPresets(online, { ...online, power: false }), false);
  assert.equal(shouldReloadPresets(null, { ...online, power: false }), false);
});

test('shortens long URLs while leaving short URLs unchanged', () => {
  assert.equal(shortenUrl('http://radio.test/live'), 'http://radio.test/live');
  assert.equal(shortenUrl('https://radio.example/very/long/stream/address', 20), 'https://ra…m/address');
  assert.equal(shortenUrl('abcdef', 1), '…');
  assert.equal(shortenUrl('abcdef', 0), '');
});