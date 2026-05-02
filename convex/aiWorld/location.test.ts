import { locationFields, playerLocation } from './location';
import { Player } from './player';

function makePlayer(overrides: Partial<{
  facing: { dx: number; dy: number };
  position: { x: number; y: number };
  speed: number;
}> = {}): Player {
  return new Player({
    id: 'p:0',
    lastInput: 0,
    position: { x: 1, y: 2 },
    facing: { dx: 0, dy: 1 },
    speed: 0.5,
    ...overrides,
  });
}

describe('playerLocation', () => {
  it('extracts position, facing, and speed from a Player', () => {
    const player = makePlayer();
    expect(playerLocation(player)).toEqual({
      x: 1,
      y: 2,
      dx: 0,
      dy: 1,
      speed: 0.5,
    });
  });

  it('returns zero speed for stationary players', () => {
    expect(playerLocation(makePlayer({ speed: 0 })).speed).toBe(0);
  });

  it('preserves negative facing components', () => {
    const loc = playerLocation(makePlayer({ facing: { dx: -1, dy: 0 } }));
    expect(loc.dx).toBe(-1);
    expect(loc.dy).toBe(0);
  });
});

describe('locationFields', () => {
  it('declares the five fields used for historical tracking', () => {
    const names = locationFields.map((f) => (typeof f === 'string' ? f : f.name));
    expect(names).toEqual(['x', 'y', 'dx', 'dy', 'speed']);
  });

  it('uses higher precision for speed than position', () => {
    const byName = new Map(
      locationFields
        .filter((f): f is { name: string; precision: number } => typeof f !== 'string')
        .map((f) => [f.name, f.precision]),
    );
    expect(byName.get('speed')).toBeGreaterThan(byName.get('x')!);
  });
});
