// Shared hand-landmark helpers. MediaPipe Hands returns 21 normalized
// {x, y, z} points; multiply by the frame size to measure in pixels so the
// 4:3 frame doesn't skew distances.
export const LANDMARK = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9
};

export function distancePx(a, b, width = 1, height = 1) {
  return Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
}

// Wrist to middle knuckle: a stable measure of how big the hand appears.
export function palmLength(landmarks, width = 1, height = 1) {
  return distancePx(landmarks[LANDMARK.WRIST], landmarks[LANDMARK.MIDDLE_MCP], width, height);
}
