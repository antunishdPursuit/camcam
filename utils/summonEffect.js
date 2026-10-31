import { EYE_MS, biteTiming, clipFrame, effectFrame, eyeState, soundCues } from './summonTimeline.js';
import { PLACEMENT, fleeDistance, foxRectAt, foxSize, jawsX, swallowScale } from './foxPlacement.js';
import { palmLength } from './landmarks.js';
import { FINGERS, alongFinger, fireReach, ringCenter } from './handFire.js';

// Summon effect renderer.
// - Fire: drawn on the camera-box canvas, small flames along the fingers while
//   charging. When the summon fires, an eye opens in the closed ring, and the
//   fox attack starts EYE_MS later.
// - Fox attack: drawn on a full-page canvas from sprite sheets. The full-body
//   fox runs in from the right edge while the camera box shrinks, plays a bite
//   clip whose jaws snap shut on the box (which vanishes), runs on out the left
//   edge, and the box comes back. Timing and clip playback live in
//   summonTimeline.js, placement in foxPlacement.js.
const FIRE = ['#ffd27a', '#ff9a2e', '#ff5a1f', '#c2261b'];

// `art` is an optional promise of { flames, fox } from loadSummonArt(), which
// never rejects; either part may be null. Until it resolves, or for a missing
// part, fire falls back to drawn particles and the attack shows only the box.
export function createSummonEffect({ boxCanvas, pageCanvas, box, camera, reducedMotion = () => false, art: artPromise, sound = null }) {
  const ctx = boxCanvas.getContext('2d');
  const W = boxCanvas.width;
  const H = boxCanvas.height;
  const page = pageCanvas.getContext('2d');
  let art = null;
  artPromise?.then((loaded) => { art = loaded; });
  let particles = [];
  let hand = null;
  let charging = false;
  let fireLevel = 0;
  let sequenceStart = null;
  let eyeAt = null;
  let reduced = false;
  let frameId = null;
  let lastTick = null;

  // ---- Fire on the camera box -------------------------------------------

  // Flame size follows the hand's on-screen size (wrist to middle knuckle).
  function palmPx() {
    if (!hand) return H * 0.15;
    return palmLength(hand, W, H);
  }

  // One small flame licking up from a point on a finger. Tip flames are a
  // little bigger; all are short-lived so the fire hugs the fingers.
  function emitFlame(p, palm, scale, speed) {
    particles.push({
      x: p.x + (Math.random() - 0.5) * palm * 0.06,
      y: p.y + (Math.random() - 0.5) * palm * 0.06,
      vx: (Math.random() - 0.5) * speed * 0.4,
      vy: -(0.5 + Math.random() * 0.5) * speed,
      life: 1,
      decay: 1.8 + Math.random() * 1.2,
      size: palm * scale * (0.7 + Math.random() * 0.6),
      color: FIRE[Math.floor(Math.random() * FIRE.length)],
      sprite: Math.floor(Math.random() * 2),
      rotation: (Math.random() - 0.5) * 0.5
    });
  }

  // Flames along every finger: at the tips first, creeping down to the base
  // knuckles as the charge builds. Spawn rate is per second, so it doesn't
  // depend on the frame rate.
  function emitFingerFire(dt, level) {
    const palm = palmPx();
    const reach = fireReach(level);
    const rate = reduced ? 0.35 : 1;
    const speed = palm * (reduced ? 0.35 : 0.7);
    for (const finger of FINGERS) {
      for (let n = poisson(dt * 26 * rate); n > 0; n--) {
        emitFlame(alongFinger(hand, finger, 0, W, H), palm, 0.12, speed);
      }
      for (let n = poisson(dt * 40 * rate * reach); n > 0; n--) {
        emitFlame(alongFinger(hand, finger, Math.random() * reach, W, H), palm, 0.08, speed);
      }
    }
  }

  function poisson(mean) {
    let n = Math.floor(mean);
    if (Math.random() < mean - n) n++;
    return n;
  }

  // A faint ember glow traced along the burning part of each finger.
  function drawFingerGlow(level) {
    const palm = palmPx();
    const reach = fireReach(level);
    const flicker = reduced ? 1 : 0.85 + 0.15 * Math.sin((lastTick ?? 0) / 70);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [width, alpha] of [[0.22, 0.1], [0.09, 0.22]]) {
      ctx.lineWidth = palm * width;
      ctx.strokeStyle = `rgba(255, 128, 32, ${alpha * flicker * (0.4 + 0.6 * level)})`;
      for (const finger of FINGERS) {
        ctx.beginPath();
        for (let s = 0; s <= 6; s++) {
          const p = alongFinger(hand, finger, (s / 6) * reach, W, H);
          if (s === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
    }
  }

  // The eye that opens in the closed ring when the summon fires: an almond of
  // glowing gold with a slit pupil and a red halo. It follows the hand while
  // tracked and stays put if the hand is lost.
  function drawEye(ms) {
    const e = eyeState(ms, reduced);
    if (e.alpha <= 0) return;
    if (hand) eyeAt = { ...ringCenter(hand, W, H), w: palmPx() * 0.2 };
    eyeAt ??= { x: W / 2, y: H / 2, w: H * 0.05 };
    const { x, y, w } = eyeAt;
    const h = w * 0.5 * e.open;
    ctx.save();
    ctx.globalAlpha = e.alpha;
    ctx.translate(x, y);

    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 2.2);
    halo.addColorStop(0, `rgba(255, 90, 31, ${0.55 * e.open})`);
    halo.addColorStop(1, 'rgba(194, 38, 27, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, w * 2.2, 0, Math.PI * 2);
    ctx.fill();

    if (h > 0.5) {
      const almond = new Path2D();
      almond.moveTo(-w, 0);
      almond.quadraticCurveTo(0, -h * 2, w, 0);
      almond.quadraticCurveTo(0, h * 2, -w, 0);
      ctx.save();
      ctx.clip(almond);
      const iris = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
      iris.addColorStop(0, '#fff3b8');
      iris.addColorStop(0.35, '#ffc23d');
      iris.addColorStop(0.75, '#ff7a1a');
      iris.addColorStop(1, '#a8201a');
      ctx.fillStyle = iris;
      ctx.fillRect(-w, -h * 2, w * 2, h * 4);
      ctx.fillStyle = '#120404';
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.13 * e.slit, h * 0.95, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = Math.max(1.5, w * 0.09);
      ctx.strokeStyle = '#2a0805';
      ctx.stroke(almond);
    }
    ctx.restore();
  }

  function drawFire(dt, eyeMs) {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (charging && hand) {
      drawFingerGlow(fireLevel);
      emitFingerFire(dt, fireLevel);
    }
    particles = particles.filter((p) => (p.life -= p.decay * dt) > 0);
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ctx.globalAlpha = p.life * 0.8;
      if (art?.flames) {
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
    if (eyeMs !== null) drawEye(eyeMs);
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
    pawParticles = [];
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

  // Which run and bite clips this summon uses, picked at random per summon.
  // Clips are tagged with the fox they were generated from; a run is always
  // paired with a bite of the same fox so its look doesn't change mid-attack.
  let chosen = null;

  function pickClips(random = Math.random) {
    const fox = art?.fox;
    if (!fox) return null;
    const bite = fox.bite[Math.floor(random() * fox.bite.length)];
    const runs = fox.run.filter((clip) => clip.fox === bite.fox);
    const pool = runs.length ? runs : fox.run;
    const run = pool[Math.floor(random() * pool.length)];
    // Running off after the bite: a closed-mouth run of the same fox if the
    // manifest has one, otherwise the ordinary run.
    const carries = (fox.carry ?? []).filter((clip) => clip.fox === bite.fox);
    const carry = carries.length ? carries[Math.floor(random() * carries.length)] : run;
    return { run, bite, carry, timing: biteTiming(bite) };
  }

  // Draw one frame of a clip. Clips are positioned in the coordinates of the
  // source video frame (sourceCrop), so switching from run to bite doesn't jump.
  function drawSprite(clip, index, r) {
    const video = art.fox.video;
    const [x0, y0, x1, y1] = clip.sourceCrop;
    const sx = (index % clip.cols) * clip.frameW;
    const sy = Math.floor(index / clip.cols) * clip.frameH;
    page.drawImage(
      clip.img, sx, sy, clip.frameW, clip.frameH,
      r.x + (x0 / video.w) * r.w, r.y + (y0 / video.h) * r.h,
      ((x1 - x0) / video.w) * r.w, ((y1 - y0) / video.h) * r.h
    );
  }

  // Spirit fire bursting from the paws that touch down, trailing behind the
  // running fox, so it reads as running on fire rather than on a hidden floor.
  let pawParticles = [];
  let lastRunFrame = null; // run-clip frame last drawn, to hear each paw land once

  function emitPawFire(clip, index, r, running) {
    for (const [fx, fy] of clip.feet?.[index] ?? []) {
      if (Math.random() > 0.7) continue;
      pawParticles.push({
        x: r.x + fx * r.w + (Math.random() - 0.5) * r.h * 0.04,
        y: r.y + fy * r.h,
        vx: (running ? 140 : 40) + Math.random() * 60,
        vy: -(30 + Math.random() * 70),
        life: 1,
        decay: 2.2 + Math.random(),
        size: r.h * (0.05 + Math.random() * 0.05),
        sprite: Math.floor(Math.random() * 2),
        rotation: (Math.random() - 0.5) * 0.6
      });
    }
  }

  function drawPawFire(dt) {
    pawParticles = pawParticles.filter((p) => (p.life -= p.decay * dt) > 0);
    page.save();
    page.globalCompositeOperation = 'lighter';
    for (const p of pawParticles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      page.globalAlpha = p.life * 0.85;
      if (art?.flames) {
        const size = p.size * (0.7 + 0.3 * p.life);
        page.save();
        page.translate(p.x, p.y);
        page.rotate(p.rotation);
        page.drawImage(art.flames[p.sprite], -size / 2, -size * 0.8, size, size);
        page.restore();
      } else {
        page.fillStyle = FIRE[p.sprite + 1];
        page.beginPath();
        page.arc(p.x, p.y, p.size * 0.3 * p.life, 0, Math.PI * 2);
        page.fill();
      }
    }
    page.restore();
  }

  // The box's stage and border colours, read once per summon (reading styles
  // every frame right after writing transform/opacity would force a recalc).
  let boxColors = null;

  function readBoxColors() {
    const style = getComputedStyle(box);
    return { stage: style.backgroundColor, border: style.borderTopColor };
  }

  // The live camera drawn on the page layer, on top of the fox: at the box's
  // spot while it shrinks, then clamped in the jaws (following the mouth frame
  // by frame) until it is gulped down. Mirrored like the box itself, with the
  // box's own fire canvas on top so the summon burst doesn't vanish.
  function drawHeldCamera(center, w, h, fullW) {
    boxColors ??= readBoxColors();
    page.save();
    page.translate(center.x, center.y);
    page.fillStyle = boxColors.stage;
    page.fillRect(-w / 2, -h / 2, w, h);
    page.save();
    page.scale(-1, 1);
    if (camera) page.drawImage(camera, -w / 2, -h / 2, w, h);
    page.drawImage(boxCanvas, -w / 2, -h / 2, w, h);
    page.restore();
    page.lineWidth = Math.max(1, 2 * (w / Math.max(1, fullW)));
    page.strokeStyle = boxColors.border;
    page.strokeRect(-w / 2, -h / 2, w, h);
    page.restore();
  }

  // Mouth point of a clip frame in page pixels.
  function mouthAt(clip, index, r) {
    const [mx, my] = clip.mouths?.[index] ?? chosen.bite.mouth;
    return { x: r.x + mx * r.w, y: r.y + my * r.h };
  }

  function drawAttack(f, now, dt = 0) {
    fitPage();
    const boxRect = fullBoxRect();
    const shakeX = f.shake * Math.sin(now / 16) * 12;
    const shakeY = f.shake * Math.cos(now / 21) * 6;

    const viewport = { w: innerWidth, h: innerHeight };

    // The camera shrinks to fit between the jaws (smaller when a short window
    // caps the fox's size). While the page layer draws it, the box in the
    // layout is hidden; it grows back in place at the end.
    const smallest = chosen
      ? swallowScale({ box: boxRect, viewport, gape: chosen.bite.gape })
      : PLACEMENT.swallowScale;
    const scale = 1 - (1 - smallest) * f.boxShrink;
    box.dataset.summonScale = String(scale);
    box.style.transform = scale < 1 ? `scale(${scale})` : '';
    box.style.opacity = f.boxAlpha < 1 ? String(f.boxAlpha) : '';

    // The camera runs left in a straight line and is caught at mouth height,
    // so it never drops.
    const home = { x: boxRect.x + boxRect.w / 2, y: boxRect.y + boxRect.h / 2 };
    const fleeDist = fleeDistance({ box: boxRect, scale: smallest });
    const camX = home.x - fleeDist * f.camTravel;
    const caught = { x: home.x - fleeDist * f.caughtTravel, y: home.y };

    let mouth = null;
    if (chosen && f.foxGap < 1 && f.foxCross < 1 && f.foxAlpha > 0) {
      // The fox is placed by its jaws: trailing the camera before the snap,
      // carrying on from the catch point after it. The anchor is the bite
      // clip's mouth at the snap, so the jaws meet the camera exactly then.
      const size = foxSize({ box: boxRect, viewport, frame: art.fox.video });
      const anchorMouth = chosen.bite.mouths?.[chosen.bite.snapFrame] ?? chosen.bite.mouth;
      const x = jawsX({ camX, caughtX: caught.x, foxGap: f.foxGap, foxCross: f.foxCross, viewport, size, mouth: anchorMouth });
      const r = foxRectAt({ anchor: { x: x + shakeX, y: caught.y + shakeY }, size, mouth: anchorMouth });
      const clip = chosen[f.sprite] ?? chosen.run;
      const looping = f.sprite !== 'bite';
      const index = clipFrame(clip, f.spriteMs, looping);
      page.save();
      page.globalAlpha = f.foxAlpha;
      drawSprite(clip, index, r);
      page.restore();
      if (!reduced) emitPawFire(clip, index, r, looping);
      // Footsteps while running in: a step each time another paw touches down.
      if (f.sprite === 'run' && index !== lastRunFrame) {
        const prev = lastRunFrame ?? index;
        if ((clip.feet?.[index]?.length ?? 0) > (clip.feet?.[prev]?.length ?? 0)) sound?.footstep(1 - f.foxGap);
        lastRunFrame = index;
      }
      if (f.boxHeld) mouth = mouthAt(clip, index, r);
    }
    drawPawFire(dt);

    if (f.boxOnPage && f.gulp < 1) {
      // Fleeing: a light running bob, no tilt. As the jaws close it is pulled
      // into the fox's actual mouth and is gone exactly at the snap.
      const size = scale * (1 - f.gulp);
      let center = { x: camX, y: home.y };
      if (!reduced && f.camTravel > 0 && f.camTravel < 1) {
        center.y -= Math.abs(Math.sin(now / 85)) * boxRect.h * size * 0.08;
      }
      if (f.boxHeld && mouth) {
        const pull = f.gulp * f.gulp * (3 - 2 * f.gulp);
        center = { x: center.x + (mouth.x - center.x) * pull, y: center.y + (mouth.y - center.y) * pull };
      }
      drawHeldCamera(center, boxRect.w * size, boxRect.h * size, boxRect.w);
    }

    if (f.streaks > 0) {
      const cx = caught.x;
      const cy = caught.y;
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
    const elapsed = sequenceStart === null ? null : now - sequenceStart;
    drawFire(dt, elapsed);

    let sequenceDone = true;
    if (elapsed !== null) {
      const f = effectFrame(Math.max(0, elapsed - EYE_MS), reduced, chosen?.timing);
      if (elapsed >= EYE_MS) drawAttack(f, now, dt);
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
      sound?.setFire(fireLevel);
      if (charging) {
        if (sequenceStart === null) reduced = reducedMotion();
        startLoop();
      }
    },
    play() {
      if (sequenceStart !== null) return;
      reduced = reducedMotion();
      if (hand) {
        const palm = palmPx();
        for (const finger of FINGERS) {
          for (let n = reduced ? 1 : 4; n > 0; n--) emitFlame(alongFinger(hand, finger, 0, W, H), palm, 0.14, palm * 1.2);
        }
      }
      eyeAt = null;
      lastRunFrame = null;
      chosen = pickClips();
      boxColors = readBoxColors();
      sequenceStart = performance.now();
      sound?.summon(soundCues(reduced, chosen?.timing), EYE_MS);
      startLoop();
    },
    cancel() {
      sound?.cancel();
      sequenceStart = null;
      particles = [];
      charging = false;
      fireLevel = 0;
      stopLoop();
      ctx.clearRect(0, 0, W, H);
      clearPage();
    },
    // Draw one still frame of the attack at `ms`, for inspecting poses.
    // biteIndex picks which bite clip (and a run of the same fox) to show.
    freezeAt(ms, biteIndex = 0) {
      this.cancel();
      const count = art?.fox?.bite.length || 1;
      const index = ((Math.trunc(biteIndex) % count) + count) % count; // any integer, even negative
      chosen = pickClips(() => (index + 0.5) / count);
      boxColors = readBoxColors();
      reduced = reducedMotion();
      drawAttack(effectFrame(ms, reduced, chosen?.timing), 0);
    },
    get playing() { return sequenceStart !== null; }
  };
}
