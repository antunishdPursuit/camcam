// Guards against phantom hands the model finds in the background. Ignore tiny
// and low-confidence detections, require a new hand to persist a few frames
// before using it, and once a hand is confirmed stay with it: follow the
// detection nearest where it was, and let it vanish briefly (the ring pose
// self-occludes) without handing over to whatever else is in the frame.
// Thresholds are starting proposals to tune against real camera trials.
import { LANDMARK, distancePx, palmLength } from './landmarks.js';

export const HAND_FILTER_DEFAULTS = {
  minPalmFraction: 0.06, // palm length (wrist to middle knuckle) / frame height
  minScore: 0.8,         // MediaPipe handedness score; drop shakier detections
  confirmFrames: 3,
  dropoutMs: 500,        // a confirmed hand may vanish this long and come straight back
  maxJumpPalms: 2        // a detection further than this from the tracked wrist is another hand
};

export function pickLargestHand(hands, width, height, minPalmFraction) {
  let best = null;
  let bestPalm = minPalmFraction * height;
  for (const landmarks of hands ?? []) {
    const palm = palmLength(landmarks, width, height);
    if (palm >= bestPalm) {
      best = landmarks;
      bestPalm = palm;
    }
  }
  return best;
}

// The detection whose wrist is nearest the tracked wrist, if close enough to
// be the same hand. tracked: { wrist, palm } with palm in pixels.
export function pickNearestHand(hands, width, height, minPalmFraction, tracked, maxJumpPalms) {
  let best = null;
  let bestDistance = maxJumpPalms * tracked.palm;
  for (const landmarks of hands ?? []) {
    if (palmLength(landmarks, width, height) < minPalmFraction * height) continue;
    const distance = distancePx(landmarks[LANDMARK.WRIST], tracked.wrist, width, height);
    if (distance <= bestDistance) {
      best = landmarks;
      bestDistance = distance;
    }
  }
  return best;
}

export function createHandFilter(options = {}) {
  const t = { ...HAND_FILTER_DEFAULTS, ...options };
  let seenFrames = 0;
  let tracked = null; // { wrist, palm, at } of the hand last used or being confirmed

  function reset() {
    seenFrames = 0;
    tracked = null;
  }

  // scores: MediaPipe's per-hand handedness scores, in the same order as hands.
  function update(hands, width, height, now = performance.now(), scores = null) {
    if (tracked && now - tracked.at > t.dropoutMs) reset();
    const candidates = (hands ?? []).filter((_, i) => (scores?.[i] ?? 1) >= t.minScore);
    let hand = tracked ? pickNearestHand(candidates, width, height, t.minPalmFraction, tracked, t.maxJumpPalms) : null;
    if (!hand && seenFrames < t.confirmFrames) {
      // Nothing confirmed to hold on to: (re)start on the largest hand, the
      // participant's being nearest the lens.
      seenFrames = 0;
      hand = pickLargestHand(candidates, width, height, t.minPalmFraction);
    }
    if (!hand) {
      // A confirmed hand keeps its place through a short dropout; an
      // unconfirmed (possibly phantom) one gets no such grace.
      if (seenFrames < t.confirmFrames) tracked = null;
      return null;
    }
    seenFrames = Math.min(seenFrames + 1, t.confirmFrames);
    tracked = { wrist: hand[LANDMARK.WRIST], palm: palmLength(hand, width, height), at: now };
    return seenFrames >= t.confirmFrames ? hand : null;
  }

  return { update, reset };
}
