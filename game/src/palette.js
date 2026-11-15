// Cindersite palette: a dusk foundry. Warm ember against cool slate and
// teal — the two team colours read instantly at any distance.
import * as THREE from "three";

export const PAL = {
  sky: 0x1a2027, fog: 0x232a31, fogNear: 55, fogFar: 130,
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
  const key = color + "|" + (opts.flat ? 1 : 0) + "|" + (opts.rough ?? "");
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshLambertMaterial({ color });
  if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.ei ?? 1; }
  cache.set(key, m);
  return m;
}

export function box(w, h, d, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.castShadow = false; mesh.receiveShadow = false;
  return mesh;
}
