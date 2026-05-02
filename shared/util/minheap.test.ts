import { MinHeap } from './minheap';

describe('MinHeap', () => {
  const compareNumbers = (a: number, b: number): boolean => a > b;

  test('initializes empty', () => {
    const heap = MinHeap(compareNumbers);
    expect(heap.length()).toBe(0);
    expect(heap.peek()).toBeUndefined();
  });

  test('maintains the min-property after pushes', () => {
    const heap = MinHeap(compareNumbers);
    heap.push(3);
    heap.push(1);
    heap.push(4);
    heap.push(2);
    expect(heap.peek()).toBe(1);
    expect(heap.length()).toBe(4);
  });

  test('pops in sorted order', () => {
    const heap = MinHeap(compareNumbers);
    heap.push(3);
    heap.push(1);
    heap.push(4);
    heap.push(2);
    expect(heap.pop()).toBe(1);
    expect(heap.pop()).toBe(2);
    expect(heap.pop()).toBe(3);
    expect(heap.pop()).toBe(4);
    expect(heap.pop()).toBeUndefined();
  });

  test('pop on empty heap returns undefined', () => {
    const heap = MinHeap(compareNumbers);
    expect(heap.pop()).toBeUndefined();
    expect(heap.length()).toBe(0);
  });

  test('peek does not mutate the heap', () => {
    const heap = MinHeap(compareNumbers);
    heap.push(2);
    heap.push(5);
    expect(heap.peek()).toBe(2);
    expect(heap.length()).toBe(2);
    expect(heap.peek()).toBe(2);
  });

  test('handles duplicates', () => {
    const heap = MinHeap(compareNumbers);
    [5, 5, 5, 1, 1, 3].forEach((v) => heap.push(v));
    const popped: number[] = [];
    while (heap.length() > 0) popped.push(heap.pop()!);
    expect(popped).toEqual([1, 1, 3, 5, 5, 5]);
  });

  test('sorts a randomized batch', () => {
    const heap = MinHeap(compareNumbers);
    const values = [42, 7, 19, 3, 27, 11, 99, -5, 0, 88, 14, 6, 6, 100];
    for (const v of values) heap.push(v);
    const popped: number[] = [];
    while (heap.length() > 0) popped.push(heap.pop()!);
    expect(popped).toEqual([...values].sort((a, b) => a - b));
  });

  test('supports custom comparators (max-heap via inversion)', () => {
    const heap = MinHeap<number>((a, b) => a < b);
    [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5].forEach((v) => heap.push(v));
    expect(heap.peek()).toBe(9);
    const popped: number[] = [];
    while (heap.length() > 0) popped.push(heap.pop()!);
    expect(popped).toEqual([9, 6, 5, 5, 5, 4, 3, 3, 2, 1, 1]);
  });

  test('supports custom comparators (strings by length)', () => {
    const heap = MinHeap<string>((a, b) => a.length > b.length);
    heap.push('apple');
    heap.push('banana');
    heap.push('cherry');
    expect(heap.peek()).toBe('apple');
    heap.push('kiwi');
    expect(heap.peek()).toBe('kiwi');
  });
});
