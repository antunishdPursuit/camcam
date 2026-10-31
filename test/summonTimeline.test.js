import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTACKS, BITE_SPEED, DEFAULT_BITE, RUN_FPS, biteTiming, clipFrame, effectDuration, effectFrame
} from '../utils/summonTimeline.js';

const BITES = [DEFAULT_BITE, { snapMs: 400, durationMs: 1600 }, { snapMs: 1500, durationMs: 1650 }];

const sample = (reduced, bite, style) => {
  const frames = [];
  for (let t = 0; t <= effectDuration(reduced, bite, style) + 100; t += 10) {
    frames.push({ t, ...effectFrame(t, reduced, bite, style) });
  }
  return frames;
};

const CASES = [
  ...ATTACKS.flatMap((style) => BITES.map((bite) => ({ reduced: false, style, bite }))),
  ...BITES.map((bite) => ({ reduced: true, style: 'chase', bite }))
];

for (const { reduced, style, bite } of CASES) {
  const label = `${reduced ? 'reduced motion' : style}, snap ${bite.snapMs}/${bite.durationMs} ms`;
  const frames = sample(reduced, bite, style);

  test(`${label}: the camera starts and ends full size and visible in its box`, () => {
    const last = effectFrame(effectDuration(reduced, bite, style), reduced, bite, style);
    assert.equal(last.boxShrink, 0);
    assert.equal(last.boxAlpha, 1);
    assert.equal(last.done, true);
    assert.equal(effectFrame(effectDuration(reduced, bite, style) - 1, reduced, bite, style).done, false);
  });

  test(`${label}: the camera is fully shrunk before the fox reaches it`, () => {
    const firstClose = frames.find((f) => (f.foxGap < 0.5 && f.foxAlpha > 0) || f.boxHeld);
    assert.equal(firstClose.boxShrink, 1, `t=${firstClose.t}`);
  });

  test(`${label}: the camera is pulled into the closing jaws and gone exactly at the snap`, () => {
    const firstHeld = frames.find((f) => f.boxHeld);
    assert.equal(firstHeld.sprite, 'bite');
    assert.ok(firstHeld.spriteMs < bite.snapMs);
    assert.equal(firstHeld.gulp, 0);
    for (const f of frames.filter((f) => f.sprite === 'bite' && f.phase !== 'return')) {
      if (f.spriteMs < bite.snapMs) assert.ok(f.gulp < 1, `still visible at spriteMs=${f.spriteMs}`);
      else assert.equal(f.gulp, 1, `gone at spriteMs=${f.spriteMs}`);
    }
  });

  test(`${label}: the page layer draws the camera while its box is hidden`, () => {
    for (const f of frames) {
      if (f.boxOnPage) assert.equal(f.boxAlpha, 0, `t=${f.t}`);
      if (f.phase === 'return') assert.equal(f.boxOnPage, false, `t=${f.t}`);
    }
  });

  test(`${label}: the fox is gone before the camera comes back`, () => {
    for (const f of frames.filter((f) => f.phase === 'return')) {
      assert.ok(f.foxCross === 1 || f.foxAlpha === 0, `t=${f.t}`);
    }
  });

  test(`${label}: phases run in order`, () => {
    const order = ['run-in', 'bite', 'cross', 'gone', 'return'];
    const indexes = [...new Set(frames.map((f) => f.phase))].map((p) => order.indexOf(p));
    assert.ok(indexes.every((i) => i >= 0));
    assert.deepEqual(indexes, [...indexes].sort((a, b) => a - b));
  });

  if (!reduced) {
    test(`${label}: the fox never stops: it closes in, then carries straight on`, () => {
      assert.equal(frames[0].foxGap, 1, 'starts off the right edge');
      const firstSnap = frames.find((f) => f.gulp === 1);
      assert.equal(firstSnap.foxGap, 0, 'jaws on the camera at the snap');
      for (let i = 1; i < frames.length; i++) {
        const a = frames[i - 1];
        const b = frames[i];
        assert.ok(b.foxGap <= a.foxGap + 1e-9, `gap never widens, t=${b.t}`);
        assert.ok(b.foxCross >= a.foxCross - 1e-9, `never backs up, t=${b.t}`);
      }
      const crossing = frames.filter((f) => f.foxCross > 0 && f.foxCross < 1);
      assert.ok(crossing.length > 0 && crossing[0].t - firstSnap.t <= 20, 'carries on right after the snap');
      assert.ok(frames.some((f) => f.foxCross === 1), 'leaves the page');
    });

    test(`${label}: runs in, bites, then runs off with its mouth shut`, () => {
      const order = ['run', 'bite', 'carry'];
      const seen = [...new Set(frames.filter((f) => f.phase !== 'return' && f.phase !== 'gone').map((f) => f.sprite))];
      assert.deepEqual(seen, order.filter((s) => seen.includes(s)));
      assert.ok(seen.includes('run') && seen.includes('bite'));
    });
  }
}

for (const bite of BITES) {
  test(`chase, snap ${bite.snapMs} ms: the camera runs steadily and is caught where it got to`, () => {
    const frames = sample(false, bite, 'chase');
    assert.equal(frames[0].camTravel, 0);
    for (let i = 1; i < frames.length; i++) {
      if (frames[i].phase === 'return') break;
      assert.ok(frames[i].camTravel >= frames[i - 1].camTravel, `t=${frames[i].t}`);
    }
    const snap = frames.find((f) => f.gulp === 1);
    assert.equal(snap.camTravel, 1);
    assert.ok(frames.every((f) => f.caughtTravel === 1));
    assert.ok(frames.every((f) => f.tremble === 0));
  });

  test(`snatch, snap ${bite.snapMs} ms: the camera holds its spot and trembles until the jaws take it`, () => {
    const frames = sample(false, bite, 'snatch');
    assert.ok(frames.every((f) => f.camTravel === 0 && f.caughtTravel === 0));
    assert.ok(frames.some((f) => f.tremble === 1));
    assert.ok(frames.filter((f) => f.boxHeld).every((f) => f.tremble === 0));
  });

  test(`snap ${bite.snapMs} ms: the snatch reaches the camera sooner than the chase`, () => {
    const at = (style) => sample(false, bite, style).find((f) => f.gulp === 1).t;
    assert.ok(at('snatch') < at('chase'));
  });
}

test('reduced motion: no running, fleeing, trembling, shake or streaks; the jaws cut once to the snap', () => {
  for (const f of sample(true, DEFAULT_BITE, 'chase')) {
    assert.equal(f.shake, 0);
    assert.equal(f.streaks, 0);
    assert.equal(f.foxGap, 0);
    assert.equal(f.foxCross, 0);
    assert.equal(f.camTravel, 0);
    assert.equal(f.tremble, 0);
    assert.equal(f.sprite, 'bite');
    assert.ok(f.spriteMs === 0 || f.spriteMs === DEFAULT_BITE.snapMs);
  }
});

test('an unknown attack style falls back to the chase', () => {
  assert.deepEqual(effectFrame(500, false, DEFAULT_BITE, 'nonsense'), effectFrame(500, false, DEFAULT_BITE, 'chase'));
});

test('bite timing follows the clip and the playback speed', () => {
  const clip = { fps: 16, snapFrame: 12, count: 30 };
  const t = biteTiming(clip);
  assert.ok(Math.abs(t.snapMs - (12 / (16 * BITE_SPEED)) * 1000) < 1e-9);
  assert.ok(Math.abs(t.durationMs - (30 / (16 * BITE_SPEED)) * 1000) < 1e-9);
});

test('run clips loop and bite clips hold their last frame', () => {
  const clip = { fps: 16, count: 10 };
  assert.equal(clipFrame(clip, 0, true), 0);
  assert.equal(clipFrame(clip, (12 / RUN_FPS) * 1000 + 1, true), 2);
  assert.equal(clipFrame(clip, 60000, false), 9);
  assert.equal(clipFrame(clip, -5, false), 0);
});
