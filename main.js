const video = document.getElementById('input_video');
const canvas = document.getElementById('output_canvas');
const ctx = canvas.getContext('2d');
const gestureDisplay = document.querySelector('#gesture span');

if (!video || !canvas || !gestureDisplay) {
  console.error("One or more elements not found!");
}

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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const landmarks = results.multiHandLandmarks[0];

    // Draw landmarks
    for (let lm of landmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 5, 0, 2 * Math.PI);
      ctx.fillStyle = 'blue';
      ctx.fill();
    }

    // Thumbs up logic
    const thumbTip = landmarks[4];
    const indexMCP = landmarks[5];
    const middleMCP = landmarks[9];

    const isThumbUp = thumbTip.y < indexMCP.y && thumbTip.y < middleMCP.y;
    gestureDisplay.textContent = isThumbUp ? 'Thumbs Up 👍' : 'None';
  } else {
    gestureDisplay.textContent = 'None';
  }
});

const camera = new Camera(video, {
  onFrame: async () => {
    await hands.send({ image: video });
  },
  width: 640,
  height: 480
});
camera.start();

