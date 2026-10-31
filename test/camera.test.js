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
