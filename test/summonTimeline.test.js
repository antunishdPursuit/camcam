import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BITE_SPEED, DEFAULT_BITE, EYE_MS, RUN_FPS, biteTiming, clipFrame, effectDuration, effectFrame, eyeState
} from '../utils/summonTimeline.js';

const BITES = [DEFAULT_BITE, { snapMs: 400, durationMs: 1600 }, { snapMs: 1500, durationMs: 1650 }];

const sample = (reduced, bite) => {
  const frames = [];
  for (let t = 0; t <= effectDuration(reduced, bite) + 100; t += 10) {
    frames.push({ t, ...effectFrame(t, reduced, bite) });
  }
  return frames;
};

const CASES = [
  ...BITES.map((bite) => ({ reduced: false, bite })),
  ...BITES.map((bite) => ({ reduced: true, bite }))
];

for (const { reduced, bite } of CASES) {
  const label = `${reduced ? 'reduced motion' : 'full motion'}, snap ${bite.snapMs}/${bite.durationMs} ms`;
  const frames = sample(reduced, bite);

  test(`${label}: the camera starts and ends full size and visible in its box`, () => {
    const last = effectFrame(effectDuration(reduced, bite), reduced, bite);
    assert.equal(last.boxShrink, 0);
    assert.equal(last.boxAlpha, 1);
    assert.equal(last.done, true);
    assert.equal(effectFrame(effectDuration(reduced, bite) - 1, reduced, bite).done, false);
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
    test(`${label}: the camera holds full size for a beat, then shrinks gently`, () => {
      assert.ok(frames.filter((f) => f.t < 150).every((f) => f.boxShrink === 0), 'no instant shrink');
      const start = frames.find((f) => f.boxShrink > 0).t;
      const end = frames.find((f) => f.boxShrink === 1).t;
      assert.ok(end - start >= 700, `shrink takes ${end - start} ms`);
      for (let i = 1; frames[i].t <= end; i++) {
        const step = frames[i].boxShrink - frames[i - 1].boxShrink;
        assert.ok(step >= 0 && step < 0.025, `smooth at t=${frames[i].t}`);
      }
    });

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

    test(`${label}: the camera runs steadily and is caught where it got to`, () => {
      assert.equal(frames[0].camTravel, 0);
      for (let i = 1; i < frames.length; i++) {
        if (frames[i].phase === 'return') break;
        assert.ok(frames[i].camTravel >= frames[i - 1].camTravel, `t=${frames[i].t}`);
      }
      assert.equal(frames.find((f) => f.gulp === 1).camTravel, 1);
      assert.ok(frames.every((f) => f.caughtTravel === 1));
    });
  }
}

test('reduced motion: no running, fleeing, shake or streaks; the jaws cut once to the snap', () => {
  for (const f of sample(true, DEFAULT_BITE)) {
    assert.equal(f.shake, 0);
    assert.equal(f.streaks, 0);
    assert.equal(f.foxGap, 0);
    assert.equal(f.foxCross, 0);
    assert.equal(f.camTravel, 0);
    assert.equal(f.sprite, 'bite');
    assert.ok(f.spriteMs === 0 || f.spriteMs === DEFAULT_BITE.snapMs);
  }
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

test('the eye opens quickly, narrows its pupil, then fades as the attack starts', () => {
  assert.equal(eyeState(0).open, 0);
  assert.equal(eyeState(300).open, 1);
  assert.equal(eyeState(EYE_MS - 1).alpha, 1, 'fully visible until the attack');
  assert.ok(eyeState(EYE_MS - 50).slit < eyeState(300).slit, 'pupil narrows');
  assert.equal(eyeState(EYE_MS + 500).alpha, 0, 'gone while the camera shrinks');
  for (let t = 10; t <= EYE_MS + 600; t += 10) {
    assert.ok(eyeState(t).open >= eyeState(t - 10).open, `never blinks shut, t=${t}`);
  }
});

test('reduced motion: the eye fades in already open with a fixed pupil', () => {
  for (let t = 0; t <= EYE_MS + 600; t += 10) {
    const e = eyeState(t, true);
    assert.equal(e.open, 1);
    assert.equal(e.slit, 0.5);
  }
  assert.equal(eyeState(0, true).alpha, 0);
  assert.equal(eyeState(EYE_MS + 500, true).alpha, 0);
});
