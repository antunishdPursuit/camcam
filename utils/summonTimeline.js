// Pure timeline for the fox attack: given elapsed ms and the chosen bite clip,
// says where every part is and which sprite frame to show. The full-body fox
// runs in from the right edge while the camera box shrinks; it plays its bite
// clip and its jaws snap shut on the box, which it then carries in its mouth
// and gulps down while running out the left edge; after a pause the camera box
// grows back. Phases: run-in → bite → cross → gone → return.

// bite: { snapMs, durationMs } of the chosen bite clip at playback speed.
export const DEFAULT_BITE = { snapMs: 700, durationMs: 1300 };

const RUN_IN = 900;
const SHRINK_START = 300;
const CROSS_MS = 1000;
const GONE_MS = 600;
const RETURN_MS = 600;
const GULP_DELAY = 450;   // the box is held in the jaws this long after the snap
const GULP_MS = 350;      // then swallowed over this long

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const progress = (t, start, end) => clamp01((t - start) / (end - start));
const easeIn = (p) => p * p * p;
const easeOut = (p) => 1 - (1 - p) ** 3;
const easeInOut = (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

function fullTimes(bite) {
  const biteStart = RUN_IN;
  const snap = biteStart + bite.snapMs;
  const crossStart = biteStart + bite.durationMs;
  const crossEnd = crossStart + CROSS_MS;
  const returnStart = crossEnd + GONE_MS;
  return { biteStart, snap, crossStart, crossEnd, returnStart, end: returnStart + RETURN_MS };
}

const REDUCED = {
  fadeInEnd: 700, shrinkStart: 300, shrinkEnd: 900, snap: 1300,
  fadeOutStart: 2200, fadeOutEnd: 2700, returnStart: 3000, end: 3700
};

export function effectDuration(reducedMotion, bite = DEFAULT_BITE) {
  return reducedMotion ? REDUCED.end : fullTimes(bite).end;
}

// foxIn: 0 = off the right edge, 1 = at the bite position.
// foxCross: 0 = at the bite position, 1 = off the left edge.
// sprite: 'run' or 'bite'; spriteMs: time into that clip.
// boxShrink: 0 = camera box at full size, 1 = shrunk to fit the jaws.
// boxOnPage: the camera is drawn on the page layer (on top of the fox) instead
// of in its own box, from when it starts shrinking until it is swallowed.
// boxHeld: the camera follows the fox's mouth (from the snap).
// gulp: 0 = held at full shrunk size, 1 = swallowed.
// boxAlpha: visibility of the camera box in the page layout (hidden while the
// page layer draws it, fading back in on return).
export function effectFrame(t, reducedMotion = false, bite = DEFAULT_BITE) {
  return reducedMotion ? reducedFrame(t, bite) : fullFrame(t, bite);
}

function boxState(t, { shrinkStart, shrinkEnd, snap, returnStart, end }) {
  if (t < returnStart) {
    return {
      boxShrink: easeInOut(progress(t, shrinkStart, shrinkEnd)),
      boxOnPage: t >= shrinkStart,
      boxHeld: t >= snap,
      gulp: easeIn(progress(t, snap + GULP_DELAY, snap + GULP_DELAY + GULP_MS)),
      boxAlpha: t < shrinkStart ? 1 : 0
    };
  }
  const p = easeOut(progress(t, returnStart, end));
  return { boxShrink: 1 - p, boxOnPage: false, boxHeld: false, gulp: 0, boxAlpha: p };
}

function fullFrame(t, bite) {
  const T = fullTimes(bite);
  const frame = {
    phase: 'run-in', foxIn: easeOut(progress(t, 0, RUN_IN)), foxCross: 0, foxAlpha: 1,
    sprite: 'run', spriteMs: t, shake: 0, streaks: 0, done: t >= T.end,
    ...boxState(t, { shrinkStart: SHRINK_START, shrinkEnd: RUN_IN, snap: T.snap, returnStart: T.returnStart, end: T.end })
  };

  if (t >= T.biteStart && t < T.crossStart) {
    frame.phase = 'bite';
    frame.sprite = 'bite';
    frame.spriteMs = t - T.biteStart;
  } else if (t >= T.crossStart) {
    frame.phase = t < T.crossEnd ? 'cross' : t < T.returnStart ? 'gone' : 'return';
    frame.foxCross = easeIn(progress(t, T.crossStart, T.crossEnd));
    frame.spriteMs = t - T.crossStart;
  }

  if (t >= T.snap && t < T.snap + 300) {
    frame.shake = 1 - progress(t, T.snap, T.snap + 300);
    frame.streaks = frame.shake;
  }
  return frame;
}

// Reduced motion: no running, crossing, shake or streaks. The fox fades in
// already in place on the first bite frame, the box shrinks gently, the jaws
// cut once to the snap frame holding the box, which is then swallowed, the fox
// fades out, and the box grows back.
function reducedFrame(t, bite) {
  const T = REDUCED;
  const frame = {
    phase: 'run-in', foxIn: 1, foxCross: 0, foxAlpha: 0,
    sprite: 'bite', spriteMs: t < T.snap ? 0 : bite.snapMs,
    shake: 0, streaks: 0, done: t >= T.end,
    ...boxState(t, { shrinkStart: T.shrinkStart, shrinkEnd: T.shrinkEnd, snap: T.snap, returnStart: T.returnStart, end: T.end })
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

// Sprite clip playback. Clips are generated at their own fps; the run loops at
// RUN_FPS and the bite plays a little faster than generated for snap.
export const RUN_FPS = 20;
export const BITE_SPEED = 1.25;

// Snap and total duration of a bite clip at playback speed.
export function biteTiming(clip) {
  const fps = clip.fps * BITE_SPEED;
  return { snapMs: (clip.snapFrame / fps) * 1000, durationMs: (clip.count / fps) * 1000 };
}

// Frame index to show `ms` into a clip: run clips loop, bite clips hold the
// last frame.
export function clipFrame(clip, ms, loop) {
  const fps = loop ? RUN_FPS : clip.fps * BITE_SPEED;
  const index = Math.floor((Math.max(0, ms) / 1000) * fps);
  return loop ? index % clip.count : Math.min(index, clip.count - 1);
}
