import { describe, it, expect } from 'vitest';
import { formatBytes } from '../../src/core/utils/formatBytes';

describe('formatBytes', () => {
  it('formats zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1_500_000)).toBe('1.4 MB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(1_500_000_000)).toBe('1.4 GB');
  });
});
