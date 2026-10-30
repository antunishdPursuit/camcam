// Guards against phantom hands the model finds in the background. Keep the
// largest detected hand (the participant's is nearest the lens), ignore tiny
// detections, and require a new hand to persist a few frames before using it.
// Thresholds are starting proposals to tune against real camera trials.
import { palmLength } from './landmarks.js';

export const HAND_FILTER_DEFAULTS = {
  minPalmFraction: 0.06, // palm length (wrist to middle knuckle) / frame height
  confirmFrames: 3,
  dropoutFrames: 4       // missing frames a confirmed hand may skip and stay confirmed
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

export function createHandFilter(options = {}) {
  const t = { ...HAND_FILTER_DEFAULTS, ...options };
  let seenFrames = 0;
  let missingFrames = 0;

  function update(hands, width, height) {
    const hand = pickLargestHand(hands, width, height, t.minPalmFraction);
    if (!hand) {
      // A confirmed hand stays confirmed through a short dropout, so it comes
      // back at once instead of re-confirming.
      // An unconfirmed (possibly phantom) hand gets no such grace.
      missingFrames++;
      if (seenFrames < t.confirmFrames || missingFrames > t.dropoutFrames) seenFrames = 0;
      return null;
    }
    missingFrames = 0;
    seenFrames = Math.min(seenFrames + 1, t.confirmFrames);
    return seenFrames >= t.confirmFrames ? hand : null;
  }

  function reset() {
    seenFrames = 0;
    missingFrames = 0;
  }

  return { update, reset };
}
