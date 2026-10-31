# camcam

Browser hand-tracking camera experience. MediaPipe Hands tracks your hand in the page; make the summon gesture and a fox answers.

## How to use it

1. Choose Start Camera and allow camera access.
2. Hold a near-OK ring: thumb and index fingertips close but not touching, other three fingers up. Small flames lick along your fingers, starting at the fingertips and creeping down as the charge builds, and the label reads **Charging**.
3. After one second it reads **Charged**.
4. Close the ring (fingertips together). A fox eye opens in the ring, and a moment later a fox gallops in from the right edge of the page on fire-bursting paws while the camera view shrinks and runs; the fox catches it on the move and the camera view is pulled into its mouth as its jaws close; then it runs off across the page with its mouth shut. After a moment the camera view comes back.

The camera view is mirrored, like looking in a mirror. Closing before **Charged** wastes the charge; open the ring to start again. Escape cancels a charge or the effect; Stop turns the camera off at any time. With reduced motion enabled in your system settings, the fox fades in and out in place instead of crossing the page.

## Artwork

The fox and flame artwork lives in `assets/summon/` and is **not committed**: it was generated locally and is kept out of the repository. In a fresh clone the app still works, but without the fox; the fire falls back to simple drawn flames and the camera view still shrinks, vanishes and returns. To use the artwork, place these files in `assets/summon/`:

- `flame-c.webp`, `flame-d.webp`: flame sprites with brightness-based transparency
- `sprites/*.webp`: the full-body fox's run loops and bite clips, each a grid sprite sheet with a transparent background
- `sprites/sprites.json`: describes the clips. `video` is the source frame size; each clip has `sheet`, `frameW`/`frameH`, `cols`, `count`, `fps`, `sourceCrop` (its position in the source frame) and `fox` (which fox it shows; a summon pairs a run and a bite of the same fox). Bite clips also have `snapFrame` (when the jaws shut), `mouth` (where they meet, as fractions of the source frame) and `gape` (open-jaw height as a fraction of the frame). Every clip also lists, per frame, `mouths` (the mouth point, where the swallowed camera is held) and `feet` (the paws touching down, where the spirit fire bursts), both as fractions of the source frame. Without them the camera stays at the snap point and the paws don't burn.

Each summon picks a random bite clip and a run loop of the same fox. An optional `carry` list holds closed-mouth run loops (same fields as `run`) used after the bite; without it the fox runs off on its ordinary run loop.

## Run locally

Requires Node 20 or newer. No install step.

```bash
npm start
```

Open http://localhost:5173. Browsers only allow camera access over HTTPS or localhost.

### Developer mode

Add `?proof` to the address (http://localhost:5173/?proof) for tuning tools that stay hidden otherwise:

- **Test Summon** plays the fox attack without making the gesture (works with the camera off).
- A live readout shows the thumb-to-index ring gap in palm lengths against the charge and close thresholds, whether the other fingers count as raised, and the gesture state.
- `?proof&at=1500` freezes the attack at that millisecond, to inspect a single frame.

The thresholds live in `SUMMON_DEFAULTS` in `utils/summonGesture.js`; fox size and fit in `PLACEMENT` in `utils/foxPlacement.js`.

## Test

```bash
npm test
```

## Code layout

- `main.js` wires the page together.
- `utils/camera.js` and `utils/cameraController.js` handle the camera and the start/stop lifecycle.
- `utils/handSelection.js` filters out phantom background hands.
- `utils/summonGesture.js` is the charge/summon state machine.
- `utils/summonTimeline.js` (timing and clip playback, including the eye), `utils/handFire.js` (where the finger flames and the eye go), `utils/foxPlacement.js` (where the fox goes and how far the camera view shrinks) and `utils/summonEffect.js` (drawing; picks the clips) make up the fire and fox effect; `utils/summonArt.js` loads the artwork.
- `utils/landmarks.js` holds shared hand-landmark math.

## Privacy

Camera frames are processed in the browser and are never uploaded or recorded. The page asks for video only, never the microphone. It downloads the MediaPipe model and scripts from jsDelivr (pinned versions) and the page font from Google Fonts, so it needs a network connection on first load; no other requests are made while the camera runs.
