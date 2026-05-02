import {
  compressPath,
  distance,
  manhattanDistance,
  normalize,
  orientationDegrees,
  pathOverlaps,
  pathPosition,
  pointsEqual,
  vector,
  vectorLength,
} from './geometry';
import { Path, Vector } from './types';

describe('distance', () => {
  test('Euclidean distance for 3-4-5 triangle', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  test('zero for identical points', () => {
    expect(distance({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(0);
  });

  test('handles negative coordinates', () => {
    expect(distance({ x: -2, y: -3 }, { x: 1, y: 2 })).toBeCloseTo(5.83);
  });
});

describe('pointsEqual', () => {
  test('true for identical points', () => {
    expect(pointsEqual({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true);
  });

  test('false for different x', () => {
    expect(pointsEqual({ x: 1, y: 2 }, { x: 2, y: 2 })).toBe(false);
  });

  test('false for different y', () => {
    expect(pointsEqual({ x: 1, y: 2 }, { x: 1, y: 3 })).toBe(false);
  });
});

describe('manhattanDistance', () => {
  test('points on the same axis', () => {
    expect(manhattanDistance({ x: 1, y: 0 }, { x: 1, y: 2 })).toBe(2);
  });

  test('points off-axis', () => {
    expect(manhattanDistance({ x: 1, y: 0 }, { x: 3, y: 2 })).toBe(4);
  });

  test('negative coordinates', () => {
    expect(manhattanDistance({ x: -2, y: 0 }, { x: 1, y: -2 })).toBe(5);
  });

  test('identical points', () => {
    expect(manhattanDistance({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(0);
  });
});

describe('pathOverlaps', () => {
  const path: Path = [
    [0, 0, 0, 1, 1],
    [0, 2, 0, 1, 2],
  ];

  test('throws on a path with fewer than 2 entries', () => {
    expect(() => pathOverlaps([[0, 0, 0, 1, 0]] as Path, 0)).toThrowError(/Invalid path/);
  });

  test('time within the path', () => {
    expect(pathOverlaps(path, 1.5)).toBe(true);
  });

  test('time before the path', () => {
    expect(pathOverlaps(path, 0.5)).toBe(false);
  });

  test('time after the path', () => {
    expect(pathOverlaps(path, 2.5)).toBe(false);
  });

  test('boundaries are inclusive', () => {
    expect(pathOverlaps(path, 1)).toBe(true);
    expect(pathOverlaps(path, 2)).toBe(true);
  });
});

describe('pathPosition', () => {
  test('throws on a path with fewer than 2 entries', () => {
    expect(() => pathPosition([[0, 0, 0, 1, 0]] as Path, 0)).toThrowError(/Invalid path/);
  });

  test('returns the first sample for time before the path', () => {
    const path: Path = [
      [1, 2, 3, 4, 2],
      [5, 6, 3, 4, 3],
    ];
    const result = pathPosition(path, 1);
    expect(result.position).toEqual({ x: 1, y: 2 });
    expect(result.facing).toEqual({ dx: 3, dy: 4 });
    expect(result.velocity).toBe(0);
  });

  test('returns the last sample for time after the path', () => {
    const path: Path = [
      [1, 2, 3, 4, 2],
      [5, 6, 3, 4, 3],
    ];
    const result = pathPosition(path, 4);
    expect(result.position).toEqual({ x: 5, y: 6 });
    expect(result.velocity).toBe(0);
  });

  test('linearly interpolates within a segment', () => {
    const path: Path = [
      [1, 2, 7, 8, 2],
      [5, 6, 7, 8, 3],
      [10, 11, 7, 8, 4],
      [14, 15, 7, 8, 5],
    ];
    const result = pathPosition(path, 4.5);
    expect(result.position).toEqual({ x: 12, y: 13 });
    expect(result.facing).toEqual({ dx: 7, dy: 8 });
    expect(result.velocity).toBeCloseTo(5.657);
  });

  test('reports velocity along a segment', () => {
    const path: Path = [
      [0, 0, 1, 0, 0],
      [3, 4, 1, 0, 5],
    ];
    expect(pathPosition(path, 2.5).velocity).toBeCloseTo(1);
  });
});

describe('vector', () => {
  test('returns componentwise differences', () => {
    expect(vector({ x: 1, y: 2 }, { x: 2, y: 4 })).toEqual({ dx: 1, dy: 2 });
  });

  test('zero vector for identical points', () => {
    expect(vector({ x: 1, y: 2 }, { x: 1, y: 2 })).toEqual({ dx: 0, dy: 0 });
  });

  test('negative components', () => {
    expect(vector({ x: 1, y: 2 }, { x: 1, y: 1 })).toEqual({ dx: 0, dy: -1 });
  });
});

describe('vectorLength', () => {
  test('positive components', () => {
    expect(vectorLength({ dx: 3.14, dy: 4 } as Vector)).toBeCloseTo(5.09);
  });

  test('negative components', () => {
    expect(vectorLength({ dx: -3, dy: -4 })).toBeCloseTo(5);
  });

  test('zero vector', () => {
    expect(vectorLength({ dx: 0, dy: 0 })).toBeCloseTo(0);
  });
});

describe('normalize', () => {
  test('returns null for vectors smaller than EPSILON', () => {
    expect(normalize({ dx: 0, dy: 0 })).toBeNull();
  });

  test('normalizes a 3-4 vector', () => {
    expect(normalize({ dx: 3, dy: 4 })).toEqual({ dx: 0.6, dy: 0.8 });
  });

  test('normalizes a unit vector to itself', () => {
    expect(normalize({ dx: 1, dy: 0 })).toEqual({ dx: 1, dy: 0 });
  });
});

describe('orientationDegrees', () => {
  test('throws for vectors smaller than EPSILON', () => {
    expect(() => orientationDegrees({ dx: 0, dy: 0 })).toThrowError(/Can't compute the orientation/);
  });

  test.each([
    [{ dx: 1, dy: 0 }, 0],
    [{ dx: 0, dy: 1 }, 90],
    [{ dx: -1, dy: 0 }, 180],
    [{ dx: 0, dy: -1 }, 270],
  ])('returns %p degrees for %p', (v: { dx: number; dy: number }, expected: number) => {
    expect(orientationDegrees(v)).toBe(expected);
  });
});

describe('compressPath', () => {
  test('does not compress a path with only 2 entries', () => {
    const facing = { dx: 0, dy: 1 };
    const compressed = compressPath([
      { position: { x: 0, y: 0 }, facing, t: 0 },
      { position: { x: 0, y: 1 }, facing, t: 1 },
    ]);
    expect(compressed).toEqual([
      [0, 0, 0, 1, 0],
      [0, 1, 0, 1, 1],
    ]);
  });

  test('compresses a straight line to its endpoints', () => {
    const facing = { dx: 0, dy: 1 };
    const compressed = compressPath([
      { position: { x: 0, y: 0 }, facing, t: 0 },
      { position: { x: 0, y: 1 }, facing, t: 1 },
      { position: { x: 0, y: 2 }, facing, t: 2 },
      { position: { x: 0, y: 3 }, facing, t: 3 },
      { position: { x: 0, y: 4 }, facing, t: 4 },
    ]);
    expect(compressed).toEqual([
      [0, 0, 0, 1, 0],
      [0, 4, 0, 1, 4],
    ]);
  });

  test('preserves turns where facing changes', () => {
    const facingUp = { dx: 0, dy: 1 };
    const facingRight = { dx: 1, dy: 0 };
    const compressed = compressPath([
      { position: { x: 0, y: 0 }, facing: facingUp, t: 0 },
      { position: { x: 0, y: 1 }, facing: facingUp, t: 1 },
      { position: { x: 0, y: 2 }, facing: facingRight, t: 2 },
      { position: { x: 1, y: 2 }, facing: facingRight, t: 3 },
      { position: { x: 2, y: 2 }, facing: facingRight, t: 4 },
    ]);
    expect(compressed).toEqual([
      [0, 0, 0, 1, 0],
      [0, 2, 1, 0, 2],
      [2, 2, 1, 0, 4],
    ]);
  });
});
