import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandFilter } from '../utils/handSelection.js';
import { createSummonGesture } from '../utils/summonGesture.js';

// Same synthetic ring hand as summonGesture.test.js: 100-unit palm in a
// 1000-unit frame, gap in palm units.
function hand(gap) {
  const points = Array.from({ length: 21 }, () => ({ x: 0, y: 200, z: 0 }));
  const set = (i, x, y) => { points[i] = { x, y, z: 0 }; };
  set(0, 0, 200);
  set(9, 0, 100);
  set(4, -40, 60);
  set(8, -40 + gap * 100, 60);
  set(10, 0, 60);
  set(12, 0, 0);
  set(14, 20, 65);
  set(16, 20, 5);
  set(18, 40, 75);
  set(20, 40, 25);
  return points.map(({ x, y, z }) => ({ x: (x + 500) / 1000, y: y / 1000, z }));
}

// Runs detections through the filter and the gesture the way main.js does.
function run(frames, step) {
  const filter = createHandFilter();
  const gesture = createSummonGesture();
  const events = [];
  frames.forEach((hands, i) => {
    const now = i * step;
    const event = gesture.update(filter.update(hands, 1000, 1000, now), now, 1000, 1000);
    if (event) events.push(event);
  });
  return events;
}

const repeat = (frame, n) => Array(n).fill(frame);

test('at 15 fps a 400 ms tracking dropout mid-charge keeps the charge', () => {
  const OPEN = [hand(0.4)];
  const events = run([...repeat(OPEN, 8), ...repeat([], 6), ...repeat(OPEN, 8), ...repeat([hand(0.05)], 2)], 67);
  assert.deepEqual(events, ['charge', 'charged', 'summon']);
});

test('at 15 fps a dropout well past the grace puts the fire out', () => {
  const events = run([...repeat([hand(0.4)], 8), ...repeat([], 12)], 67);
  assert.deepEqual(events, ['charge', 'fizzle']);
});
