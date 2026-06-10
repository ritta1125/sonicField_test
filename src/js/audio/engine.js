/**
 * SonicField Audio Engine — Tennis Edition
 * Web Audio API — PannerNode (HRTF) spatial audio
 *
 * Coordinate system (normalized):
 *   x: 0-100  left (deuce side) → right (ad side)
 *   y: 0-100  near baseline → far baseline (50 = net)
 *
 * Listener sits at center of net, facing far end.
 */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.mutedTypes = new Set();
    this._initialized = false;
  }

  async init() {
    if (this._initialized) return;
    this.ctx = new AudioContext();
    await this.ctx.resume();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1.0;
    this.masterGain.connect(this.ctx.destination);

    const L = this.ctx.listener;
    if (L.positionX) {
      L.positionX.value = 0;
      L.positionY.value = 2;   // slightly elevated (spectator view)
      L.positionZ.value = 0;
      L.forwardX.value  = 0;
      L.forwardY.value  = -0.2;
      L.forwardZ.value  = -1;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(0, 2, 0);
      L.setOrientation(0, -0.2, -1, 0, 1, 0);
    }
    this._initialized = true;
  }

  /** x: 0-100, y: 0-100 → 3D coords */
  _toCoords(x, y) {
    const nx = ((x ?? 50) / 100) * 2 - 1;  // -1 (left) to +1 (right)
    const nz = ((y ?? 50) / 100) * 2 - 1;  // -1 (near) to +1 (far)
    return { x: nx * 10, y: 0, z: nz * 12 - 8 };
  }

  _createPanner(x, y, z) {
    const p = this.ctx.createPanner();
    p.panningModel  = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance   = 1;
    p.rolloffFactor = 0.3;
    p.coneInnerAngle = 360;
    p.coneOuterAngle = 0;
    if (p.positionX) {
      p.positionX.value = x;
      p.positionY.value = y;
      p.positionZ.value = z;
    } else {
      p.setPosition(x, y, z);
    }
    p.connect(this.masterGain);
    return p;
  }

  async play(type, x, y) {
    if (this.mutedTypes.has(type)) return;
    if (!this._initialized) await this.init();
    const c = this._toCoords(x, y);
    const panner = this._createPanner(c.x, c.y, c.z);
    SYNTH[type]?.(this.ctx, panner);
    setTimeout(() => { try { panner.disconnect(); } catch(_) {} }, 3000);
  }

  /** Game/set announcements: no spatial pan */
  async playCenter(type) {
    if (this.mutedTypes.has(type)) return;
    if (!this._initialized) await this.init();
    SYNTH[type]?.(this.ctx, this.masterGain);
  }

  toggleMute(type) {
    if (this.mutedTypes.has(type)) { this.mutedTypes.delete(type); return false; }
    this.mutedTypes.add(type); return true;
  }
  isMuted(type) { return this.mutedTypes.has(type); }
  setVolume(v)  { if (this.masterGain) this.masterGain.gain.value = Math.max(0, Math.min(1, v)); }
  get isReady() { return this._initialized; }
}

// ─────────────────────────────────────────────
// Ball impact helper — acoustic "탁" (snare-like thwack)
// vel: 0.5 (soft) → 1.0 (hard smash)
// ─────────────────────────────────────────────
// 4-layer realistic racket impact:
//   Layer 1: String snap    — HPF 5kHz,  6ms  (스트링 면에 닿는 순간)
//   Layer 2: Ball thump     — sine 320→85Hz, 40ms  (공 압축·반발)
//   Layer 3: String twang   — BPF 850Hz Q=9, 80ms  (라켓 스트링 공명)
//   Layer 4: Mid punch      — BPF 340Hz Q=4, 35ms  (임팩트 살감)
function _ballHit(ctx, dest, t, vel = 1.0) {
  const sr = ctx.sampleRate;

  // 1. String snap — 초단발 HPF 노이즈 (스트링 탄성 순간)
  const sLen = Math.floor(sr * 0.006);
  const sBuf = ctx.createBuffer(1, sLen, sr);
  const sD   = sBuf.getChannelData(0);
  for (let i = 0; i < sLen; i++) sD[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sLen * 0.12));
  const snap = ctx.createBufferSource(), sHPF = ctx.createBiquadFilter(), sG = ctx.createGain();
  snap.buffer = sBuf;
  sHPF.type = 'highpass'; sHPF.frequency.value = 5000; sHPF.Q.value = 0.7;
  sG.gain.setValueAtTime(1.5 * vel, t);
  sG.gain.exponentialRampToValueAtTime(0.001, t + 0.006);
  snap.connect(sHPF); sHPF.connect(sG); sG.connect(dest); snap.start(t);

  // 2. Ball compression thump — 피치 드롭 320→85 Hz
  const thump = ctx.createOscillator(), tG = ctx.createGain();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(320, t);
  thump.frequency.exponentialRampToValueAtTime(85, t + 0.04);
  tG.gain.setValueAtTime(0, t);
  tG.gain.linearRampToValueAtTime(0.72 * vel, t + 0.002);
  tG.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
  thump.connect(tG); tG.connect(dest); thump.start(t); thump.stop(t + 0.06);

  // 3. String resonance twang — BPF 850Hz Q=9 (라켓 고유 음색)
  const twLen = Math.floor(sr * 0.08);
  const twBuf = ctx.createBuffer(1, twLen, sr);
  const twD   = twBuf.getChannelData(0);
  for (let i = 0; i < twLen; i++) twD[i] = (Math.random() * 2 - 1) * Math.exp(-i / (twLen * 0.18));
  const twang = ctx.createBufferSource(), twBPF = ctx.createBiquadFilter(), twG = ctx.createGain();
  twang.buffer = twBuf;
  twBPF.type = 'bandpass'; twBPF.frequency.value = 850; twBPF.Q.value = 9;
  twG.gain.setValueAtTime(0, t);
  twG.gain.linearRampToValueAtTime(0.42 * vel, t + 0.001);
  twG.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  twang.connect(twBPF); twBPF.connect(twG); twG.connect(dest); twang.start(t);

  // 4. Mid punch — BPF 340Hz Q=4 (임팩트 질감)
  const mpLen = Math.floor(sr * 0.035);
  const mpBuf = ctx.createBuffer(1, mpLen, sr);
  const mpD   = mpBuf.getChannelData(0);
  for (let i = 0; i < mpLen; i++) mpD[i] = (Math.random() * 2 - 1) * Math.exp(-i / (mpLen * 0.28));
  const mp = ctx.createBufferSource(), mpBPF = ctx.createBiquadFilter(), mpG = ctx.createGain();
  mp.buffer = mpBuf;
  mpBPF.type = 'bandpass'; mpBPF.frequency.value = 340; mpBPF.Q.value = 4;
  mpG.gain.setValueAtTime(0, t);
  mpG.gain.linearRampToValueAtTime(0.52 * vel, t + 0.002);
  mpG.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
  mp.connect(mpBPF); mpBPF.connect(mpG); mpG.connect(dest); mp.start(t);
}

// ─────────────────────────────────────────────
// Tennis Earcon Synthesis
// ─────────────────────────────────────────────
export const SYNTH = {

  /** 에이스: serve nobody touches — hard hit + ball flying away */
  ace(ctx, dest) {
    const t = ctx.currentTime;
    // Sharp serve impact first
    _ballHit(ctx, dest, t, 1.0);
    // Rising swoosh — ball whipping through air
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, t + 0.02);
    osc.frequency.exponentialRampToValueAtTime(1600, t + 0.18);
    gain.gain.setValueAtTime(0, t + 0.02);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(gain); gain.connect(dest);
    osc.start(t + 0.02); osc.stop(t + 0.5);
    // high ping on landing
    const osc2  = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine'; osc2.frequency.value = 2200;
    gain2.gain.setValueAtTime(0, t + 0.22);
    gain2.gain.linearRampToValueAtTime(0.25, t + 0.24);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    osc2.connect(gain2); gain2.connect(dest);
    osc2.start(t + 0.22); osc2.stop(t + 0.6);
  },

  /** 폴트: serve error — thud into net or long */
  fault(ctx, dest) {
    const t = ctx.currentTime;
    // Softer, lower hit — ball dies quickly
    _ballHit(ctx, dest, t, 0.6);
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, t + 0.01);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.18);
    gain.gain.setValueAtTime(0.3, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(gain); gain.connect(dest);
    osc.start(t + 0.01); osc.stop(t + 0.25);
  },

  /** 위너: clean winner — hard smash, ball bounces unreturnable */
  winner(ctx, dest) {
    const t = ctx.currentTime;
    // Hard impact
    _ballHit(ctx, dest, t, 1.1);
    // Bright resonance — satisfying crack
    [[800, 0.02], [1200, 0.1]].forEach(([freq, delay]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + delay);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.7, t + delay + 0.4);
      gain.gain.setValueAtTime(0, t + delay);
      gain.gain.linearRampToValueAtTime(0.35, t + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.45);
      osc.connect(gain); gain.connect(dest);
      osc.start(t + delay); osc.stop(t + delay + 0.5);
    });
  },

  /** 브레이크포인트: pressure moment — low tension pulse ×3 */
  breakpoint(ctx, dest) {
    const t = ctx.currentTime;
    [0, 0.22, 0.44].forEach(delay => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 100 + delay * 40;
      gain.gain.setValueAtTime(0, t + delay);
      gain.gain.linearRampToValueAtTime(0.25, t + delay + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.18);
      osc.connect(gain); gain.connect(dest);
      osc.start(t + delay); osc.stop(t + delay + 0.2);
    });
  },

  /** 랠리: back-and-forth exchange — 4 real ball thwacks */
  rally(ctx, dest) {
    const t = ctx.currentTime;
    // Slightly varied timing and velocity for natural feel
    [[0, 1.0], [0.22, 0.85], [0.46, 0.95], [0.72, 0.9]].forEach(([delay, vel]) => {
      _ballHit(ctx, dest, t + delay, vel);
    });
  },

  /** 게임/세트: center announcement chime */
  game(ctx, dest) {
    const t = ctx.currentTime;
    [523.25, 783.99, 1046.50].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.3, t + i * 0.12 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.5);
      osc.connect(gain); gain.connect(dest);
      osc.start(t + i * 0.12); osc.stop(t + i * 0.12 + 0.55);
    });
  },
};

export const EARCON_META = {
  ace:        { label: '에이스',       icon: '🎯', color: '#ffd700', desc: '날카로운 상승음 + 핑' },
  fault:      { label: '폴트',         icon: '🔴', color: '#ff6b6b', desc: '하강 둔탁음' },
  winner:     { label: '위너',         icon: '⚡', color: '#4fc3f7', desc: '밝은 이중 핑' },
  breakpoint: { label: '브레이크포인트', icon: '🎯', color: '#ce93d8', desc: '저음 긴장 펄스 ×3' },
  rally:      { label: '랠리',         icon: '🏃', color: '#ff8c42', desc: '연속 볼 바운스 패턴' },
  game:       { label: '게임/세트',     icon: '🏆', color: '#a5d6a7', desc: '중앙 3음 알림' },
};
