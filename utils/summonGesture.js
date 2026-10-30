// Deterministic summon trigger: hold an open near-OK ring (thumb and index tips
// close but apart, other fingers raised) for a second to charge, then close the
// ring to fire once. Distances are divided by palm size so hand distance from the camera
// doesn't matter, and they don't depend on which hand or a mirrored view.
// Thresholds are starting proposals to tune against real camera trials.
// A natural near-OK ring measured about 0.23 palms in a live camera trial,
// so the charge band starts below that.
import { LANDMARK, distancePx, palmLength } from './landmarks.js';

export const SUMMON_DEFAULTS = {
  chargeMinGap: 0.15,   // ring must be at least this open to charge
  chargeMaxGap: 0.8,    // wider than this is an ordinary open hand
  closeGap: 0.1,        // tips this close count as touching
  rearmGap: 0.15,       // after a summon, reopen past this to re-arm
  chargeHoldMs: 1000,   // hold the open ring this long to go from charging to charged
  closeFrames: 2,       // consecutive closed frames needed to fire
  breakFrames: 3,       // consecutive broken-pose frames before the fire goes out
  lostGraceMs: 300      // tracking can drop out this long without losing the charge
};

const RAISED_FINGERS = [[10, 12], [14, 16], [18, 20]]; // [PIP, TIP] of middle, ring, pinky

export function measureHand(landmarks, width = 1, height = 1) {
  const palm = palmLength(landmarks, width, height);
  if (palm === 0) return null;
  const gap = distancePx(landmarks[LANDMARK.THUMB_TIP], landmarks[LANDMARK.INDEX_TIP], width, height) / palm;
  const wrist = landmarks[LANDMARK.WRIST];
  const othersRaised = RAISED_FINGERS.every(([pip, tip]) =>
    distancePx(wrist, landmarks[tip], width, height) > distancePx(wrist, landmarks[pip], width, height)
  );
  return { gap, othersRaised };
}

// States: idle → charging (fire lit, 1 s) → charged → summoned (held until
// the ring reopens or the hand is lost). 'locked' follows Escape until the
// ring pose is released. Events: 'charge', 'charged', 'fizzle', 'summon'.
export function createSummonGesture(options = {}) {
  const t = { ...SUMMON_DEFAULTS, ...options };
  let state = 'idle';
  let lastHand = null;
  let chargeStart = null;
  let lastNow = 0;
  let closedCount = 0;
  let brokenCount = 0;
  let lostSince = null;

  const isLit = () => state === 'charging' || state === 'charged';

  function toIdle() {
    state = 'idle';
    chargeStart = null;
    closedCount = 0;
    brokenCount = 0;
    lostSince = null;
  }

  function fizzle() {
    const wasLit = isLit();
    toIdle();
    return wasLit ? 'fizzle' : null;
  }

  function update(landmarks, now, width, height) {
    const hand = landmarks ? measureHand(landmarks, width, height) : null;
    lastHand = hand;
    lastNow = now;

    if (!hand) {
      // Tracking often drops a frame or two on a self-occluding ring; keep the
      // charge through a short dropout, and only let it go after the grace.
      if (isLit()) {
        lostSince ??= now;
        return now - lostSince >= t.lostGraceMs ? fizzle() : null;
      }
      return fizzle();
    }
    lostSince = null;

    if (state === 'summoned') {
      if (hand.gap > t.rearmGap) toIdle();
      return null;
    }

    const openRing = hand.othersRaised && hand.gap >= t.chargeMinGap && hand.gap <= t.chargeMaxGap;

    // After Escape, stay off until the ring pose is released, so holding it
    // doesn't immediately relight the fire.
    if (state === 'locked') {
      if (!openRing) toIdle();
      return null;
    }
    const closed = hand.othersRaised && hand.gap <= t.closeGap;
    // Between the close and charge thresholds the ring is wobbling or mid-close.
    const midClose = hand.othersRaised && hand.gap > t.closeGap && hand.gap < t.chargeMinGap;

    if (state === 'idle') {
      if (!openRing) return null;
      state = 'charging';
      chargeStart = now;
      return 'charge';
    }

    // Charging or charged: a pose break must last a few frames to count, so a
    // single bad landmark frame doesn't put the fire out.
    if (!openRing && !closed && !midClose) {
      brokenCount++;
      return brokenCount >= t.breakFrames ? fizzle() : null;
    }
    brokenCount = 0;

    if (state === 'charging') {
      // Closing before the charge completes wastes it; reopen to start again.
      if (closed) {
        closedCount++;
        return closedCount >= t.closeFrames ? fizzle() : null;
      }
      closedCount = 0;
      if (now - chargeStart >= t.chargeHoldMs) {
        state = 'charged';
        return 'charged';
      }
      return null;
    }

    // charged
    if (closed) {
      closedCount++;
      if (closedCount >= t.closeFrames) {
        state = 'summoned';
        chargeStart = null;
        closedCount = 0;
        return 'summon';
      }
      return null;
    }
    closedCount = 0;
    return null;
  }

  // reset() returns to idle; reset({ lock: true }) also ignores the ring until
  // the pose is released (used for Escape).
  function reset({ lock = false } = {}) {
    const event = fizzle();
    if (lock) state = 'locked';
    return event;
  }

  return {
    update,
    reset,
    get state() { return state; },
    // 0 → 1 while charging, 1 once charged, 0 otherwise.
    get chargeProgress() {
      if (state === 'charged') return 1;
      if (state !== 'charging') return 0;
      return Math.min(1, (lastNow - chargeStart) / t.chargeHoldMs);
    },
    // Latest { gap, othersRaised } measurement, or null with no hand.
    get measurement() { return lastHand; }
  };
}
