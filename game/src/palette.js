// Cindersite palette: a dusk foundry. Warm ember against cool slate and
// teal — the two team colours read instantly at any distance. Surfaces use
// small procedural canvas textures (brick, cobble, planks, concrete, metal)
// so the world reads as built, not as flat prototype boxes.
import * as THREE from "three";

export const PAL = {
  sky: 0x2b3644, fog: 0x2b3644, fogNear: 60, fogFar: 140,
  ground: 0x3d4148, groundAlt: 0x35393f,
  wall: 0x8a7f6d, wallDark: 0x6b6252, trim: 0x54493a,
  crate: 0x9c6b3f, crateAlt: 0x7d8894, metal: 0x707a84,
  furnace: 0x4a4038, emberGlow: 0xff6a1f,
  siteA: 0xffb347, siteB: 0x2fd4c4,
  us: 0xff7a29, usDark: 0xb34d12, them: 0x2fd4c4, themDark: 0x177a72,
  tracer: 0xffd9a0, muzzle: 0xffc46b,
};

const cache = new Map();
export function mat(color, opts = {}) {
  const key = color + "|" + (opts.flat ? 1 : 0) + "|" + (opts.rough ?? "") + "|" + (opts.tex ?? "");
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshLambertMaterial({ color });
  if (opts.tex) { m.map = tex(opts.tex); }
  if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.ei ?? 1; }
  cache.set(key, m);
  return m;
}

export function box(w, h, d, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.castShadow = false; mesh.receiveShadow = false;
  return mesh;
}

// --- procedural textures ---------------------------------------------------
// Each texture is a 128px canvas painted once and tiled. A seeded PRNG makes
// every load paint the same foundry.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function canvasTex(paint, repeat = 1) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  paint(c.getContext("2d"), 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const texCache = new Map();
export function tex(kind) {
  if (texCache.has(kind)) return texCache.get(kind);
  const R = rng(kind.length * 7919 + kind.charCodeAt(0) * 131);
  let t;
  if (kind === "brick") {
    t = canvasTex((g, S) => {
      g.fillStyle = "#7d6a52"; g.fillRect(0, 0, S, S);
      const bh = 16, bw = 32;
      for (let y = 0; y < S / bh; y++) {
        for (let x = -1; x < S / bw + 1; x++) {
          const off = y % 2 ? bw / 2 : 0;
          const v = 0.82 + R() * 0.36;
          g.fillStyle = `rgb(${Math.round(146 * v)},${Math.round(118 * v)},${Math.round(88 * v)})`;
          g.fillRect(x * bw + off + 1.5, y * bh + 1.5, bw - 3, bh - 3);
        }
      }
      g.fillStyle = "rgba(30,22,16,0.25)";
      for (let i = 0; i < 260; i++) g.fillRect(R() * S, R() * S, 2, 2);
    });
  } else if (kind === "cobble") {
    t = canvasTex((g, S) => {
      g.fillStyle = "#43464c"; g.fillRect(0, 0, S, S);
      const cell = S / 5;
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
        const v = 0.9 + R() * 0.2;
        g.fillStyle = `rgb(${Math.round(99 * v)},${Math.round(104 * v)},${Math.round(114 * v)})`;
        g.beginPath();
        g.roundRect(x * cell + 1.6, y * cell + 1.6, cell - 3.2, cell - 3.2, 6);
        g.fill();
        g.fillStyle = "rgba(255,255,255,0.05)";
        g.fillRect(x * cell + 4, y * cell + 3, cell - 8, 2);
      }
      g.fillStyle = "rgba(255,150,60,0.05)";
      for (let i = 0; i < 40; i++) g.fillRect(R() * S, R() * S, 3, 1);
    }, 16);
  } else if (kind === "wood") {
    t = canvasTex((g, S) => {
      g.fillStyle = "#8a5a30"; g.fillRect(0, 0, S, S);
      for (let p = 0; p < 4; p++) {
        const v = 0.85 + R() * 0.3;
        g.fillStyle = `rgb(${Math.round(158 * v)},${Math.round(106 * v)},${Math.round(60 * v)})`;
        g.fillRect(0, p * 32 + 1.5, S, 29);
        g.strokeStyle = "rgba(60,36,16,0.5)"; g.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
          g.beginPath();
          const y = p * 32 + 5 + R() * 22;
          g.moveTo(0, y); g.bezierCurveTo(40, y + 3, 90, y - 3, S, y + 1); g.stroke();
        }
      }
      g.fillStyle = "rgba(40,26,12,0.85)";
      for (const [x, y] of [[6, 6], [122, 6], [6, 122], [122, 122]]) { g.beginPath(); g.arc(x, y, 2.4, 0, 7); g.fill(); }
    });
  } else if (kind === "concrete") {
    t = canvasTex((g, S) => {
      g.fillStyle = "#5d564a"; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 900; i++) {
        const v = 0.75 + R() * 0.5;
        g.fillStyle = `rgba(${Math.round(110 * v)},${Math.round(102 * v)},${Math.round(88 * v)},0.5)`;
        g.fillRect(R() * S, R() * S, 2.2, 2.2);
      }
      g.strokeStyle = "rgba(28,24,20,0.55)"; g.lineWidth = 2;
      g.strokeRect(1, 1, S - 2, S - 2);
      g.fillStyle = "rgba(20,16,12,0.35)";
      g.fillRect(0, S - 14 - R() * 10, S, 24);
    });
  } else { // metal
    t = canvasTex((g, S) => {
      g.fillStyle = "#6d777f"; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 46; i++) {
        g.fillStyle = `rgba(30,34,38,${0.05 + R() * 0.12})`;
        g.fillRect(R() * S, 0, 1.4, S);
      }
      g.fillStyle = "rgba(22,24,26,0.8)";
      for (const [x, y] of [[7, 7], [121, 7], [7, 121], [121, 121]]) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
      g.strokeStyle = "rgba(24,26,28,0.6)"; g.lineWidth = 2; g.strokeRect(1, 1, S - 2, S - 2);
    });
  }
  texCache.set(kind, t);
  return t;
}

// A painted panel: a big stencil letter or a word sign, transparent surround.
export function panelTexture(text, color = "#f5ede0", fontPx = 92) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const g = c.getContext("2d");
  g.clearRect(0, 0, 256, 128);
  g.font = `900 ${fontPx}px system-ui, sans-serif`;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = color;
  g.globalAlpha = 0.92;
  g.fillText(text, 128, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function panel(text, w, h, color, fontPx) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: panelTexture(text, color, fontPx), transparent: true, side: THREE.DoubleSide })
  );
}
