import { namedError } from './cameraController.js';

// Opens the user camera (video only) and feeds frames to onFrame one at a time.
// Frames stay in the page; nothing is uploaded or recorded.
export async function openCamera(video, { onFrame, onError, width = 640, height = 480 }) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw namedError('InsecureContextError');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width, height, facingMode: 'user' },
    audio: false
  });

  let running = true;
  let frameId = null;

  async function stop() {
    running = false;
    if (frameId !== null) cancelAnimationFrame(frameId);
    stream.getTracks().forEach((track) => track.stop());
    if (video.srcObject === stream) video.srcObject = null;
  }

  async function loop() {
    if (!running) return;
    try {
      await onFrame(video);
    } catch (error) {
      if (running) onError(error);
      return;
    }
    if (running) frameId = requestAnimationFrame(loop);
  }

  try {
    video.srcObject = stream;
    await video.play();
  } catch (error) {
    await stop();
    throw error;
  }

  frameId = requestAnimationFrame(loop);
  return { stop };
}
