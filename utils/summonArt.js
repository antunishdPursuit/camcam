// Loads the generated summon artwork: flame sprites, and the full-body fox's
// run and bite clips as sprite sheets (described by sprites/sprites.json).
// Flames and fox load independently, so missing fox clips don't take the fire
// with them; whatever fails, the effect falls back (see summonEffect.js).
const BASE = 'assets/summon/';

// onload rather than img.decode(): decode() can stay pending while the page
// isn't painting (a background tab), which would leave the art unloaded.
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${file}`));
    img.src = BASE + file;
  });
}

async function loadClips(list) {
  return Promise.all(list.map(async (clip) => ({ ...clip, img: await loadImage(`sprites/${clip.sheet}`) })));
}

async function loadFox() {
  const response = await fetch(BASE + 'sprites/sprites.json');
  if (!response.ok) throw new Error(`sprites.json: HTTP ${response.status}`);
  const manifest = await response.json();
  const [run, bite, carry] = await Promise.all([
    loadClips(manifest.run), loadClips(manifest.bite), loadClips(manifest.carry ?? [])
  ]);
  if (!run.length || !bite.length) throw new Error('sprites.json needs run and bite clips');
  return { video: manifest.video, run, bite, carry };
}

export async function loadSummonArt() {
  const [flames, fox] = await Promise.allSettled([
    Promise.all([loadImage('flame-c.webp'), loadImage('flame-d.webp')]),
    loadFox()
  ]);
  if (fox.status === 'rejected') console.warn('Fox sprites unavailable; the attack shows the camera box only.', fox.reason);
  return {
    flames: flames.status === 'fulfilled' ? flames.value : null,
    fox: fox.status === 'fulfilled' ? fox.value : null
  };
}
