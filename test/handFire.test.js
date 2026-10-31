import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FINGERS, alongFinger, fireReach, ringCenter } from '../utils/handFire.js';

// A flat hand: each landmark i sits at (i / 20, i / 40).
const hand = Array.from({ length: 21 }, (_, i) => ({ x: i / 20, y: i / 40, z: 0 }));
const W = 640;
const H = 480;

test('every landmark except the wrist belongs to exactly one finger', () => {
  assert.deepEqual(FINGERS.flat().sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
});

test('alongFinger runs from the tip (0) to the base knuckle (1)', () => {
  for (const finger of FINGERS) {
    const tip = hand[finger[3]];
    const base = hand[finger[0]];
    assert.deepEqual(alongFinger(hand, finger, 0, W, H), { x: tip.x * W, y: tip.y * H });
    const end = alongFinger(hand, finger, 1, W, H);
    assert.ok(Math.abs(end.x - base.x * W) < 1e-9 && Math.abs(end.y - base.y * H) < 1e-9);
    const mid = alongFinger(hand, finger, 0.5, W, H);
    assert.ok(Math.abs(mid.x - ((tip.x + base.x) / 2) * W) < 1e-9, 'evenly spaced joints: halfway is the midpoint');
  }
});

test('the fire starts at the tips and reaches the whole finger once charged', () => {
  assert.ok(fireReach(0) > 0 && fireReach(0) < 0.5);
  assert.equal(fireReach(1), 1);
  assert.equal(fireReach(5), 1);
  assert.ok(fireReach(0.5) > fireReach(0.1));
});

test('the eye sits in the thumb–index ring', () => {
  const c = ringCenter(hand, W, H);
  const ring = [3, 4, 6, 7, 8].map((i) => hand[i]);
  const xs = ring.map((p) => p.x * W);
  assert.ok(c.x >= Math.min(...xs) && c.x <= Math.max(...xs));
});

test('the eye sits in the middle of an OK ring, not up at the touching tips', () => {
  // An OK ring as a circle (center 0.5, 0.5; radius 0.1) with the thumb up the
  // left side and the index up the right, tips touching at the top. The
  // joints bunch toward the tips, as on a real hand.
  const at = (deg) => ({ x: 0.5 + 0.1 * Math.cos((deg * Math.PI) / 180), y: 0.5 - 0.1 * Math.sin((deg * Math.PI) / 180), z: 0 });
  const ok = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.9, z: 0 }));
  Object.assign(ok, { 2: at(240), 3: at(160), 4: at(95), 8: at(85), 7: at(30), 6: at(-30), 5: at(-60) });
  const c = ringCenter(ok, W, H);
  const r = 0.1 * H;
  assert.ok(Math.hypot(c.x - 0.5 * W, c.y - 0.5 * H) < 0.2 * r, `eye at (${c.x.toFixed(1)}, ${c.y.toFixed(1)})`);
});
