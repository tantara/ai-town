import { Path, PathComponent, packPathComponent, queryPath, unpackPathComponent } from "./types";

describe('queryPath', () => {
  it('should return the correct path component', () => {
    const p: Path = [
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10],
      [11, 12, 13, 14, 15]
    ];
    const expected = {
      position: { x: 6, y: 7 },
      facing: { dx: 8, dy: 9 },
      t: 10,
    };
    expect(queryPath(p, 1)).toEqual(expected);
  });

  it('should return the first and last components', () => {
    const p: Path = [
      [1, 2, 3, 4, 5],
      [11, 12, 13, 14, 15],
    ];
    expect(queryPath(p, 0)).toEqual({
      position: { x: 1, y: 2 },
      facing: { dx: 3, dy: 4 },
      t: 5,
    });
    expect(queryPath(p, 1)).toEqual({
      position: { x: 11, y: 12 },
      facing: { dx: 13, dy: 14 },
      t: 15,
    });
  });
});

describe('packPathComponent', () => {
  it('should correctly pack a path component', () => {
    const p: PathComponent = {
      position: { x: 10, y: 20 },
      facing: { dx: 3, dy: 4 },
      t: 5,
    };
    const expected = [10, 20, 3, 4, 5];
    expect(packPathComponent(p)).toEqual(expected);
  });

  it('should pack negative and fractional values', () => {
    const p: PathComponent = {
      position: { x: -10.5, y: -20.25 },
      facing: { dx: -1, dy: 0.5 },
      t: 1234567890,
    };
    expect(packPathComponent(p)).toEqual([-10.5, -20.25, -1, 0.5, 1234567890]);
  });
});

describe('unpackPathComponent', () => {
  it('should unpack a path component with positive values', () => {
    const input: [number, number, number, number, number] = [10, 20, 3, 4, 5];
    const expected = {
      position: { x: 10, y: 20 },
      facing: { dx: 3, dy: 4 },
      t: 5,
    };
    expect(unpackPathComponent(input)).toEqual(expected);
  });

  it('should unpack a path component with negative values', () => {
    const input: [number, number, number, number, number] = [-1, -2, -3, -4, -5];
    expect(unpackPathComponent(input)).toEqual({
      position: { x: -1, y: -2 },
      facing: { dx: -3, dy: -4 },
      t: -5,
    });
  });

  it('should be the inverse of packPathComponent', () => {
    const original: PathComponent = {
      position: { x: 1.5, y: -2.25 },
      facing: { dx: 0, dy: 1 },
      t: 99,
    };
    expect(unpackPathComponent(packPathComponent(original))).toEqual(original);
  });
});
