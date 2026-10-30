import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectDuration, effectFrame } from '../utils/summonTimeline.js';

const sample = (reduced) => {
  const frames = [];
  for (let t = 0; t <= effectDuration(reduced) + 100; t += 10) frames.push({ t, ...effectFrame(t, reduced) });
  return frames;
};

for (const reduced of [false, true]) {
  const label = reduced ? 'reduced motion' : 'full motion';

  test(`${label}: the camera box starts and ends full size and visible`, () => {
    const first = effectFrame(0, reduced);
    assert.equal(first.boxShrink, 0);
    assert.equal(first.boxAlpha, 1);
    const last = effectFrame(effectDuration(reduced), reduced);
    assert.equal(last.boxShrink, 0);
    assert.equal(last.boxAlpha, 1);
    assert.equal(last.done, true);
    assert.equal(effectFrame(effectDuration(reduced) - 1, reduced).done, false);
  });

  test(`${label}: the box is fully shrunk before the jaw starts to close`, () => {
    const frames = sample(reduced);
    const closing = frames.find((f) => f.jawClose > 0);
    assert.equal(closing.boxShrink, 1);
  });

  test(`${label}: the box only vanishes as the jaw shuts`, () => {
    for (const f of sample(reduced)) {
      if (f.boxAlpha < 1 && f.phase !== 'return') assert.ok(f.jawClose > 0.5, `t=${f.t}`);
    }
    const shut = sample(reduced).find((f) => f.jawClose === 1);
    assert.equal(shut.boxAlpha, 0);
  });

  test(`${label}: the jaw only closes, never reopens`, () => {
    const jaws = sample(reduced).map((f) => f.jawClose);
    for (let i = 1; i < jaws.length; i++) assert.ok(jaws[i] >= jaws[i - 1] - 1e-9);
  });

  test(`${label}: the fox is gone before the box comes back`, () => {
    for (const f of sample(reduced).filter((f) => f.phase === 'return')) {
      assert.ok(f.foxCross === 1 || f.foxAlpha === 0, `t=${f.t}`);
    }
  });

  test(`${label}: phases run in order`, () => {
    const order = ['enter', 'lunge', 'bite', 'cross', 'gone', 'return'];
    const seen = [...new Set(sample(reduced).map((f) => f.phase))];
    const indexes = seen.map((p) => order.indexOf(p));
    assert.ok(indexes.every((i) => i >= 0));
    assert.deepEqual(indexes, [...indexes].sort((a, b) => a - b));
  });
}

test('full motion: the fox enters from the right and crosses out the left', () => {
  assert.equal(effectFrame(0).foxIn, 0);
  const frames = sample(false);
  assert.ok(frames.some((f) => f.foxIn === 1 && f.foxCross === 0), 'reaches the bite');
  assert.ok(frames.some((f) => f.foxCross === 1), 'leaves across the page');
  const leaving = frames.filter((f) => f.foxCross > 0);
  assert.ok(leaving.every((f) => f.jawClose === 1), 'carries the box off with its jaw shut');
});

test('full motion: a pause with the spot empty before the box returns', () => {
  const gone = sample(false).filter((f) => f.phase === 'gone');
  assert.ok(gone.length * 10 >= 400);
  assert.ok(gone.every((f) => f.boxAlpha === 0 && f.foxCross === 1));
});

test('reduced motion has no slide, crossing, shake, streaks or lunge', () => {
  for (const f of sample(true)) {
    assert.equal(f.shake, 0);
    assert.equal(f.streaks, 0);
    assert.equal(f.thrust, 0);
    assert.equal(f.foxIn, 1);
    assert.equal(f.foxCross, 0);
  }
});
