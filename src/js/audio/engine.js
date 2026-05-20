/**
 * SonicField Audio Engine
 * Web Audio API — PannerNode (HRTF) spatial audio
 *
 * Coordinate system:
 *   Listener is at center of pitch, facing the far end.
 *   StatsBomb: x=0-120 (left→right goal), y=0-80 (bottom→top)
 *   3D space: x = left/right, y = height (0), z = near/far
 */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.mutedTypes = new Set();
    this._initialized = false;
  }

  /** Must be called from a user gesture (click/tap) */
  async init() {
    if (this._initialized) return;
    this.ctx = new AudioContext();
    await this.ctx.resume();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1.0;
    this.masterGain.connect(this.ctx.destination);

    // Position listener at center of pitch, facing far end
    const L = this.ctx.listener;
    if (L.positionX) {
      L.positionX.value = 0;
      L.positionY.value = 0;
      L.positionZ.value = 0;
      L.forwardX.value  = 0;
      L.forwardY.value  = 0;
      L.forwardZ.value  = -1; // facing -Z = far end
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    } else {
      L.setPosition(0, 0, 0);
      L.setOrientation(0, 0, -1, 0, 1, 0);
    }

    this._initialized = true;
  }

  /** Convert StatsBomb coordinates to 3D listener space */
  _sbToCoords(sbX, sbY) {
    const nx = ((sbX ?? 60) / 120) * 2 - 1;  // -1 (left) to +1 (right)
    const nz = ((sbY ?? 40) / 80) * 2 - 1;   // -1 (near) to +1 (far)
    return {
      x: nx * 14,       // ±14 units wide
      y: 0,
      z: nz * 9 - 12,  // offset behind listener so it's always in front
    };
  }

  _createPanner(x, y, z) {
    const p = this.ctx.createPanner();
    p.panningModel  = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance   = 1;
    p.rolloffFactor = 0.4;
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

  /**
   * Play an earcon at a StatsBomb pitch position
   * @param {string} type  - earcon type key
   * @param {number} sbX   - StatsBomb x (0-120)
   * @param {number} sbY   - StatsBomb y (0-80)
   */
  async play(type, sbX, sbY) {
    if (this.mutedTypes.has(type)) return;
    if (!this._initialized) await this.init();

    const { x, y, z } = this._sbToCoords(sbX, sbY);
    const panner = this._createPanner(x, y, z);
    this._synthesize(type, panner);
    setTimeout(() => { try { panner.disconnect(); } catch(_) {} }, 3000);
  }

  /** Play substitution (always center — no spatial position) */
  async playCenter(type) {
    if (this.mutedTypes.has(type)) return;
    if (!this._initialized) await this.init();
    this._synthesize(type, this.masterGain);
  }

  _synthesize(type, dest) {
    const fn = SYNTH[type];
    if (fn) fn(this.ctx, dest);
    else console.warn(`[AudioEngine] Unknown earcon type: ${type}`);
  }

  toggleMute(type) {
    if (this.mutedTypes.has(type)) { this.mutedTypes.delete(type); return false; }
    this.mutedTypes.add(type);
    return true;
  }

  isMuted(type) { return this.mutedTypes.has(type); }

  setVolume(v) {
    if (this.masterGain) this.masterGain.gain.value = Math.max(0, Math.min(1, v));
  }

  get isReady() { return this._initialized; }
}

// ─────────────────────────────────────────────
// Earcon synthesis functions
// ctx: AudioContext, dest: AudioNode to connect to
// ─────────────────────────────────────────────
export const SYNTH = {
  /** Goal: ascending C major chord — bright, celebratory */
  goal(ctx, dest) {
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t + i * 0.09);
      gain.gain.linearRampToValueAtTime(0.35, t + i * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.7);
      osc.connect(gain); gain.connect(dest);
      osc.start(t + i * 0.09);
      osc.stop(t + i * 0.09 + 0.8);
    });
  },

  /** Foul: sharp whistle burst */
  foul(ctx, dest) {
    const t = ctx.currentTime;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2400, t);
    osc.frequency.exponentialRampToValueAtTime(1700, t + 0.18);
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain); gain.connect(dest);
    osc.start(t); osc.stop(t + 0.3);
  },

  /** Tackle: low percussive thud (bandlimited noise) */
  tackle(ctx, dest) {
    const t   = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.35);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.08));
    }
    const src  = ctx.createBufferSource();
    const lpf  = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    src.buffer = buf;
    lpf.type = 'lowpass'; lpf.frequency.value = 180;
    gain.gain.setValueAtTime(2.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(lpf); lpf.connect(gain); gain.connect(dest);
    src.start(t);
  },

  /** Corner: bright bell ping (partials) */
  corner(ctx, dest) {
    const t = ctx.currentTime;
    [[1200, 1.0], [2400, 0.4], [3600, 0.15]].forEach(([freq, amp], i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.85, t + 0.6);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.3 * amp, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
      osc.connect(gain); gain.connect(dest);
      osc.start(t); osc.stop(t + 0.8);
    });
  },

  /** Penalty: building tension — low sawtooth swell */
  penalty(ctx, dest) {
    const t = ctx.currentTime;
    [80, 120, 160].forEach(freq => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.4);
      gain.gain.setValueAtTime(0.18, t + 0.65);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      osc.connect(gain); gain.connect(dest);
      osc.start(t); osc.stop(t + 1.0);
    });
  },

  /** Substitution: two-tone center chime (no spatial pan needed) */
  substitution(ctx, dest) {
    const t = ctx.currentTime;
    [880, 1100].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t + i * 0.14);
      gain.gain.linearRampToValueAtTime(0.3, t + i * 0.14 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.14 + 0.35);
      osc.connect(gain); gain.connect(dest);
      osc.start(t + i * 0.14); osc.stop(t + i * 0.14 + 0.4);
    });
  },
};

export const EARCON_META = {
  goal:         { label: '골',       icon: '⚽', color: '#ffd700', desc: '상승 화음 (4음 아르페지오)' },
  foul:         { label: '파울',     icon: '🟨', color: '#ff6b6b', desc: '날카로운 호루라기 burst' },
  tackle:       { label: '태클',     icon: '💥', color: '#ff8c42', desc: '저음 충격 (lowpass noise)' },
  corner:       { label: '코너킥',   icon: '🚩', color: '#4fc3f7', desc: '밝은 종소리 (배음 3개)' },
  penalty:      { label: '페널티',   icon: '🎯', color: '#ce93d8', desc: '긴장 드론 (저음 사인 swell)' },
  substitution: { label: '교체',     icon: '🔄', color: '#a5d6a7', desc: '중앙 2음 알림 (공간 패닝 없음)' },
};
