import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLACEMENT, fleeDistance, foxRectAt, foxSize, jawsX, swallowScale } from '../utils/foxPlacement.js';

const frame = { w: 832, h: 480 };   // source video frame the clips are cut from
const mouth = [0.12, 0.42];          // where the jaws meet at the bite
const gape = 0.2;                    // open-jaw height just before the bite

const LAYOUTS = [
  { name: 'desktop', viewport: { w: 1400, h: 900 }, box: { x: 380, y: 220, w: 640, h: 480 } },
  { name: 'short window', viewport: { w: 800, h: 609 }, box: { x: 80, y: 200, w: 640, h: 480 } },
  { name: 'phone', viewport: { w: 375, h: 812 }, box: { x: 16, y: 230, w: 343, h: 257 } }
];

test('the fox keeps the source frame proportions and fits the window', () => {
  for (const { name, viewport, box } of LAYOUTS) {
    const size = foxSize({ box, viewport, frame });
    assert.ok(Math.abs(size.w / size.h - frame.w / frame.h) < 1e-9, name);
    assert.ok(size.h <= viewport.h * PLACEMENT.maxViewportHeight + 1e-6, name);
  }
});

test('foxRectAt puts the mouth point on the anchor', () => {
  const size = { w: 1000, h: 577 };
  const r = foxRectAt({ anchor: { x: 400, y: 300 }, size, mouth });
  assert.ok(Math.abs(r.x + mouth[0] * r.w - 400) < 1e-9);
  assert.ok(Math.abs(r.y + mouth[1] * r.h - 300) < 1e-9);
});

test('before the snap: gap 1 is fully off the right edge, gap 0 is on the camera', () => {
  for (const { name, viewport, box } of LAYOUTS) {
    const size = foxSize({ box, viewport, frame });
    const camX = box.x + box.w / 2;
    const off = jawsX({ camX, caughtX: camX, foxGap: 1, foxCross: 0, viewport, size, mouth });
    assert.ok(off - mouth[0] * size.w >= viewport.w - 1e-6, `${name}: whole fox right of the window`);
    assert.equal(jawsX({ camX, caughtX: camX, foxGap: 0, foxCross: 0, viewport, size, mouth }), camX, name);
  }
});

test('after the snap: crossing 1 is fully off the left edge, and it starts at the catch point', () => {
  for (const { name, viewport, box } of LAYOUTS) {
    const size = foxSize({ box, viewport, frame });
    const caughtX = box.x + box.w / 3;
    const gone = jawsX({ camX: caughtX, caughtX, foxGap: 0, foxCross: 1, viewport, size, mouth });
    assert.ok(gone + (1 - mouth[0]) * size.w <= 1e-6, `${name}: whole fox left of the window`);
    const justAfter = jawsX({ camX: caughtX, caughtX, foxGap: 0, foxCross: 1e-6, viewport, size, mouth });
    assert.ok(Math.abs(justAfter - caughtX) < 1, `${name}: no jump at the snap`);
  }
});

test('the camera never flees off the left of the window', () => {
  for (const { name, viewport, box } of LAYOUTS) {
    const scale = swallowScale({ box, viewport, gape });
    const d = fleeDistance({ box, scale });
    const leftEdge = box.x + box.w / 2 - d - (box.w * scale) / 2;
    assert.ok(d >= 0 && d <= box.w * PLACEMENT.fleeWidth + 1e-9, name);
    assert.ok(leftEdge >= 16 - 1e-6 || d === 0, name);
  }
});

test('the shrunk camera height fits between the jaws at every window size', () => {
  for (const { name, viewport, box } of LAYOUTS) {
    const s = swallowScale({ box, viewport, gape });
    const { h } = foxSize({ box, viewport, frame });
    assert.ok(s > 0 && s <= PLACEMENT.swallowScale, name);
    assert.ok(box.h * s <= gape * h * PLACEMENT.mouthFill + 1e-6, name);
  }
});

test('swallowScale sizes against the drawn fox and survives a missing gape', () => {
  for (const { name, viewport, box } of LAYOUTS) {
    const { h } = foxSize({ box, viewport, frame });
    const expected = Math.min(PLACEMENT.swallowScale, (PLACEMENT.mouthFill * gape * h) / box.h);
    assert.equal(swallowScale({ box, viewport, gape }), expected, name);
    assert.equal(swallowScale({ box, viewport, gape: undefined }), PLACEMENT.swallowScale, name);
  }
});
