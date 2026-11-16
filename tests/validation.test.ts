import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampVolume, isValidHost } from '../src/validation.ts';

test('validates IPv4 addresses with optional ports', () => {
  for (const host of ['192.168.1.5', '192.168.1.5:80', ' 10.0.0.1:65535 ']) {
    assert.equal(isValidHost(host), true, `${host} should be valid`);
  }

  for (const host of ['', '999.1.1.1', '192.168.1', '192.168.1.5:0', '192.168.1.5:65536', 'http://192.168.1.5', 'radio.local', '01.2.3.4']) {
    assert.equal(isValidHost(host), false, `${host} should be invalid`);
  }
});

test('clamps volume to a rounded integer within the allowed range', () => {
  assert.equal(clampVolume(-3), 0);
  assert.equal(clampVolume(25), 20);
  assert.equal(clampVolume(7.6), 8);
  assert.equal(clampVolume(7.6, 8), 8);
  assert.equal(clampVolume(Number.NaN), 0);
});