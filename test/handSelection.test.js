import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandFilter, pickLargestHand } from '../utils/handSelection.js';

// Hand whose palm (wrist to middle knuckle) is `palm` of the frame height.
function hand(palm, x = 0.5) {
  const points = Array.from({ length: 21 }, () => ({ x, y: 0.5, z: 0 }));
  points[0] = { x, y: 0.5 + palm, z: 0 };
  points[9] = { x, y: 0.5, z: 0 };
  return points;
}

const W = 640;
const H = 480;

test('picks the largest hand over a smaller background one', () => {
  const near = hand(0.2, 0.3);
  const ghost = hand(0.08, 0.8);
  assert.equal(pickLargestHand([ghost, near], W, H, 0.06), near);
});

test('ignores detections smaller than the minimum palm size', () => {
  assert.equal(pickLargestHand([hand(0.03)], W, H, 0.06), null);
  assert.equal(pickLargestHand([], W, H, 0.06), null);
  assert.equal(pickLargestHand(undefined, W, H, 0.06), null);
});

test('a hand must persist for the confirm frames before it is used', () => {
  const filter = createHandFilter({ confirmFrames: 3 });
  const h = hand(0.2);
  assert.equal(filter.update([h], W, H), null);
  assert.equal(filter.update([h], W, H), null);
  assert.equal(filter.update([h], W, H), h);
  assert.equal(filter.update([h], W, H), h);
});

test('a one-frame flicker never reaches the app', () => {
  const filter = createHandFilter({ confirmFrames: 3 });
  const results = [[hand(0.2)], [], [hand(0.2)], [], [hand(0.2)], []]
    .map((hands) => filter.update(hands, W, H));
  assert.deepEqual(results, [null, null, null, null, null, null]);
});

test('losing a confirmed hand for longer than the dropout needs fresh confirmation', () => {
  const filter = createHandFilter({ confirmFrames: 2, dropoutMs: 500 });
  const h = hand(0.2);
  filter.update([h], W, H, 0);
  assert.equal(filter.update([h], W, H, 33), h);
  assert.equal(filter.update([], W, H, 300), null);
  assert.equal(filter.update([], W, H, 600), null);
  assert.equal(filter.update([h], W, H, 633), null);
  assert.equal(filter.update([h], W, H, 666), h);
});

test('a confirmed hand comes straight back after a dropout shorter than the allowance', () => {
  // 15 fps: 6 missing frames is 400 ms, which the old frame count lost.
  const filter = createHandFilter({ confirmFrames: 3, dropoutMs: 500 });
  const h = hand(0.2);
  let now = 0;
  for (let i = 0; i < 3; i++) filter.update([h], W, H, (now += 67));
  for (let i = 0; i < 6; i++) assert.equal(filter.update([], W, H, (now += 67)), null);
  assert.equal(filter.update([h], W, H, (now += 67)), h);
});

test('detections below the minimum score are ignored', () => {
  const filter = createHandFilter({ confirmFrames: 1, minScore: 0.8 });
  const near = hand(0.2, 0.3);
  const ghost = hand(0.3, 0.8);
  assert.equal(filter.update([ghost, near], W, H, 0, [0.5, 0.95]), near);
  assert.equal(filter.update([ghost], W, H, 33, [0.5]), null);
});

test('a confirmed hand is kept over a larger detection elsewhere', () => {
  const filter = createHandFilter({ confirmFrames: 2 });
  const real = hand(0.15, 0.3);
  const ghost = hand(0.25, 0.8);
  filter.update([real], W, H, 0);
  assert.equal(filter.update([real], W, H, 33), real);
  assert.equal(filter.update([ghost, real], W, H, 66), real);
  assert.equal(filter.update([real, ghost], W, H, 99), real);
});

test('during a dropout a detection elsewhere does not take over', () => {
  const filter = createHandFilter({ confirmFrames: 2, dropoutMs: 500 });
  const real = hand(0.15, 0.3);
  const ghost = hand(0.25, 0.8);
  filter.update([real], W, H, 0);
  filter.update([real], W, H, 33);
  for (let t = 66; t <= 300; t += 33) assert.equal(filter.update([ghost], W, H, t), null);
  assert.equal(filter.update([real], W, H, 333), real);
});

test('a new hand far from the old one must confirm afresh once the old one is gone', () => {
  const filter = createHandFilter({ confirmFrames: 2, dropoutMs: 500 });
  const a = hand(0.15, 0.2);
  const b = hand(0.15, 0.8);
  filter.update([a], W, H, 0);
  filter.update([a], W, H, 33);
  assert.equal(filter.update([b], W, H, 600), null);
  assert.equal(filter.update([b], W, H, 633), b);
});
