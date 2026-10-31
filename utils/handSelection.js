// Guards against phantom hands the model finds in the background. Ignore tiny
// and low-confidence detections, require a new hand to persist a few frames
// before using it, and once a hand is confirmed stay with it: follow the
// detection nearest where it was, and let it vanish briefly (the ring pose
// self-occludes). Another hand takes over only by holding up for a few frames
// while clearly bigger, or, while the tracked one is missing, about as big and
// turning up somewhere new (hands already in view beside it are bystanders).
// Thresholds are starting proposals to tune against real camera trials.
import { LANDMARK, distancePx, palmLength } from './landmarks.js';

export const HAND_FILTER_DEFAULTS = {
  minPalmFraction: 0.06, // palm length (wrist to middle knuckle) / frame height
  minScore: 0.8,         // MediaPipe handedness score; drop shakier detections
  confirmFrames: 3,
  dropoutMs: 500,        // a confirmed hand may vanish this long and come straight back
  maxJumpPalms: 2,       // a detection further than this from the tracked wrist is another hand
  takeoverRatio: 1.25,   // another hand this much bigger than the tracked one takes over...
  reappearRatio: 0.8     // ...or, while the tracked hand is missing, one about its size
                         // that wasn't already in view beside it; either only after
                         // holding up for confirmFrames
};

// A bystander unseen for this many frames is forgotten.
const BYSTANDER_MISSES = 2;

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
  let tracked = null;      // { wrist, palm } of the hand last used or being confirmed
  let missingSince = null; // when the confirmed hand was first missed
  let challenger = null;   // { wrist, palm, frames } of another hand bidding to take over
  let bystanders = [];     // { wrist, palm, missed } of other hands seen beside the tracked one

  function reset() {
    seenFrames = 0;
    tracked = null;
    missingSince = null;
    challenger = null;
    bystanders = [];
  }

  const describe = (hand, width, height) => ({ wrist: hand[LANDMARK.WRIST], palm: palmLength(hand, width, height) });

  // A different hand takes over only if it keeps qualifying, in the same
  // place, for confirmFrames in a row: a passing phantom can't steal the slot,
  // but the real hand isn't shut out by whatever was confirmed first.
  // candidates excludes the tracked hand's bystanders while it is missing.
  function takeover(candidates, near, width, height) {
    const other = pickLargestHand(candidates.filter((c) => c !== near), width, height, t.minPalmFraction);
    const bar = near ? t.takeoverRatio * palmLength(near, width, height) : t.reappearRatio * tracked.palm;
    if (!other || palmLength(other, width, height) < bar) {
      challenger = null;
      return null;
    }
    const same = challenger && pickNearestHand([other], width, height, t.minPalmFraction, challenger, t.maxJumpPalms);
    challenger = { ...describe(other, width, height), frames: same ? challenger.frames + 1 : 1 };
    if (challenger.frames < t.confirmFrames) return null;
    challenger = null;
    return other;
  }

  // While the tracked hand is missing, hands that were already in view beside
  // it (a phantom in the background, the other hand) can't take its place:
  // only one turning up somewhere new can, as the tracked hand does when it
  // jumps. Bystanders are followed as they move, matched nearest pair first so
  // the list order can't swap them with the returning hand, and forgotten
  // after BYSTANDER_MISSES frames unseen so the spot they left isn't blocked.
  function skipBystanders(candidates, width, height) {
    const pairs = [];
    candidates.forEach((c, ci) => bystanders.forEach((b, bi) => {
      const d = distancePx(c[LANDMARK.WRIST], b.wrist, width, height);
      if (d <= t.maxJumpPalms * b.palm) pairs.push({ ci, bi, d });
    }));
    pairs.sort((a, b) => a.d - b.d);
    const matched = new Map(); // bystander index → candidate index
    const taken = new Set();
    for (const { ci, bi } of pairs) {
      if (matched.has(bi) || taken.has(ci)) continue;
      matched.set(bi, ci);
      taken.add(ci);
    }
    bystanders = bystanders.flatMap((b, bi) => {
      if (matched.has(bi)) return [{ ...describe(candidates[matched.get(bi)], width, height), missed: 0 }];
      return b.missed + 1 < BYSTANDER_MISSES ? [{ ...b, missed: b.missed + 1 }] : [];
    });
    return candidates.filter((_, ci) => !taken.has(ci));
  }

  // scores: MediaPipe's per-hand handedness scores, in the same order as hands.
  function update(hands, width, height, now = performance.now(), scores = null) {
    if (missingSince !== null && now - missingSince > t.dropoutMs) reset();
    const candidates = (hands ?? []).filter((_, i) => (scores?.[i] ?? 1) >= t.minScore);
    const confirmed = seenFrames >= t.confirmFrames;
    const near = tracked ? pickNearestHand(candidates, width, height, t.minPalmFraction, tracked, t.maxJumpPalms) : null;
    let hand = near;
    if (confirmed) {
      hand = takeover(near ? candidates : skipBystanders(candidates, width, height), near, width, height) ?? near;
    } else if (!near) {
      // Nothing confirmed to hold on to: (re)start on the largest hand, the
      // participant's being nearest the lens.
      seenFrames = 0;
      hand = pickLargestHand(candidates, width, height, t.minPalmFraction);
    }
    if (!hand) {
      // A confirmed hand keeps its place through a short dropout; an
      // unconfirmed (possibly phantom) one gets no such grace.
      if (confirmed) missingSince ??= now;
      else tracked = null;
      return null;
    }
    missingSince = null;
    if (hand === near) {
      bystanders = candidates.filter((c) => c !== near).map((c) => ({ ...describe(c, width, height), missed: 0 }));
    }
    seenFrames = Math.min(seenFrames + 1, t.confirmFrames);
    tracked = describe(hand, width, height);
    return seenFrames >= t.confirmFrames ? hand : null;
  }

  return { update, reset };
}
