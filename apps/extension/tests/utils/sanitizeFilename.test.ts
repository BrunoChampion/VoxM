import { describe, it, expect } from 'vitest';
import { sanitizeFilename } from '../../src/core/utils/sanitizeFilename';

describe('sanitizeFilename', () => {
  it('removes unsafe characters', () => {
    expect(sanitizeFilename('file<>:"/\\|?*.txt')).toBe('file-.txt');
  });

  it('replaces control characters', () => {
    expect(sanitizeFilename('file\x00\x1fname')).toBe('file-name');
  });

  it('trims whitespace', () => {
    expect(sanitizeFilename('  file name  ')).toBe('file name');
  });

  it('truncates very long names', () => {
    const long = 'a'.repeat(300);
    expect(sanitizeFilename(long).length).toBe(200);
  });
});
