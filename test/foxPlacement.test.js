import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foxRect, PLACEMENT, swallowScale } from '../utils/foxPlacement.js';

const mouth = [0.1549, 0.5732, 0.4733, 0.9229];
const aspect = 1280 / 853;
const viewport = { w: 1400, h: 900 };
const box = { x: 380, y: 220, w: 640, h: 480 };

// Window sizes to check: roomy desktop, the short in-app pane, a phone.
const LAYOUTS = [
  { name: 'desktop', viewport: { w: 1400, h: 900 }, box },
  { name: 'short window', viewport: { w: 800, h: 609 }, box: { x: 80, y: 200, w: 640, h: 480 } },
  { name: 'phone', viewport: { w: 375, h: 812 }, box: { x: 16, y: 230, w: 343, h: 257 } }
];

test('off-screen: the fox starts entirely past the right edge', () => {
  const r = foxRect({ box, viewport, mouth, aspect, foxIn: 0 });
  assert.ok(r.x >= viewport.w);
});

test('in place: the mouth opening is centred on the camera box', () => {
  for (const { name, viewport: v, box: b } of LAYOUTS) {
    const r = foxRect({ box: b, viewport: v, mouth, aspect, foxIn: 1 });
    const mouthCx = r.x + ((mouth[0] + mouth[2]) / 2) * r.w;
    const mouthCy = r.y + ((mouth[1] + mouth[3]) / 2) * r.h;
    assert.ok(Math.abs(mouthCx - (b.x + b.w / 2)) < 1e-6, name);
    assert.ok(Math.abs(mouthCy - (b.y + b.h / 2)) < 1e-6, name);
  }
});

test('the fox is never taller than the window allows', () => {
  for (const { name, viewport: v, box: b } of LAYOUTS) {
    const r = foxRect({ box: b, viewport: v, mouth, aspect, foxIn: 1 });
    assert.ok(r.h <= v.h * PLACEMENT.maxViewportHeight + 1e-6, name);
  }
});

test('the shrunk camera box fits inside the mouth at every window size', () => {
  for (const { name, viewport: v, box: b } of LAYOUTS) {
    const geometry = { box: b, viewport: v, mouth, aspect };
    const s = swallowScale(geometry);
    const r = foxRect({ ...geometry, foxIn: 1 });
    const mouthW = (mouth[2] - mouth[0]) * r.w;
    const mouthH = (mouth[3] - mouth[1]) * r.h;
    assert.ok(s > 0 && s <= PLACEMENT.swallowScale, name);
    assert.ok(b.w * s <= mouthW * PLACEMENT.mouthFill + 1e-6, `${name} width`);
    assert.ok(b.h * s <= mouthH * PLACEMENT.mouthFill + 1e-6, `${name} height`);
  }
});

test('a short window caps the fox and shrinks the box further', () => {
  const roomy = swallowScale({ box, viewport: { w: 1400, h: 1400 }, mouth, aspect });
  const short = swallowScale({ box, viewport: { w: 1400, h: 500 }, mouth, aspect });
  assert.equal(roomy, PLACEMENT.swallowScale);
  assert.ok(short < roomy);
});

test('crossing: the fox ends entirely past the left edge', () => {
  const r = foxRect({ box, viewport, mouth, aspect, foxIn: 1, foxCross: 1 });
  assert.ok(r.x + r.w <= 0);
});

test('the lunge pushes the fox further left', () => {
  const rest = foxRect({ box, viewport, mouth, aspect, foxIn: 1, thrust: 0 });
  const lunge = foxRect({ box, viewport, mouth, aspect, foxIn: 1, thrust: 1 });
  assert.ok(lunge.x < rest.x);
});
