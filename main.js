import { drawHand, drawVideoFrame } from './utils/drawUtils.js';
import { openCamera } from './utils/camera.js';
import { createCameraController, namedError } from './utils/cameraController.js';
import { createSummonGesture, measureHand, SUMMON_DEFAULTS } from './utils/summonGesture.js';
import { createHandFilter } from './utils/handSelection.js';
import { createSummonEffect } from './utils/summonEffect.js';
import { loadSummonArt } from './utils/summonArt.js';

const MEDIAPIPE_HANDS_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240';

const video = document.getElementById('input_video');
const canvas = document.getElementById('output_canvas');
const ctx = canvas.getContext('2d');
const gestureDisplay = document.querySelector('#gesture span');
const statusDisplay = document.getElementById('status');
const startButton = document.getElementById('startCameraBtn');
const stopButton = document.getElementById('stopCameraBtn');
const proofReadout = document.getElementById('proofReadout');

let hands = null;
const summon = createSummonGesture();
const handFilter = createHandFilter();
const SUMMON_LABELS = { charging: 'Charging', charged: 'Charged', summoned: 'Summoned', locked: 'Cancelled, release your hand' };

// Fire and summon effect. ?proof in the URL adds the test button, tuning
// readout and ?at= freeze frames.
const params = new URLSearchParams(location.search);
const proofMode = params.has('proof');
const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const summonArt = loadSummonArt();
const effect = createSummonEffect({
  boxCanvas: document.getElementById('effect_canvas'),
  pageCanvas: document.getElementById('summon_overlay'),
  camera: canvas,
  box: document.querySelector('.container'),
  reducedMotion: () => reducedMotionQuery.matches,
  art: summonArt
});

function onResults(results) {
  if (controller.state !== 'running') return;
  drawVideoFrame(ctx, results.image, canvas);

  const now = performance.now();
  // MediaPipe's handedness score (left/right confidence) doubles as a filter
  // for shaky phantom detections.
  const scores = results.multiHandedness?.map((h) => h?.score ?? 1);
  const landmarks = handFilter.update(results.multiHandLandmarks, canvas.width, canvas.height, now, scores);
  // While the fox sequence plays, the gesture holds at 'summoned' and no new
  // charge starts, so a summon can't be swallowed and fire can't cover the fox.
  // A different hand taking over starts from scratch rather than inheriting
  // the previous hand's charge.
  if (handFilter.switched) summon.reset();
  if (!effect.playing) {
    const event = summon.update(landmarks, now, canvas.width, canvas.height);
    if (event === 'summon') effect.play();
  }
  const lit = summon.state === 'charging' || summon.state === 'charged';
  effect.setHand(landmarks, lit ? Math.max(0.1, summon.chargeProgress) : 0);
  if (proofMode) showProofReadout(landmarks);

  if (landmarks) drawHand(ctx, landmarks, canvas.width, canvas.height);
  setText(gestureDisplay, SUMMON_LABELS[summon.state] ?? 'None');
}

// Only touch the DOM when the text changes: the gesture label is a live
// region, and rewriting it every frame can make screen readers repeat it.
function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

// Proof-only tuning readout: live ring gap (in palm lengths) against the
// charge and close thresholds, so a miss can be traced to the pose.
// Measured here rather than read from the gesture, which pauses during the effect.
function showProofReadout(landmarks) {
  const m = landmarks ? measureHand(landmarks, canvas.width, canvas.height) : null;
  const { chargeMinGap, chargeMaxGap, closeGap } = SUMMON_DEFAULTS;
  setText(proofReadout, m
    ? `Ring gap ${m.gap.toFixed(2)} (charge ${chargeMinGap}–${chargeMaxGap}, close ≤ ${closeGap}) · other fingers ${m.othersRaised ? 'up' : 'down'} · ${summon.state}`
    : `No hand · ${summon.state}`);
}

// One load at a time: a Stop then Start while the model is still loading
// waits on the same load instead of initializing the instance twice.
let modelLoad = null;

function loadModel() {
  modelLoad ??= initModel().catch((error) => {
    modelLoad = null;
    throw error;
  });
  return modelLoad;
}

async function initModel() {
  try {
    if (!hands) {
      hands = new Hands({ locateFile: (file) => `${MEDIAPIPE_HANDS_URL}/${file}` });
      hands.setOptions({
        // Two slots so a background false detection can't crowd out the real
        // hand; handFilter stays with the tracked hand (see handSelection.js).
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.8,
        minTrackingConfidence: 0.7
      });
      hands.onResults(onResults);
    }
    await hands.initialize();
  } catch (error) {
    // A failed load leaves this instance unusable; build a fresh one on retry.
    hands?.close?.();
    hands = null;
    throw namedError('ModelLoadError', error);
  }
}

function resetView() {
  summon.reset();
  handFilter.reset();
  effect.cancel();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  setText(gestureDisplay, 'None');
}

function renderStatus(state, message) {
  statusDisplay.textContent = message;
  statusDisplay.dataset.state = state;
  document.body.dataset.state = state;
  // Disabling the focused button would drop keyboard focus to the page, so
  // hand it to the button that just became usable.
  const focused = document.activeElement;
  startButton.disabled = state === 'starting' || state === 'running';
  stopButton.disabled = !(state === 'starting' || state === 'running');
  if (focused === startButton && startButton.disabled) stopButton.focus();
  if (focused === stopButton && stopButton.disabled) startButton.focus();
  if (state !== 'running') resetView();
}

const controller = createCameraController({
  loadModel,
  openCamera: (isCurrent, signal) => openCamera(video, {
    isCurrent,
    signal,
    onFrame: async (frame) => {
      try {
        await hands.send({ image: frame });
      } catch (error) {
        throw namedError('InferenceError', error);
      }
    },
    onError: (error) => controller.fail(error),
    width: canvas.width,
    height: canvas.height
  }),
  onStatus: renderStatus
});

startButton.addEventListener('click', () => controller.start());
stopButton.addEventListener('click', () => controller.stop());

// Escape cancels a charge or a running effect without touching the camera.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    summon.reset({ lock: true });
    effect.cancel();
  }
});

if (proofMode) {
  const testButton = document.getElementById('testSummonBtn');
  testButton.hidden = false;
  proofReadout.hidden = false;
  testButton.addEventListener('click', () => effect.play());
}

renderStatus('idle', 'Choose Start Camera to begin. Video stays in this browser and is never uploaded.');

// ?proof&at=1500 freezes the effect at that millisecond for inspection;
// &bite=N picks which bite clip to show.
const freezeAt = Number(params.get('at'));
const freezeBite = Number(params.get('bite')) || 0;
if (proofMode && freezeAt > 0) summonArt.finally(() => effect.freezeAt(freezeAt, freezeBite));
