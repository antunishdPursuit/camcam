import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSummonSound } from '../utils/summonSound.js';
import { DEFAULT_BITE, effectDuration, soundCues } from '../utils/summonTimeline.js';

// A stand-in for the browser's AudioContext that records what was started,
// when, and which nodes were disconnected.
class FakeAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 10;
    this.sampleRate = 8000;
    this.destination = this.node('destination');
    this.started = [];
  }
  param(value = 0) {
    return { value, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime(v) { this.target = v; } };
  }
  node(kind) {
    const ctx = this;
    return {
      kind,
      disconnected: false,
      gain: this.param(1), frequency: this.param(), Q: this.param(), detune: this.param(),
      connect(next) { return next; },
      disconnect() { this.disconnected = true; },
      start(at = ctx.currentTime) { ctx.started.push({ kind, at }); },
      stop() {}
    };
  }
  createGain() { const g = this.node('gain'); (this.gains ??= []).push(g); return g; }
  createBiquadFilter() { return this.node('filter'); }
  createOscillator() { return this.node('tone'); }
  createBufferSource() { return this.node('noise'); }
  createBuffer(channels, length) { const data = new Float32Array(length); return { getChannelData: () => data }; }
  async resume() { this.state = 'running'; }
  async decodeAudioData(data) { return { decoded: data }; }
}

function setup() {
  let ac;
  const sound = createSummonSound({ AudioContextClass: class extends FakeAudioContext { constructor() { super(); ac = this; } } });
  return { sound, ac: () => ac };
}

test('every sound call is a no-op without Web Audio', () => {
  const sound = createSummonSound({ AudioContextClass: undefined });
  sound.unlock();
  sound.setFire(1);
  sound.summon(soundCues(), 450);
  sound.cancel();
  sound.muted = true;
  assert.equal(sound.muted, true);
});

test('stays silent until a click unlocks it', () => {
  const { sound, ac } = setup();
  sound.setFire(1);
  sound.summon(soundCues(), 450);
  assert.equal(ac(), undefined, 'no audio context before unlock');
  sound.unlock();
  sound.summon(soundCues(), 450);
  assert.ok(ac().started.length > 0);
});

test('the chomp lands when the jaws close', () => {
  const { sound, ac } = setup();
  sound.unlock();
  const cues = soundCues(false, DEFAULT_BITE);
  sound.summon(cues, 450);
  const snapAt = 10 + (450 + cues.snap) / 1000;
  assert.ok(ac().started.some((s) => s.kind === 'tone' && Math.abs(s.at - snapAt) < 1e-9), 'a tone starts at the snap');
});

test('cancel cuts the summon cues and puts the fire out', () => {
  const { sound, ac } = setup();
  sound.unlock();
  sound.setFire(0.5);
  const fireStarted = ac().started.filter((s) => s.kind === 'noise').length;
  assert.ok(fireStarted >= 1, 'fire noise is playing');
  sound.summon(soundCues(), 450);
  const before = ac().gains.filter((g) => g.disconnected).length;
  sound.cancel();
  assert.ok(ac().gains.filter((g) => g.disconnected).length > before, 'the summon cues are disconnected');
  // A new charge after cancel starts a fresh fire.
  sound.setFire(0.5);
  assert.ok(ac().started.filter((s) => s.kind === 'noise').length > fireStarted);
});

test('the bite cue falls inside the effect', () => {
  for (const reduced of [false, true]) {
    const { snap } = soundCues(reduced, DEFAULT_BITE);
    assert.ok(snap > 0 && snap < effectDuration(reduced, DEFAULT_BITE), `reduced=${reduced}`);
  }
});

test('the charged chime and footsteps play; footsteps only during a summon', () => {
  const { sound, ac } = setup();
  sound.unlock();
  sound.charged();
  assert.ok(ac().started.filter((s) => s.kind === 'tone').length >= 2, 'chime');
  const before = ac().started.length;
  sound.footstep(1);
  assert.equal(ac().started.length, before, 'no stray footstep outside a summon');
  sound.summon(soundCues(), 450);
  const during = ac().started.length;
  sound.footstep(0.5);
  assert.ok(ac().started.length > during, 'footstep during the run');
});

test('recorded clips replace the synthesized howl and bite once loaded; a failed load falls back', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => (url === 'howl.mp3'
    ? { ok: true, arrayBuffer: async () => 'howl-bytes' }
    : { ok: false });
  try {
    let ac;
    const sound = createSummonSound({
      AudioContextClass: class extends FakeAudioContext { constructor() { super(); ac = this; } },
      clips: { howl: 'howl.mp3', bite: 'missing.mp3' }
    });
    sound.unlock();
    await new Promise((r) => setTimeout(r, 0));
    const cues = soundCues(false, DEFAULT_BITE);
    sound.summon(cues, 450);
    const atNow = ac.started.filter((s) => Math.abs(s.at - 10) < 1e-9);
    assert.ok(atNow.some((s) => s.kind === 'noise'), 'the howl clip plays as a buffer source');
    assert.ok(!atNow.some((s) => s.kind === 'tone'), 'no synthesized howl voice');
    const snapAt = 10 + (450 + cues.snap) / 1000;
    assert.ok(ac.started.some((s) => s.kind === 'tone' && Math.abs(s.at - snapAt) < 1e-9), 'the bite falls back to synthesis');
  } finally {
    globalThis.fetch = realFetch;
  }
});
