// Pure timeline for the fox attack: given elapsed ms, says where every part
// is. The fox comes in from the right edge of the page while the camera box
// shrinks to fit its open mouth; the jaw snaps shut and the box is swallowed;
// the fox carries on across the page and out the left edge; after a pause the
// camera box grows back.
// Phases: enter → lunge → bite → cross → gone → return.
export const BOX_SWALLOW_SCALE = 0.35; // box size inside the mouth

const FULL = {
  shrinkStart: 250,
  enterEnd: 600,
  lungeEnd: 800,
  biteEnd: 950,
  crossStart: 1100,
  crossEnd: 2000,
  returnStart: 2600,
  end: 3200
};

const REDUCED = {
  fadeInEnd: 700,
  shrinkStart: 300,
  shrinkEnd: 900,
  biteEnd: 1500,
  fadeOutStart: 1700,
  fadeOutEnd: 2300,
  returnStart: 2600,
  end: 3300
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const progress = (t, start, end) => clamp01((t - start) / (end - start));
const lerp = (a, b, p) => a + (b - a) * p;
const easeIn = (p) => p * p * p;
const easeOut = (p) => 1 - (1 - p) ** 3;
const easeInOut = (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

export function effectDuration(reducedMotion) {
  return (reducedMotion ? REDUCED : FULL).end;
}

// foxIn: 0 = off the right edge, 1 = at the attack position.
// foxCross: 0 = at the attack position, 1 = off the left edge.
// thrust: extra forward push during the lunge (0..1).
// jawClose: 0 = open, 1 = shut.
// boxScale / boxAlpha: the camera box's size and visibility.
export function effectFrame(t, reducedMotion = false) {
  return reducedMotion ? reducedFrame(t) : fullFrame(t);
}

function swallowAndReturn(t, shrinkStart, shrinkEnd, hideStart, hideEnd, returnStart, end) {
  if (t < returnStart) {
    return {
      boxScale: lerp(1, BOX_SWALLOW_SCALE, easeInOut(progress(t, shrinkStart, shrinkEnd))),
      boxAlpha: 1 - progress(t, hideStart, hideEnd)
    };
  }
  const p = easeOut(progress(t, returnStart, end));
  return { boxScale: lerp(BOX_SWALLOW_SCALE, 1, p), boxAlpha: p };
}

function fullFrame(t) {
  const T = FULL;
  const frame = {
    phase: 'enter', foxIn: easeOut(progress(t, 0, T.enterEnd)), foxCross: 0, foxAlpha: 1,
    thrust: 0, jawClose: easeIn(progress(t, T.lungeEnd, T.biteEnd)),
    shake: 0, streaks: 0, done: t >= T.end,
    ...swallowAndReturn(t, T.shrinkStart, T.enterEnd, T.biteEnd - 30, T.biteEnd, T.returnStart, T.end)
  };

  if (t >= T.enterEnd && t < T.biteEnd) {
    frame.phase = t < T.lungeEnd ? 'lunge' : 'bite';
    frame.thrust = t < T.lungeEnd ? easeOut(progress(t, T.enterEnd, T.lungeEnd)) : 1;
  } else if (t >= T.biteEnd) {
    frame.phase = t < T.crossEnd ? 'cross' : t < T.returnStart ? 'gone' : 'return';
    frame.thrust = 1 - progress(t, T.biteEnd, T.crossStart);
    frame.foxCross = easeIn(progress(t, T.crossStart, T.crossEnd));
  }

  if (t >= T.biteEnd && t < T.biteEnd + 300) {
    frame.shake = 1 - progress(t, T.biteEnd, T.biteEnd + 300);
    frame.streaks = frame.shake;
  }
  return frame;
}

// Reduced motion: no slide, lunge, shake or streaks. The fox fades in already
// in place, the box shrinks gently, the jaw closes slowly, the box fades away
// inside the mouth, the fox fades out, and the box grows back.
function reducedFrame(t) {
  const T = REDUCED;
  const frame = {
    phase: 'enter', foxIn: 1, foxCross: 0, foxAlpha: 0, thrust: 0,
    jawClose: easeInOut(progress(t, T.shrinkEnd, T.biteEnd)),
    shake: 0, streaks: 0, done: t >= T.end,
    ...swallowAndReturn(t, T.shrinkStart, T.shrinkEnd, T.biteEnd - 200, T.biteEnd, T.returnStart, T.end)
  };

  if (t < T.fadeInEnd) {
    frame.foxAlpha = progress(t, 0, T.fadeInEnd);
  } else if (t < T.fadeOutStart) {
    frame.foxAlpha = 1;
    frame.phase = 'bite';
  } else {
    frame.foxAlpha = 1 - progress(t, T.fadeOutStart, T.fadeOutEnd);
    frame.phase = t < T.returnStart ? 'gone' : 'return';
  }
  return frame;
}
