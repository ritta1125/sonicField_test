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
// Tennis Earcon Synthesis
// ─────────────────────────────────────────────
export const SYNTH = {

  /** 에이스: clean serve no one touches — bright sharp rise */
  ace(ctx, dest) {
    const t = ctx.currentTime;
    // Quick rising swoosh + chime
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(1800, t + 0.12);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(gain); gain.connect(dest);
    osc.start(t); osc.stop(t + 0.5);
    // trailing ping
    const osc2  = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = 2200;
    gain2.gain.setValueAtTime(0, t + 0.1);
    gain2.gain.linearRampToValueAtTime(0.3, t + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    osc2.connect(gain2); gain2.connect(dest);
    osc2.start(t + 0.1); osc2.stop(t + 0.6);
  },

  /** 폴트: serve error — flat dull thud, downward */
  fault(ctx, dest) {
    const t = ctx.currentTime;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.2);
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain); gain.connect(dest);
    osc.start(t); osc.stop(t + 0.3);
  },

  /** 위너: clean winner — bright double-ping */
  winner(ctx, dest) {
    const t = ctx.currentTime;
    [[900, 0], [1350, 0.1]].forEach(([freq, delay]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + delay);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.75, t + delay + 0.5);
      gain.gain.setValueAtTime(0, t + delay);
      gain.gain.linearRampToValueAtTime(0.4, t + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.55);
      osc.connect(gain); gain.connect(dest);
      osc.start(t + delay); osc.stop(t + delay + 0.6);
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

  /** 랠리: long exchange — rhythmic ball-bounce pattern */
  rally(ctx, dest) {
    const t = ctx.currentTime;
    // Simulate 4 rapid ball impacts
    [0, 0.15, 0.3, 0.45].forEach((delay, i) => {
      const len = Math.floor(ctx.sampleRate * 0.12);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d   = buf.getChannelData(0);
      for (let j = 0; j < len; j++) {
        d[j] = (Math.random() * 2 - 1) * Math.exp(-j / (len * 0.06));
      }
      const src  = ctx.createBufferSource();
      const bpf  = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      src.buffer = buf;
      bpf.type = 'bandpass'; bpf.frequency.value = 800 + i * 100; bpf.Q.value = 2;
      gain.gain.setValueAtTime(0.6, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.12);
      src.connect(bpf); bpf.connect(gain); gain.connect(dest);
      src.start(t + delay);
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
