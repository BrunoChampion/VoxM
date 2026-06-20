import { describe, it, expect } from 'vitest';
import { formatDuration, formatDurationShort } from '../../src/core/utils/formatDuration';

describe('formatDuration', () => {
  it('formats zero milliseconds', () => {
    expect(formatDuration(0)).toBe('00:00:00');
  });

  it('formats seconds only', () => {
    expect(formatDuration(45_000)).toBe('00:00:45');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(125_000)).toBe('00:02:05');
  });

  it('formats hours, minutes, and seconds', () => {
    expect(formatDuration(3_661_000)).toBe('01:01:01');
  });

  it('pads single digits', () => {
    expect(formatDuration(3_600_000 + 60_000 + 1_000)).toBe('01:01:01');
  });
});

describe('formatDurationShort', () => {
  it('omits hours when zero', () => {
    expect(formatDurationShort(125_000)).toBe('02:05');
  });

  it('includes hours when non-zero', () => {
    expect(formatDurationShort(3_661_000)).toBe('1:01:01');
  });
});
