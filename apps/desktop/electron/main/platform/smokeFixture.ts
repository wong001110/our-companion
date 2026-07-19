import { deflateSync } from 'node:zlib';
import { pngCrc32 } from './pngValidation';

/** A deterministic transparent 300px sprite-sheet PNG used only by smoke bootstrap. */
export function createSmokeFixturePng(color: readonly [number, number, number] = [123, 82, 176], frames = 1): Buffer {
  const width = 300 * Math.max(1, Math.min(3, Math.round(frames)));
  const height = 300;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const offset = row + 1 + x * 4;
      const pixel = smokeCompanionPixel(x % 300, y, color);
      raw[offset] = pixel[0]; raw[offset + 1] = pixel[1]; raw[offset + 2] = pixel[2]; raw[offset + 3] = pixel[3];
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', pngHeader(width, height)),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Structurally valid RGBA PNG for Main Process asset-validation tests. */
export function createPngFixture(
  width: number,
  height: number,
  paddingBytes = 0,
  interlaceMethod: 0 | 1 = 0,
): Buffer {
  const safeWidth = Math.max(0, Math.floor(width));
  const safeHeight = Math.max(0, Math.floor(height));
  const raw = Buffer.alloc(filteredRgbaBytes(safeWidth, safeHeight, interlaceMethod));
  const chunks = [
    pngChunk('IHDR', pngHeader(safeWidth, safeHeight, interlaceMethod)),
    pngChunk('IDAT', deflateSync(raw)),
  ];
  if (paddingBytes > 0) chunks.push(pngChunk('raNd', Buffer.alloc(Math.floor(paddingBytes))));
  chunks.push(pngChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ...chunks,
  ]);
}

/** A small neutral silhouette makes renderer QA inspect the real sprite path, not a solid test rectangle. */
function smokeCompanionPixel(x: number, y: number, color: readonly [number, number, number]): [number, number, number, number] {
  const [red, green, blue] = color;
  const face = [255, 224, 210] as const;
  const hair = [Math.max(20, red - 42), Math.max(16, green - 36), Math.max(35, blue - 28)] as const;
  const inCircle = (cx: number, cy: number, radius: number) => (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
  const inEllipse = (cx: number, cy: number, radiusX: number, radiusY: number) => ((x - cx) / radiusX) ** 2 + ((y - cy) / radiusY) ** 2 <= 1;

  if (inEllipse(150, 278, 76, 10)) return [30, 20, 45, 70];
  if (inCircle(132, 110, 6) || inCircle(168, 110, 6)) return [49, 37, 64, 255];
  if (y > 132 && y < 142 && x > 139 && x < 161) return [188, 92, 121, 255];
  if (inEllipse(150, 78, 50, 28)) return [hair[0], hair[1], hair[2], 255];
  if (inCircle(150, 112, 49)) return [face[0], face[1], face[2], 255];
  if (inCircle(150, 103, 61)) return [hair[0], hair[1], hair[2], 255];
  if (inEllipse(150, 205, 56, 78)) return [red, green, blue, 255];
  if (y > 185 && y < 235 && ((x > 70 && x < 108) || (x > 192 && x < 230))) return [red, green, blue, 220];
  return [0, 0, 0, 0];
}

function pngHeader(width: number, height: number, interlaceMethod: 0 | 1 = 0): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, interlaceMethod], 8);
  return header;
}

function filteredRgbaBytes(width: number, height: number, interlaceMethod: 0 | 1): number {
  if (interlaceMethod === 0) return (width * 4 + 1) * height;
  const passes = [
    [0, 0, 8, 8],
    [4, 0, 8, 8],
    [0, 4, 4, 8],
    [2, 0, 4, 4],
    [0, 2, 2, 4],
    [1, 0, 2, 2],
    [0, 1, 1, 2],
  ] as const;
  return passes.reduce((total, [startX, startY, stepX, stepY]) => {
    if (width <= startX || height <= startY) return total;
    const passWidth = Math.ceil((width - startX) / stepX);
    const passHeight = Math.ceil((height - startY) / stepY);
    return total + (passWidth * 4 + 1) * passHeight;
  }, 0);
}

function pngChunk(name: string, data: Buffer): Buffer {
  const type = Buffer.from(name, 'ascii');
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(pngCrc32(Buffer.concat([type, data])) >>> 0);
  return Buffer.concat([length, type, data, crc]);
}
