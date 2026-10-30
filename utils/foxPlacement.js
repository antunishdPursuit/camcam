// Where to draw the full-body fox sprite on the page so its mouth lands on the
// camera box at the moment of the bite, and how small the box must shrink to
// fit between its jaws. Pure geometry so it can be tested; all rects are page
// pixels and `box` is the camera box at full size (before it shrinks).
export const PLACEMENT = {
  foxToBox: 1.25,          // fox sprite height as a multiple of the full box height
  maxViewportHeight: 0.8,  // never draw the fox taller than this × the window height
  swallowScale: 0.35,      // largest box size inside the mouth
  mouthFill: 0.9           // the shrunk box may fill at most this much of the jaw gape
};

// frame: {w, h} of one sprite frame in its sheet (any units, only the ratio
// matters). Returns the drawn sprite height in page pixels.
function spriteHeight({ box, viewport }, p) {
  return Math.min(box.h * p.foxToBox, viewport.h * p.maxViewportHeight);
}

// mouth: [x, y] fraction of the frame where the jaws meet at the bite.
// foxIn: 0 off the right edge → 1 with that mouth point on the box centre.
// foxCross: 0 there → 1 off the left edge.
export function foxRect({ box, viewport, frame, mouth, foxIn, foxCross = 0 }, p = PLACEMENT) {
  const h = spriteHeight({ box, viewport }, p);
  const w = h * (frame.w / frame.h);
  const attackX = box.x + box.w / 2 - mouth[0] * w;
  const offRight = viewport.w;
  const offLeft = -w;
  const x = foxCross > 0
    ? attackX + (offLeft - attackX) * foxCross
    : offRight + (attackX - offRight) * foxIn;
  return { x, y: box.y + box.h / 2 - mouth[1] * h, w, h };
}

// gape: fraction of the frame height spanned by the open jaws just before the
// bite. The box shrinks until its height fits between them; in side view the
// jaws are narrow, so the box's sides stick out like something held in the
// mouth rather than shrinking to fit the width too.
export function swallowScale({ box, viewport, gape }, p = PLACEMENT) {
  const h = spriteHeight({ box, viewport }, p);
  return Math.min(p.swallowScale, (p.mouthFill * gape * h) / box.h);
}
