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

test('losing the hand past the dropout allowance needs fresh confirmation', () => {
  const filter = createHandFilter({ confirmFrames: 2, dropoutFrames: 1 });
  const h = hand(0.2);
  filter.update([h], W, H);
  assert.equal(filter.update([h], W, H), h);
  assert.equal(filter.update([], W, H), null);
  assert.equal(filter.update([], W, H), null);
  assert.equal(filter.update([h], W, H), null);
});

test('a confirmed hand survives a short dropout without re-confirming', () => {
  const filter = createHandFilter({ confirmFrames: 3, dropoutFrames: 4 });
  const h = hand(0.2);
  for (let i = 0; i < 3; i++) filter.update([h], W, H);
  assert.equal(filter.update([], W, H), null);
  assert.equal(filter.update([], W, H), null);
  assert.equal(filter.update([h], W, H), h);
  for (let i = 0; i < 5; i++) filter.update([], W, H);
  assert.equal(filter.update([h], W, H), null);
});
