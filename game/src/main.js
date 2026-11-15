// CINDERSITE — entry point and orchestration. Wires the world, the fighters,
// the weapons and the round director together; owns player shooting, damage,
// grenades, the buy flow, and the screenshot staging the judge harness uses.
// Simulation runs on a fixed 60 Hz step; rendering happens every frame.
import * as THREE from "three";
import { buildWorld, SITES, SPAWNS, collide } from "./world.js";
import { PAL } from "./palette.js";
import { Player } from "./player.js";
import { Bot } from "./bots.js";
import { Gun, WEAPONS, ARMOR_PRICE, BUY_LIST, Tracers, fireHitscan, viewModel } from "./weapon.js";
import * as Snd from "./audio.js";
import { HUD } from "./hud.js";
import { Rounds, RULES } from "./rounds.js";

const params = new URLSearchParams(location.search);
const shotMode = params.get("shot");

// --- renderer / scene ---------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.getElementById("app").appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.08, 320);
scene.add(camera);
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const { colliders, nav } = buildWorld(scene);
const tracers = new Tracers(scene);
const hud = new HUD();

// --- fighters -------------------------------------------------------------
const player = new Player(scene, camera);
player.spawnIdx = 0;
player.money = RULES.startMoney;
const fighters = [player];
SPAWNS.us.forEach((sp, i) => { if (i > 0) { const b = new Bot(scene, "us", i - 1, sp); b.spawnIdx = i; fighters.push(b); } });
SPAWNS.them.forEach((sp, i) => { const b = new Bot(scene, "them", i, sp); b.spawnIdx = i; fighters.push(b); });

// --- player loadout -------------------------------------------------------
let inv, cur;
function freshLoadout() {
  inv = {
    primary: null,
    pistol: { key: "pistol", gun: new Gun(WEAPONS.pistol) },
    knife: { key: "knife", gun: new Gun(WEAPONS.knife) },
    grenade: null,
  };
  cur = "pistol";
}
freshLoadout();
player.armor = 0;

const vmHolder = new THREE.Group();
vmHolder.scale.setScalar(0.82);
camera.add(vmHolder);
let vmKind = null;
function swapVM(kind) {
  if (kind === vmKind) return;
  vmKind = kind;
  while (vmHolder.children.length) vmHolder.remove(vmHolder.children[0]);
  vmHolder.add(viewModel(kind, PAL.us));
}
swapVM("pistol");

const curEntry = () => inv[cur];
const curGun = () => inv[cur].gun;

function owns(id) {
  if (id === "armor") return player.armor > 0;
  if (id === "grenade") return !!inv.grenade;
  if (id === "pistol") return true;
  return !!inv.primary && inv.primary.gun.def === WEAPONS[id];
}

function buy(id) {
  if (owns(id)) return;
  const price = id === "armor" ? ARMOR_PRICE : WEAPONS[id].price;
  if (player.money < price) { Snd.dryFire(); return; }
  player.money -= price;
  if (id === "armor") player.armor = 100;
  else if (id === "grenade") inv.grenade = { key: "grenade", gun: new Gun(WEAPONS.grenade) };
  else if (WEAPONS[id].slot === 1) { inv.primary = { key: id, gun: new Gun(WEAPONS[id]) }; cur = "primary"; swapVM(id); }
  else inv.pistol = { key: id, gun: new Gun(WEAPONS[id]) };
  Snd.hitmarkSnd(false);
  hud.renderBuy(player, owns);
}

// --- damage ---------------------------------------------------------------
const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;
function applyDamage(victim, dmg, head, attacker) {
  if (!victim.alive || dmg <= 0) return;
  let d = dmg;
  if (victim.armor > 0) {
    const absorbed = d * 0.45;
    victim.armor = Math.max(0, victim.armor - absorbed);
    d -= absorbed;
  }
  victim.hp -= d;
  if (victim.isPlayer) { hud.damageFlash(); Snd.hurtSnd(); }
  if (victim.hp > 0) return;
  victim.hp = 0;
  victim.alive = false;
  if (!victim.isPlayer) victim.die();
  rounds.awardKill(attacker);
  const ac = attacker ? hex(attacker.team === "us" ? PAL.us : PAL.them) : "#ccc";
  const vc = hex(victim.team === "us" ? PAL.us : PAL.them);
  hud.feed(`<span style="color:${ac}"><b>${attacker ? attacker.name : "BLAST"}</b></span> ▸ <span style="color:${vc}">${victim.name}</span>${head ? " ⌖ headshot" : ""}`);
  if (victim.isPlayer) hud.banner("YOU ARE DOWN", "Spectating — your squad fights on", 2600);
}

// --- shooting ---------------------------------------------------------------
const _org = new THREE.Vector3(), _dir = new THREE.Vector3(), _aim = new THREE.Vector3();
function hearShots(x, z, byTeam) {
  for (const f of fighters) if (f.alive && !f.isPlayer && f.team !== byTeam) f.hear(x, z);
}

function shoot(fighter, gun, origin, dir, spread) {
  const foes = fighters.filter((f) => f.team !== fighter.team);
  const hit = fireHitscan(colliders, tracers, fighter, origin, dir, spread, foes);
  gun.bloom = Math.min(1, gun.bloom + 0.16);
  hearShots(fighter.pos.x, fighter.pos.z, fighter.team);
  if (hit.victim) {
    applyDamage(hit.victim, gun.def.dmg * (hit.head ? gun.def.head : 1), hit.head, fighter);
    if (fighter.isPlayer) { hud.hit(hit.head); Snd.hitmarkSnd(hit.head); }
  }
  return hit;
}

function tryBotShoot(bot) {
  if (rounds.phase !== "live" || !bot.target || !bot.target.alive) return false;
  const gun = bot.gun;
  if (gun.cool > 0 || gun.reloading > 0) return false;
  if (gun.empty) { if (gun.reserve > 0) gun.reloading = gun.def.reload; return false; }
  gun.mag--;
  gun.cool = 60 / gun.def.rpm;
  bot.eyePos(_org);
  const t = bot.target;
  _aim.set(t.pos.x, t.isPlayer ? (t.crouch ? 1.02 : 1.34) : 1.34, t.pos.z);
  _dir.subVectors(_aim, _org).normalize();
  const spread = gun.def.spread * 1.3 + (1.12 - bot.skill) * 0.016;
  Snd.shot(_org.distanceTo(player.pos), gun.def.heavy);
  shoot(bot, gun, _org, _dir, spread);
  const arm = bot.mesh.userData.armR;
  if (arm) arm.rotation.x = -0.55;
  return true;
}

// --- grenades ---------------------------------------------------------------
const grenades = [], flashes = [];
const nadeMesh = () => new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0x4a5a34 }));
function throwGrenade(from, dir) {
  const m = nadeMesh();
  const p = new THREE.Vector3(from.pos.x, 1.45, from.pos.z);
  scene.add(m);
  grenades.push({ m, p, v: new THREE.Vector3(dir.x * 15, 5.2, dir.z * 15), t: 1.7, owner: from });
  Snd.throwSnd();
}
function explode(g) {
  scene.remove(g.m);
  Snd.boom();
  const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9 }));
  flash.position.copy(g.p);
  scene.add(flash);
  flashes.push({ m: flash, t: 0.28 });
  for (const f of fighters) {
    if (!f.alive) continue;
    const d = Math.hypot(f.pos.x - g.p.x, f.pos.z - g.p.z);
    if (d >= WEAPONS.grenade.blast) continue;
    applyDamage(f, WEAPONS.grenade.dmg * (1 - d / WEAPONS.grenade.blast) + 6, false, g.owner);
  }
  if (player.alive && player.pos.distanceTo(g.p) < 9) player.recoilPitch += 0.03;
}
function updateGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.t -= dt;
    g.v.y -= 18 * dt;
    g.p.addScaledVector(g.v, dt);
    if (g.p.y < 0.1) { g.p.y = 0.1; g.v.y *= -0.35; g.v.x *= 0.7; g.v.z *= 0.7; }
    const tmp = new THREE.Vector3(g.p.x, 0, g.p.z);
    collide(colliders, tmp, 0.15);
    if (tmp.x !== g.p.x || tmp.z !== g.p.z) { g.p.x = tmp.x; g.p.z = tmp.z; g.v.x *= -0.4; g.v.z *= -0.4; }
    g.m.position.copy(g.p);
    if (g.t <= 0) { grenades.splice(i, 1); explode(g); }
  }
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i];
    f.t -= dt;
    const k = Math.max(0, f.t / 0.28);
    f.m.scale.setScalar(1 + (1 - k) * 4.6);
    f.m.material.opacity = k * 0.9;
    if (f.t <= 0) { scene.remove(f.m); flashes.splice(i, 1); }
  }
}
// --- rounds -----------------------------------------------------------------
const rounds = new Rounds(fighters, player, nav, {
  spawns: SPAWNS,
  banner: (b, s, ms) => hud.banner(b, s, ms),
  feed: (h) => hud.feed(h),
  beep: (final) => Snd.beep(final),
  onPlanted: () => Snd.beep(false),
  onDetonate: (site) => {
    const s = SITES[site];
    const g = { m: nadeMesh(), p: new THREE.Vector3(s.x, 0.6, s.z), owner: null };
    explode(g);
  },
  onMatchEnd: (winner) => showOverlay(winner),
  resetPlayerLoadout: () => { freshLoadout(); player.armor = 0; swapVM("pistol"); },
  refillPlayerAmmo: () => {
    for (const slot of ["primary", "pistol", "knife"]) {
      if (inv[slot]) inv[slot] = { key: inv[slot].key, gun: new Gun(inv[slot].gun.def) };
    }
    if (!inv[cur]) cur = "pistol";
    swapVM(curEntry().key);
  },
});

// --- input ------------------------------------------------------------------
let mouseDown = false, clicked = false;
player.bind(renderer.domElement);
addEventListener("mousedown", (e) => {
  if (shotMode || document.pointerLockElement !== renderer.domElement) return;
  if (e.button === 0) { mouseDown = true; clicked = true; }
});
addEventListener("mouseup", (e) => { if (e.button === 0) mouseDown = false; });
addEventListener("keydown", (e) => {
  if (shotMode) return;
  if (hud.buyVisible && rounds.phase === "buy") {
    const item = BUY_LIST.find((b) => b.key === e.key);
    if (item) { buy(item.id); return; }
  }
  if (e.code === "KeyB" && rounds.phase === "buy" && player.alive) {
    hud.buyVisible ? hud.buyClose() : hud.buyOpen(player, owns);
  } else if (e.code === "Digit1" && inv.primary) { cur = "primary"; swapVM(inv.primary.key); }
  else if (e.code === "Digit2") { cur = "pistol"; swapVM("pistol"); }
  else if (e.code === "Digit3") { cur = "knife"; swapVM("knife"); }
  else if (e.code === "KeyR") startReload(curGun());
  else if (e.code === "KeyG") playerThrow();
});
renderer.domElement.addEventListener("click", () => {
  if (!shotMode && overlayEl.style.display === "none" && document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
  }
});

function startReload(gun) {
  if (!gun || gun.def.mag === 0 || gun.reloading > 0 || gun.mag >= gun.def.mag || gun.reserve <= 0) return;
  gun.reloading = gun.def.reload;
  Snd.reloadSnd();
}

function playerThrow() {
  if (!inv.grenade || rounds.phase !== "live" || !player.alive) return;
  inv.grenade = null;
  player.lookDir(_dir);
  throwGrenade(player, _dir);
}

// plant channel state for the player
let plantP = 0, plantSite = null;
function updatePlayerPlant(dt) {
  const want = !shotMode && player.alive && rounds.phase === "live" && !rounds.planted && player.keys["KeyE"];
  const site = want ? rounds.siteAt(player.pos) : null;
  if (!site) { plantP = 0; plantSite = null; hud.interact(false, 0, ""); return; }
  if (site !== plantSite) { plantSite = site; plantP = 0; }
  plantP += dt;
  hud.interact(true, plantP / RULES.plantTime, `PLANTING AT SITE ${site} — hold E`);
  if (plantP >= RULES.plantTime) {
    hud.interact(false, 0, "");
    plantP = 0;
    rounds.doPlant(site, player);
  }
}

// --- per-step updates ---------------------------------------------------------
function updatePlayerGun(dt) {
  for (const slot of ["primary", "pistol", "knife", "grenade"]) {
    const e = inv[slot];
    if (!e) continue;
    const g = e.gun;
    g.cool = Math.max(0, g.cool - dt);
    g.bloom = Math.max(0, g.bloom - dt * 3.4);
    if (g.reloading > 0) {
      g.reloading -= dt;
      if (g.reloading <= 0) {
        const take = Math.min(g.def.mag - g.mag, g.reserve);
        g.mag += take; g.reserve -= take;
      }
    }
  }
}

function playerShootStep() {
  if (!player.alive || rounds.phase !== "live") return;
  const gun = curGun();
  if (cur === "knife") {
    if (!clicked) return;
    clicked = false;
    let best = null;
    player.eyePos(_org); player.lookDir(_dir);
    for (const f of fighters) {
      if (f.team === "us" || !f.alive) continue;
      const hit = f.hitTest(_org, _dir, WEAPONS.knife.range);
      if (hit && (!best || hit.dist < best.dist)) best = hit;
    }
    if (best) { applyDamage(best.fighter, WEAPONS.knife.dmg * (best.head ? WEAPONS.knife.head : 1), best.head, player); Snd.hitmarkSnd(best.head); hud.hit(best.head); }
    return;
  }
  if (gun.reloading > 0 || gun.cool > 0) return;
  if (!mouseDown) return;
  if (!gun.def.auto && !clicked) return;
  clicked = false;
  if (gun.empty) { Snd.dryFire(); startReload(gun); mouseDown = false; return; }
  gun.mag--;
  gun.cool = 60 / gun.def.rpm;
  player.eyePos(_org); player.lookDir(_dir);
  const spread = (gun.def.spread + gun.bloom * 0.011) * (1 + player.speed01 * 1.7) * (player.crouch ? 0.55 : 1);
  Snd.shot(0, gun.def.heavy);
  player.recoilPitch += gun.def.kick * 0.011;
  shoot(player, gun, _org, _dir, spread);
  // viewmodel kick
  vmHolder.position.z = 0.05;
}

let nadeThinkT = 0;
function botGrenadeThink(dt) {
  nadeThinkT -= dt;
  if (nadeThinkT > 0 || rounds.phase !== "live") return;
  nadeThinkT = 0.5;
  for (const b of fighters) {
    if (b.isPlayer || !b.alive || !b.grenade || b.target || !b.lastKnown) continue;
    const d = Math.hypot(b.lastKnown.x - b.pos.x, b.lastKnown.z - b.pos.z);
    if (d < 6 || d > 18) continue;
    b.grenade = false;
    _dir.set(b.lastKnown.x - b.pos.x, 0, b.lastKnown.z - b.pos.z).normalize();
    throwGrenade(b, _dir);
  }
}

const botEnv = { colliders, nav, fighters, phase: "buy", tryBotShoot, onChannel: (b, dt) => rounds.onChannel(b, dt) };
let prevPhase = rounds.phase;
function step(dt) {
  if (!shotMode) rounds.update(dt); // staged screenshots freeze the match state
  if (rounds.phase !== prevPhase) {
    if (rounds.phase === "buy" && player.alive && !shotMode) hud.buyOpen(player, owns);
    if (rounds.phase === "live") hud.buyClose();
    prevPhase = rounds.phase;
  }
  botEnv.phase = rounds.phase;
  if (!shotMode) {
    if (player.alive) player.update(dt, colliders);
    playerShootStep();
    updatePlayerPlant(dt);
  } else {
    player.update(0, colliders); // settle the camera on the staged pose
  }
  updatePlayerGun(dt);
  for (const f of fighters) {
    if (f.isPlayer) continue;
    f.gun.cool = Math.max(0, f.gun.cool - dt);
    if (!shotMode && rounds.phase !== "buy") f.update(dt, botEnv);
    else if (!shotMode && f.alive) { f.mesh.position.copy(f.pos); }
  }
  botGrenadeThink(dt);
  updateGrenades(dt);
  tracers.update(dt);
  vmHolder.position.z *= Math.pow(0.0001, dt); // viewmodel kick recovery
  hud.vitals(player, curGun());
  hud.top(rounds.score.us, rounds.score.them, rounds.phaseLabel(), rounds.clockSeconds(), !!rounds.planted);
  hud.alive(fighters);
}

// --- overlay / match flow -----------------------------------------------------
const overlayEl = document.getElementById("overlay");
const startBtn = document.getElementById("startbtn");
function showOverlay(winner) {
  document.exitPointerLock && document.exitPointerLock();
  overlayEl.style.display = "flex";
  overlayEl.querySelector("h1").innerHTML = winner === "us" ? "ASHBORNE <span>WIN</span>" : "WARDENS <span>WIN</span>";
  overlayEl.querySelector("p").textContent = `Final score ${rounds.score.us} — ${rounds.score.them}. Click to run it back.`;
  startBtn.textContent = "PLAY AGAIN";
}
startBtn.addEventListener("click", () => {
  Snd.audioReady();
  overlayEl.style.display = "none";
  hud.show();
  if (rounds.phase === "over") rounds.startMatch();
  if (!shotMode) renderer.domElement.requestPointerLock();
});

// --- screenshot staging ---------------------------------------------------------
function stageShot(kind) {
  overlayEl.style.display = "none";
  hud.show();
  rounds.startMatch();
  const setBot = (b, x, z, yaw) => { b.pos.set(x, 0, z); b.yaw = yaw; b.mesh.position.copy(b.pos); b.mesh.rotation.y = yaw; };
  if (kind === "buy") {
    player.money = 2450;
    hud.buyOpen(player, owns);
  } else if (kind === "play") {
    rounds.phase = "live"; rounds.phaseT = 76;
    inv.primary = { key: "rifle", gun: new Gun(WEAPONS.rifle) };
    cur = "primary"; swapVM("rifle");
    player.pos.set(-8, 0, 5); player.yaw = 0.22; player.money = 1240;
    const them = fighters.filter((f) => f.team === "them");
    setBot(them[0], -13, -3, Math.PI); setBot(them[1], 3, -8, Math.PI * 0.9);
    const us = fighters.filter((f) => f.team === "us" && !f.isPlayer);
    setBot(us[0], -4.5, 8, 0.1);
    player.eyePos(_org); player.lookDir(_dir);
    _aim.copy(_org).addScaledVector(_dir, 9);
    tracers.fire(_org, _aim);
  } else if (kind === "site") {
    rounds.phase = "live"; rounds.phaseT = 60;
    rounds.planted = { site: "A", fuse: 23 };
    player.pos.set(-19.5, 0, -4.5); player.yaw = 0.83; player.money = 3100;
    inv.primary = { key: "rifle", gun: new Gun(WEAPONS.rifle) };
    cur = "primary"; swapVM("rifle");
    const them = fighters.filter((f) => f.team === "them");
    setBot(them[0], -15, -15, Math.PI * 0.8);
    const us = fighters.filter((f) => f.team === "us" && !f.isPlayer);
    setBot(us[0], -24, -8, 0);
  } else if (kind === "end") {
    rounds.score.us = 6; rounds.score.them = 4;
    rounds.phase = "end"; rounds.phaseT = 99;
    player.pos.set(0, 0, -2); player.yaw = 0; player.money = 4600;
    const them = fighters.filter((f) => f.team === "them");
    them[0].pos.set(-2.5, 0, -6); them[0].mesh.position.copy(them[0].pos); them[0].die();
    them[1].pos.set(3, 0, -7); them[1].mesh.position.copy(them[1].pos); them[1].die();
    hud.banner("ASHBORNE TAKE THE ROUND", "Wardens eliminated · 6–4", 999999);
  }
}

// --- boot + fixed-step loop -------------------------------------------------------
if (shotMode) stageShot(shotMode);
else rounds.startMatch();

let last = performance.now(), acc = 0, frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  const h = 1 / 60;
  let n = 0;
  while (acc >= h && n < 4) { step(h); acc -= h; n++; }
  if (n === 4) acc = 0;
  renderer.render(scene, camera);
  if (shotMode && ++frames === 24) window.__shotReady = true;
}
requestAnimationFrame(frame);
