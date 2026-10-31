// Sound for the summon: the fingers burn while charging, a chime marks the
// full charge, the fox howls as the eye opens, its paws thud as it runs in,
// and its jaws snap shut on the camera. Nothing plays after the bite. The howl
// and bite are recordings (clips: { howl, bite } URLs); everything else is
// synthesized with Web Audio, as are the howl and bite until their clips load
// or if they fail to. Browsers only allow audio after a click, so it stays
// silent until unlock() runs from one.
const VOLUME = 0.8;

export function createSummonSound({ AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext, clips = {} } = {}) {
  let ac = null;
  let master = null;
  let noise = null;
  let fire = null;     // { sources, gain } while the fingers burn
  let sequence = null; // gain node the howl and bite play through, so cancel() can cut them
  let muted = false;
  const recorded = {}; // decoded clips by name, once loaded

  const ready = () => ac !== null && ac.state === 'running';

  function unlock() {
    if (!AudioContextClass) return;
    if (!ac) {
      ac = new AudioContextClass();
      master = ac.createGain();
      master.gain.value = muted ? 0 : VOLUME;
      master.connect(ac.destination);
      loadClips();
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
  }

  function loadClips() {
    for (const [name, url] of Object.entries(clips)) {
      fetch(url)
        .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(url))))
        .then((data) => ac.decodeAudioData(data))
        .then((buffer) => { recorded[name] = buffer; })
        .catch(() => {}); // keep the synthesized stand-in
    }
  }

  function playClip(out, at, buffer, level) {
    const source = ac.createBufferSource();
    source.buffer = buffer;
    const gain = ac.createGain();
    gain.gain.value = level;
    source.connect(gain).connect(out);
    source.start(at);
  }

  function setMuted(value) {
    muted = value;
    master?.gain.setTargetAtTime(muted ? 0 : VOLUME, ac.currentTime, 0.02);
  }

  function noiseBuffer() {
    if (!noise) {
      noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return noise;
  }

  // A noise burst through a filter, shaped by a quick attack and decay.
  function burst(out, at, { type, freq, endFreq = freq, q = 1, peak, attack, decay }) {
    const source = ac.createBufferSource();
    source.buffer = noiseBuffer();
    const filter = ac.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, at);
    filter.frequency.exponentialRampToValueAtTime(endFreq, at + attack + decay);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    source.connect(filter).connect(gain).connect(out);
    source.start(at, Math.random());
    source.stop(at + attack + decay + 0.05);
  }

  // A tone gliding from one pitch to another under the same envelope.
  function tone(out, at, { type = 'sine', freq, endFreq = freq, peak, attack, decay }) {
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    osc.frequency.exponentialRampToValueAtTime(endFreq, at + attack + decay);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + attack + decay + 0.05);
  }

  // ---- Burning fingers ------------------------------------------------------

  // level: 0 = no fire, rising to 1 as the charge completes. Called every
  // frame: a low flame roar and a hiss follow the level, crackles pop at random.
  function setFire(level) {
    if (!ready()) return;
    const now = ac.currentTime;
    if (level > 0 && !fire) {
      const gain = ac.createGain();
      gain.gain.value = 0;
      gain.connect(master);
      const sources = [
        { type: 'lowpass', freq: 380, q: 0.7, mix: 1 },   // roar
        { type: 'bandpass', freq: 1400, q: 0.5, mix: 0.35 } // hiss
      ].map(({ type, freq, q, mix }) => {
        const source = ac.createBufferSource();
        source.buffer = noiseBuffer();
        source.loop = true;
        const filter = ac.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = freq;
        filter.Q.value = q;
        const blend = ac.createGain();
        blend.gain.value = mix;
        source.connect(filter).connect(blend).connect(gain);
        source.start(now, Math.random());
        return source;
      });
      fire = { sources, gain };
    }
    if (!fire) return;
    if (level > 0) {
      fire.gain.gain.setTargetAtTime(0.06 + 0.22 * level, now, 0.08);
      if (Math.random() < 0.1 + 0.35 * level) {
        burst(master, now, { type: 'highpass', freq: 2000 + Math.random() * 3500, peak: 0.06 + 0.22 * Math.random() * level, attack: 0.002, decay: 0.02 + Math.random() * 0.05 });
      }
    } else {
      stopFire();
    }
  }

  function stopFire() {
    if (!fire) return;
    const { sources, gain } = fire;
    fire = null;
    gain.gain.setTargetAtTime(0, ac.currentTime, 0.1);
    for (const source of sources) source.stop(ac.currentTime + 0.6);
  }

  // ---- Charged ----------------------------------------------------------------

  // A short bright two-note chime the moment the charge completes.
  function charged() {
    if (!ready()) return;
    const now = ac.currentTime;
    tone(master, now, { type: 'triangle', freq: 880, peak: 0.16, attack: 0.005, decay: 0.3 });
    tone(master, now + 0.09, { type: 'triangle', freq: 1320, peak: 0.16, attack: 0.005, decay: 0.45 });
    tone(master, now + 0.09, { freq: 2640, peak: 0.04, attack: 0.005, decay: 0.35 });
  }

  // ---- The summon -------------------------------------------------------------

  // A howl: two slightly detuned saws through vocal-like formant filters,
  // rising, holding with a waver, then falling away.
  function howl(out, at) {
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.32, at + 0.18);
    gain.gain.setValueAtTime(0.32, at + 1.0);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
    gain.connect(out);
    const formants = [[750, 4, 1], [1200, 6, 0.6], [2600, 8, 0.25]].map(([freq, q, mix]) => {
      const filter = ac.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      filter.Q.value = q;
      const level = ac.createGain();
      level.gain.value = mix;
      filter.connect(level).connect(gain);
      return filter;
    });
    const vibrato = ac.createOscillator();
    vibrato.frequency.value = 5.5;
    const depth = ac.createGain();
    depth.gain.setValueAtTime(0, at);
    depth.gain.linearRampToValueAtTime(14, at + 0.6);
    vibrato.connect(depth);
    for (const detune of [-8, 8]) {
      const osc = ac.createOscillator();
      osc.type = 'sawtooth';
      osc.detune.value = detune;
      osc.frequency.setValueAtTime(320, at);
      osc.frequency.exponentialRampToValueAtTime(560, at + 0.35);
      osc.frequency.exponentialRampToValueAtTime(600, at + 1.0);
      osc.frequency.exponentialRampToValueAtTime(360, at + 1.6);
      depth.connect(osc.frequency);
      for (const filter of formants) osc.connect(filter);
      osc.start(at);
      osc.stop(at + 1.65);
    }
    vibrato.start(at);
    vibrato.stop(at + 1.65);
    // A breath of air under the voice.
    burst(out, at, { type: 'bandpass', freq: 1500, q: 0.8, peak: 0.05, attack: 0.2, decay: 1.2 });
  }

  // The jaws closing: a deep thump and a double crunch.
  function bite(out, at) {
    tone(out, at, { freq: 180, endFreq: 55, peak: 0.6, attack: 0.004, decay: 0.16 });
    burst(out, at, { type: 'bandpass', freq: 2600, q: 1.5, peak: 0.45, attack: 0.002, decay: 0.08 });
    burst(out, at + 0.07, { type: 'bandpass', freq: 1900, q: 1.5, peak: 0.3, attack: 0.002, decay: 0.1 });
  }

  // cues: { snap } in ms from the start of the attack, which begins eyeMs
  // after the summon. The howl starts with the eye; the bite lands on the snap.
  function summon(cues, eyeMs) {
    if (!ready()) return;
    cancelSequence();
    sequence = ac.createGain();
    sequence.connect(master);
    const now = ac.currentTime;
    const snap = now + (eyeMs + cues.snap) / 1000;
    if (recorded.howl) playClip(sequence, now, recorded.howl, 0.9);
    else howl(sequence, now);
    if (recorded.bite) playClip(sequence, snap, recorded.bite, 1);
    else bite(sequence, snap);
  }

  // One paw landing while the fox runs in; near: 0 = far off, 1 = right at
  // the camera, so the steps grow louder as it closes in.
  function footstep(near = 1) {
    if (!ready() || !sequence) return;
    const now = ac.currentTime;
    const loud = 0.35 + 0.65 * Math.min(1, Math.max(0, near));
    tone(sequence, now, { freq: 95 + Math.random() * 20, endFreq: 50, peak: 0.3 * loud, attack: 0.004, decay: 0.08 });
    burst(sequence, now, { type: 'lowpass', freq: 700, q: 0.7, peak: 0.12 * loud, attack: 0.003, decay: 0.05 });
  }

  function cancelSequence() {
    sequence?.disconnect();
    sequence = null;
  }

  return {
    unlock,
    setFire,
    charged,
    summon,
    footstep,
    cancel() {
      cancelSequence();
      if (ac) stopFire();
    },
    get muted() { return muted; },
    set muted(value) { setMuted(Boolean(value)); }
  };
}
