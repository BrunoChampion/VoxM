type Vint = {
  value: number;
  start: number;
  end: number;
  length: number;
  raw: Uint8Array;
  unknown: boolean;
};

type ElementHeader = {
  id: number;
  idStart: number;
  idEnd: number;
  size: Vint;
  dataStart: number;
  dataEnd: number;
};

const ID_SEGMENT = 0x18538067;
const ID_INFO = 0x1549a966;
const ID_DURATION = 0x4489;

export async function repairWebmDurationMetadata(blob: Blob, durationMs: number): Promise<Blob> {
  if (!blob.type.startsWith('video/webm') || !Number.isFinite(durationMs) || durationMs <= 0) {
    return blob;
  }

  try {
    const original = new Uint8Array(await blob.arrayBuffer());
    const repaired = repairWebmBytes(original, durationMs);
    if (!repaired) return blob;
    const buffer = new ArrayBuffer(repaired.byteLength);
    new Uint8Array(buffer).set(repaired);
    return new Blob([buffer], { type: blob.type });
  } catch {
    return blob;
  }
}

export function repairWebmBytes(bytes: Uint8Array, durationMs: number): Uint8Array | null {
  const segment = findElement(bytes, 0, bytes.length, ID_SEGMENT);
  if (!segment) return null;

  const info = findElement(bytes, segment.dataStart, segment.dataEnd, ID_INFO);
  if (!info) return null;

  if (findElement(bytes, info.dataStart, info.dataEnd, ID_DURATION)) {
    return bytes;
  }

  const durationElement = createDurationElement(durationMs);
  const oldInfoData = bytes.slice(info.dataStart, info.dataEnd);
  const newInfoData = concatBytes(oldInfoData, durationElement);
  const newInfoElement = concatBytes(
    encodeElementId(ID_INFO),
    encodeVintSize(newInfoData.length),
    newInfoData,
  );

  const beforeSegmentData = bytes.slice(0, segment.dataStart);
  const beforeInfo = bytes.slice(segment.dataStart, info.idStart);
  const afterInfo = bytes.slice(info.dataEnd, segment.dataEnd);
  const newSegmentData = concatBytes(beforeInfo, newInfoElement, afterInfo);

  const afterSegment = bytes.slice(segment.dataEnd);
  const segmentSize = segment.size.unknown
    ? segment.size.raw
    : encodeVintSize(newSegmentData.length, segment.size.length);

  return concatBytes(
    beforeSegmentData.slice(0, segment.idStart),
    encodeElementId(ID_SEGMENT),
    segmentSize,
    newSegmentData,
    afterSegment,
  );
}

function findElement(
  bytes: Uint8Array,
  start: number,
  end: number,
  targetId: number,
): ElementHeader | null {
  let offset = start;
  while (offset < end) {
    const header = readElementHeader(bytes, offset, end);
    if (!header) return null;
    if (header.id === targetId) return header;
    offset = header.dataEnd;
  }
  return null;
}

function readElementHeader(bytes: Uint8Array, offset: number, end: number): ElementHeader | null {
  const id = readElementId(bytes, offset, end);
  if (!id) return null;
  const size = readVint(bytes, id.end, end);
  if (!size) return null;

  const dataStart = size.end;
  const dataEnd = size.unknown ? end : dataStart + size.value;
  if (dataEnd > end) return null;

  return {
    id: id.value,
    idStart: offset,
    idEnd: id.end,
    size,
    dataStart,
    dataEnd,
  };
}

function readElementId(bytes: Uint8Array, offset: number, end: number): Vint | null {
  if (offset >= end) return null;
  const first = bytes[offset];
  let mask = 0x80;
  let length = 1;
  while (length <= 4 && (first & mask) === 0) {
    mask >>= 1;
    length += 1;
  }
  if (length > 4 || offset + length > end) return null;

  let value = 0;
  for (let i = 0; i < length; i += 1) {
    value = value * 256 + bytes[offset + i];
  }

  return {
    value,
    start: offset,
    end: offset + length,
    length,
    raw: bytes.slice(offset, offset + length),
    unknown: false,
  };
}

function readVint(bytes: Uint8Array, offset: number, end: number): Vint | null {
  if (offset >= end) return null;
  const first = bytes[offset];
  let mask = 0x80;
  let length = 1;
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1;
    length += 1;
  }
  if (length > 8 || offset + length > end) return null;

  let value = first & (mask - 1);
  let unknown = value === mask - 1;
  for (let i = 1; i < length; i += 1) {
    value = value * 256 + bytes[offset + i];
    unknown = unknown && bytes[offset + i] === 0xff;
  }

  return {
    value,
    start: offset,
    end: offset + length,
    length,
    raw: bytes.slice(offset, offset + length),
    unknown,
  };
}

function createDurationElement(durationMs: number): Uint8Array {
  const payload = new Uint8Array(8);
  new DataView(payload.buffer).setFloat64(0, durationMs, false);
  return concatBytes(encodeElementId(ID_DURATION), encodeVintSize(payload.length), payload);
}

function encodeElementId(id: number): Uint8Array {
  const bytes: number[] = [];
  let value = id;
  do {
    bytes.unshift(value & 0xff);
    value >>= 8;
  } while (value > 0);
  return new Uint8Array(bytes);
}

function encodeVintSize(value: number, length = minimalVintLength(value)): Uint8Array {
  const maxValue = 2 ** (7 * length) - 2;
  if (value > maxValue) {
    return encodeVintSize(value, length + 1);
  }

  const bytes = new Uint8Array(length);
  let remaining = value;
  for (let i = length - 1; i >= 0; i -= 1) {
    bytes[i] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }
  bytes[0] |= 1 << (8 - length);
  return bytes;
}

function minimalVintLength(value: number): number {
  for (let length = 1; length <= 8; length += 1) {
    if (value <= 2 ** (7 * length) - 2) return length;
  }
  return 8;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
