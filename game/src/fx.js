// Shared battlefield effects registry: smoke clouds and incendiary fire
// zones. A smoke is a sphere that blocks sight lines (bot perception and
// callouts respect it) while bullets pass through — the classic information
// cut. A fire zone is a cylinder that hurts everyone standing in it and
// that bots step out of: area denial with a clock on it. Both live in this
// one module so world, bots, rounds and main all agree on where they are.

const smokes = []; // { x, y, z, r, t }
const fires = [];  // { x, z, r, t, ttl }

export function addSmoke(x, z, r = 5.6, ttl = 15) {
  smokes.push({ x, y: 1.3, z, r, t: ttl });
}

export function addFire(x, z, r = 4.4, ttl = 7, owner = null) {
  fires.push({ x, z, r, t: ttl, ttl, owner });
}

export function tickSmokes(dt) {
  for (let i = smokes.length - 1; i >= 0; i--) {
    smokes[i].t -= dt;
    if (smokes[i].t <= 0) smokes.splice(i, 1);
  }
  for (let i = fires.length - 1; i >= 0; i--) {
    fires[i].t -= dt;
    if (fires[i].t <= 0) fires.splice(i, 1);
  }
}

export function activeSmokes() { return smokes; }
export function activeFires() { return fires; }

// Is this ground point inside a burning zone? Fire does not care whose
// boots are melting — attacker, defender and the thrower all burn.
export function inFire(x, z) {
  for (const f of fires) {
    const dx = x - f.x, dz = z - f.z;
    if (dx * dx + dz * dz < f.r * f.r) return f;
  }
  return null;
}

// Does the straight sight line between two points pass through any smoke?
export function losBlocked(x1, y1, z1, x2, y2, z2) {
  const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
  const len2 = dx * dx + dy * dy + dz * dz || 1;
  for (const s of smokes) {
    let u = ((s.x - x1) * dx + (s.y - y1) * dy + (s.z - z1) * dz) / len2;
    u = Math.max(0, Math.min(1, u));
    const px = x1 + dx * u - s.x, py = y1 + dy * u - s.y, pz = z1 + dz * u - s.z;
    if (px * px + py * py + pz * pz < s.r * s.r * 0.72) return true;
  }
  return false;
}
