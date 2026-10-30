// Where to draw the side-view fox on the page so its open mouth lands on the
// camera box, and how small the box must shrink to fit inside that mouth.
// Pure geometry so it can be tested; all rects are page pixels and `box` is
// the camera box at full size (before it shrinks).
export const PLACEMENT = {
  mouthToBox: 0.65,      // mouth opening height as a fraction of the full box height
  maxViewportHeight: 1.1, // never draw the fox taller than this × the window height
  thrustReach: 0.12,     // extra forward push during the lunge, in box widths
  swallowScale: 0.35,    // preferred box size inside the mouth
  mouthFill: 0.7         // the shrunk box may fill at most this much of the mouth
};

function foxSize({ box, viewport, mouth, aspect }, p) {
  const fromBox = (box.h * p.mouthToBox) / (mouth[3] - mouth[1]);
  const h = Math.min(fromBox, viewport.h * p.maxViewportHeight);
  return { w: h * aspect, h };
}

// viewport: {w, h}. mouth: [x0, y0, x1, y1] fractions of the image. aspect:
// image width / height. foxIn: 0 off the right edge → 1 with the mouth
// centred on the box. foxCross: 0 there → 1 off the left edge.
export function foxRect({ box, viewport, mouth, aspect, foxIn, foxCross = 0, thrust = 0 }, p = PLACEMENT) {
  const { w, h } = foxSize({ box, viewport, mouth, aspect }, p);
  const mouthX = ((mouth[0] + mouth[2]) / 2) * w;
  const mouthY = ((mouth[1] + mouth[3]) / 2) * h;
  const attackX = box.x + box.w / 2 - mouthX - thrust * box.w * p.thrustReach;
  const offRight = viewport.w;
  const offLeft = -w;
  const x = foxCross > 0
    ? attackX + (offLeft - attackX) * foxCross
    : offRight + (attackX - offRight) * foxIn;
  return { x, y: box.y + box.h / 2 - mouthY, w, h };
}

// How small the camera box shrinks so it fits inside the mouth. When the fox
// is capped by a short window, its mouth is smaller, so the box shrinks more.
export function swallowScale({ box, viewport, mouth, aspect }, p = PLACEMENT) {
  const { w, h } = foxSize({ box, viewport, mouth, aspect }, p);
  const mouthW = (mouth[2] - mouth[0]) * w;
  const mouthH = (mouth[3] - mouth[1]) * h;
  return Math.min(p.swallowScale, (p.mouthFill * mouthW) / box.w, (p.mouthFill * mouthH) / box.h);
}
