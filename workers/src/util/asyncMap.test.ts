import { asyncMap } from './asyncMap';

describe('asyncMap', () => {
  it('maps over a list asynchronously', async () => {
    const result = await asyncMap([1, 2, 3], async (n: number) => n * 2);
    expect(result).toEqual([2, 4, 6]);
  });

  it('returns an empty array for empty input', async () => {
    const result = await asyncMap<number, number>([], async (n) => n * 2);
    expect(result).toEqual([]);
  });

  it('passes the index as the second argument', async () => {
    const result = await asyncMap(['a', 'b', 'c'], async (item, idx) => `${item}-${idx}`);
    expect(result).toEqual(['a-0', 'b-1', 'c-2']);
  });

  it('propagates errors from the transform', async () => {
    await expect(
      asyncMap([1, 2, 3], async (n: number) => {
        if (n === 2) throw new Error('fail');
        return n;
      }),
    ).rejects.toThrow('fail');
  });

  it('supports iterables other than arrays', async () => {
    const result = await asyncMap(new Set([1, 2, 3]), async (n: number) => n + 1);
    expect(result).toEqual([2, 3, 4]);
  });

  it('runs transforms in parallel', async () => {
    const order: number[] = [];
    const result = await asyncMap([100, 50, 10], async (delay, idx) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      order.push(idx);
      return delay;
    });
    expect(result).toEqual([100, 50, 10]);
    expect(order).toEqual([2, 1, 0]);
  });
});
