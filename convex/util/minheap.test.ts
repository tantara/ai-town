import { MinHeap } from './minheap';

describe('MinHeap', () => {
  const compareNumbers = (a: number, b: number): boolean => a > b;

  test('should initialize an empty heap', () => {
    const heap = MinHeap(compareNumbers);
    expect(heap.length()).toBe(0);
    expect(heap.peek()).toBeUndefined();
  });

  test('should insert values correctly and maintain the min property', () => {
    const heap = MinHeap(compareNumbers);
    heap.push(3);
    heap.push(1);
    heap.push(4);
    heap.push(2);

    expect(heap.peek()).toBe(1);
    expect(heap.length()).toBe(4);
  });

  test('should pop values correctly and maintain the min property', () => {
    const heap = MinHeap(compareNumbers);
    heap.push(3);
    heap.push(1);
    heap.push(4);
    heap.push(2);

    expect(heap.pop()).toBe(1);
    expect(heap.length()).toBe(3);
    expect(heap.peek()).toBe(2);

    expect(heap.pop()).toBe(2);
    expect(heap.length()).toBe(2);
    expect(heap.peek()).toBe(3);
  });

  test('should handle popping from an empty heap', () => {
    const heap = MinHeap(compareNumbers);
    expect(heap.pop()).toBeUndefined();
    expect(heap.length()).toBe(0);
    expect(heap.peek()).toBeUndefined();
  });

  test('should handle peeking from an empty heap', () => {
    const heap = MinHeap(compareNumbers);
    expect(heap.peek()).toBeUndefined();
  });

  test('should handle custom comparison functions', () => {
    const compareStringsByLength = (a: string, b: string): boolean => a.length > b.length;
    const heap = MinHeap(compareStringsByLength);
    heap.push('apple');
    heap.push('banana');
    heap.push('cherry');

    expect(heap.peek()).toBe('apple');
    heap.push('kiwi');
    expect(heap.peek()).toBe('kiwi');
  });

  test('should pop values in sorted order across many random inserts', () => {
    const heap = MinHeap(compareNumbers);
    const values = [42, 7, 19, 3, 27, 11, 99, -5, 0, 88, 14, 6, 6, 100];
    for (const v of values) heap.push(v);
    const popped: number[] = [];
    while (heap.length() > 0) {
      popped.push(heap.pop()!);
    }
    expect(popped).toEqual([...values].sort((a, b) => a - b));
  });

  test('should support a max-heap via inverted comparator', () => {
    const heap = MinHeap<number>((a, b) => a < b);
    [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5].forEach((v) => heap.push(v));
    expect(heap.peek()).toBe(9);
    const popped: number[] = [];
    while (heap.length() > 0) popped.push(heap.pop()!);
    expect(popped).toEqual([9, 6, 5, 5, 5, 4, 3, 3, 2, 1, 1]);
  });

  test('should handle duplicates correctly', () => {
    const heap = MinHeap(compareNumbers);
    [5, 5, 5, 1, 1, 3].forEach((v) => heap.push(v));
    expect(heap.length()).toBe(6);
    expect(heap.pop()).toBe(1);
    expect(heap.pop()).toBe(1);
    expect(heap.pop()).toBe(3);
    expect(heap.pop()).toBe(5);
    expect(heap.pop()).toBe(5);
    expect(heap.pop()).toBe(5);
    expect(heap.pop()).toBeUndefined();
  });

  test('peek does not mutate the heap', () => {
    const heap = MinHeap(compareNumbers);
    heap.push(2);
    heap.push(5);
    expect(heap.peek()).toBe(2);
    expect(heap.length()).toBe(2);
    expect(heap.peek()).toBe(2);
  });
});
