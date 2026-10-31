// Pure timeline for the fox attack: given elapsed ms, the chosen bite clip and
// the attack style, says where every part is and which sprite frame to show.
//
// Both styles open the same way: the camera senses danger and shrinks fast,
// before the fox appears, so the fox never runs into a full-size camera. The
// fox never stops moving: it comes in from the right, its jaws close on the
// camera (which is pulled into its mouth and gone at the snap), and it carries
// straight on out the left edge with its mouth shut. After a pause the camera
// grows back in place.
// - 'chase': the camera flees left in a straight line at a steady pace and the
//   fox runs it down from behind; the bite lands on the move.
// - 'snatch': the camera stays put, trembling, and the fox lunges straight in
//   and snatches it.
// Phases: run-in → bite → cross → gone → return.

export const ATTACKS = ['chase', 'snatch'];

// bite: { snapMs, durationMs } of the chosen bite clip at playback speed.
export const DEFAULT_BITE = { snapMs: 700, durationMs: 1300 };

const SHRINK_MS = 250;     // the camera shrinks this fast at the start
const SWALLOW_MS = 260;    // pulled into the closing jaws over this long, ending at the snap
const GONE_MS = 600;
const RETURN_MS = 600;

const STYLE = {
  // run-in: ms of running before the bite clip starts; cross: ms from the snap
  // until the fox is off the left edge; flee: the camera runs (chase) or not.
  chase: { runIn: 1300, cross: 1100, flee: true, closing: 1.5 },
  snatch: { runIn: 500, cross: 900, flee: false, closing: 2 }
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const progress = (t, start, end) => clamp01((t - start) / (end - start));
const easeIn = (p) => p * p * p;
const easeOut = (p) => 1 - (1 - p) ** 3;
const easeInOut = (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

function fullTimes(bite, style) {
  const S = STYLE[style];
  const biteStart = S.runIn;
  const snap = biteStart + bite.snapMs;
  const crossEnd = snap + S.cross;
  const returnStart = crossEnd + GONE_MS;
  return { biteStart, snap, biteEnd: biteStart + bite.durationMs, crossEnd, returnStart, end: returnStart + RETURN_MS };
}

const REDUCED = {
  shrinkEnd: 300, fadeInStart: 300, fadeInEnd: 900, snap: 1300,
  fadeOutStart: 2200, fadeOutEnd: 2700, returnStart: 3000, end: 3700
};

export function effectDuration(reducedMotion, bite = DEFAULT_BITE, style = 'chase') {
  return reducedMotion ? REDUCED.end : fullTimes(bite, style).end;
}

// sprite: 'run' (running in), 'bite', or 'carry' (running off with its mouth
// shut); spriteMs: time into that clip.
// foxGap: before the snap, how far the fox's jaws are behind the camera:
//   1 = fox entirely off the right edge, 0 = jaws on the camera.
// foxCross: after the snap, 0 = at the catch point, 1 = off the left edge.
// foxAlpha: the fox's opacity (reduced motion fades it in and out).
// camTravel: how far the camera has fled, 0 = its own spot, 1 = where it is
//   caught (chase only; it keeps running until the snap).
// caughtTravel: camTravel at the snap (1 for chase, 0 otherwise), so the
//   renderer knows the catch point from the start.
// tremble: the camera shivers in place (snatch).
// boxShrink: 0 = camera at full size, 1 = shrunk to fit the jaws.
// boxOnPage: the camera is drawn on the page layer (on top of the fox) instead
//   of in its own box, from the start until it is swallowed.
// boxHeld: the jaws have it and are pulling it into the mouth.
// gulp: 0 = full shrunk size, 1 = swallowed (exactly at the snap).
// boxAlpha: visibility of the camera box in the page layout (hidden while the
//   page layer draws it, fading back in on return).
// shake / streaks: the impact at the snap.
export function effectFrame(t, reducedMotion = false, bite = DEFAULT_BITE, style = 'chase') {
  return reducedMotion ? reducedFrame(t, bite) : fullFrame(t, bite, STYLE[style] ? style : 'chase');
}

function boxState(t, { shrinkEnd, snap, returnStart, end }) {
  if (t < returnStart) {
    return {
      boxShrink: easeInOut(progress(t, 0, shrinkEnd)),
      boxOnPage: true,
      boxHeld: t >= snap - SWALLOW_MS,
      gulp: easeIn(progress(t, snap - SWALLOW_MS, snap)),
      boxAlpha: 0
    };
  }
  const p = easeOut(progress(t, returnStart, end));
  return { boxShrink: 1 - p, boxOnPage: false, boxHeld: false, gulp: 0, boxAlpha: p };
}

function fullFrame(t, bite, style) {
  const S = STYLE[style];
  const T = fullTimes(bite, style);
  const frame = {
    phase: 'run-in', sprite: 'run', spriteMs: t,
    foxGap: (1 - progress(t, 0, T.snap)) ** S.closing,
    foxCross: easeIn(progress(t, T.snap, T.crossEnd)),
    foxAlpha: 1,
    camTravel: S.flee ? progress(t, SHRINK_MS * 0.6, T.snap) : 0,
    caughtTravel: S.flee ? 1 : 0,
    tremble: !S.flee && t > SHRINK_MS && t < T.snap - SWALLOW_MS ? 1 : 0,
    shake: 0, streaks: 0, done: t >= T.end,
    ...boxState(t, { shrinkEnd: SHRINK_MS, snap: T.snap, returnStart: T.returnStart, end: T.end })
  };

  if (t >= T.biteStart && t < T.biteEnd) {
    frame.sprite = 'bite';
    frame.spriteMs = t - T.biteStart;
  } else if (t >= T.biteEnd) {
    frame.sprite = 'carry';
    frame.spriteMs = t - T.biteEnd;
  }
  if (t >= T.biteStart) frame.phase = t < T.snap ? 'bite' : t < T.crossEnd ? 'cross' : t < T.returnStart ? 'gone' : 'return';

  if (t >= T.snap && t < T.snap + 300) {
    frame.shake = 1 - progress(t, T.snap, T.snap + 300);
    frame.streaks = frame.shake;
  }
  return frame;
}

// Reduced motion: no running, fleeing, trembling, shake or streaks. The camera
// shrinks first, then the fox fades in already in place on the first bite
// frame, the camera is pulled into the mouth as the jaws cut once to the snap
// frame, the fox fades out, and the camera grows back.
function reducedFrame(t, bite) {
  const T = REDUCED;
  const frame = {
    phase: 'run-in', sprite: 'bite', spriteMs: t < T.snap ? 0 : bite.snapMs,
    foxGap: 0, foxCross: 0, foxAlpha: 0, camTravel: 0, caughtTravel: 0, tremble: 0,
    shake: 0, streaks: 0, done: t >= T.end,
    ...boxState(t, { shrinkEnd: T.shrinkEnd, snap: T.snap, returnStart: T.returnStart, end: T.end })
  };

  if (t < T.fadeInEnd) {
    frame.foxAlpha = progress(t, T.fadeInStart, T.fadeInEnd);
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
