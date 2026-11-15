// The Cindersite map: one foundry yard, two bomb sites, three lanes.
// Geometry is data-driven: every solid is an AABB that doubles as its own
// collision box, so what you see is exactly what stops bullets and bodies.
import * as THREE from "three";
import { PAL, mat, box } from "./palette.js";

// Layout entries: [cx, cz, w, d, h, materialKey, yBase?]
// The yard is 76 x 60 m. Attackers (us) spawn south, Wardens north.
const LAYOUT = [
  // perimeter
  [0, -30.5, 78, 1, 5, "wall"], [0, 30.5, 78, 1, 5, "wall"],
  [-38.5, 0, 1, 62, 5, "wall"], [38.5, 0, 1, 62, 5, "wall"],
  // site A (west): furnace hall — furnace block + crate stacks
  [-26, -12, 10, 7, 4.4, "furnace"], [-26, -19.5, 16, 1, 3.4, "wallDark"],
  [-33, -4, 2.4, 2.4, 2.4, "crate"], [-30.6, -4, 2.4, 2.4, 1.2, "crateAlt"],
  [-19, -5, 2.4, 4.8, 1.2, "crateAlt"], [-14, -14, 1, 12, 3.4, "wall"],
  // site B (east): silo yard — three silo blocks + low cover
  [24, -14, 5, 5, 7, "metal"], [31, -8, 5, 5, 7, "metal"], [24, -2, 5, 5, 7, "metal"],
  [17, -12, 2.4, 2.4, 1.2, "crate"], [29, -18, 4.8, 2.4, 2.4, "crate"],
  [14, -14, 1, 12, 3.4, "wall"],
  // mid: the spine wall splits the yard; two door gaps are the connectors
  [0, -16, 1.2, 16, 3.6, "wallDark"], [0, 8, 1.2, 20, 3.6, "wallDark"],
  [-6, 0, 6, 2.4, 1.2, "crateAlt"], [6, -4, 2.4, 2.4, 2.4, "crate"],
  // south lane cover (attacker approach)
  [-16, 14, 4.8, 2.4, 2.4, "crate"], [12, 16, 2.4, 2.4, 1.2, "crateAlt"],
  [22, 10, 6, 1, 2.6, "wall"], [-24, 8, 1, 8, 2.6, "wall"],
  // north lane cover (defender side)
  [-12, -24, 2.4, 2.4, 1.2, "crateAlt"], [10, -24, 4.8, 2.4, 2.4, "crate"],
  [0, -26, 8, 1, 2.6, "wall"],
];

export const SITES = {
  A: { x: -26, z: -11, r: 6.5, color: PAL.siteA, name: "SITE A" },
  B: { x: 26, z: -9, r: 6.5, color: PAL.siteB, name: "SITE B" },
};
export const SPAWNS = {
  us: [[-8, 25], [-4, 26.5], [0, 25], [4, 26.5], [8, 25]],
  them: [[-20, -25], [20, -25], [-26, -22], [26, -22], [0, -27]],
};

// Waypoint graph for bot navigation: nodes on the lanes, edges walkable.
const NODES = [
  [-6, 22], [6, 22], [-18, 16], [16, 14], [-26, 2], [-8, 4], [8, 2], [24, 4],
  [-26, -11], [-16, -11], [0, -10], [16, -9], [26, -9], [-8, -20], [8, -20],
  [-24, -24], [24, -24], [0, -24], [-16, 6], [18, 8],
];
const EDGES = [
  [0, 2], [0, 5], [1, 3], [1, 6], [2, 4], [2, 18], [3, 7], [3, 19], [4, 8],
  [4, 5], [5, 6], [5, 9], [6, 7], [6, 10], [7, 12], [7, 11], [8, 9], [9, 10],
  [9, 13], [10, 11], [10, 14], [11, 12], [12, 16], [13, 14], [13, 15], [14, 17],
  [15, 8], [16, 12], [17, 14], [18, 5], [19, 6], [18, 2], [19, 3],
];

export function buildWorld(scene) {
  scene.background = new THREE.Color(PAL.sky);
  scene.fog = new THREE.Fog(PAL.fog, PAL.fogNear, PAL.fogFar);
  scene.add(new THREE.HemisphereLight(0xbdd0dd, 0x3a3128, 1.12));
  const sun = new THREE.DirectionalLight(0xffd9b0, 1.5);
  sun.position.set(-30, 42, 18);
  scene.add(sun);
  const emberLight = new THREE.PointLight(PAL.emberGlow, 60, 26, 1.8);
  emberLight.position.set(-26, 3.4, -12);
  scene.add(emberLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(78, 62),
    mat(PAL.ground)
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  // darker aprons under the sites so the zones read from across the yard
  for (const s of [SITES.A, SITES.B]) {
    const apron = new THREE.Mesh(new THREE.CircleGeometry(s.r + 1.2, 28), mat(PAL.groundAlt));
    apron.rotation.x = -Math.PI / 2; apron.position.set(s.x, 0.02, s.z);
    scene.add(apron);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s.r - 0.35, s.r, 40),
      new THREE.MeshBasicMaterial({ color: s.color, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2; ring.position.set(s.x, 0.04, s.z);
    scene.add(ring);
    // beacon pillar of light so a planted site is findable
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.5, 9, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
    );
    beam.position.set(s.x, 4.5, s.z);
    scene.add(beam);
  }

  const colliders = [];
  const mats = { wall: mat(PAL.wall), wallDark: mat(PAL.wallDark), crate: mat(PAL.crate), crateAlt: mat(PAL.crateAlt), metal: mat(PAL.metal), furnace: mat(PAL.furnace, { emissive: 0x903500, ei: 0.35 }) };
  for (const [cx, cz, w, d, h, key] of LAYOUT) {
    const m = box(w, h, d, mats[key]);
    m.position.set(cx, h / 2, cz);
    scene.add(m);
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h });
    if (key === "furnace") {
      const mouth = box(3.4, 1.6, 0.3, mat(0x1c0f08, { emissive: PAL.emberGlow, ei: 1.6 }));
      mouth.position.set(cx, 1.1, cz + d / 2 + 0.16);
      scene.add(mouth);
    }
  }
  // silo caps
  for (const [x, z] of [[24, -14], [31, -8], [24, -2]]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.8, 14), mat(PAL.trim));
    cap.position.set(x, 7.4, z);
    scene.add(cap);
  }

  const nav = NODES.map(([x, z], i) => ({ i, x, z, next: [] }));
  for (const [a, b] of EDGES) { nav[a].next.push(b); nav[b].next.push(a); }
  return { colliders, nav };
}

// Circle (x,z,r) vs AABB colliders: push out along the smallest penetration.
export function collide(colliders, pos, r) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2), push = (r - d) / d;
      pos.x += dx * push; pos.z += dz * push;
    } else {
      // centre inside the box: push out the shallowest face
      const pl = pos.x - c.minX, pr = c.maxX - pos.x, pt = pos.z - c.minZ, pb = c.maxZ - pos.z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) pos.x = c.minX - r; else if (m === pr) pos.x = c.maxX + r;
      else if (m === pt) pos.z = c.minZ - r; else pos.z = c.maxZ + r;
    }
  }
  pos.x = Math.max(-37.4, Math.min(37.4, pos.x));
  pos.z = Math.max(-29.4, Math.min(29.4, pos.z));
}

// Segment vs colliders for bullets: returns nearest hit distance or Infinity.
export function rayHit(colliders, ox, oy, oz, dx, dy, dz, maxDist) {
  let best = maxDist;
  for (const c of colliders) {
    let t0 = 0, t1 = best;
    // X slab
    if (Math.abs(dx) < 1e-9) { if (ox < c.minX || ox > c.maxX) continue; }
    else {
      let ta = (c.minX - ox) / dx, tb = (c.maxX - ox) / dx;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) continue;
    }
    // Y slab (boxes sit on the ground, top at c.h)
    if (Math.abs(dy) < 1e-9) { if (oy < 0 || oy > c.h) continue; }
    else {
      let ta = (0 - oy) / dy, tb = (c.h - oy) / dy;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) continue;
    }
    // Z slab
    if (Math.abs(dz) < 1e-9) { if (oz < c.minZ || oz > c.maxZ) continue; }
    else {
      let ta = (c.minZ - oz) / dz, tb = (c.maxZ - oz) / dz;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) continue;
    }
    if (t0 < best && t0 >= 0) best = t0;
  }
  // ground plane
  if (dy < -1e-9) { const t = -oy / dy; if (t >= 0 && t < best) best = t; }
  return best;
}

// Breadth-first path over the waypoint graph; returns node indices to walk.
export function findPath(nav, fromIdx, toIdx) {
  if (fromIdx === toIdx) return [toIdx];
  const prev = new Map([[fromIdx, -1]]);
  const queue = [fromIdx];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === toIdx) break;
    for (const n of nav[cur].next) if (!prev.has(n)) { prev.set(n, cur); queue.push(n); }
  }
  if (!prev.has(toIdx)) return [toIdx];
  const path = [];
  for (let c = toIdx; c !== -1; c = prev.get(c)) path.push(c);
  return path.reverse();
}
export function nearestNode(nav, x, z) {
  let best = 0, bd = Infinity;
  for (const n of nav) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n.i; } }
  return best;
}
