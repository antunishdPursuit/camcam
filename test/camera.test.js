import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openCamera } from '../utils/camera.js';

// Minimal browser stand-ins: a stream whose video track can end, and a video
// element that records what it was given.
function fakeStream() {
  const track = Object.assign(new EventTarget(), { stopped: false, stop() { this.stopped = true; } });
  return { track, getTracks: () => [track], getVideoTracks: () => [track] };
}

let nextStream;
beforeEach(() => {
  globalThis.window = { isSecureContext: true };
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices: { getUserMedia: async () => nextStream } },
    configurable: true
  });
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
});

const fakeVideo = () => ({ srcObject: null, async play() {} });

test('a superseded open releases its stream without touching the video', async () => {
  nextStream = fakeStream();
  const video = fakeVideo();
  video.srcObject = 'current session';
  const opened = await openCamera(video, { onFrame: async () => {}, onError: () => {}, isCurrent: () => false });
  assert.equal(nextStream.track.stopped, true);
  assert.equal(video.srcObject, 'current session');
  await opened.stop();
  assert.equal(video.srcObject, 'current session');
});

test('the camera track ending reports CameraLostError', async () => {
  nextStream = fakeStream();
  const errors = [];
  const opened = await openCamera(fakeVideo(), { onFrame: async () => {}, onError: (e) => errors.push(e.name) });
  nextStream.track.dispatchEvent(new Event('ended'));
  assert.deepEqual(errors, ['CameraLostError']);
  await opened.stop();
  nextStream.track.dispatchEvent(new Event('ended'));
  assert.deepEqual(errors, ['CameraLostError'], 'no report after Stop');
});

function pendingPlayVideo() {
  let resolvePlay;
  const video = { srcObject: null, play: () => new Promise((resolve) => { resolvePlay = resolve; }) };
  return { video, resolvePlay: () => resolvePlay() };
}

test('a camera lost while playback starts fails the start instead of reporting it on', async () => {
  nextStream = fakeStream();
  const { video, resolvePlay } = pendingPlayVideo();
  const errors = [];
  const opening = openCamera(video, { onFrame: async () => {}, onError: (e) => errors.push(e.name) });
  await new Promise((r) => setImmediate(r));
  nextStream.track.dispatchEvent(new Event('ended'));
  resolvePlay();
  await assert.rejects(opening, { name: 'CameraLostError' });
  assert.equal(nextStream.track.stopped, true);
  assert.deepEqual(errors, [], 'reported once, by the start');
});

test('aborting during pending playback releases the camera right away', async () => {
  nextStream = fakeStream();
  const { video, resolvePlay } = pendingPlayVideo();
  const abort = new AbortController();
  let frames = 0;
  const opening = openCamera(video, { onFrame: async () => { frames++; }, onError: () => {}, signal: abort.signal });
  await new Promise((r) => setImmediate(r));
  abort.abort();
  assert.equal(nextStream.track.stopped, true, 'stopped before playback settles');
  assert.equal(video.srcObject, null);
  resolvePlay();
  await opening;
  assert.equal(frames, 0, 'no frame loop after an abort');
});

test('stop waits for the frame already in the model', async () => {
  nextStream = fakeStream();
  let finishFrame;
  let frameDone = false;
  globalThis.requestAnimationFrame = (fn) => { fn(); return 1; };
  const opened = await openCamera(fakeVideo(), {
    onFrame: () => new Promise((resolve) => { finishFrame = () => { frameDone = true; resolve(); }; }),
    onError: () => {}
  });
  const stopping = opened.stop();
  setImmediate(() => finishFrame());
  await stopping;
  assert.equal(frameDone, true);
});
