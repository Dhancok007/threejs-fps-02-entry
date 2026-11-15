// The human fighter: pointer-lock mouse look, acceleration movement with
// crouch and walk, collision, and a body that bots can shoot at.
import * as THREE from "three";
import { collide } from "./world.js";

export const EYE = 1.62, RADIUS = 0.42;

export class Player {
  constructor(scene, camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 0, 25); // feet position
    this.vel = new THREE.Vector3();
    this.yaw = 0; // forward is (-sin yaw, -cos yaw): yaw 0 faces -z (north, toward the sites)
    this.pitch = 0;
    this.hp = 100; this.armor = 0; this.alive = true;
    this.team = "us"; this.name = "YOU";
    this.crouch = false; this.walk = false;
    this.keys = {};
    this.recoilPitch = 0; this.bobT = 0; this.speedNow = 0;
    this.isPlayer = true;
  }
  reset(spawn) {
    this.pos.set(spawn[0], 0, spawn[1]);
    this.vel.set(0, 0, 0);
    this.yaw = 0; this.pitch = 0;
    this.hp = 100; this.alive = true; this.recoilPitch = 0;
  }
  eyePos(out) { return out.set(this.pos.x, (this.crouch ? 1.18 : EYE), this.pos.z); }
  eyeY() { return this.crouch ? 1.18 : EYE; }
  lookDir(out) {
    const cp = Math.cos(this.pitch + this.recoilPitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch + this.recoilPitch), -Math.cos(this.yaw) * cp);
  }
  bind(dom) {
    addEventListener("keydown", (e) => { this.keys[e.code] = true; });
    addEventListener("keyup", (e) => { this.keys[e.code] = false; });
    dom.addEventListener("mousemove", (e) => {
      if (document.pointerLockElement !== dom || !this.alive) return;
      this.yaw -= e.movementX * 0.0021;
      this.pitch -= e.movementY * 0.0021;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    });
  }
  update(dt, colliders) {
    if (!this.alive) return;
    const k = this.keys;
    this.crouch = !!(k["KeyC"] || k["ControlLeft"]);
    this.walk = !!k["ShiftLeft"];
    const f = (k["KeyW"] ? 1 : 0) - (k["KeyS"] ? 1 : 0);
    const s = (k["KeyD"] ? 1 : 0) - (k["KeyA"] ? 1 : 0);
    const max = this.crouch ? 2.1 : this.walk ? 2.6 : 5.4;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wish = new THREE.Vector3(-sin * f + cos * s, 0, -cos * f - sin * s);
    if (wish.lengthSq() > 0) wish.normalize();
    const accel = this.vel.length() > max + 0.1 ? 14 : 42;
    this.vel.x += wish.x * accel * dt; this.vel.z += wish.z * accel * dt;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > max) { const c = max / sp; this.vel.x *= c; this.vel.z *= c; }
    if (wish.lengthSq() === 0) { const d = Math.max(0, 1 - 11 * dt); this.vel.x *= d; this.vel.z *= d; }
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    collide(colliders, this.pos, RADIUS);
    this.speedNow = Math.hypot(this.vel.x, this.vel.z);
    this.bobT += dt * this.speedNow * 1.6;
    this.recoilPitch *= Math.pow(0.0015, dt); // fast recovery
    // camera
    const bobY = Math.sin(this.bobT * 2) * 0.028 * Math.min(1, this.speedNow / 5);
    this.camera.position.set(this.pos.x, this.eyeY() + bobY, this.pos.z);
    const dir = this.lookDir(new THREE.Vector3());
    this.camera.lookAt(this.camera.position.clone().add(dir));
  }
  // Ray vs the player's two hit spheres (head + torso). Bots use this.
  hitTest(origin, dir, maxD) {
    let best = null;
    const hy = 1.5, by = 0.92;
    for (const [cy, r, head] of [[hy, 0.21, true], [by, 0.44, false]]) {
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
  get speed01() { return Math.min(1, this.speedNow / 5.4); }
}
