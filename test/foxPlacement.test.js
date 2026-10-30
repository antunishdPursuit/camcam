import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foxRect, PLACEMENT, swallowScale } from '../utils/foxPlacement.js';

const frame = { w: 832, h: 480 };   // source video frame the clips are cut from
const mouth = [0.12, 0.42];          // where the jaws meet at the bite
const gape = 0.2;                    // open-jaw height just before the bite

const LAYOUTS = [
  { name: 'desktop', viewport: { w: 1400, h: 900 }, box: { x: 380, y: 220, w: 640, h: 480 } },
  { name: 'short window', viewport: { w: 800, h: 609 }, box: { x: 80, y: 200, w: 640, h: 480 } },
  { name: 'phone', viewport: { w: 375, h: 812 }, box: { x: 16, y: 230, w: 343, h: 257 } }
];
const [{ viewport, box }] = LAYOUTS;

test('off-screen: the fox starts entirely past the right edge', () => {
  const r = foxRect({ box, viewport, frame, mouth, foxIn: 0 });
  assert.ok(r.x >= viewport.w);
});

test('at the bite: the mouth point sits on the camera box centre', () => {
  for (const { name, viewport: v, box: b } of LAYOUTS) {
    const r = foxRect({ box: b, viewport: v, frame, mouth, foxIn: 1 });
    assert.ok(Math.abs(r.x + mouth[0] * r.w - (b.x + b.w / 2)) < 1e-6, name);
    assert.ok(Math.abs(r.y + mouth[1] * r.h - (b.y + b.h / 2)) < 1e-6, name);
  }
});

test('the fox keeps the source frame proportions and fits the window', () => {
  for (const { name, viewport: v, box: b } of LAYOUTS) {
    const r = foxRect({ box: b, viewport: v, frame, mouth, foxIn: 1 });
    assert.ok(Math.abs(r.w / r.h - frame.w / frame.h) < 1e-9, name);
    assert.ok(r.h <= v.h * PLACEMENT.maxViewportHeight + 1e-6, name);
  }
});

test('the shrunk camera box height fits between the jaws at every window size', () => {
  for (const { name, viewport: v, box: b } of LAYOUTS) {
    const s = swallowScale({ box: b, viewport: v, gape });
    const r = foxRect({ box: b, viewport: v, frame, mouth, foxIn: 1 });
    assert.ok(s > 0 && s <= PLACEMENT.swallowScale, name);
    assert.ok(b.h * s <= gape * r.h * PLACEMENT.mouthFill + 1e-6, name);
  }
});

test('crossing: the fox ends entirely past the left edge', () => {
  const r = foxRect({ box, viewport, frame, mouth, foxIn: 1, foxCross: 1 });
  assert.ok(r.x + r.w <= 0);
});
