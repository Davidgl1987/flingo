import type { Vec2 } from './types';

export const v = (x = 0, y = 0): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec2, scalar: number): Vec2 => ({ x: a.x * scalar, y: a.y * scalar });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const lenSq = (a: Vec2): number => dot(a, a);
export const len = (a: Vec2): number => Math.sqrt(lenSq(a));
export const dist = (a: Vec2, b: Vec2): number => len(sub(a, b));
export const normalize = (a: Vec2): Vec2 => {
  const l = len(a);
  return l <= 0.00001 ? v(0, 0) : mul(a, 1 / l);
};
export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
export const clampLen = (a: Vec2, maxLen: number): Vec2 => {
  const l = len(a);
  return l > maxLen ? mul(normalize(a), maxLen) : a;
};
export const reflect = (velocity: Vec2, normal: Vec2, restitution = 0.9): Vec2 => {
  const n = normalize(normal);
  return sub(velocity, mul(n, (1 + restitution) * dot(velocity, n)));
};
export const isInsideCircle = (point: Vec2, center: Vec2, radius: number): boolean => dist(point, center) <= radius;
export const isInsideRect = (point: Vec2, center: Vec2, width: number, height: number): boolean => {
  return Math.abs(point.x - center.x) <= width / 2 && Math.abs(point.y - center.y) <= height / 2;
};
export const nearestPointOnRect = (point: Vec2, center: Vec2, width: number, height: number): Vec2 => ({
  x: clamp(point.x, center.x - width / 2, center.x + width / 2),
  y: clamp(point.y, center.y - height / 2, center.y + height / 2),
});
export const overlapCircleRect = (circle: Vec2, radius: number, rectCenter: Vec2, width: number, height: number): boolean => {
  const nearest = nearestPointOnRect(circle, rectCenter, width, height);
  return dist(circle, nearest) <= radius;
};
export const randFromSeed = (seed: number): number => {
  const x = Math.sin(seed * 999.123) * 10000;
  return x - Math.floor(x);
};
