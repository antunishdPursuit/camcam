import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foxRect, PLACEMENT } from '../utils/foxPlacement.js';
import { BOX_SWALLOW_SCALE } from '../utils/summonTimeline.js';

const mouth = [0.1549, 0.5732, 0.4733, 0.9229];
const aspect = 1280 / 853;
const viewport = { w: 1400, h: 900 };
const box = { x: 380, y: 220, w: 640, h: 480 };

test('off-screen: the fox starts entirely past the right edge', () => {
  const r = foxRect({ box, viewport, mouth, aspect, foxIn: 0 });
  assert.ok(r.x >= viewport.w);
});

test('in place: the mouth opening is centred on the camera box', () => {
  const r = foxRect({ box, viewport, mouth, aspect, foxIn: 1 });
  const mouthCx = r.x + ((mouth[0] + mouth[2]) / 2) * r.w;
  const mouthCy = r.y + ((mouth[1] + mouth[3]) / 2) * r.h;
  assert.ok(Math.abs(mouthCx - (box.x + box.w / 2)) < 1e-6);
  assert.ok(Math.abs(mouthCy - (box.y + box.h / 2)) < 1e-6);
});

test('the shrunk camera box fits inside the mouth opening', () => {
  for (const b of [box, { ...box, w: 343, h: 257 }]) {
    const r = foxRect({ box: b, viewport, mouth, aspect, foxIn: 1 });
    const mouthW = (mouth[2] - mouth[0]) * r.w;
    const mouthH = (mouth[3] - mouth[1]) * r.h;
    assert.ok(b.w * BOX_SWALLOW_SCALE < mouthW * 0.75, 'width fits');
    assert.ok(b.h * BOX_SWALLOW_SCALE < mouthH * 0.75, 'height fits');
  }
});

test('crossing: the fox ends entirely past the left edge', () => {
  const r = foxRect({ box, viewport, mouth, aspect, foxIn: 1, foxCross: 1 });
  assert.ok(r.x + r.w <= 0);
});

test('the mouth opening is sized relative to the full camera box', () => {
  const r = foxRect({ box, viewport, mouth, aspect, foxIn: 1 });
  assert.ok(Math.abs((mouth[3] - mouth[1]) * r.h - box.h * PLACEMENT.mouthToBox) < 1e-6);
});

test('the lunge pushes the fox further left', () => {
  const rest = foxRect({ box, viewport, mouth, aspect, foxIn: 1, thrust: 0 });
  const lunge = foxRect({ box, viewport, mouth, aspect, foxIn: 1, thrust: 1 });
  assert.ok(lunge.x < rest.x);
});
