// Where to draw the side-view fox on the page so its open mouth lands on the
// camera box. Pure geometry so it can be tested; all rects are page pixels and
// `box` is the camera box at full size (before it shrinks).
export const PLACEMENT = {
  mouthToBox: 0.65,   // mouth opening height as a fraction of the full box height
  thrustReach: 0.12   // extra forward push during the lunge, in box widths
};

// viewport: {w, h}. mouth: [x0, y0, x1, y1] fractions of the image. aspect:
// image width / height. foxIn: 0 off the right edge → 1 with the mouth
// centred on the box. foxCross: 0 there → 1 off the left edge.
export function foxRect({ box, viewport, mouth, aspect, foxIn, foxCross = 0, thrust = 0 }, p = PLACEMENT) {
  const h = (box.h * p.mouthToBox) / (mouth[3] - mouth[1]);
  const w = h * aspect;
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
