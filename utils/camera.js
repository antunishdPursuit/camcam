import { namedError } from './cameraController.js';

// Opens the user camera (video only) and feeds frames to onFrame one at a time.
// Frames stay in the page; nothing is uploaded or recorded.
// isCurrent: false once this start has been superseded (Stop, or Stop then
// Start), so a late permission grant releases its stream without touching the
// shared video element.
// signal: aborted by Stop, so a camera still starting playback is released at
// once instead of when playback settles.
export async function openCamera(video, { onFrame, onError, isCurrent = () => true, signal, width = 640, height = 480 }) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw namedError('InsecureContextError');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width, height, facingMode: 'user' },
    audio: false
  });
  if (!isCurrent()) {
    stream.getTracks().forEach((track) => track.stop());
    return { stop: async () => {} };
  }

  let running = true;
  let started = false;
  let lostWhileStarting = false;
  let frameId = null;
  let inFlight = null;

  async function stop() {
    running = false;
    if (frameId !== null) cancelAnimationFrame(frameId);
    stream.getTracks().forEach((track) => track.stop());
    if (video.srcObject === stream) video.srcObject = null;
    // Let a frame already in the model finish (up to a second), so a quick
    // restart never has two frames in the model at once.
    if (inFlight) await settleWithin(inFlight, 1000);
  }

  async function loop() {
    if (!running) return;
    try {
      inFlight = onFrame(video);
      await inFlight;
    } catch (error) {
      if (running) onError(error);
      return;
    }
    if (running) frameId = requestAnimationFrame(loop);
  }

  // Unplugged, taken by another app, or permission revoked mid-session. Before
  // playback starts there is no session to fail yet, so the start reports it.
  for (const track of stream.getVideoTracks()) {
    track.addEventListener('ended', () => {
      if (!started) lostWhileStarting = true;
      else if (running) onError(namedError('CameraLostError'));
    });
  }
  signal?.addEventListener('abort', () => stop(), { once: true });

  try {
    video.srcObject = stream;
    await video.play();
  } catch (error) {
    await stop();
    throw error;
  }

  if (!running) return { stop };
  if (lostWhileStarting) {
    await stop();
    throw namedError('CameraLostError');
  }
  started = true;
  frameId = requestAnimationFrame(loop);
  return { stop };
}

function settleWithin(promise, ms) {
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(resolve, ms); });
  return Promise.race([promise.catch(() => {}), timeout]).finally(() => clearTimeout(timer));
}
