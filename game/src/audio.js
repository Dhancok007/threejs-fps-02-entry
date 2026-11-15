// Procedural WebAudio: every sound is synthesized, no audio files exist.
// Distant shots are low-passed and quieter, so your ears work like radar.
let ctx = null;
export function audioReady() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; } }
  if (ctx && ctx.state === "suspended") ctx.resume();
  return ctx;
}
function env(gain, t0, peak, dur) {
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}
function noiseBuffer() {
  const len = ctx.sampleRate * 0.5;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
let sharedNoise = null;
export function shot(dist = 0, heavy = false) {
  if (!ctx) return;
  if (!sharedNoise) sharedNoise = noiseBuffer();
  const t = ctx.currentTime;
  const att = 1 / (1 + dist * 0.09);
  const src = ctx.createBufferSource(); src.buffer = sharedNoise;
  const filt = ctx.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = Math.max(320, (heavy ? 2600 : 3600) - dist * 55);
  const g = ctx.createGain();
  env(g, t, 0.5 * att * (heavy ? 1.25 : 1), heavy ? 0.22 : 0.14);
  src.connect(filt).connect(g).connect(ctx.destination);
  src.start(t); src.stop(t + 0.3);
}
export function dryFire() { blip(1900, 0.05, 0.08, "square"); }
export function reloadSnd() { blip(700, 0.07, 0.1, "square"); setTimeout(() => blip(980, 0.06, 0.1, "square"), 160); }
export function hitmarkSnd(head) { blip(head ? 1560 : 1180, 0.06, 0.12, "sine"); }
export function hurtSnd() { blip(160, 0.16, 0.16, "sawtooth"); }
export function beep(final) { blip(final ? 1760 : 1180, final ? 0.3 : 0.09, 0.14, "sine"); }
export function boom() {
  if (!ctx) return;
  if (!sharedNoise) sharedNoise = noiseBuffer();
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = sharedNoise;
  const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = 420;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.9, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
  src.connect(filt).connect(g).connect(ctx.destination);
  src.start(t); src.stop(t + 1.5);
}
export function throwSnd() { blip(420, 0.1, 0.07, "triangle"); }
function blip(freq, dur, vol, type) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = ctx.createGain(); env(g, t, vol, dur);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + dur + 0.05);
}
