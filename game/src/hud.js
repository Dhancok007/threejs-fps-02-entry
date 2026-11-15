// HUD: every DOM element the game drives. No game logic lives here —
// rounds/main compute, hud renders. All updates are cheap text/style writes.
// Beyond vitals: the radio net, a live minimap, floating damage numbers,
// a flash overlay, and the full match scoreboard.
import { WEAPONS, BUY_LIST, ARMOR_PRICE, KIT_PRICE } from "./weapon.js";
import { SITES } from "./world.js";
import { activeSmokes, activeFires } from "./fx.js";
import { roleOf } from "./radio.js";

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.root = $("hud"); this.hp = $("hp"); this.armorEl = $("armor");
    this.hpfill = $("hpfill"); this.money = $("money");
    this.wname = $("wname"); this.ammo = $("ammo");
    this.timer = $("timer"); this.phaselab = $("phaselab");
    this.scoreUs = document.querySelector("#score-us .val");
    this.scoreThem = document.querySelector("#score-them .val");
    this.bannerBig = document.querySelector("#banner .big");
    this.bannerSub = document.querySelector("#banner .sub");
    this.feedEl = $("feed"); this.aliveEl = $("alive");
    this.hitmark = $("hitmark"); this.dmgvin = $("dmgvin");
    this.plantedEl = $("planted");
    this.interactEl = $("interact");
    this.interactTxt = this.interactEl.querySelector(".txt");
    this.interactFill = this.interactEl.querySelector(".fill");
    this.buyEl = $("buy"); this.buyGrid = $("buygrid"); this.buyCash = $("buycash");
    this.feedLines = []; this.bannerTimer = null; this.hitTimer = null;
    this.radioEl = $("radio"); this.radioLines = [];
    this.mapCv = $("minimap"); this.mapCtx = this.mapCv.getContext("2d");
    this.boardEl = $("scoreboard"); this.boardBody = $("boardbody");
    this.flashEl = $("flashfx"); this.dmgLayer = $("dmglayer");
    this.utilEl = $("utilline");
  }
  show() { this.root.style.visibility = "visible"; }
  vitals(p, gun) {
    this.hp.textContent = Math.max(0, Math.ceil(p.hp));
    this.hp.style.color = p.hp <= 30 ? "var(--bad)" : "";
    this.armorEl.textContent = p.armor > 0 ? `🛡 ${Math.ceil(p.armor)}` : "";
    this.hpfill.style.width = `${Math.max(0, p.hp)}%`;
    this.money.textContent = `$${p.money}`;
    this.wname.textContent = gun ? gun.def.name : "—";
    if (gun && gun.def.mag > 0) {
      this.ammo.innerHTML = `${gun.mag} <span class="res">/ ${gun.reserve}</span>`;
      this.ammo.className = gun.mag <= Math.ceil(gun.def.mag * 0.25) ? "low" : "";
    } else if (gun && gun.def.name === "GRENADE") {
      this.ammo.innerHTML = `${gun.mag} <span class="res">grenade</span>`; this.ammo.className = "";
    } else {
      this.ammo.innerHTML = `— <span class="res"></span>`; this.ammo.className = "";
    }
  }
  top(scoreUs, scoreThem, phaseLabel, seconds, planted) {
    this.scoreUs.textContent = scoreUs; this.scoreThem.textContent = scoreThem;
    this.phaselab.textContent = phaseLabel;
    const m = Math.floor(Math.max(0, seconds) / 60), s = Math.floor(Math.max(0, seconds) % 60);
    this.timer.textContent = `${m}:${String(s).padStart(2, "0")}`;
    this.timer.className = "val" + (seconds <= 10 && phaseLabel === "ROUND LIVE" ? " warn" : "");
    this.plantedEl.style.display = planted ? "block" : "none";
  }
  banner(big, sub = "", ms = 2600) {
    this.bannerBig.textContent = big; this.bannerSub.textContent = sub;
    clearTimeout(this.bannerTimer);
    if (ms > 0) this.bannerTimer = setTimeout(() => { this.bannerBig.textContent = ""; this.bannerSub.textContent = ""; }, ms);
  }
  feed(html) {
    this.feedLines.push(html);
    if (this.feedLines.length > 5) this.feedLines.shift();
    this.feedEl.innerHTML = this.feedLines.join("<br>");
  }
  alive(fighters) {
    const us = fighters.filter((f) => f.team === "us");
    const them = fighters.filter((f) => f.team === "them");
    const pips = (list, cls) => list.map((f) => `<span class="pip ${cls}${f.alive ? "" : " dead"}"></span>`).join("");
    this.aliveEl.innerHTML = `ASH ${pips(us, "us")}<br>WRD ${pips(them, "them")}`;
  }
  hit(head) {
    this.hitmark.style.opacity = 1;
    this.hitmark.style.borderColor = head ? "var(--bad)" : "var(--ember2)";
    clearTimeout(this.hitTimer);
    this.hitTimer = setTimeout(() => { this.hitmark.style.opacity = 0; }, 130);
  }
  damageFlash() {
    this.dmgvin.style.opacity = 1;
    setTimeout(() => { this.dmgvin.style.opacity = 0; }, 220);
  }
  interact(show, frac, label) {
    this.interactEl.style.display = show ? "block" : "none";
    if (show) { this.interactTxt.textContent = label; this.interactFill.style.width = `${Math.round(frac * 100)}%`; }
  }
  radio(name, role, text, team) {
    const color = team === "us" ? "var(--ember2)" : "var(--teal)";
    this.radioLines.push(`<div class="rline"><span style="color:${color}">[RADIO] ${name} (${role}):</span> ${text}</div>`);
    if (this.radioLines.length > 4) this.radioLines.shift();
    this.radioEl.innerHTML = this.radioLines.join("");
  }
  utilLine(text) { if (this.utilEl) this.utilEl.textContent = text; }
  flash(strength) {
    this.flashEl.style.transition = "none";
    this.flashEl.style.opacity = Math.min(0.95, strength);
    requestAnimationFrame(() => {
      this.flashEl.style.transition = "opacity 1.1s ease-out";
      this.flashEl.style.opacity = 0;
    });
  }
  dmgNum(x, y, amount, head, sticky = false) {
    const d = document.createElement("div");
    d.className = "dmgnum" + (head ? " head" : "");
    d.textContent = Math.round(amount);
    d.style.left = `${x}px`; d.style.top = `${y}px`;
    if (sticky) d.style.animation = "none"; // screenshot staging: hold the number
    this.dmgLayer.appendChild(d);
    if (!sticky) setTimeout(() => d.remove(), 750);
    if (this.dmgLayer.children.length > 14) this.dmgLayer.firstChild.remove();
  }
  drawMap(fighters, player, plantedSite, spotted) {
    const g = this.mapCtx, W = this.mapCv.width, H = this.mapCv.height;
    const px = (x) => ((x + 39) / 78) * W, pz = (z) => ((z + 31) / 62) * H;
    g.fillStyle = "#12151a"; g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(255,255,255,0.14)"; g.strokeRect(1, 1, W - 2, H - 2);
    for (const s of activeSmokes()) {
      g.fillStyle = "rgba(190,198,208,0.35)";
      g.beginPath(); g.arc(px(s.x), pz(s.z), (s.r / 78) * W, 0, 7); g.fill();
    }
    for (const s of activeFires()) {
      g.fillStyle = "rgba(255,110,30,0.5)";
      g.beginPath(); g.arc(px(s.x), pz(s.z), (s.r / 78) * W, 0, 7); g.fill();
      g.fillStyle = "rgba(255,190,60,0.65)";
      g.beginPath(); g.arc(px(s.x), pz(s.z), (s.r / 78) * W * 0.55, 0, 7); g.fill();
    }
    for (const key of ["A", "B"]) {
      const s = SITES[key];
      g.strokeStyle = key === "A" ? "#ffb347" : "#2fd4c4";
      g.lineWidth = plantedSite === key ? 2.6 : 1.4;
      g.beginPath(); g.arc(px(s.x), pz(s.z), (s.r / 78) * W, 0, 7); g.stroke();
      g.fillStyle = g.strokeStyle; g.font = "900 11px system-ui"; g.textAlign = "center";
      g.fillText(key, px(s.x), pz(s.z) + 4);
    }
    g.fillStyle = "rgba(255,255,255,0.4)"; g.font = "700 8px system-ui";
    g.fillText("MID", px(0), pz(-4) + 3);
    g.fillText("FOUNDRY", px(-24), pz(-23) + 3);
    g.fillText("SILO", px(28), pz(4) + 3);
    g.fillText("DOCKS", px(31), pz(21) + 3);
    for (const f of fighters) {
      if (!f.alive) continue;
      if (f.isPlayer) continue;
      if (f.team === "them" && !(spotted && spotted.has(f))) continue;
      g.fillStyle = f.team === "us" ? "#ff7a29" : "#2fd4c4";
      g.beginPath(); g.arc(px(f.pos.x), pz(f.pos.z), 3, 0, 7); g.fill();
    }
    // the player: a white arrow that turns with the view
    const x = px(player.pos.x), y = pz(player.pos.z);
    g.save();
    g.translate(x, y);
    g.rotate(-player.yaw); // canvas y is world z; the arrow tip is "forward"
    g.fillStyle = "#fff";
    g.beginPath(); g.moveTo(0, -5.5); g.lineTo(3.6, 4.4); g.lineTo(-3.6, 4.4); g.closePath(); g.fill();
    g.restore();
  }
  scoreboard(fighters, stats, score, visible) {
    this.boardEl.style.display = visible ? "flex" : "none";
    if (!visible) return;
    const row = (f) => {
      const s = stats.get(f) || { k: 0, d: 0, a: 0, dmg: 0 };
      const dead = f.alive ? "" : " dead";
      const col = f.team === "us" ? "var(--ember2)" : "var(--teal)";
      return `<tr class="${dead}"><td style="color:${col}">${f.name}</td><td>${roleOf(f)}</td><td>${s.k}</td><td>${s.d}</td><td>${s.a}</td><td>${Math.round(s.dmg)}</td><td>$${f.money ?? 0}</td></tr>`;
    };
    const us = fighters.filter((f) => f.team === "us").sort((a, b) => (stats.get(b)?.k || 0) - (stats.get(a)?.k || 0));
    const them = fighters.filter((f) => f.team === "them").sort((a, b) => (stats.get(b)?.k || 0) - (stats.get(a)?.k || 0));
    this.boardBody.innerHTML =
      `<tr class="teamrow"><td colspan="7">ASHBORNE — ${score.us}</td></tr>` + us.map(row).join("") +
      `<tr class="teamrow"><td colspan="7">WARDENS — ${score.them}</td></tr>` + them.map(row).join("");
  }
  renderBuy(player, owns) {
    this.buyCash.textContent = `$${player.money}`;
    let cat = "";
    this.buyGrid.innerHTML = BUY_LIST.map((item) => {
      const def = WEAPONS[item.id];
      const price = item.id === "armor" ? ARMOR_PRICE : item.id === "kit" ? KIT_PRICE : def.price;
      const owned = owns(item.id);
      const cant = !owned && player.money < price;
      const head = item.cat !== cat ? `<div class="buysec">${(cat = item.cat)}</div>` : "";
      return head + `<div class="buyitem${owned ? " owned" : ""}${cant ? " cant" : ""}">
        <span><span class="key">${item.key}</span>&nbsp; ${item.label}${owned ? " ✓" : ""}<span class="bdesc">${item.desc}</span></span>
        <span class="price">$${price}</span></div>`;
    }).join("");
  }
  buyOpen(player, owns) { this.renderBuy(player, owns); this.buyEl.style.display = "block"; }
  buyClose() { this.buyEl.style.display = "none"; }
  get buyVisible() { return this.buyEl.style.display === "block"; }
}
