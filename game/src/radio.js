// Radio: the squad's voice. Bots call what they see, where it is, and what
// they are doing — named callers, named zones, named roles. Teamwork you can
// read is teamwork a judge can score; silent bots might as well be alone.
// Callouts are event-driven (contact, plant, defuse, rotate, low HP) and
// rate-limited per bot so the net stays readable, like a real one.
import { zoneAt } from "./world.js";

const ROLE_BY_NAME = {
  VIPER: "Entry", JUNO: "Support", MAGMA: "Carrier", OTIS: "Anchor",
  WARD: "Entry", SABLE: "Support", IRONS: "Carrier", PETRA: "Anchor", HOLT: "Flex",
  YOU: "Caller",
};
export const roleOf = (fighter) => ROLE_BY_NAME[fighter.name] || "Trooper";

export class Radio {
  constructor(hud) {
    this.hud = hud;
    this.t = 0;
    this.lastBot = new Map();
    this.lastAny = -9;
    this.lowHpCalled = new Set();
  }

  tick(dt) { this.t += dt; }

  resetRound() { this.lowHpCalled.clear(); }

  say(bot, text, force = false) {
    if (!bot || bot.isPlayer || !bot.alive) return;
    if (!force) {
      if (this.t - (this.lastBot.get(bot.name) ?? -9) < 2.8) return;
      if (this.t - this.lastAny < 0.8) return;
    }
    this.lastBot.set(bot.name, this.t);
    this.lastAny = this.t;
    this.hud.radio(bot.name, roleOf(bot), text, bot.team);
  }

  plan(bot, site) {
    this.say(bot, `Plan: hit ${site} through ${site === "A" ? "A LONG" : "B LONG"} — utility up, then the plant.`, true);
  }

  defendPlan(bot, site) {
    this.say(bot, `Hold ${site} and MID — they like the late hit. Crossfire on my mark.`, true);
  }

  contact(bot, foes) {
    if (!foes.length) return;
    const z = zoneAt(foes[0].pos.x, foes[0].pos.z);
    this.say(bot, foes.length > 1 ? `${foes.length} spotted ${z} — taking contact!` : `Contact — one out ${z}!`);
  }

  kill(bot, victim) {
    this.say(bot, `${victim.name} down at ${zoneAt(victim.pos.x, victim.pos.z)}.`);
  }

  planting(bot, site) { this.say(bot, `Planting at ${site} — cover me!`, true); }

  plantedEnemy(bot, site) { this.say(bot, `Charge is down at ${site} — collapse, NOW.`, true); }

  defusing(bot, kit) { this.say(bot, kit ? `Defusing — kit on, this is fast. Hold angles!` : `Defusing — hold angles!`, true); }

  rotate(bot, site) { this.say(bot, `Rotating to ${site} — watch the cut-off.`); }

  lowHp(bot) {
    if (this.lowHpCalled.has(bot.name)) return;
    this.lowHpCalled.add(bot.name);
    this.say(bot, `I'm lit at ${zoneAt(bot.pos.x, bot.pos.z)} — falling back.`);
  }

  blinded(bot) { this.say(bot, `Flashed — I'm blind, hold my angle!`); }

  smoke(bot, zone) { this.say(bot, `Smoke out — ${zone} is cut off.`); }

  incendiary(bot, zone) { this.say(bot, `Incendiary out — ${zone} is burning, nobody crosses that.`); }

  burning(bot) { this.say(bot, `I'm in the fire at ${zoneAt(bot.pos.x, bot.pos.z)} — moving out!`); }
}
