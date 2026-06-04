export interface ImageDimensions {
  width?: number;
  height?: number;
}

export function detectImageDimensions(bytes: Uint8Array | undefined, contentType?: string): ImageDimensions {
  if (!bytes || bytes.length < 16) {
    return {};
  }

  const type = contentType?.toLowerCase() ?? "";

  if (type.includes("png") || isPng(bytes)) {
    return readPngDimensions(bytes);
  }

  if (type.includes("jpeg") || type.includes("jpg") || isJpeg(bytes)) {
    return readJpegDimensions(bytes);
  }

  if (type.includes("webp") || isWebp(bytes)) {
    return readWebpDimensions(bytes);
  }

  return {};
}

function isPng(bytes: Uint8Array): boolean {
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8;
}

function isWebp(bytes: Uint8Array): boolean {
  return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
}

function readPngDimensions(bytes: Uint8Array): ImageDimensions {
  if (bytes.length < 24) {
    return {};
  }

  return {
    width: readUint32(bytes, 16),
    height: readUint32(bytes, 20)
  };
}

function readJpegDimensions(bytes: Uint8Array): ImageDimensions {
  let offset = 2;

  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    const length = readUint16(bytes, offset + 2);
    if (length < 2) {
      return {};
    }

    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        height: readUint16(bytes, offset + 5),
        width: readUint16(bytes, offset + 7)
      };
    }

    offset += 2 + length;
  }

  return {};
}

function readWebpDimensions(bytes: Uint8Array): ImageDimensions {
  const chunk = ascii(bytes, 12, 4);

  if (chunk === "VP8X" && bytes.length >= 30) {
    return {
      width: 1 + readUint24Le(bytes, 24),
      height: 1 + readUint24Le(bytes, 27)
    };
  }

  if (chunk === "VP8 " && bytes.length >= 30) {
    return {
      width: readUint16Le(bytes, 26) & 0x3fff,
      height: readUint16Le(bytes, 28) & 0x3fff
    };
  }

  if (chunk === "VP8L" && bytes.length >= 25) {
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))
    };
  }

  return {};
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) + bytes[offset + 1];
}

function readUint16Le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] + (bytes[offset + 1] << 8);
}

function readUint24Le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}
