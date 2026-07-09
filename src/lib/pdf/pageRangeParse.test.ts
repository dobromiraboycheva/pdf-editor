import { describe, it, expect } from 'vitest';
import { parsePageRanges } from '@/lib/pdf/pageRangeParse';

describe('parsePageRanges', () => {
  it('parses a mixed spec into ascending indices and preserves grouping', () => {
    const result = parsePageRanges('1-3, 5, 8-10', 10);
    expect(result.ok).toBe(true);
    expect(result.indices).toEqual([0, 1, 2, 4, 7, 8, 9]);
    expect(result.groups).toEqual([[0, 1, 2], [4], [7, 8, 9]]);
  });

  it('parses a single page', () => {
    const result = parsePageRanges('5', 10);
    expect(result.ok).toBe(true);
    expect(result.indices).toEqual([4]);
    expect(result.groups).toEqual([[4]]);
  });

  it('tolerates surrounding whitespace', () => {
    const result = parsePageRanges(' 1 , 2 ', 10);
    expect(result.ok).toBe(true);
    expect(result.indices).toEqual([0, 1]);
    expect(result.groups).toEqual([[0], [1]]);
  });

  it('rejects an empty string', () => {
    const result = parsePageRanges('', 10);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rejects an out-of-range page with a range-mentioning error', () => {
    const result = parsePageRanges('12', 10);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/range/i);
  });

  it('rejects a reversed range', () => {
    const result = parsePageRanges('5-3', 10);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rejects a non-numeric range', () => {
    const result = parsePageRanges('a-b', 10);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
