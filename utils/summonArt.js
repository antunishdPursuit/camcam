// Loads the generated summon artwork (side-view fox head and jaw, flame
// sprites). Until, or unless, this resolves the effect skips the fox art.
const BASE = 'assets/summon/';

// onload rather than img.decode(): decode() can stay pending while the page
// isn't painting (a background tab), which would leave the fox unloaded.
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${file}`));
    img.src = BASE + file;
  });
}

export async function loadSummonArt() {
  const [foxHead, foxJaw, flameA, flameB, layers] = await Promise.all([
    loadImage('fox-side-head.webp'),
    loadImage('fox-side-jaw.webp'),
    loadImage('flame-c.webp'),
    loadImage('flame-d.webp'),
    fetch(BASE + 'layers.json').then((res) => res.json())
  ]);
  return { foxHead, foxJaw, flames: [flameA, flameB], ...layers };
}
