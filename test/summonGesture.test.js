import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSummonGesture, measureHand } from '../utils/summonGesture.js';

// Synthetic hand in arbitrary units with a 100-unit palm (wrist to middle knuckle).
// gap is thumb-to-index distance in palm units.
function hand({ gap, raised = true, scale = 1, offsetX = 0, mirror = false }) {
  const points = Array.from({ length: 21 }, () => ({ x: 0, y: 200, z: 0 }));
  const set = (i, x, y) => { points[i] = { x, y, z: 0 }; };
  set(0, 0, 200);
  set(9, 0, 100);
  set(4, -40, 60);
  set(8, -40 + gap * 100, 60);
  set(10, 0, 60);
  set(12, 0, raised ? 0 : 150);
  set(14, 20, 65);
  set(16, 20, raised ? 5 : 155);
  set(18, 40, 75);
  set(20, 40, raised ? 25 : 160);
  return points.map(({ x, y, z }) => ({
    x: ((mirror ? -x : x) * scale + offsetX) / 1000,
    y: (y * scale) / 1000,
    z
  }));
}

// Feeds frames 33 ms apart (about 30 fps) and collects events.
function run(gesture, frames, start = 0, step = 33) {
  const events = [];
  frames.forEach((frame, i) => {
    const event = gesture.update(frame, start + i * step, 1000, 1000);
    if (event) events.push(event);
  });
  return events;
}

const repeat = (frame, n) => Array(n).fill(frame);
const OPEN = hand({ gap: 0.4 });
const CLOSED = hand({ gap: 0.05 });
const FULL_CHARGE = 32; // 32 frames × 33 ms ≈ 1.05 s

test('measures gap in palm units regardless of scale, position, or hand side', () => {
  for (const variant of [{}, { scale: 2.5 }, { offsetX: 300 }, { mirror: true }]) {
    const m = measureHand(hand({ gap: 0.4, ...variant }), 1000, 1000);
    assert.ok(Math.abs(m.gap - 0.4) < 1e-9, JSON.stringify(variant));
    assert.equal(m.othersRaised, true);
  }
  assert.equal(measureHand(hand({ gap: 0.4, raised: false })).othersRaised, false);
});

test('charging starts on the first open-ring frame', () => {
  const g = createSummonGesture();
  assert.deepEqual(run(g, [OPEN]), ['charge']);
  assert.equal(g.state, 'charging');
});

test('charging becomes charged after one second, not before', () => {
  const g = createSummonGesture();
  assert.deepEqual(run(g, repeat(OPEN, 30)), ['charge']); // 0.96 s
  assert.equal(g.state, 'charging');
  assert.deepEqual(run(g, repeat(OPEN, 2), 30 * 33), ['charged']);
  assert.equal(g.state, 'charged');
});

test('charge progress climbs from 0 to 1', () => {
  const g = createSummonGesture();
  g.update(OPEN, 0, 1000, 1000);
  assert.equal(g.chargeProgress, 0);
  g.update(OPEN, 500, 1000, 1000);
  assert.ok(Math.abs(g.chargeProgress - 0.5) < 1e-9);
  g.update(OPEN, 1000, 1000, 1000);
  assert.equal(g.chargeProgress, 1);
  assert.equal(g.state, 'charged');
});

test('charged then closing fires once', () => {
  const g = createSummonGesture();
  const events = run(g, [...repeat(OPEN, FULL_CHARGE), ...repeat(CLOSED, 5)]);
  assert.deepEqual(events, ['charge', 'charged', 'summon']);
  assert.equal(g.state, 'summoned');
});

test('holding the closed ring does not retrigger', () => {
  const g = createSummonGesture();
  const events = run(g, [...repeat(OPEN, FULL_CHARGE), ...repeat(CLOSED, 60)]);
  assert.deepEqual(events, ['charge', 'charged', 'summon']);
});

test('reopening re-arms for another summon', () => {
  const g = createSummonGesture();
  const events = run(g, [
    ...repeat(OPEN, FULL_CHARGE), ...repeat(CLOSED, 3),
    ...repeat(OPEN, FULL_CHARGE + 1), ...repeat(CLOSED, 3)
  ]);
  assert.deepEqual(events, ['charge', 'charged', 'summon', 'charge', 'charged', 'summon']);
});

test('a closed ring on first sight never fires', () => {
  const g = createSummonGesture();
  assert.deepEqual(run(g, repeat(CLOSED, 60)), []);
});

test('closing before charged wastes the charge and needs a fresh one', () => {
  const g = createSummonGesture();
  const events = run(g, [...repeat(OPEN, 10), ...repeat(CLOSED, 40)]);
  assert.deepEqual(events, ['charge', 'fizzle']);
  assert.equal(g.state, 'idle');
});

test('a pinch with other fingers curled never charges', () => {
  const g = createSummonGesture();
  const events = run(g, [
    ...repeat(hand({ gap: 0.4, raised: false }), 40),
    ...repeat(hand({ gap: 0.05, raised: false }), 5)
  ]);
  assert.deepEqual(events, []);
});

test('a wide-open hand does not charge', () => {
  const g = createSummonGesture();
  assert.deepEqual(run(g, repeat(hand({ gap: 1.2 }), 40)), []);
});

test('losing the hand for longer than the grace while charging or charged fizzles', () => {
  for (const lead of [10, FULL_CHARGE]) {
    const g = createSummonGesture();
    const events = run(g, [...repeat(OPEN, lead), ...repeat(null, 12), ...repeat(CLOSED, 5)]);
    assert.equal(events.at(-1), 'fizzle');
    assert.equal(g.state, 'idle');
  }
});

test('one or two bad pose frames keep the fire lit; a sustained break puts it out', () => {
  const WIDE = hand({ gap: 1.2 });
  const g = createSummonGesture();
  assert.deepEqual(run(g, [...repeat(OPEN, 10), WIDE, WIDE, OPEN]), ['charge']);
  assert.equal(g.state, 'charging');
  assert.deepEqual(run(g, repeat(WIDE, 3), 1000), ['fizzle']);
});

test('ring wobbling into the mid-close band keeps charging', () => {
  const g = createSummonGesture();
  const wobble = [OPEN, hand({ gap: 0.15 }), OPEN, hand({ gap: 0.13 })];
  const events = run(g, [...Array(9).fill(wobble).flat(), ...repeat(CLOSED, 2)]);
  assert.deepEqual(events, ['charge', 'charged', 'summon']);
});

test('a single noisy closed frame while charged does not fire', () => {
  const g = createSummonGesture();
  const events = run(g, [...repeat(OPEN, FULL_CHARGE), CLOSED, OPEN, CLOSED, OPEN]);
  assert.deepEqual(events, ['charge', 'charged']);
  assert.equal(g.state, 'charged');
});

test('reset while lit fizzles and needs a fresh charge', () => {
  const g = createSummonGesture();
  run(g, repeat(OPEN, FULL_CHARGE));
  assert.equal(g.reset(), 'fizzle');
  assert.deepEqual(run(g, repeat(CLOSED, 5), 2000), []);
});

test('charge timing follows timestamps, not frame count', () => {
  const g = createSummonGesture();
  assert.deepEqual(run(g, repeat(OPEN, 3), 0, 500), ['charge', 'charged']);
});

test('a real near-OK ring measured at 0.23 palms charges and fires', () => {
  const g = createSummonGesture();
  const events = run(g, [...repeat(hand({ gap: 0.23 }), FULL_CHARGE), ...repeat(hand({ gap: 0.08 }), 3)]);
  assert.deepEqual(events, ['charge', 'charged', 'summon']);
});

test('a short tracking dropout keeps the charge; a long one fizzles', () => {
  const g = createSummonGesture();
  const events = run(g, [...repeat(OPEN, FULL_CHARGE), null, null, null, ...repeat(CLOSED, 2)]);
  assert.deepEqual(events, ['charge', 'charged', 'summon']);
  const g2 = createSummonGesture();
  const events2 = run(g2, [...repeat(OPEN, 10), ...repeat(null, 12)]);
  assert.deepEqual(events2, ['charge', 'fizzle']);
});

test('the charge timer keeps running through a dropout', () => {
  const g = createSummonGesture();
  const events = run(g, [...repeat(OPEN, 25), null, null, ...repeat(OPEN, 5)]);
  assert.deepEqual(events, ['charge', 'charged']);
});

test('after an Escape lock, holding the ring stays off until the pose is released', () => {
  const g = createSummonGesture();
  run(g, repeat(OPEN, FULL_CHARGE));
  assert.equal(g.reset({ lock: true }), 'fizzle');
  assert.deepEqual(run(g, repeat(OPEN, 40), 2000), []);
  assert.equal(g.state, 'locked');
  assert.deepEqual(run(g, [hand({ gap: 1.2 }), ...repeat(OPEN, 2)], 4000), ['charge']);
});
