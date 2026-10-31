// Pure timeline for the fox attack: given elapsed ms and the chosen bite clip,
// says where every part is and which sprite frame to show.
//
// The camera senses danger: after a brief beat at full size it shrinks
// smoothly, and the fox only comes into reach once it is small. The camera
// then flees left in a straight line at a steady pace and the fox runs it down
// from behind, never stopping: its jaws close on the camera (which is pulled
// into its mouth and gone at the snap), and it carries straight on out the
// left edge with its mouth shut. After a pause the camera grows back in place.
// Phases: run-in → bite → cross → gone → return.

// bite: { snapMs, durationMs } of the chosen bite clip at playback speed.
export const DEFAULT_BITE = { snapMs: 700, durationMs: 1300 };

const SHRINK_START = 150;  // a beat at full size before the camera reacts
const SHRINK_END = 950;    // then it eases down to its small size over 800 ms
const FOX_START = 500;     // the fox enters from the right edge
const RUN_IN = 1700;       // ms of running before the bite clip starts
const CROSS_MS = 1100;     // from the snap until the fox is off the left edge
const CLOSING = 1.5;       // how sharply the fox closes the gap near the end
const SWALLOW_MS = 260;    // pulled into the closing jaws over this long, ending at the snap
const GONE_MS = 600;
const RETURN_MS = 600;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const progress = (t, start, end) => clamp01((t - start) / (end - start));
const easeIn = (p) => p * p * p;
const easeOut = (p) => 1 - (1 - p) ** 3;
const easeInOutSine = (p) => (1 - Math.cos(Math.PI * p)) / 2;

function fullTimes(bite) {
  const snap = RUN_IN + bite.snapMs;
  const crossEnd = snap + CROSS_MS;
  const returnStart = crossEnd + GONE_MS;
  return { biteStart: RUN_IN, snap, biteEnd: RUN_IN + bite.durationMs, crossEnd, returnStart, end: returnStart + RETURN_MS };
}

const REDUCED = {
  shrinkEnd: 300, fadeInStart: 300, fadeInEnd: 900, snap: 1300,
  fadeOutStart: 2200, fadeOutEnd: 2700, returnStart: 3000, end: 3700
};

export function effectDuration(reducedMotion, bite = DEFAULT_BITE) {
  return reducedMotion ? REDUCED.end : fullTimes(bite).end;
}

// sprite: 'run' (running in), 'bite', or 'carry' (running off with its mouth
// shut); spriteMs: time into that clip.
// foxGap: before the snap, how far the fox's jaws are behind the camera:
//   1 = fox entirely off the right edge, 0 = jaws on the camera.
// foxCross: after the snap, 0 = at the catch point, 1 = off the left edge.
// foxAlpha: the fox's opacity (reduced motion fades it in and out).
// camTravel: how far the camera has fled, 0 = its own spot, 1 = where it is
//   caught (it keeps running until the snap).
// caughtTravel: camTravel at the snap (1, or 0 in reduced motion), so the
//   renderer knows the catch point from the start.
// boxShrink: 0 = camera at full size, 1 = shrunk to fit the jaws.
// boxOnPage: the camera is drawn on the page layer (on top of the fox) instead
//   of in its own box, from the start until it is swallowed.
// boxHeld: the jaws have it and are pulling it into the mouth.
// gulp: 0 = full shrunk size, 1 = swallowed (exactly at the snap).
// boxAlpha: visibility of the camera box in the page layout (hidden while the
//   page layer draws it, fading back in on return).
// shake / streaks: the impact at the snap.
export function effectFrame(t, reducedMotion = false, bite = DEFAULT_BITE) {
  return reducedMotion ? reducedFrame(t, bite) : fullFrame(t, bite);
}

function boxState(t, { shrinkStart, shrinkEnd, snap, returnStart, end }) {
  if (t < returnStart) {
    return {
      boxShrink: easeInOutSine(progress(t, shrinkStart, shrinkEnd)),
      boxOnPage: true,
      boxHeld: t >= snap - SWALLOW_MS,
      gulp: easeIn(progress(t, snap - SWALLOW_MS, snap)),
      boxAlpha: 0
    };
  }
  const p = easeOut(progress(t, returnStart, end));
  return { boxShrink: 1 - p, boxOnPage: false, boxHeld: false, gulp: 0, boxAlpha: p };
}

function fullFrame(t, bite) {
  const T = fullTimes(bite);
  const frame = {
    phase: 'run-in', sprite: 'run', spriteMs: t,
    foxGap: (1 - progress(t, FOX_START, T.snap)) ** CLOSING,
    foxCross: easeIn(progress(t, T.snap, T.crossEnd)),
    foxAlpha: 1,
    camTravel: progress(t, SHRINK_START + (SHRINK_END - SHRINK_START) * 0.6, T.snap),
    caughtTravel: 1,
    shake: 0, streaks: 0, done: t >= T.end,
    ...boxState(t, { shrinkStart: SHRINK_START, shrinkEnd: SHRINK_END, snap: T.snap, returnStart: T.returnStart, end: T.end })
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

// Reduced motion: no running, fleeing, shake or streaks. The camera shrinks
// first, then the fox fades in already in place on the first bite frame, the
// camera is pulled into the mouth as the jaws cut once to the snap frame, the
// fox fades out, and the camera grows back.
function reducedFrame(t, bite) {
  const T = REDUCED;
  const frame = {
    phase: 'run-in', sprite: 'bite', spriteMs: t < T.snap ? 0 : bite.snapMs,
    foxGap: 0, foxCross: 0, foxAlpha: 0, camTravel: 0, caughtTravel: 0,
    shake: 0, streaks: 0, done: t >= T.end,
    ...boxState(t, { shrinkStart: 0, shrinkEnd: T.shrinkEnd, snap: T.snap, returnStart: T.returnStart, end: T.end })
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

// The eye that opens in the closed ring when the summon fires. The attack
// timeline above starts EYE_MS later; the eye fades as the camera shrinks.
export const EYE_MS = 450;   // short, so the close reads as an instant reaction
const EYE_OPEN_MS = 250;
const EYE_FADE_MS = 500;

// ms: time since the summon. open: 0 = lids shut, 1 = wide open. alpha: its
// opacity. slit: pupil width, narrowing from 1 to 0.5 as it focuses.
// Reduced motion: the eye fades in already open, with a fixed pupil.
export function eyeState(ms, reducedMotion = false) {
  const fade = 1 - progress(ms, EYE_MS, EYE_MS + EYE_FADE_MS);
  if (reducedMotion) return { open: 1, alpha: progress(ms, 0, EYE_OPEN_MS) * fade, slit: 0.5 };
  return {
    open: easeOut(progress(ms, 0, EYE_OPEN_MS)),
    alpha: fade,
    slit: 1 - 0.5 * easeInOutSine(progress(ms, EYE_OPEN_MS, EYE_MS))
  };
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
