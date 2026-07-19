import { inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_DECODED_BYTES = 512 * 1024 * 1024;
const CRC_TABLE = createCrcTable();

export type PngStructureErrorCode =
  | 'invalid_png'
  | 'invalid_dimensions'
  | 'unsupported_png'
  | 'decoded_size_limit';

export class PngStructureError extends Error {
  constructor(readonly code: PngStructureErrorCode) {
    super(code);
    this.name = 'PngStructureError';
  }
}

export interface ValidatedPngMetadata {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlaceMethod: 0 | 1;
}

/**
 * Validates the complete PNG container and zlib image stream before callers
 * trust IHDR dimensions. Both standard and Adam7-interlaced images are
 * accepted because the desktop runtime can render either PNG form.
 */
export function validatePngStructure(bytes: Buffer): ValidatedPngMetadata {
  if (bytes.byteLength < PNG_SIGNATURE.length || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new PngStructureError('invalid_png');
  }

  let offset = PNG_SIGNATURE.length;
  let metadata: ValidatedPngMetadata | undefined;
  let paletteSeen = false;
  let idatSeen = false;
  let idatEnded = false;
  let iendSeen = false;
  const compressedParts: Buffer[] = [];

  while (offset < bytes.byteLength) {
    if (iendSeen || offset + 12 > bytes.byteLength) throw new PngStructureError('invalid_png');
    const length = bytes.readUInt32BE(offset);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (dataEnd < dataStart || chunkEnd > bytes.byteLength) throw new PngStructureError('invalid_png');

    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const type = typeBytes.toString('ascii');
    // PNG reserves the third chunk-type bit; a lowercase third character is invalid.
    if (!/^[A-Za-z]{4}$/.test(type) || (typeBytes[2]! & 0x20) !== 0) {
      throw new PngStructureError('invalid_png');
    }
    const data = bytes.subarray(dataStart, dataEnd);
    const expectedCrc = bytes.readUInt32BE(dataEnd);
    if (pngCrc32(Buffer.concat([typeBytes, data])) !== expectedCrc) {
      throw new PngStructureError('invalid_png');
    }

    if (!metadata && type !== 'IHDR') throw new PngStructureError('invalid_png');
    if (type === 'IHDR') {
      if (metadata || length !== 13) throw new PngStructureError('invalid_png');
      const width = data.readUInt32BE(0);
      const height = data.readUInt32BE(4);
      if (!width || !height) throw new PngStructureError('invalid_dimensions');
      const bitDepth = data[8]!;
      const colorType = data[9]!;
      const interlaceMethod = data[12];
      if (
        !validBitDepth(colorType, bitDepth)
        || data[10] !== 0
        || data[11] !== 0
        || (interlaceMethod !== 0 && interlaceMethod !== 1)
      ) {
        throw new PngStructureError('unsupported_png');
      }
      metadata = { width, height, bitDepth, colorType, interlaceMethod };
    } else if (type === 'PLTE') {
      if (!metadata || idatSeen || paletteSeen || length === 0 || length % 3 !== 0 || length > 768) {
        throw new PngStructureError('invalid_png');
      }
      if (metadata.colorType === 0 || metadata.colorType === 4) {
        throw new PngStructureError('invalid_png');
      }
      paletteSeen = true;
    } else if (type === 'IDAT') {
      if (!metadata || idatEnded || (metadata.colorType === 3 && !paletteSeen)) {
        throw new PngStructureError('invalid_png');
      }
      idatSeen = true;
      compressedParts.push(data);
    } else if (type === 'IEND') {
      if (!metadata || !idatSeen || length !== 0) throw new PngStructureError('invalid_png');
      iendSeen = true;
    } else {
      if (idatSeen) idatEnded = true;
      // Unknown critical chunks are not safe to ignore.
      if ((typeBytes[0]! & 0x20) === 0) throw new PngStructureError('unsupported_png');
    }

    offset = chunkEnd;
  }

  if (!metadata || !iendSeen || offset !== bytes.byteLength) throw new PngStructureError('invalid_png');
  validateInflatedImageData(metadata, compressedParts);
  return metadata;
}

export function pngCrc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function validateInflatedImageData(
  metadata: ValidatedPngMetadata,
  compressedParts: readonly Buffer[],
): void {
  const bitsPerPixel = channelsForColorType(metadata.colorType) * metadata.bitDepth;
  const rows = pngFilteredRows(metadata.width, metadata.height, bitsPerPixel, metadata.interlaceMethod);
  const expectedBytes = rows.reduce((sum, rowBytes) => sum + rowBytes + 1, 0);
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes > MAX_DECODED_BYTES) {
    throw new PngStructureError('decoded_size_limit');
  }

  let decoded: Buffer;
  try {
    decoded = inflateSync(Buffer.concat(compressedParts), { maxOutputLength: expectedBytes + 1 });
  } catch {
    throw new PngStructureError('invalid_png');
  }
  if (decoded.byteLength !== expectedBytes) throw new PngStructureError('invalid_png');
  let offset = 0;
  for (const rowBytes of rows) {
    if (decoded[offset]! > 4) throw new PngStructureError('invalid_png');
    offset += rowBytes + 1;
  }
}

function pngFilteredRows(
  width: number,
  height: number,
  bitsPerPixel: number,
  interlaceMethod: 0 | 1,
): number[] {
  if (interlaceMethod === 0) {
    const rowBytes = Math.ceil((width * bitsPerPixel) / 8);
    return Array.from({ length: height }, () => rowBytes);
  }

  const adam7Passes = [
    [0, 0, 8, 8],
    [4, 0, 8, 8],
    [0, 4, 4, 8],
    [2, 0, 4, 4],
    [0, 2, 2, 4],
    [1, 0, 2, 2],
    [0, 1, 1, 2],
  ] as const;
  return adam7Passes.flatMap(([startX, startY, stepX, stepY]) => {
    if (width <= startX || height <= startY) return [];
    const passWidth = Math.ceil((width - startX) / stepX);
    const passHeight = Math.ceil((height - startY) / stepY);
    const rowBytes = Math.ceil((passWidth * bitsPerPixel) / 8);
    return Array.from({ length: passHeight }, () => rowBytes);
  });
}

function validBitDepth(colorType: number, bitDepth: number): boolean {
  const allowed: Readonly<Record<number, readonly number[]>> = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
  };
  return allowed[colorType]?.includes(bitDepth) ?? false;
}

function channelsForColorType(colorType: number): number {
  if (colorType === 0 || colorType === 3) return 1;
  if (colorType === 2) return 3;
  if (colorType === 4) return 2;
  if (colorType === 6) return 4;
  throw new PngStructureError('unsupported_png');
}

function createCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let value = 0; value < table.length; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    table[value] = crc >>> 0;
  }
  return table;
}
