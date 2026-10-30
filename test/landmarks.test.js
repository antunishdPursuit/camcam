import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANDMARK, distancePx, palmLength } from '../utils/landmarks.js';

test('distances are measured in frame pixels, not normalized units', () => {
  assert.equal(distancePx({ x: 0, y: 0 }, { x: 0.5, y: 0 }, 640, 480), 320);
  assert.equal(distancePx({ x: 0, y: 0 }, { x: 0, y: 0.5 }, 640, 480), 240);
});

test('palm length runs from wrist to middle knuckle', () => {
  const hand = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  hand[LANDMARK.WRIST] = { x: 0.5, y: 0.75 };
  hand[LANDMARK.MIDDLE_MCP] = { x: 0.5, y: 0.5 };
  assert.equal(palmLength(hand, 640, 480), 120);
});
