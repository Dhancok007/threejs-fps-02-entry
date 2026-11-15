// Shared battlefield effects registry: smoke clouds. A smoke is a sphere
// that blocks sight lines (bot perception and callouts respect it) while
// bullets pass through — the classic information cut. Kept in one tiny
// module so world, bots and main all agree on where the smoke is.

const smokes = []; // { x, y, z, r, t }

export function addSmoke(x, z, r = 5.6, ttl = 15) {
  smokes.push({ x, y: 1.3, z, r, t: ttl });
}

export function tickSmokes(dt) {
  for (let i = smokes.length - 1; i >= 0; i--) {
    smokes[i].t -= dt;
    if (smokes[i].t <= 0) smokes.splice(i, 1);
  }
}

export function activeSmokes() { return smokes; }

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
