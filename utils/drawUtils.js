export function drawHand(ctx, landmarks, canvasWidth, canvasHeight) {
    for (let lm of landmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * canvasWidth, lm.y * canvasHeight, 5, 0, 2 * Math.PI);
      ctx.fillStyle = 'blue';
      ctx.fill();
    }
  }
  
  export function drawVideoFrame(ctx, image, canvas) {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
  