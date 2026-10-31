// Owns the camera/model lifecycle: idle → starting → running, with stopped and
// error reachable from any active state. Each start gets a session id so a
// Stop during a pending start invalidates late results instead of reviving them.
export function createCameraController({ loadModel, openCamera, onStatus }) {
  let session = 0;
  let camera = null;
  let state = 'idle';

  function setState(next, message = '') {
    state = next;
    onStatus(next, message);
  }

  async function release() {
    const current = camera;
    camera = null;
    if (current) await current.stop();
  }

  async function start() {
    if (state === 'starting' || state === 'running') return;
    const id = ++session;
    setState('starting', 'Loading hand-tracking model…');

    try {
      await loadModel();
      if (id !== session) return;

      setState('starting', 'Waiting for camera permission…');
      const opened = await openCamera(() => id === session);
      if (id !== session) {
        await opened.stop();
        return;
      }
      camera = opened;
      setState('running', 'Camera on. Show one hand to the camera.');
    } catch (error) {
      if (id !== session) return;
      await release();
      setState('error', describeError(error));
    }
  }

  // State changes before the camera finishes releasing, so a frame still in
  // flight sees a non-running state and isn't drawn after Stop.
  async function stop() {
    session++;
    const releasing = release();
    setState('stopped', 'Camera off.');
    await releasing;
  }

  async function fail(error) {
    if (state !== 'running') return;
    session++;
    const releasing = release();
    setState('error', describeError(error));
    await releasing;
  }

  return {
    start,
    stop,
    fail,
    get state() { return state; }
  };
}

export function describeError(error) {
  switch (error?.name) {
    case 'InsecureContextError':
      return 'Camera access needs HTTPS or localhost. Open CamCam from a secure address.';
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission was denied. Allow camera access in your browser\'s site settings, then choose Start Camera.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found. Connect a camera and try again.';
    case 'NotReadableError':
    case 'AbortError':
      return 'The camera is busy or unavailable. Close other apps using it and try again.';
    case 'CameraLostError':
      return 'The camera disconnected. Reconnect it, then choose Start Camera.';
    case 'ModelLoadError':
      return 'The hand-tracking model couldn\'t load. Check your connection and try again.';
    case 'InferenceError':
      return 'Hand tracking stopped unexpectedly. Choose Start Camera to try again.';
    default:
      return 'Something went wrong starting the camera. Try again.';
  }
}

export function namedError(name, cause) {
  const error = new Error(name, { cause });
  error.name = name;
  return error;
}
