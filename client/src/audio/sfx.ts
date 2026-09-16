import { storage } from '../net/net';

/**
 * 절차적 사운드 (WebAudio). 외부 음원 없이 종이·카드·도장·종소리·빗소리를 합성한다.
 * 모든 소리는 짧고 건조하게 — 보드게임을 손으로 만지는 느낌을 목표로 한다.
 */
let ctx: AudioContext | null = null;
let master: GainNode, sfxBus: GainNode, ambBus: GainNode, ambFilter: BiquadFilterNode;
let noiseBuf: AudioBuffer;

export const audioPrefs = {
  sfx: storage.getPref('sfx', 0.8),
  ambient: storage.getPref('ambient', 0.5),
  voice: storage.getPref('voice', 1),
};

export function audioCtx(): AudioContext | null {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
  try {
    ctx = new AudioContext();
  } catch { return null; }
  master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = audioPrefs.sfx; sfxBus.connect(master);
  ambFilter = ctx.createBiquadFilter(); ambFilter.type = 'lowpass'; ambFilter.frequency.value = 18000; ambFilter.connect(master);
  ambBus = ctx.createGain(); ambBus.gain.value = audioPrefs.ambient; ambBus.connect(ambFilter);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

export function setVolume(kind: 'sfx' | 'ambient' | 'voice', v: number) {
  audioPrefs[kind] = v;
  storage.setPref(kind, v);
  if (!ctx) return;
  if (kind === 'sfx') sfxBus.gain.value = v;
  if (kind === 'ambient') ambBus.gain.value = v;
}

const unlock = () => { audioCtx(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

function env(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function noise(opts: { dur: number; type?: BiquadFilterType; freq: number; q?: number; gain: number; attack?: number; sweepTo?: number; delay?: number; out?: AudioNode }) {
  const c = audioCtx(); if (!c) return;
  const t = c.currentTime + (opts.delay ?? 0);
  const src = c.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = c.createBiquadFilter(); f.type = opts.type ?? 'bandpass'; f.frequency.setValueAtTime(opts.freq, t); f.Q.value = opts.q ?? 1;
  if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + opts.dur);
  const g = c.createGain(); env(g, t, opts.attack ?? 0.005, opts.gain, opts.dur);
  src.connect(f); f.connect(g); g.connect(opts.out ?? sfxBus);
  src.start(t, Math.random() * 1.5, opts.dur + 0.1);
}

function tone(opts: { freq: number; dur: number; type?: OscillatorType; gain: number; attack?: number; delay?: number; slideTo?: number; out?: AudioNode }) {
  const c = audioCtx(); if (!c) return;
  const t = c.currentTime + (opts.delay ?? 0);
  const o = c.createOscillator(); o.type = opts.type ?? 'sine'; o.frequency.setValueAtTime(opts.freq, t);
  if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, t + opts.dur);
  const g = c.createGain(); env(g, t, opts.attack ?? 0.004, opts.gain, opts.dur);
  o.connect(g); g.connect(opts.out ?? sfxBus);
  o.start(t); o.stop(t + opts.dur + 0.05);
}

export const sfx = {
  click() { noise({ dur: 0.03, freq: 3200, q: 3, gain: 0.25 }); tone({ freq: 900, dur: 0.03, gain: 0.05, type: 'triangle' }); },
  hover() { noise({ dur: 0.02, freq: 5000, q: 4, gain: 0.05 }); },
  paper() { // 종이 바스락
    for (let i = 0; i < 5; i++) noise({ dur: 0.05 + Math.random() * 0.06, freq: 2500 + Math.random() * 3000, q: 0.8, gain: 0.18 + Math.random() * 0.12, delay: i * 0.035 + Math.random() * 0.02 });
  },
  pageFlip() { noise({ dur: 0.22, freq: 1800, sweepTo: 5200, q: 0.6, gain: 0.35, attack: 0.04 }); noise({ dur: 0.05, freq: 900, q: 1, gain: 0.2, delay: 0.2 }); },
  cardFlip() { noise({ dur: 0.07, freq: 4200, q: 1.2, gain: 0.35 }); noise({ dur: 0.04, freq: 1200, q: 1, gain: 0.3, delay: 0.08 }); },
  cardSlide() { noise({ dur: 0.25, freq: 2600, sweepTo: 1400, q: 0.7, gain: 0.18, attack: 0.05 }); },
  tear(progress = 1) { noise({ dur: 0.08 + progress * 0.05, freq: 1500 + Math.random() * 1500, q: 2.5, gain: 0.25 }); },
  seal() { tone({ freq: 160, dur: 0.18, gain: 0.35, slideTo: 60 }); noise({ dur: 0.12, freq: 600, q: 0.7, gain: 0.3 }); },
  stamp() {
    tone({ freq: 120, dur: 0.25, gain: 0.7, slideTo: 42 });
    noise({ dur: 0.18, type: 'lowpass', freq: 900, q: 0.5, gain: 0.7 });
    noise({ dur: 0.05, freq: 3000, q: 1, gain: 0.25, delay: 0.01 });
  },
  thud() { tone({ freq: 90, dur: 0.3, gain: 0.55, slideTo: 35 }); noise({ dur: 0.1, type: 'lowpass', freq: 500, gain: 0.4 }); },
  bell() { // 단계 전환 종소리
    [523.25, 659.25, 1046.5].forEach((f, i) => tone({ freq: f, dur: 1.6 - i * 0.3, gain: 0.12 - i * 0.03, type: 'sine', delay: i * 0.01 }));
    tone({ freq: 1567, dur: 0.6, gain: 0.03, type: 'triangle' });
  },
  chime() { [880, 1320].forEach((f, i) => tone({ freq: f, dur: 0.5, gain: 0.08, delay: i * 0.09, type: 'triangle' })); },
  tick(strong = false) { noise({ dur: 0.02, freq: strong ? 2400 : 3600, q: 8, gain: strong ? 0.35 : 0.18 }); },
  msg() { tone({ freq: 1250, dur: 0.06, gain: 0.05, type: 'triangle' }); },
  whoosh() { noise({ dur: 0.35, freq: 400, sweepTo: 2600, q: 0.6, gain: 0.25, attack: 0.12 }); },
  sting() { // 반전/공개
    tone({ freq: 110, dur: 1.8, gain: 0.25, type: 'sawtooth', attack: 0.02 });
    tone({ freq: 164.8, dur: 1.8, gain: 0.12, type: 'sawtooth' });
    tone({ freq: 233, dur: 1.5, gain: 0.1, type: 'square', delay: 0.02 });
    noise({ dur: 1.2, type: 'lowpass', freq: 300, gain: 0.3 });
  },
  success() { [392, 523.25, 659.25, 783.99].forEach((f, i) => tone({ freq: f, dur: 1.2, gain: 0.1, delay: i * 0.12, type: 'triangle' })); },
  failure() { [311, 293.66, 261.63, 196].forEach((f, i) => tone({ freq: f, dur: 1.1, gain: 0.1, delay: i * 0.22, type: 'sine' })); },
  drumroll(sec = 1.5) { const n = Math.floor(sec * 22); for (let i = 0; i < n; i++) noise({ dur: 0.05, type: 'lowpass', freq: 700, gain: 0.08 + (i / n) * 0.25, delay: i / 22 }); },
  door() { tone({ freq: 70, dur: 0.25, gain: 0.3, slideTo: 50 }); noise({ dur: 0.18, type: 'lowpass', freq: 400, gain: 0.25 }); },
  sit() { noise({ dur: 0.12, type: 'lowpass', freq: 500, gain: 0.25 }); tone({ freq: 140, dur: 0.1, gain: 0.12, slideTo: 90 }); },
  error() { tone({ freq: 220, dur: 0.12, gain: 0.08, type: 'square' }); tone({ freq: 180, dur: 0.14, gain: 0.08, type: 'square', delay: 0.1 }); },
  thunder() {
    const c = audioCtx(); if (!c) return;
    noise({ dur: 2.8, type: 'lowpass', freq: 220, gain: 0.7, attack: 0.08, out: ambBus });
    noise({ dur: 0.5, type: 'lowpass', freq: 900, gain: 0.35, out: ambBus });
  },
  step() { noise({ dur: 0.035, type: 'lowpass', freq: 380 + Math.random() * 120, gain: 0.08 }); },
};

// ── 앰비언트: 빗소리 + 낮은 드론 ─────────────────────
let ambientStarted = false;
export function startAmbient() {
  const c = audioCtx();
  if (!c || ambientStarted) return;
  ambientStarted = true;
  const rain = c.createBufferSource(); rain.buffer = noiseBuf; rain.loop = true;
  const rf = c.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 1400; rf.Q.value = 0.4;
  const rg = c.createGain(); rg.gain.value = 0.12;
  const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lg = c.createGain(); lg.gain.value = 0.05;
  lfo.connect(lg); lg.connect(rg.gain); lfo.start();
  rain.connect(rf); rf.connect(rg); rg.connect(ambBus); rain.start();
  const low = c.createOscillator(); low.type = 'sine'; low.frequency.value = 55;
  const lowg = c.createGain(); lowg.gain.value = 0.025;
  low.connect(lowg); lowg.connect(ambBus); low.start();
  const low2 = c.createOscillator(); low2.type = 'sine'; low2.frequency.value = 82.4;
  const low2g = c.createGain(); low2g.gain.value = 0.012; low2.connect(low2g); low2g.connect(ambBus); low2.start();
}

/** 밀담 구역 안에서는 바깥 소리가 먹먹하게 */
export function setMuffled(on: boolean) {
  if (!ctx) return;
  ambFilter.frequency.cancelScheduledValues(ctx.currentTime);
  ambFilter.frequency.setTargetAtTime(on ? 700 : 18000, ctx.currentTime, 0.25);
}

let lastTickSec = -1;
/** 타이머 마지막 10초 째깍 */
export function timerTick(remainingSec: number) {
  const s = Math.ceil(remainingSec);
  if (s === lastTickSec) return;
  lastTickSec = s;
  if (s <= 10 && s > 0) sfx.tick(s <= 3);
}
