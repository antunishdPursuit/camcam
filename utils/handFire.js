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

// The hole of the closed thumb–index ring, where the eye opens: the ring
// traced from the thumb's knuckle out to its tip, across to the index tip and
// back down to the index knuckle. Its area centroid is the middle of the hole;
// a plain average of the joints would lean toward the touching fingertips.
const RING_LOOP = [2, 3, 4, 8, 7, 6, 5];
export function ringCenter(hand, width, height) {
  const pts = RING_LOOP.map((i) => ({ x: hand[i].x * width, y: hand[i].y * height }));
  let area = 0;
  let cx = 0;
  let cy = 0;
  pts.forEach((a, k) => {
    const b = pts[(k + 1) % pts.length];
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  });
  // A ring seen edge-on has no area; fall back to the joints' average.
  if (Math.abs(area) < 1e-6) {
    return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  }
  return { x: cx / (3 * area), y: cy / (3 * area) };
}
