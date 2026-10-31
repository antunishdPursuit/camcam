// Where to draw the full-body fox sprite on the page, and how small the camera
// must shrink to fit between its jaws. Pure geometry so it can be tested; all
// values are page pixels and `box` is the camera box at full size.
export const PLACEMENT = {
  foxToBox: 1.25,          // fox sprite height as a multiple of the full box height
  maxViewportHeight: 0.8,  // never draw the fox taller than this × the window height
  swallowScale: 0.35,      // largest camera size inside the mouth
  mouthFill: 0.9,          // the shrunk camera may fill at most this much of the jaw gape
  fleeWidth: 0.45          // the camera flees at most this × its width to the left
};

// Size of the drawn sprite frame. frame: {w, h} of the source video frame the
// clips were cut from (only its proportions matter).
export function foxSize({ box, viewport, frame }, p = PLACEMENT) {
  const h = Math.min(box.h * p.foxToBox, viewport.h * p.maxViewportHeight);
  return { w: h * (frame.w / frame.h), h };
}

// The sprite rect that puts the clip's mouth point (fractions of the frame) on
// `anchor`.
export function foxRectAt({ anchor, size, mouth }) {
  return { x: anchor.x - mouth[0] * size.w, y: anchor.y - mouth[1] * size.h, w: size.w, h: size.h };
}

// Where the jaws are along the page. Before the snap they trail the camera by
// foxGap (1 = the whole fox still off the right edge, 0 = on the camera);
// after it they carry on from the catch point, foxCross 0 → 1 = off the left
// edge.
export function jawsX({ camX, caughtX, foxGap, foxCross, viewport, size, mouth }) {
  if (foxCross > 0) return caughtX - foxCross * (caughtX + (1 - mouth[0]) * size.w);
  return camX + foxGap * (viewport.w + mouth[0] * size.w - camX);
}

// How far left the camera can flee without leaving the window.
export function fleeDistance({ box, scale }, p = PLACEMENT) {
  const room = box.x + box.w / 2 - (box.w * scale) / 2 - 16;
  return Math.max(0, Math.min(box.w * p.fleeWidth, room));
}

// gape: fraction of the frame height spanned by the open jaws just before the
// bite. The camera shrinks until its height fits between them; in side view
// the jaws are narrow, so its sides stick out like something held in the mouth.
// A clip without a gape gets the largest size rather than NaN.
export function swallowScale({ box, viewport, gape }, p = PLACEMENT) {
  if (!Number.isFinite(gape)) return p.swallowScale;
  const { h } = foxSize({ box, viewport, frame: { w: 1, h: 1 } }, p);
  return Math.min(p.swallowScale, (p.mouthFill * gape * h) / box.h);
}
