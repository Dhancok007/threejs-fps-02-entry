// Rounds: the match director. Owns phases (buy / live / end / over), the
// round clock and the planted-charge fuse, team economy, bot job assignment
// (rush, hold, plant, defuse), and win checks. Rendering and shooting live
// elsewhere — this file only decides.
import { SITES } from "./world.js";
import { Gun, WEAPONS } from "./weapon.js";

export const RULES = {
  winTarget: 7, buyTime: 12, roundTime: 100, fuseTime: 40,
  plantTime: 3.2, defuseTime: 5, endTime: 4.5,
  startMoney: 800, maxMoney: 9000,
  killReward: 300, plantTeamBonus: 800, winReward: 2700, lossReward: 1900,
};

const POSTS = { // defender posts: [x, z, holdYaw] — holdYaw pi faces south, toward the attackers
  A: [[-20, -17, Math.PI], [-31, -6, Math.PI * 0.78]],
  B: [[20, -16, Math.PI], [31, -4, Math.PI * 1.22]],
  MID: [[2, -19, Math.PI]],
};

export class Rounds {
  constructor(fighters, player, nav, hooks) {
    this.fighters = fighters;
    this.player = player;
    this.nav = nav;
    this.hooks = hooks; // { banner, feed, onPlanted, onDetonate, beep, resetPlayerLoadout }
    this.phase = "buy";
    this.phaseT = RULES.buyTime;
    this.round = 0;
    this.score = { us: 0, them: 0 };
    this.planted = null; // { site, fuse }
    this.siteChoice = "A";
    this.carrier = null;
    this.directorT = 0;
    this.beepT = 0;
    this.plantHappened = false;
  }

  aliveCount(team) {
    let n = 0;
    for (const f of this.fighters) if (f.team === team && f.alive) n++;
    return n;
  }

  siteAt(pos) {
    for (const key of ["A", "B"]) {
      const s = SITES[key];
      if (Math.hypot(pos.x - s.x, pos.z - s.z) <= s.r) return key;
    }
    return null;
  }

  startMatch() {
    this.score = { us: 0, them: 0 };
    this.round = 0;
    for (const f of this.fighters) {
      f.money = RULES.startMoney;
      if (!f.isPlayer) { f.gun = new Gun(WEAPONS.pistol); f.armor = 0; f.grenade = false; }
    }
    this.hooks.resetPlayerLoadout(true);
    this.nextRound();
  }

  nextRound() {
    this.round++;
    this.planted = null;
    this.plantHappened = false;
    this.phase = "buy";
    this.phaseT = RULES.buyTime;
    this.siteChoice = this.round % 2 === 1 ? "A" : "B";
    const spawns = this.hooks.spawns;
    for (const f of this.fighters) {
      const sp = spawns[f.team][f.spawnIdx];
      const survived = f.alive;
      f.reset(sp);
      if (!survived) { // the dead come back with a pistol and no armor
        if (f.isPlayer) this.hooks.resetPlayerLoadout(false);
        else { f.gun = new Gun(WEAPONS.pistol); f.armor = 0; f.grenade = false; }
      } else if (f.isPlayer) {
        this.hooks.refillPlayerAmmo();
      } else {
        f.gun = new Gun(f.gun.def); // survivors keep the weapon, ammo refilled
      }
      this.botBuy(f);
    }
    this.carrier = this.fighters.find((f) => f.team === "us" && !f.isPlayer) || null;
    this.hooks.banner(`ROUND ${this.round}`, this.round === 1 ? "First to 7 takes the match" : `Site ${this.siteChoice} is the call`, 2200);
  }

  botBuy(f) {
    if (f.isPlayer || typeof f.money !== "number") return;
    if (f.money >= 650 && f.armor < 50) { f.armor = 100; f.money -= 650; }
    if (f.money >= 2700 && f.gun.def !== WEAPONS.rifle) { f.gun = new Gun(WEAPONS.rifle); f.money -= 2700; }
    else if (f.money >= 1200 && f.gun.def === WEAPONS.pistol) { f.gun = new Gun(WEAPONS.smg); f.money -= 1200; }
    if (f.money >= 300 && !f.grenade) { f.grenade = true; f.money -= 300; }
  }

  awardKill(killer) {
    if (killer && typeof killer.money === "number") {
      killer.money = Math.min(RULES.maxMoney, killer.money + RULES.killReward);
    }
  }

  // --- plant / defuse -------------------------------------------------
  doPlant(site, byWhom) {
    if (this.planted || this.phase !== "live") return;
    this.planted = { site, fuse: RULES.fuseTime };
    this.plantHappened = true;
    this.beepT = 0;
    for (const f of this.fighters) if (f.team === "us") this.awardFlat(f, RULES.plantTeamBonus);
    if (byWhom && !byWhom.isPlayer) { // the planter guards the charge
      byWhom.state = "hold";
      byWhom.holdPos = { x: byWhom.pos.x, z: byWhom.pos.z };
      byWhom.holdYaw = Math.PI; // watch the south approach
      byWhom.channel = 0;
    }
    // defenders converge on the site; attackers fall back to guard posts
    const s = SITES[site];
    for (const f of this.fighters) {
      if (!f.alive || f.isPlayer) continue;
      if (f.team === "them") { f.state = "advance"; f.setDestination(this.nav, s.x, s.z); }
      else if (f !== byWhom) { f.state = "hold"; f.holdPos = { x: f.pos.x, z: f.pos.z }; f.holdYaw = 0; }
    }
    this.hooks.onPlanted(site);
    this.hooks.feed(`<b>CHARGE PLANTED</b> at site ${site} — ${(RULES.fuseTime)}s to detonation`);
  }

  awardFlat(f, amount) {
    if (typeof f.money === "number") f.money = Math.min(RULES.maxMoney, f.money + amount);
  }

  // Called from Bot.update while a bot is in its "channel" state.
  onChannel(bot, dt) {
    if (this.phase !== "live") { bot.state = "advance"; bot.channel = 0; return; }
    if (bot.channelKind === "plant") {
      if (this.planted || this.siteAt(bot.pos) !== bot.channelSite) { bot.state = "advance"; bot.channel = 0; return; }
      bot.channel += dt;
      if (bot.channel >= RULES.plantTime) { bot.channel = 0; this.doPlant(bot.channelSite, bot); }
    } else if (bot.channelKind === "defuse") {
      if (!this.planted) { bot.state = "advance"; bot.channel = 0; return; }
      bot.channel += dt;
      if (bot.channel >= RULES.defuseTime) {
        bot.channel = 0;
        this.endRound("them", "CHARGE DEFUSED");
      }
    }
  }

  // The director: keeps jobs flowing as fighters die and the state changes.
  director() {
    if (this.phase !== "live") return;
    if (!this.planted) {
      if (!this.carrier || !this.carrier.alive) {
        this.carrier = this.fighters.find((f) => f.team === "us" && !f.isPlayer && f.alive) || null;
        if (this.carrier) {
          const s = SITES[this.siteChoice];
          this.carrier.state = "advance";
          this.carrier.setDestination(this.nav, s.x, s.z);
        }
      }
      const c = this.carrier;
      if (c && c.alive && c.state !== "channel" && this.siteAt(c.pos) === this.siteChoice) {
        c.state = "channel"; c.channelKind = "plant"; c.channelSite = this.siteChoice; c.channel = 0; c.channelYaw = 0;
      }
    } else {
      const s = SITES[this.planted.site];
      const defuserBusy = this.fighters.some((f) => f.team === "them" && f.alive && f.state === "channel" && f.channelKind === "defuse");
      if (!defuserBusy) {
        let best = null, bd = Infinity;
        for (const f of this.fighters) {
          if (f.team !== "them" || !f.alive) continue;
          const d = Math.hypot(f.pos.x - s.x, f.pos.z - s.z);
          if (d < bd) { bd = d; best = f; }
        }
        if (best && bd <= s.r * 0.9) {
          best.state = "channel"; best.channelKind = "defuse"; best.channel = 0;
          best.channelYaw = Math.atan2(-(s.x - best.pos.x), -(s.z - best.pos.z));
        }
      }
    }
  }

  assignJobs() {
    const s = SITES[this.siteChoice];
    const other = SITES[this.siteChoice === "A" ? "B" : "A"];
    const usBots = this.fighters.filter((f) => f.team === "us" && !f.isPlayer && f.alive);
    usBots.forEach((b, i) => {
      b.state = "advance";
      if (b === this.carrier || i === 1) b.setDestination(this.nav, s.x, s.z);
      else if (i === 2) b.setDestination(this.nav, other.x, other.z);
      else b.setDestination(this.nav, 0, -8); // mid control
    });
    const themBots = this.fighters.filter((f) => f.team === "them" && f.alive);
    const posts = [...POSTS.A, ...POSTS.B, ...POSTS.MID];
    themBots.forEach((b, i) => {
      const [x, z, yaw] = posts[i % posts.length];
      b.state = "hold"; b.holdPos = { x, z }; b.holdYaw = yaw;
      b.setDestination(this.nav, x, z); // path is ignored in hold, kept for investigate exits
    });
  }

  endRound(winner, reason) {
    if (this.phase !== "live") return;
    this.score[winner]++;
    for (const f of this.fighters) this.awardFlat(f, winner === f.team ? RULES.winReward : RULES.lossReward);
    this.phase = "end";
    this.phaseT = RULES.endTime;
    const usWon = winner === "us";
    this.hooks.banner(usWon ? "ASHBORNE TAKE THE ROUND" : "WARDENS TAKE THE ROUND", reason, 3400);
    this.hooks.feed(`Round ${this.round}: <b>${usWon ? "ASHBORNE" : "WARDENS"}</b> — ${reason.toLowerCase()} · ${this.score.us}–${this.score.them}`);
  }

  update(dt) {
    this.directorT -= dt;
    if (this.directorT <= 0) { this.directorT = 0.25; this.director(); }
    if (this.phase === "buy") {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        this.phase = "live";
        this.phaseT = RULES.roundTime;
        this.assignJobs();
        this.hooks.banner("ROUND LIVE", `Plant at site ${this.siteChoice} — or eliminate the Wardens`, 1800);
      }
    } else if (this.phase === "live") {
      const usAlive = this.aliveCount("us"), themAlive = this.aliveCount("them");
      if (themAlive === 0) { this.endRound("us", "WARDENS ELIMINATED"); return; }
      if (usAlive === 0 && !this.planted) { this.endRound("them", "ASHBORNE ELIMINATED"); return; }
      if (this.planted) {
        this.planted.fuse -= dt;
        this.beepT -= dt;
        if (this.beepT <= 0) {
          const f = this.planted.fuse;
          this.beepT = f <= 5 ? 0.25 : f <= 15 ? 0.55 : 1.0;
          this.hooks.beep(f <= 5);
        }
        if (this.planted.fuse <= 0) {
          const site = this.planted.site;
          this.planted = null;
          this.hooks.onDetonate(site);
          this.endRound("us", "CHARGE DETONATED");
        }
      } else {
        this.phaseT -= dt;
        if (this.phaseT <= 0) this.endRound("them", "TIME EXPIRED — NO PLANT");
      }
    } else if (this.phase === "end") {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        if (this.score.us >= RULES.winTarget || this.score.them >= RULES.winTarget) {
          this.phase = "over";
          this.hooks.onMatchEnd(this.score.us > this.score.them ? "us" : "them");
        } else this.nextRound();
      }
    }
  }

  phaseLabel() {
    if (this.phase === "buy") return "BUY PHASE";
    if (this.phase === "live") return "ROUND LIVE";
    if (this.phase === "end") return "ROUND OVER";
    return "MATCH OVER";
  }

  clockSeconds() {
    if (this.phase === "live" && this.planted) return this.planted.fuse;
    return Math.max(0, this.phaseT);
  }
}
