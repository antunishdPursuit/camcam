import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCameraController, describeError, namedError } from '../utils/cameraController.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function fakeCamera() {
  return { stopped: 0, async stop() { this.stopped++; } };
}

function setup(overrides = {}) {
  const states = [];
  const controller = createCameraController({
    loadModel: async () => {},
    openCamera: async () => fakeCamera(),
    onStatus: (state, message) => states.push({ state, message }),
    ...overrides
  });
  return { controller, states };
}

test('starts and stops the camera', async () => {
  const camera = fakeCamera();
  const { controller } = setup({ openCamera: async () => camera });
  await controller.start();
  assert.equal(controller.state, 'running');
  await controller.stop();
  assert.equal(controller.state, 'stopped');
  assert.equal(camera.stopped, 1);
});

test('stop during pending camera permission releases the late stream', async () => {
  const pending = deferred();
  const camera = fakeCamera();
  const { controller } = setup({ openCamera: () => pending.promise });
  const starting = controller.start();
  await new Promise((r) => setImmediate(r));
  await controller.stop();
  pending.resolve(camera);
  await starting;
  assert.equal(controller.state, 'stopped');
  assert.equal(camera.stopped, 1);
});

test('stop during model load never opens the camera', async () => {
  const model = deferred();
  let opened = 0;
  const { controller } = setup({
    loadModel: () => model.promise,
    openCamera: async () => { opened++; return fakeCamera(); }
  });
  const starting = controller.start();
  await controller.stop();
  model.resolve();
  await starting;
  assert.equal(opened, 0);
  assert.equal(controller.state, 'stopped');
});

test('a second start while starting is ignored', async () => {
  const model = deferred();
  let loads = 0;
  const { controller } = setup({ loadModel: () => { loads++; return model.promise; } });
  const first = controller.start();
  await controller.start();
  model.resolve();
  await first;
  assert.equal(loads, 1);
  assert.equal(controller.state, 'running');
});

test('permission denial shows a recovery message and allows retry', async () => {
  let attempts = 0;
  const { controller, states } = setup({
    openCamera: async () => {
      attempts++;
      if (attempts === 1) throw namedError('NotAllowedError');
      return fakeCamera();
    }
  });
  await controller.start();
  assert.equal(controller.state, 'error');
  assert.match(states.at(-1).message, /permission was denied/);
  await controller.start();
  assert.equal(controller.state, 'running');
});

test('inference failure while running releases the camera', async () => {
  const camera = fakeCamera();
  const { controller } = setup({ openCamera: async () => camera });
  await controller.start();
  await controller.fail(namedError('InferenceError'));
  assert.equal(controller.state, 'error');
  assert.equal(camera.stopped, 1);
});

test('every known error name has a specific message', () => {
  const fallback = describeError(new Error('x'));
  for (const name of ['InsecureContextError', 'NotAllowedError', 'NotFoundError', 'NotReadableError', 'ModelLoadError', 'InferenceError']) {
    assert.notEqual(describeError(namedError(name)), fallback, name);
  }
});

test('stop reports stopped before the camera finishes releasing', async () => {
  const release = deferred();
  const camera = { stop: () => release.promise };
  const { controller } = setup({ openCamera: async () => camera });
  await controller.start();
  const stopping = controller.stop();
  assert.equal(controller.state, 'stopped');
  release.resolve();
  await stopping;
});

test('openCamera is told when its start has been superseded', async () => {
  const pending = deferred();
  let isCurrent;
  const { controller } = setup({ openCamera: (current) => { isCurrent = current; return pending.promise; } });
  const starting = controller.start();
  await new Promise((r) => setImmediate(r));
  assert.equal(isCurrent(), true);
  await controller.stop();
  assert.equal(isCurrent(), false);
  pending.resolve(fakeCamera());
  await starting;
});

test('a lost camera has its own message', () => {
  assert.match(describeError(namedError('CameraLostError')), /disconnected/);
});

test('a restart waits for the old camera to finish releasing', async () => {
  const release = deferred();
  let opens = 0;
  const { controller } = setup({ openCamera: async () => { opens++; return { stop: () => release.promise }; } });
  await controller.start();
  const stopping = controller.stop();
  const restarting = controller.start();
  await new Promise((r) => setImmediate(r));
  assert.equal(opens, 1, 'the new camera waits');
  release.resolve();
  await stopping;
  await restarting;
  assert.equal(opens, 2);
  assert.equal(controller.state, 'running');
});

test('stop aborts a camera that is still opening', async () => {
  const pending = deferred();
  let signal;
  const { controller } = setup({ openCamera: (current, s) => { signal = s; return pending.promise; } });
  const starting = controller.start();
  await new Promise((r) => setImmediate(r));
  assert.equal(signal.aborted, false);
  await controller.stop();
  assert.equal(signal.aborted, true);
  pending.resolve(fakeCamera());
  await starting;
});
