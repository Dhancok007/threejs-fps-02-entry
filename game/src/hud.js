// HUD: every DOM element the game drives. No game logic lives here —
// rounds/main compute, hud renders. All updates are cheap text/style writes.
import { WEAPONS, BUY_LIST } from "./weapon.js";

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
  renderBuy(player, owns) {
    this.buyCash.textContent = `$${player.money}`;
    this.buyGrid.innerHTML = BUY_LIST.map((item) => {
      const def = WEAPONS[item.id];
      const price = item.id === "armor" ? 650 : def.price;
      const owned = owns(item.id);
      const cant = !owned && player.money < price;
      return `<div class="buyitem${owned ? " owned" : ""}${cant ? " cant" : ""}">
        <span><span class="key">${item.key}</span>&nbsp; ${item.label}${owned ? " ✓" : ""}</span>
        <span class="price">$${price}</span></div>`;
    }).join("");
  }
  buyOpen(player, owns) { this.renderBuy(player, owns); this.buyEl.style.display = "block"; }
  buyClose() { this.buyEl.style.display = "none"; }
  get buyVisible() { return this.buyEl.style.display === "block"; }
}
