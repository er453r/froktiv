import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const supersampling = 4;
const colors = {
  background: [0x16, 0x3a, 0x5f],
  body: [0xf4, 0xf6, 0xf8],
  display: [0x16, 0x3a, 0x5f],
  accent: [0xf4, 0xb9, 0x42],
  speaker: [0x15, 0x97, 0xa5],
  speakerCentre: [0xd9, 0xf0, 0xf0]
};

const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[index] = value >>> 0;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function containsRoundedRect(px, py, x, y, width, height, radius) {
  if (px < x || px > x + width || py < y || py > y + height) {
    return false;
  }
  const nearestX = Math.max(x + radius, Math.min(px, x + width - radius));
  const nearestY = Math.max(y + radius, Math.min(py, y + height - radius));
  return (px - nearestX) ** 2 + (py - nearestY) ** 2 <= radius ** 2;
}

function containsCircle(px, py, cx, cy, radius) {
  return (px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2;
}

function containsLine(px, py, x1, y1, x2, y2, width) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const position = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  const nearestX = x1 + position * dx;
  const nearestY = y1 + position * dy;
  return (px - nearestX) ** 2 + (py - nearestY) ** 2 <= (width / 2) ** 2;
}

function colorAt(px, py, maskable) {
  if (containsCircle(px, py, 324, 390, 9) || containsCircle(px, py, 376, 390, 9)) {
    return colors.speaker;
  }
  if (containsCircle(px, py, 350, 305, 12)) {
    return colors.background;
  }
  if (containsCircle(px, py, 350, 305, 38)) {
    return colors.accent;
  }
  if (containsCircle(px, py, 350, 305, 52)) {
    return colors.background;
  }
  if (containsCircle(px, py, 164, 320, 22)) {
    return colors.speakerCentre;
  }
  if (containsCircle(px, py, 164, 320, 68)) {
    return colors.speaker;
  }
  if (containsCircle(px, py, 164, 320, 86)) {
    return colors.background;
  }
  if (containsRoundedRect(px, py, 115, 180, 280, 36, 16)) {
    return colors.display;
  }
  if (containsRoundedRect(px, py, 64, 155, 384, 285, 36)) {
    return colors.body;
  }
  if (containsLine(px, py, 290, 155, 372, 86, 18)) {
    return colors.accent;
  }
  if (maskable || containsRoundedRect(px, py, 16, 16, 480, 480, 104)) {
    return colors.background;
  }
  return null;
}

export function renderIcon(size, { maskable = false } = {}) {
  if (!Number.isInteger(size) || size <= 0) {
    throw new RangeError('Icon size must be a positive integer');
  }

  const rgba = new Uint8Array(size * size * 4);
  const sampleCount = supersampling * supersampling;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let opaqueSamples = 0;
      for (let sy = 0; sy < supersampling; sy += 1) {
        for (let sx = 0; sx < supersampling; sx += 1) {
          const px = (x + (sx + 0.5) / supersampling) * 512 / size;
          const py = (y + (sy + 0.5) / supersampling) * 512 / size;
          const color = colorAt(px, py, maskable);
          if (color !== null) {
            red += color[0];
            green += color[1];
            blue += color[2];
            opaqueSamples += 1;
          }
        }
      }

      if (opaqueSamples > 0) {
        const offset = (y * size + x) * 4;
        rgba[offset] = Math.round(red / opaqueSamples);
        rgba[offset + 1] = Math.round(green / opaqueSamples);
        rgba[offset + 2] = Math.round(blue / opaqueSamples);
        rgba[offset + 3] = Math.round(opaqueSamples * 255 / sampleCount);
      }
    }
  }
  return rgba;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

export function encodePng(width, height, rgba) {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new RangeError('PNG width and height must be positive integers');
  }
  if (!(rgba instanceof Uint8Array) || rgba.byteLength !== width * height * 4) {
    throw new RangeError('RGBA data must contain exactly width * height * 4 bytes');
  }

  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    scanlines.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (1 + width * 4) + 1);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

export async function writeIcons(outDir) {
  await mkdir(outDir, { recursive: true });
  const icons = [
    { name: 'icon-192.png', size: 192, maskable: false },
    { name: 'icon-512.png', size: 512, maskable: false },
    { name: 'icon-maskable-512.png', size: 512, maskable: true },
    { name: 'apple-touch-icon.png', size: 180, maskable: false }
  ];
  for (const icon of icons) {
    await writeFile(join(outDir, icon.name), encodePng(icon.size, icon.size, renderIcon(icon.size, icon)));
  }
}