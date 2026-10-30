import { effectFrame } from './summonTimeline.js';
import { PLACEMENT, foxRect, swallowScale } from './foxPlacement.js';
import { LANDMARK, palmLength } from './landmarks.js';

// Summon effect renderer.
// - Fire: drawn on the camera-box canvas, anchored to the thumb/index ring
//   while charging.
// - Fox attack: drawn on a full-page canvas. The side-view fox comes in from
//   the right edge, snaps its jaw shut on the camera box, the box goes dark and
//   shakes, the fox retreats and the box comes back. Timing lives in
//   summonTimeline.js, placement in foxPlacement.js.
const FIRE = ['#ffd27a', '#ff9a2e', '#ff5a1f', '#c2261b'];
const RING_POINTS = [2, 3, 4, 6, 7, 8]; // thumb and index joints around the ring

// `art` is an optional promise of the generated layers (see summonArt.js).
// Until it resolves, or if it fails, fire falls back to drawn particles and
// the attack shows only the box going dark.
export function createSummonEffect({ boxCanvas, pageCanvas, box, reducedMotion = () => false, art: artPromise }) {
  const ctx = boxCanvas.getContext('2d');
  const W = boxCanvas.width;
  const H = boxCanvas.height;
  const page = pageCanvas.getContext('2d');
  let art = null;
  artPromise?.then((loaded) => { art = loaded; })
    .catch((error) => console.warn('Summon art failed to load; using fallbacks.', error));
  let particles = [];
  let hand = null;
  let charging = false;
  let fireLevel = 0;
  let sequenceStart = null;
  let reduced = false;
  let frameId = null;
  let lastTick = null;

  // ---- Fire on the camera box -------------------------------------------

  // Flame size follows the hand's on-screen size (wrist to middle knuckle).
  function palmPx() {
    if (!hand) return H * 0.15;
    return palmLength(hand, W, H);
  }

  function emitFire(points, count, speed) {
    const palm = palmPx();
    for (const p of points) {
      for (let i = 0; i < count; i++) {
        particles.push({
          x: p.x + (Math.random() - 0.5) * palm * 0.25,
          y: p.y + (Math.random() - 0.5) * palm * 0.25,
          vx: (Math.random() - 0.5) * speed,
          vy: -Math.random() * speed - palm * 0.6,
          life: 1,
          decay: 0.9 + Math.random() * 0.7,
          size: palm * (0.12 + Math.random() * 0.18),
          color: FIRE[Math.floor(Math.random() * FIRE.length)],
          sprite: Math.floor(Math.random() * 2),
          rotation: (Math.random() - 0.5) * 0.6
        });
      }
    }
  }

  function handPoints() {
    return hand ? RING_POINTS.map((i) => ({ x: hand[i].x * W, y: hand[i].y * H })) : [];
  }

  // Warm glow filling the open ring between thumb and index tips. It grows as
  // the charge builds and pulses once fully charged.
  function drawRingGlow() {
    const palm = palmPx();
    const thumb = hand[LANDMARK.THUMB_TIP];
    const index = hand[LANDMARK.INDEX_TIP];
    const x = ((thumb.x + index.x) / 2) * W;
    const y = ((thumb.y + index.y) / 2) * H;
    const pulse = fireLevel >= 1 && !reduced ? 1 + 0.12 * Math.sin((lastTick ?? 0) / 110) : 1;
    const r = palm * (0.35 + 0.45 * fireLevel) * pulse;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, 'rgba(255, 210, 122, 0.85)');
    glow.addColorStop(0.4, 'rgba(255, 122, 26, 0.45)');
    glow.addColorStop(1, 'rgba(194, 38, 27, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFire(dt) {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (charging && hand) {
      const count = reduced || fireLevel < 0.5 ? 1 : 2;
      emitFire(handPoints(), count, palmPx() * (reduced ? 0.3 : 0.5 + 0.4 * fireLevel));
      drawRingGlow();
    }
    particles = particles.filter((p) => (p.life -= p.decay * dt) > 0);
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ctx.globalAlpha = p.life * 0.8;
      if (art) {
        // Flame sprite with brightness-based alpha, blended additively.
        const size = p.size * 1.9 * (0.6 + 0.4 * p.life);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.drawImage(art.flames[p.sprite], -size / 2, -size * 0.75, size, size);
        ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---- Fox attack on the page ------------------------------------------

  // Match the page canvas to the viewport (in CSS pixels, scaled for DPR).
  function fitPage() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(innerWidth * dpr);
    const h = Math.round(innerHeight * dpr);
    if (pageCanvas.width !== w || pageCanvas.height !== h) {
      pageCanvas.width = w;
      pageCanvas.height = h;
    }
    page.setTransform(dpr, 0, 0, dpr, 0, 0);
    page.clearRect(0, 0, innerWidth, innerHeight);
  }

  function clearPage() {
    page.setTransform(1, 0, 0, 1, 0, 0);
    page.clearRect(0, 0, pageCanvas.width, pageCanvas.height);
    box.style.transform = '';
    delete box.dataset.summonScale;
    box.style.opacity = '';
  }

  // The camera box at full size. The box shrinks about its centre, so its
  // centre stays put and its full size is the current size over the scale.
  function fullBoxRect() {
    const rect = box.getBoundingClientRect();
    const scale = Number(box.dataset.summonScale) || 1;
    const w = rect.width / scale;
    const h = rect.height / scale;
    return { x: rect.left + rect.width / 2 - w / 2, y: rect.top + rect.height / 2 - h / 2, w, h };
  }

  function drawAttack(f, now) {
    fitPage();
    const boxRect = fullBoxRect();
    const shakeX = f.shake * Math.sin(now / 16) * 12;
    const shakeY = f.shake * Math.cos(now / 21) * 6;

    const viewport = { w: innerWidth, h: innerHeight };
    const geometry = art && {
      box: boxRect,
      viewport,
      mouth: art.sideMouth,
      aspect: art.foxHead.width / art.foxHead.height
    };

    // The camera box shrinks to fit the mouth (smaller when a short window
    // caps the fox's size), vanishes when the jaw shuts, and grows back.
    const smallest = geometry ? swallowScale(geometry) : PLACEMENT.swallowScale;
    const scale = 1 - (1 - smallest) * f.boxShrink;
    box.dataset.summonScale = String(scale);
    box.style.transform = scale < 1 ? `scale(${scale})` : '';
    box.style.opacity = f.boxAlpha < 1 ? String(f.boxAlpha) : '';

    if (geometry && f.foxIn > 0 && f.foxCross < 1 && f.foxAlpha > 0) {
      const r = foxRect({
        ...geometry,
        foxIn: f.foxIn,
        foxCross: f.foxCross,
        thrust: f.thrust
      });
      const hingeX = r.x + art.sideHinge[0] * r.w + shakeX;
      const hingeY = r.y + art.sideHinge[1] * r.h + shakeY;
      page.save();
      page.globalAlpha = f.foxAlpha;
      // Lower jaw rotates about the hinge; the head layer covers the seam.
      page.save();
      page.translate(hingeX, hingeY);
      // Positive canvas rotation is clockwise: the jaw swings up to shut.
      page.rotate((art.sideCloseDeg * Math.PI / 180) * f.jawClose);
      page.drawImage(art.foxJaw, r.x + shakeX - hingeX, r.y + shakeY - hingeY, r.w, r.h);
      page.restore();
      page.drawImage(art.foxHead, r.x + shakeX, r.y + shakeY, r.w, r.h);
      page.restore();
    }

    if (f.streaks > 0) {
      const cx = boxRect.x + boxRect.w / 2;
      const cy = boxRect.y + boxRect.h / 2;
      const reach = Math.hypot(innerWidth, innerHeight);
      page.save();
      page.globalAlpha = f.streaks;
      page.strokeStyle = '#fff4e0';
      page.lineWidth = 2;
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2;
        const r0 = boxRect.h * 0.55;
        page.beginPath();
        page.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        page.lineTo(cx + Math.cos(a) * reach, cy + Math.sin(a) * reach);
        page.stroke();
      }
      page.restore();
    }
  }

  // ---- Loop ---------------------------------------------------------------

  function tick(now) {
    const dt = lastTick === null ? 0 : Math.min((now - lastTick) / 1000, 0.1);
    lastTick = now;
    drawFire(dt);

    let sequenceDone = true;
    if (sequenceStart !== null) {
      const f = effectFrame(now - sequenceStart, reduced);
      drawAttack(f, now);
      sequenceDone = f.done;
      if (f.done) {
        sequenceStart = null;
        clearPage();
      }
    }

    if (sequenceDone && !charging && particles.length === 0) {
      stopLoop();
      ctx.clearRect(0, 0, W, H);
      return;
    }
    frameId = requestAnimationFrame(tick);
  }

  function startLoop() {
    if (frameId === null) {
      lastTick = null;
      frameId = requestAnimationFrame(tick);
    }
  }

  function stopLoop() {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
  }

  return {
    // Latest tracked hand (MediaPipe landmarks) and fire strength: 0 = no fire,
    // rising to 1 as the charge completes.
    setHand(landmarks, level = 0) {
      // Through a short tracking dropout, keep burning at the last known hand.
      hand = landmarks ?? (level > 0 ? hand : null);
      fireLevel = hand ? level : 0;
      charging = fireLevel > 0;
      if (charging) {
        if (sequenceStart === null) reduced = reducedMotion();
        startLoop();
      }
    },
    play() {
      if (sequenceStart !== null) return;
      reduced = reducedMotion();
      if (hand) emitFire(handPoints(), reduced ? 4 : 14, reduced ? 60 : 220);
      sequenceStart = performance.now();
      startLoop();
    },
    cancel() {
      sequenceStart = null;
      particles = [];
      charging = false;
      fireLevel = 0;
      stopLoop();
      ctx.clearRect(0, 0, W, H);
      clearPage();
    },
    // Draw one still frame of the attack at `ms`, for inspecting poses.
    freezeAt(ms) {
      this.cancel();
      drawAttack(effectFrame(ms, reducedMotion()), 0);
    },
    get playing() { return sequenceStart !== null; }
  };
}
