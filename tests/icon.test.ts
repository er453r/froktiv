import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { test } from 'node:test';
import { encodePng, renderIcon, writeIcons } from '../scripts/icon.mjs';

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function inspectPng(png: Buffer): { width: number; height: number } {
  assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  let offset = 8;
  let width = 0;
  let height = 0;
  const imageData: Buffer[] = [];
  let foundEnd = false;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    const storedCrc = png.readUInt32BE(offset + 8 + length);
    assert.equal(crc32(Buffer.concat([type, data])), storedCrc, `${type.toString('ascii')} CRC`);
    if (type.toString('ascii') === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8);
      assert.equal(data[9], 6);
    } else if (type.toString('ascii') === 'IDAT') {
      imageData.push(data);
    } else if (type.toString('ascii') === 'IEND') {
      foundEnd = true;
    }
    offset += 12 + length;
  }
  assert.equal(offset, png.length);
  assert.equal(foundEnd, true);
  const pixelData = inflateSync(Buffer.concat(imageData));
  assert.equal(pixelData.length, height * (1 + width * 4));
  return { width, height };
}

test('encodes valid RGBA PNG chunks and dimensions', () => {
  const png = encodePng(2, 3, new Uint8Array(2 * 3 * 4));
  const decoded = inspectPng(png);
  assert.equal(decoded.width, 2);
  assert.equal(decoded.height, 3);
});

test('renders transparent rounded corners and a fully covered centre', () => {
  const icon = renderIcon(32);
  assert.deepEqual(Array.from(icon.subarray(0, 4)), [0, 0, 0, 0]);
  assert.equal(icon[(16 * 32 + 16) * 4 + 3], 255);

  const maskable = renderIcon(32, { maskable: true });
  assert.equal(maskable[3], 255);
  assert.equal(maskable[(16 * 32 + 16) * 4 + 3], 255);
  assert.throws(() => renderIcon(0), RangeError);
});

test('writes the four required icon sizes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'radio-icon-test-'));
  try {
    await writeIcons(directory);
    const names = (await readdir(directory)).sort();
    assert.deepEqual(names, ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']);
    const expectedSizes = new Map([
      ['apple-touch-icon.png', 180],
      ['icon-192.png', 192],
      ['icon-512.png', 512],
      ['icon-maskable-512.png', 512]
    ]);
    for (const [name, size] of expectedSizes) {
      const { width, height } = inspectPng(await readFile(join(directory, name)));
      assert.equal(width, size);
      assert.equal(height, size);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});