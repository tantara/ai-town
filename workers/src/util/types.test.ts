import { Path, PathComponent, packPathComponent, queryPath, unpackPathComponent } from './types';

describe('queryPath', () => {
  it('returns the correct path component', () => {
    const p: Path = [
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10],
      [11, 12, 13, 14, 15],
    ];
    expect(queryPath(p, 1)).toEqual({
      position: { x: 6, y: 7 },
      facing: { dx: 8, dy: 9 },
      t: 10,
    });
  });

  it('returns the first and last components', () => {
    const p: Path = [
      [1, 2, 3, 4, 5],
      [11, 12, 13, 14, 15],
    ];
    expect(queryPath(p, 0).t).toBe(5);
    expect(queryPath(p, 1).t).toBe(15);
  });
});

describe('packPathComponent', () => {
  it('packs to a [x, y, dx, dy, t] tuple', () => {
    const p: PathComponent = {
      position: { x: 10, y: 20 },
      facing: { dx: 3, dy: 4 },
      t: 5,
    };
    expect(packPathComponent(p)).toEqual([10, 20, 3, 4, 5]);
  });

  it('preserves negative and fractional values', () => {
    expect(
      packPathComponent({
        position: { x: -10.5, y: -20.25 },
        facing: { dx: -1, dy: 0.5 },
        t: 1234567890,
      }),
    ).toEqual([-10.5, -20.25, -1, 0.5, 1234567890]);
  });
});

describe('unpackPathComponent', () => {
  it('unpacks to a structured object', () => {
    expect(unpackPathComponent([10, 20, 3, 4, 5])).toEqual({
      position: { x: 10, y: 20 },
      facing: { dx: 3, dy: 4 },
      t: 5,
    });
  });

  it('is the inverse of packPathComponent', () => {
    const original: PathComponent = {
      position: { x: 1.5, y: -2.25 },
      facing: { dx: 0, dy: 1 },
      t: 99,
    };
    expect(unpackPathComponent(packPathComponent(original))).toEqual(original);
  });
});
