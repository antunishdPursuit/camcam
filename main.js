import { isThumbsUp } from './utils/gestureUtils.js';
import { drawHand, drawVideoFrame } from './utils/drawUtils.js';

const video = document.getElementById('input_video');
const canvas = document.getElementById('output_canvas');
const ctx = canvas.getContext('2d');
const gestureDisplay = document.querySelector('#gesture span');

const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.7
});

hands.onResults((results) => {
  drawVideoFrame(ctx, results.image, canvas);

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const landmarks = results.multiHandLandmarks[0];
    drawHand(ctx, landmarks, canvas.width, canvas.height);

    gestureDisplay.textContent = isThumbsUp(landmarks) ? 'Thumbs Up 👍' : 'None';
  } else {
    gestureDisplay.textContent = 'None';
  }
});

let camera;
document.getElementById('toggleCameraBtn').addEventListener('click', () => {
  if (!camera) {
    camera = new Camera(video, {
      onFrame: async () => {
        await hands.send({ image: video });
      },
      width: 640,
      height: 480
    });
    camera.start();
  }
});
