// Bot fighters: low-poly soldiers with waypoint navigation, perception
// (sight with line-of-sight + hearing gunfire), burst fire with human-like
// reaction delays, and jobs — rush a site, hold a lane, plant, defuse.
import * as THREE from "three";
import { PAL, mat } from "./palette.js";
import { collide, findPath, nearestNode, rayHit } from "./world.js";
import { Gun, WEAPONS } from "./weapon.js";
import { losBlocked, inFire } from "./fx.js";

const NAMES_US = ["VIPER", "JUNO", "MAGMA", "OTIS"];
const NAMES_THEM = ["WARD", "SABLE", "IRONS", "PETRA", "HOLT"];

export class Bot {
  constructor(scene, team, idx, spawn) {
    this.team = team; this.isPlayer = false;
    this.name = team === "us" ? NAMES_US[idx] : NAMES_THEM[idx];
    this.pos = new THREE.Vector3(spawn[0], 0, spawn[1]);
    this.yaw = team === "us" ? 0 : Math.PI;
    this.hp = 100; this.armor = 0; this.alive = true;
    this.radius = 0.42;
    this.gun = new Gun(WEAPONS.pistol);
    this.money = 800;
    // brain
    this.state = "advance"; this.path = []; this.pathI = 0;
    this.targetPos = null; this.holdPos = null; this.repathT = 0;
    this.seeT = 0; this.target = null; this.reactT = 0; this.lastKnown = null;
    this.burst = 0; this.burstCool = 0.4 + Math.random() * 0.5; this.strafeDir = 1; this.strafeT = 0;
    this.channel = 0; this.skill = 0.82 + Math.random() * 0.3; // aim/reaction scaler
    this.blindT = 0; this.kit = false;
    this.mesh = buildSoldier(team);
    const plate = makeNameplate(this.name, team);
    plate.position.y = 2.02;
    this.mesh.add(plate);
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
  }
  reset(spawn, faceYaw) {
    this.pos.set(spawn[0], 0, spawn[1]);
    this.yaw = faceYaw !== undefined ? faceYaw : this.team === "us" ? 0 : Math.PI;
    this.hp = 100; this.alive = true; this.state = "advance";
    this.path = []; this.target = null; this.lastKnown = null; this.channel = 0;
    this.blindT = 0;
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, 0, 0);
  }
  eyeY() { return 1.58; }
  eyePos(out) { return out.set(this.pos.x, this.eyeY(), this.pos.z); }
  hitTest(origin, dir, maxD) {
    if (!this.alive) return null;
    let best = null;
    for (const [cy, r, head] of [[1.5, 0.21, true], [0.92, 0.44, false]]) {
      const ox = origin.x - this.pos.x, oy = origin.y - cy, oz = origin.z - this.pos.z;
      const b = ox * dir.x + oy * dir.y + oz * dir.z;
      const c = ox * ox + oy * oy + oz * oz - r * r;
      const disc = b * b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t > 0 && t < maxD && (!best || t < best.dist)) best = { fighter: this, dist: t, head };
    }
    return best;
  }
  die() {
    this.alive = false;
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.25;
  }
  hear(x, z) {
    if (!this.alive) return;
    if (!this.target) { this.lastKnown = { x, z }; if (this.state === "hold") this.state = "investigate"; }
  }
  setDestination(nav, x, z) {
    const from = nearestNode(nav, this.pos.x, this.pos.z);
    const to = nearestNode(nav, x, z);
    this.path = findPath(nav, from, to).map((i) => nav[i]);
    this.pathI = 0;
    this.targetPos = { x, z };
  }
  update(dt, env) {
    if (!this.alive) return;
    const { colliders, nav, fighters, phase } = env;
    this.repathT -= dt; this.seeT -= dt;
    if (this.blindT > 0) {
      // flashed: no perception, no shots, a stunned half-step and a held angle
      this.blindT -= dt;
      this.target = null;
      collide(colliders, this.pos, this.radius);
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.y = this.yaw;
      return;
    }
    // --- perception (checked on a stagger so 9 bots don't raycast every frame)
    if (this.seeT <= 0) {
      this.seeT = 0.11 + Math.random() * 0.05;
      let seen = null, seenD = Infinity;
      for (const f of fighters) {
        if (!f.alive || f.team === this.team) continue;
        const dx = f.pos.x - this.pos.x, dz = f.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 55) continue;
        // facing check: generous 150° cone, plus point-blank awareness
        const ang = Math.atan2(-dx, -dz);
        let diff = Math.abs(((ang - this.yaw) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
        if (diff > 2.6 && d > 4) continue;
        const wall = rayHit(colliders, this.pos.x, this.eyeY(), this.pos.z, dx / d, 0, dz / d, d);
        if (wall < d - 0.6) continue;
        if (losBlocked(this.pos.x, this.eyeY(), this.pos.z, f.pos.x, 1.2, f.pos.z)) continue; // smoke cuts the line
        if (d < seenD) { seenD = d; seen = f; }
      }
      if (seen) {
        const fresh = this.target !== seen;
        if (fresh) this.reactT = (0.42 - this.skill * 0.18) * (0.8 + Math.random() * 0.5);
        this.target = seen; this.lastKnown = { x: seen.pos.x, z: seen.pos.z };
        if (fresh && env.onContact) env.onContact(this, seen);
      } else if (this.target && !this.target.alive) this.target = null;
      else if (this.target) {
        // lost sight: keep the target briefly, then fall back to lastKnown
        const dx = this.target.pos.x - this.pos.x, dz = this.target.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        const wall = rayHit(colliders, this.pos.x, this.eyeY(), this.pos.z, dx / d, 0, dz / d, d);
        if (wall < d - 0.6 || losBlocked(this.pos.x, this.eyeY(), this.pos.z, this.target.pos.x, 1.2, this.target.pos.z)) this.target = null;
      }
    }
    // --- act
    let moveTarget = null, speed = 4.6, faceYaw = null;
    if (this.target && this.reactT <= 0 && phase === "live") {
      // engage: hold ground, strafe, burst
      faceYaw = Math.atan2(-(this.target.pos.x - this.pos.x), -(this.target.pos.z - this.pos.z));
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = 0.6 + Math.random() * 0.9; this.strafeDir = Math.random() < 0.5 ? -1 : 1; }
      const px = -Math.cos(this.yaw), pz = Math.sin(this.yaw);
      moveTarget = { x: this.pos.x + px * this.strafeDir * 2, z: this.pos.z + pz * this.strafeDir * 2 };
      speed = 2.4;
      this.burstCool -= dt;
      if (this.burstCool <= 0) {
        if (this.burst <= 0) { this.burst = this.gun.def.auto ? 3 + (Math.random() * 3 | 0) : 1; this.burstCool = 0.34 + Math.random() * 0.5; }
        else if (env.tryBotShoot(this)) { this.burst--; this.burstCool = 60 / this.gun.def.rpm; }
      }
    } else {
      if (this.target) this.reactT -= dt;
      if (this.state === "hold" && this.holdPos) {
        faceYaw = this.holdYaw;
        if (Math.hypot(this.holdPos.x - this.pos.x, this.holdPos.z - this.pos.z) > 0.8) moveTarget = this.holdPos;
      } else if (this.state === "channel") {
        faceYaw = this.channelYaw;
        env.onChannel(this, dt); // planting / defusing handled by rounds
      } else {
        if (!this.path.length || this.pathI >= this.path.length) {
          if (this.targetPos) { moveTarget = this.targetPos; if (Math.hypot(this.targetPos.x - this.pos.x, this.targetPos.z - this.pos.z) < 1.2) this.targetPos = null; }
        } else {
          const node = this.path[this.pathI];
          moveTarget = node;
          if (Math.hypot(node.x - this.pos.x, node.z - this.pos.z) < 1.1) this.pathI++;
        }
        if (this.lastKnown && this.state === "investigate") {
          if (Math.hypot(this.lastKnown.x - this.pos.x, this.lastKnown.z - this.pos.z) < 2) { this.lastKnown = null; this.state = "hold"; this.holdPos = { x: this.pos.x, z: this.pos.z }; }
        }
      }
    }
    if (this.gun.reloading > 0) { this.gun.reloading -= dt; if (this.gun.reloading <= 0) { const need = this.gun.def.mag - this.gun.mag; const take = Math.min(need, this.gun.reserve); this.gun.mag += take; this.gun.reserve -= take; } }
    if (this.gun.empty && this.gun.reserve > 0 && this.gun.reloading <= 0) this.gun.reloading = this.gun.def.reload;
    // --- fire discipline: a bot standing in an incendiary zone drops every
    // other job and runs for cold ground. Standing in fire to finish a duel
    // is how bots die stupidly; the zone wins, the duel waits.
    const burn = inFire(this.pos.x, this.pos.z);
    if (burn) {
      const dx = this.pos.x - burn.x, dz = this.pos.z - burn.z;
      const d = Math.hypot(dx, dz) || 1;
      moveTarget = { x: burn.x + (dx / d) * (burn.r + 3), z: burn.z + (dz / d) * (burn.r + 3) };
      speed = 5.6;
    }
    // --- move
    if (moveTarget) {
      const dx = moveTarget.x - this.pos.x, dz = moveTarget.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.15) {
        const step = Math.min(d, speed * dt);
        this.pos.x += (dx / d) * step; this.pos.z += (dz / d) * step;
        if (faceYaw === null) faceYaw = Math.atan2(-dx, -dz);
      }
    }
    if (faceYaw !== null) {
      let diff = ((faceYaw - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.yaw += diff * Math.min(1, dt * 10);
    }
    collide(colliders, this.pos, this.radius);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw; // model faces local -z; rotY(yaw) maps it to the facing dir
    // gun arm points where the bot looks
    const arm = this.mesh.userData.armR;
    if (arm) arm.rotation.x = this.target ? -0.25 : 0.15;
  }
}

// A floating nameplate: the bot's callsign in its team colour. It makes a
// screenshot read like a squad, not a crowd of strangers.
function makeNameplate(name, team) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 56;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(8,10,13,0.55)";
  g.fillRect(28, 8, 200, 40);
  g.font = "800 27px system-ui, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = team === "us" ? "#ffb347" : "#2fd4c4";
  g.fillText(name, 128, 29);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set(1.5, 0.33, 1);
  return spr;
}

function buildSoldier(team) {
  const main = team === "us" ? PAL.us : PAL.them;
  const dark = team === "us" ? PAL.usDark : PAL.themDark;
  const g = new THREE.Group();
  const add = (w, h, d, x, y, z, m) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); g.add(b); return b;
  };
  const legM = mat(0x2c2c31), torsoM = mat(main), darkM = mat(dark), skinM = mat(0xc9a184), gunM = mat(0x1d1e22);
  add(0.19, 0.78, 0.22, -0.13, 0.39, 0, legM); add(0.19, 0.78, 0.22, 0.13, 0.39, 0, legM);
  add(0.56, 0.62, 0.3, 0, 1.09, 0, torsoM);
  add(0.56, 0.16, 0.32, 0, 1.36, 0, darkM); // vest band
  add(0.15, 0.5, 0.17, -0.36, 1.12, 0, torsoM); // left arm
  const armR = add(0.15, 0.5, 0.17, 0.36, 1.12, -0.08, torsoM); // right arm holds the gun forward
  armR.geometry.translate(0, -0.2, 0); armR.position.y = 1.32;
  add(0.3, 0.3, 0.3, 0, 1.6, 0, skinM); // head
  add(0.34, 0.12, 0.34, 0, 1.76, 0, darkM); // helmet
  add(0.07, 0.1, 0.52, 0.33, 1.3, -0.3, gunM); // gun
  g.userData.armR = armR;
  return g;
}
