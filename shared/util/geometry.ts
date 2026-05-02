import { Path, PathComponent, Point, Vector, packPathComponent, queryPath } from './types';

export function distance(p0: Point, p1: Point): number {
  const dx = p0.x - p1.x;
  const dy = p0.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}
export function pointsEqual(p0: Point, p1: Point): boolean {
  return p0.x == p1.x && p0.y == p1.y;
}
export function manhattanDistance(p0: Point, p1: Point) {
  return Math.abs(p0.x - p1.x) + Math.abs(p0.y - p1.y);
}
export function pathOverlaps(path: Path, time: number): boolean {
  if (path.length < 2) throw new Error(`Invalid path: ${JSON.stringify(path)}`);
  const start = queryPath(path, 0);
  const end = queryPath(path, path.length - 1);
  return start.t <= time && time <= end.t;
}
export function pathPosition(
  path: Path,
  time: number,
): { position: Point; facing: Vector; velocity: number } {
  if (path.length < 2) throw new Error(`Invalid path: ${JSON.stringify(path)}`);
  const first = queryPath(path, 0);
  if (time < first.t) return { position: first.position, facing: first.facing, velocity: 0 };
  const last = queryPath(path, path.length - 1);
  if (last.t < time) return { position: last.position, facing: last.facing, velocity: 0 };
  for (let i = 0; i < path.length - 1; i++) {
    const a = queryPath(path, i);
    const b = queryPath(path, i + 1);
    if (a.t <= time && time <= b.t) {
      const interp = (time - a.t) / (b.t - a.t);
      return {
        position: {
          x: a.position.x + interp * (b.position.x - a.position.x),
          y: a.position.y + interp * (b.position.y - a.position.y),
        },
        facing: a.facing,
        velocity: distance(a.position, b.position) / (b.t - a.t),
      };
    }
  }
  throw new Error(`Timestamp checks not exhaustive?`);
}
export const EPSILON = 0.0001;
export function vector(p0: Point, p1: Point): Vector {
  return { dx: p1.x - p0.x, dy: p1.y - p0.y };
}
export function vectorLength(v: Vector): number {
  return Math.sqrt(v.dx * v.dx + v.dy * v.dy);
}
export function normalize(v: Vector): Vector | null {
  const len = vectorLength(v);
  if (len < EPSILON) return null;
  return { dx: v.dx / len, dy: v.dy / len };
}
export function orientationDegrees(v: Vector): number {
  if (Math.sqrt(v.dx * v.dx + v.dy * v.dy) < EPSILON) {
    throw new Error(`Can't compute the orientation of too small vector ${JSON.stringify(v)}`);
  }
  const twoPi = 2 * Math.PI;
  const radians = (Math.atan2(v.dy, v.dx) + twoPi) % twoPi;
  return (radians / twoPi) * 360;
}
export function compressPath(densePath: PathComponent[]): Path {
  if (densePath.length <= 2) return densePath.map(packPathComponent);
  const out = [packPathComponent(densePath[0])];
  let last = densePath[0];
  let candidate;
  for (const point of densePath.slice(1)) {
    if (!candidate) {
      candidate = point;
      continue;
    }
    const { position, facing } = pathPosition(
      [packPathComponent(last), packPathComponent(point)],
      candidate.t,
    );
    const positionCloseEnough = distance(position, candidate.position) < EPSILON;
    const facingDifference = {
      dx: facing.dx - candidate.facing.dx,
      dy: facing.dy - candidate.facing.dy,
    };
    if (positionCloseEnough && vectorLength(facingDifference) < EPSILON) {
      candidate = point;
      continue;
    }
    out.push(packPathComponent(candidate));
    last = candidate;
    candidate = point;
  }
  if (candidate) out.push(packPathComponent(candidate));
  return out;
}
