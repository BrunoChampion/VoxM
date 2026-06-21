import { describe, expect, it } from 'vitest';
import { repairWebmBytes } from '../../src/core/video/repairWebmDuration';

describe('repairWebmDuration', () => {
  it('adds a Duration element to Segment Info when missing', () => {
    const bytes = new Uint8Array([
      0x1a, 0x45, 0xdf, 0xa3, 0x80, // EBML header
      0x18, 0x53, 0x80, 0x67, 0xff, // Segment with unknown size
      0x15, 0x49, 0xa9, 0x66, 0x80, // empty Info
    ]);

    const repaired = repairWebmBytes(bytes, 12_345);

    expect(repaired).not.toBeNull();
    expect(Array.from(repaired ?? [])).toEqual(
      expect.arrayContaining([0x44, 0x89, 0x88]),
    );
  });
});
