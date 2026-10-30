# camcam

Browser hand-tracking camera experience. MediaPipe Hands tracks your hand in the page; make the summon gesture and a fox answers.

## How to use it

1. Choose Start Camera and allow camera access.
2. Hold a near-OK ring: thumb and index fingertips close but not touching, other three fingers up. Fire lights on your hand and the label reads **Charging**.
3. After one second it reads **Charged**.
4. Close the ring (fingertips together). The fox appears, lunges, and its jaws close over the camera view, then the view resets.

Closing before **Charged** wastes the charge; open the ring to start again. Escape cancels a charge or the effect; Stop turns the camera off at any time. With reduced motion enabled in your system settings, the effect is gentler.

The fox, jaw and flame artwork in `assets/summon/` was generated locally; the effect falls back to simple drawn shapes if it fails to load.

## Run locally

Requires Node 20 or newer. No install step.

```bash
npm start
```

Open http://localhost:5173. Browsers only allow camera access over HTTPS or localhost.

For tuning, http://localhost:5173/?proof adds a Test Summon button and a live readout of the ring gap against the gesture thresholds. Add `&at=1500` to freeze the effect at that millisecond.

## Test

```bash
npm test
```

## Code layout

- `main.js` wires the page together.
- `utils/camera.js` and `utils/cameraController.js` handle the camera and the start/stop lifecycle.
- `utils/handSelection.js` filters out phantom background hands.
- `utils/summonGesture.js` is the charge/summon state machine.
- `utils/summonTimeline.js` (timing) and `utils/summonEffect.js` (drawing) make up the fire and fox effect.
- `utils/landmarks.js` holds shared hand-landmark math.

## Privacy

Camera frames are processed in the browser and are never uploaded or recorded. The page still downloads the MediaPipe model and scripts from jsDelivr (pinned versions), so it needs a network connection on first load.
