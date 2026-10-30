import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BITE_SPEED, DEFAULT_BITE, RUN_FPS, biteTiming, clipFrame, effectDuration, effectFrame
} from '../utils/summonTimeline.js';

const BITES = [DEFAULT_BITE, { snapMs: 400, durationMs: 1600 }, { snapMs: 1100, durationMs: 1200 }];

const sample = (reduced, bite) => {
  const frames = [];
  for (let t = 0; t <= effectDuration(reduced, bite) + 100; t += 10) frames.push({ t, ...effectFrame(t, reduced, bite) });
  return frames;
};

for (const reduced of [false, true]) {
  for (const bite of BITES) {
    const label = `${reduced ? 'reduced' : 'full'} motion, snap ${bite.snapMs}/${bite.durationMs} ms`;

    test(`${label}: the camera box starts and ends full size and visible`, () => {
      const first = effectFrame(0, reduced, bite);
      assert.equal(first.boxShrink, 0);
      assert.equal(first.boxAlpha, 1);
      const last = effectFrame(effectDuration(reduced, bite), reduced, bite);
      assert.equal(last.boxShrink, 0);
      assert.equal(last.boxAlpha, 1);
      assert.equal(last.done, true);
      assert.equal(effectFrame(effectDuration(reduced, bite) - 1, reduced, bite).done, false);
    });

    test(`${label}: the box is fully shrunk when the jaws take it`, () => {
      const firstHeld = sample(reduced, bite).find((f) => f.boxHeld);
      assert.equal(firstHeld.boxShrink, 1, `t=${firstHeld.t}`);
    });

    test(`${label}: the jaws take the box at the snap and it is gulped down afterwards`, () => {
      const frames = sample(reduced, bite);
      const firstHeld = frames.find((f) => f.boxHeld);
      assert.equal(firstHeld.sprite, 'bite');
      assert.ok(firstHeld.spriteMs >= bite.snapMs, `spriteMs=${firstHeld.spriteMs}`);
      assert.equal(firstHeld.gulp, 0, 'held before it is swallowed');
      const swallowed = frames.find((f) => f.gulp === 1);
      assert.ok(swallowed, 'is swallowed');
      assert.ok(reduced ? swallowed.foxAlpha === 1 : swallowed.foxCross < 1, 'while the fox is still there');
      for (const f of frames.filter((f) => f.gulp > 0 && f.phase !== 'return')) assert.ok(f.boxHeld, `t=${f.t}`);
    });

    test(`${label}: the page layer draws the camera while the layout box is hidden`, () => {
      for (const f of sample(reduced, bite)) {
        if (f.boxOnPage) assert.equal(f.boxAlpha, 0, `t=${f.t}`);
        if (f.phase === 'return') assert.equal(f.boxOnPage, false, `t=${f.t}`);
      }
      assert.equal(effectFrame(0, reduced, bite).boxOnPage, false);
    });

    test(`${label}: the fox is gone before the box comes back`, () => {
      for (const f of sample(reduced, bite).filter((f) => f.phase === 'return')) {
        assert.ok(f.foxCross === 1 || f.foxAlpha === 0, `t=${f.t}`);
      }
    });

    test(`${label}: phases run in order`, () => {
      const order = ['run-in', 'bite', 'cross', 'gone', 'return'];
      const seen = [...new Set(sample(reduced, bite).map((f) => f.phase))];
      const indexes = seen.map((p) => order.indexOf(p));
      assert.ok(indexes.every((i) => i >= 0));
      assert.deepEqual(indexes, [...indexes].sort((a, b) => a - b));
    });
  }
}

test('full motion: runs in, bites in place, then runs out the left', () => {
  const frames = sample(false, DEFAULT_BITE);
  assert.equal(frames[0].foxIn, 0);
  assert.equal(frames[0].sprite, 'run');
  const biting = frames.filter((f) => f.sprite === 'bite');
  assert.ok(biting.length > 0);
  assert.ok(biting.every((f) => f.foxIn === 1 && f.foxCross === 0), 'stays put while biting');
  assert.ok(frames.some((f) => f.foxCross === 1), 'leaves across the page');
  assert.ok(frames.filter((f) => f.foxCross > 0).every((f) => f.sprite === 'run'), 'runs off');
});

test('full motion: the bite clip plays in full', () => {
  const biting = sample(false, DEFAULT_BITE).filter((f) => f.sprite === 'bite');
  assert.ok(biting.at(-1).spriteMs >= DEFAULT_BITE.durationMs - 10);
});

test('full motion: a pause with the spot empty before the box returns', () => {
  const gone = sample(false, DEFAULT_BITE).filter((f) => f.phase === 'gone');
  assert.ok(gone.length * 10 >= 500);
  assert.ok(gone.every((f) => f.boxAlpha === 0 && f.foxCross === 1));
});

test('reduced motion: no running, crossing, shake or streaks; the jaws cut once to the snap', () => {
  const frames = sample(true, DEFAULT_BITE);
  for (const f of frames) {
    assert.equal(f.shake, 0);
    assert.equal(f.streaks, 0);
    assert.equal(f.foxIn, 1);
    assert.equal(f.foxCross, 0);
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
