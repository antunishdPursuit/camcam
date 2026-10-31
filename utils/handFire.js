// Where the hand fire burns: along the fingers rather than one torch-like
// blob. MediaPipe landmarks, normalized; results are in pixels.

// Each finger from its base knuckle to its tip.
export const FINGERS = [
  [1, 2, 3, 4],     // thumb
  [5, 6, 7, 8],     // index
  [9, 10, 11, 12],  // middle
  [13, 14, 15, 16], // ring
  [17, 18, 19, 20]  // little
];

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// How far down the fingers the fire reaches (0 = tip, 1 = base knuckle): just
// the tips as the charge starts, the whole finger once charged.
export function fireReach(level) {
  return 0.25 + 0.75 * clamp01(level);
}

// A point `along` one finger (0 = tip, 1 = base knuckle).
export function alongFinger(hand, finger, along, width, height) {
  const joints = finger.map((i) => hand[i]).reverse(); // tip first
  const pos = clamp01(along) * (joints.length - 1);
  const k = Math.min(Math.floor(pos), joints.length - 2);
  const f = pos - k;
  const a = joints[k];
  const b = joints[k + 1];
  return { x: (a.x + (b.x - a.x) * f) * width, y: (a.y + (b.y - a.y) * f) * height };
}

// The hole of the closed thumb–index ring, where the eye opens.
const RING_HOLE = [3, 4, 6, 7, 8];
export function ringCenter(hand, width, height) {
  const sum = RING_HOLE.reduce((s, i) => ({ x: s.x + hand[i].x, y: s.y + hand[i].y }), { x: 0, y: 0 });
  return { x: (sum.x / RING_HOLE.length) * width, y: (sum.y / RING_HOLE.length) * height };
}
