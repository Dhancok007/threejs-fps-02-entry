// The Cindersite map: one foundry yard, two bomb sites, three lanes.
// Geometry is data-driven: every solid is an AABB that doubles as its own
// collision box, so what you see is exactly what stops bullets and bodies.
import * as THREE from "three";
import { PAL, mat, box, panel } from "./palette.js";

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
  // docks (east edge): container stacks — long walls of coloured cover with
  // two lanes cut between them; the crane legs stand at the yard's edge
  [33, 13, 6, 2.6, 2.6, "contA"], [33, 19.5, 6, 2.6, 5.2, "contB"], [33, 26, 6, 2.6, 2.6, "contC"],
  [28.5, 22.5, 2.4, 2.4, 1.2, "crate"], [36.8, 12, 0.6, 0.6, 11, "metal"], [36.8, 27, 0.6, 0.6, 11, "metal"],
  // gantry posts flanking the mid door (the beam rides above head height)
  [-3.4, -5, 0.5, 0.5, 5.6, "metal"], [3.4, -5, 0.5, 0.5, 5.6, "metal"],
  // barrel blocks: tight little cover squares out in the lanes
  [-8, 12, 1, 1, 1.1, "metal"], [14, -20, 1, 1, 1.1, "metal"], [-20, 16, 1, 1, 1.1, "metal"],
];

export const SITES = {
  A: { x: -26, z: -11, r: 6.5, color: PAL.siteA, name: "SITE A" },
  B: { x: 26, z: -9, r: 6.5, color: PAL.siteB, name: "SITE B" },
};
export const SPAWNS = {
  us: [[-8, 25], [-4, 26.5], [0, 25], [4, 26.5], [8, 25]],
  them: [[-20, -25], [20, -25], [-26, -22], [26, -22], [0, -27]],
};

// Named zones — radio callouts and the minimap speak in these names, the way
// real squads do. First match wins; sites are checked before their lanes.
export const ZONES = [
  { name: "A SITE", x: -26, z: -11, r: 9 },
  { name: "B SITE", x: 26, z: -9, r: 9 },
  { name: "FOUNDRY", x: -24, z: -22, r: 9 },
  { name: "SILO 3", x: 27, z: -8, r: 12 },
  { name: "A LONG", x: -27, z: 6, r: 10 },
  { name: "DOCKS", x: 31, z: 20, r: 10 },
  { name: "B LONG", x: 25, z: 7, r: 10 },
  { name: "MID SPINE", x: 0, z: -4, r: 9 },
  { name: "NORTH CAMP", x: 0, z: -25, r: 8 },
  { name: "SOUTH YARD", x: 0, z: 24, r: 10 },
];
export function zoneAt(x, z) {
  for (const zn of ZONES) if (Math.hypot(x - zn.x, z - zn.z) <= zn.r) return zn.name;
  return z < -14 ? "NORTH LANE" : z > 12 ? "SOUTH LANE" : "THE YARD";
}

// Waypoint graph for bot navigation: nodes on the lanes, edges walkable.
const NODES = [
  [-6, 22], [6, 22], [-18, 16], [16, 14], [-26, 2], [-8, 4], [8, 2], [24, 4],
  [-26, -11], [-16, -11], [0, -10], [16, -9], [26, -9], [-8, -20], [8, -20],
  [-24, -24], [24, -24], [0, -24], [-16, 6], [18, 8],
  [27, 16], [27, 23], [34, 16], [34, 23],
];
const EDGES = [
  [0, 2], [0, 5], [1, 3], [1, 6], [2, 4], [2, 18], [3, 7], [3, 19], [4, 8],
  [4, 5], [5, 6], [5, 9], [6, 7], [6, 10], [7, 12], [7, 11], [8, 9], [9, 10],
  [9, 13], [10, 11], [10, 14], [11, 12], [12, 16], [13, 14], [13, 15], [14, 17],
  [15, 8], [16, 12], [17, 14], [18, 5], [19, 6], [18, 2], [19, 3],
  [3, 20], [7, 20], [20, 21], [20, 22], [21, 23], [22, 23],
];

export function buildWorld(scene) {
  scene.background = new THREE.Color(PAL.sky);
  scene.fog = new THREE.Fog(PAL.fog, PAL.fogNear, PAL.fogFar);
  scene.add(new THREE.HemisphereLight(0xbdd0dd, 0x3a3128, 1.52));
  const sun = new THREE.DirectionalLight(0xffd9b0, 1.95);
  sun.position.set(-30, 42, 18);
  scene.add(sun);
  const emberLight = new THREE.PointLight(PAL.emberGlow, 60, 26, 1.8);
  emberLight.position.set(-26, 3.4, -12);
  scene.add(emberLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(78, 62),
    mat(0xc2c8d0, { tex: "cobble" })
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
  const mats = {
    wall: mat(0xd8c9b4, { tex: "brick" }), wallDark: mat(0x9c8f7a, { tex: "brick" }),
    crate: mat(0xd9b98c, { tex: "wood" }), crateAlt: mat(0xb9c4cc, { tex: "metal" }),
    metal: mat(0xc3ccd4, { tex: "metal" }), furnace: mat(0xa89c8c, { tex: "concrete", emissive: 0x903500, ei: 0.3 }),
    contA: mat(0xc05a30, { tex: "metal" }), contB: mat(0x2e8f96, { tex: "metal" }), contC: mat(0xd9a92c, { tex: "metal" }),
  };
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

  // --- signage: painted site letters on the ground, stencil signs on walls.
  // A player (and a screenshot) should know where they are without a briefing.
  for (const s of [SITES.A, SITES.B]) {
    const letter = panel(s.name.slice(-1), 7, 3.5, s === SITES.A ? "#ffb347" : "#2fd4c4", 120);
    letter.rotation.x = -Math.PI / 2;
    letter.position.set(s.x, 0.06, s.z + 3.4);
    scene.add(letter);
  }
  const signs = [
    ["SITE A", -26, 2.3, -15.9, 0, "#ffb347"], ["SITE B", 13.3, 2.3, -14, -Math.PI / 2, "#2fd4c4"],
    ["FOUNDRY", -26, 3.2, -8.4, 0, "#f5ede0"], ["SILO 3", 24, 4.2, 0.6, 0, "#f5ede0"],
    ["MID", 0.7, 2.1, 8, Math.PI / 2, "#f5ede0"], ["A LONG", -33.9, 1.9, 2, Math.PI / 2, "#f5ede0"],
    ["DOCKS", 29.9, 3.4, 19.5, -Math.PI / 2, "#f5ede0"], ["CRANE 2", 36.4, 9.6, 19.5, -Math.PI / 2, "#ffb347"],
  ];
  for (const [text, x, y, z, ry, color] of signs) {
    const p = panel(text, 4.6, 2.3, color, 64);
    p.position.set(x, y, z);
    p.rotation.y = ry;
    scene.add(p);
  }

  // --- the docks set piece: apron, gantry crane, a container on the hook.
  // Pure theatre above and around the container stacks — it gives the east
  // lane a skyline of its own and a landmark every callout can lean on.
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(15, 21), mat(0x8f979e, { tex: "concrete" }));
  apron.rotation.x = -Math.PI / 2; apron.position.set(31, 0.015, 19.5);
  scene.add(apron);
  const craneBeam = box(0.8, 0.9, 16.5, mats.metal);
  craneBeam.position.set(36.8, 11.2, 19.5);
  scene.add(craneBeam);
  const craneJib = box(11, 0.6, 0.6, mats.metal);
  craneJib.position.set(31.6, 10.7, 19.5);
  scene.add(craneJib);
  const hookLine = box(0.08, 3.2, 0.08, mat(0x333333));
  hookLine.position.set(28.5, 9, 19.5);
  scene.add(hookLine);
  const hanging = box(6, 2.6, 2.4, mats.contA);
  hanging.position.set(28.5, 6.2, 19.5);
  hanging.rotation.z = 0.02;
  scene.add(hanging);
  // gantry beam over the mid door, high enough to duck nothing
  const gantry = box(7.6, 0.5, 0.7, mats.metal);
  gantry.position.set(0, 5.6, -5);
  scene.add(gantry);
  const gantrySign = panel("MID GANTRY", 3.8, 0.9, "#f5ede0", 48);
  gantrySign.position.set(0, 5.55, -4.6);
  scene.add(gantrySign);

  // --- dressing: barrel clusters on their collider blocks, oil stains,
  // and the world outside the walls — silhouettes and smokestacks so the
  // yard reads as one corner of a much bigger works.
  for (const [x, z] of [[-8, 12], [14, -20], [-20, 16]]) {
    for (const [ox, oz, c] of [[-0.24, -0.24, 0x7a4a21], [0.24, 0.2, 0x31556b], [0, 0.28, 0x5d6d35]]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 1.1, 10), mat(c, { tex: "metal" }));
      b.position.set(x + ox, 0.55, z + oz);
      scene.add(b);
    }
  }
  for (const [x, z, r] of [[-4, -14, 2.6], [18, 20, 3.2], [-30, 12, 2.2], [8, -26, 2.8], [30, -16, 2.4]]) {
    const stain = new THREE.Mesh(new THREE.CircleGeometry(r, 18), new THREE.MeshBasicMaterial({ color: 0x14161a, transparent: true, opacity: 0.35 }));
    stain.rotation.x = -Math.PI / 2; stain.position.set(x, 0.03, z);
    scene.add(stain);
  }
  const silhouette = mat(0x39434f, { tex: "concrete" });
  for (const [x, z, w, h] of [[-52, -20, 10, 14], [-40, -46, 14, 20], [2, -50, 18, 12], [32, -47, 12, 24], [54, -28, 10, 16], [56, 8, 12, 18], [50, 38, 16, 10], [-50, 32, 12, 15], [-56, -2, 10, 22]]) {
    const m = box(w, h, w, silhouette);
    m.position.set(x, h / 2, z);
    scene.add(m);
  }
  for (const [x, z, h] of [[-45, -16, 17], [-47, -4, 13]]) {
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, h, 12), silhouette);
    stack.position.set(x, h / 2, z);
    scene.add(stack);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), mat(0xff7733, { emissive: PAL.emberGlow, ei: 1.2 }));
    tip.position.set(x, h + 0.4, z);
    scene.add(tip);
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
