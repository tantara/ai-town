import { asyncMap } from './asyncMap';

describe('asyncMap', () => {
  it('should map over a list asynchronously', async () => {
    const list = [1, 2, 3];
    const result = await asyncMap(list, async (item: number) => item * 2);
    expect(result).toEqual([2, 4, 6]);
  });

  it('should handle empty list input', async () => {
    const list: number[] = [];
    const result = await asyncMap(list, async (item: number) => item * 2);
    expect(result).toEqual([]);
  });

  it('should pass the index as the second argument', async () => {
    const list = ['a', 'b', 'c'];
    const result = await asyncMap(list, async (item, index) => `${item}-${index}`);
    expect(result).toEqual(['a-0', 'b-1', 'c-2']);
  });

  it('should propagate errors from the transform', async () => {
    const list = [1, 2, 3];
    await expect(
      asyncMap(list, async (item: number) => {
        if (item === 2) throw new Error('boom');
        return item;
      }),
    ).rejects.toThrow('boom');
  });

  it('should support iterables other than arrays', async () => {
    const set = new Set([10, 20, 30]);
    const result = await asyncMap(set, async (item: number) => item + 1);
    expect(result).toEqual([11, 21, 31]);
  });

  it('should run transforms in parallel', async () => {
    const order: number[] = [];
    const result = await asyncMap([100, 50, 10], async (delay, index) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      order.push(index);
      return delay;
    });
    expect(result).toEqual([100, 50, 10]);
    // Shorter delays finish first when running in parallel.
    expect(order).toEqual([2, 1, 0]);
  });
});