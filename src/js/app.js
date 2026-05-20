/**
 * SonicField — Main App Controller
 * Manages screen routing, audio engine lifecycle, and SSE stream.
 */

import { AudioEngine, EARCON_META } from './audio/engine.js';
import { SSEClient } from './sse-client.js';
import { SPATIAL_EARCON_TYPES, CENTER_EARCON_TYPES, getGridCell } from './data/schema.js';

// ─────────────────────────────────────────────
// App State
// ─────────────────────────────────────────────
const state = {
  screen: 'game-select',   // current screen
  lang:   'ko',            // 'ko' | 'en'
  matchId: null,
  audioReady: false,
  ballPos: { x: 60, y: 40 },
  mutedTypes: new Set(),
  onboardingDone: false,
  onboardingStep: 0,
};

// ─────────────────────────────────────────────
// Module singletons
// ─────────────────────────────────────────────
const audio  = new AudioEngine();
let sseClient = null;

// ─────────────────────────────────────────────
// Screen registry
// ─────────────────────────────────────────────
const screens = {};

function registerScreen(id, el) {
  screens[id] = el;
  el.style.display = 'none';
}

export function navigate(screenId, params = {}) {
  // Hide current
  Object.values(screens).forEach(s => { s.style.display = 'none'; });

  // Show target
  const target = screens[screenId];
  if (!target) { console.error(`Screen not found: ${screenId}`); return; }
  target.style.display = '';
  state.screen = screenId;

  // Lifecycle hook
  target.dispatchEvent(new CustomEvent('screen-enter', { detail: params }));
}

// ─────────────────────────────────────────────
// Audio lifecycle
// ─────────────────────────────────────────────
export async function initAudio() {
  await audio.init();
  state.audioReady = true;
}

export function playEarcon(type, x, y) {
  if (SPATIAL_EARCON_TYPES.has(type)) {
    audio.play(type, x, y);
  } else if (CENTER_EARCON_TYPES.has(type)) {
    audio.playCenter(type);
  }
}

export function toggleMute(type) {
  return audio.toggleMute(type);
}

// ─────────────────────────────────────────────
// SSE stream
// ─────────────────────────────────────────────
export function startStream(matchId) {
  const url = `http://localhost:3000/stream?match_id=${matchId}`;
  sseClient = new SSEClient(url);

  sseClient.addEventListener('sf-event', (msg) => {
    const ev = msg.detail;
    handleEvent(ev);
  });

  sseClient.addEventListener('status', (msg) => {
    const status = msg.detail;
    document.getElementById('connection-status')?.setAttribute('data-status', status);
    const label = { connecting: '연결 중...', connected: '라이브', error: '연결 오류', disconnected: '연결 끊김' }[status];
    if (document.getElementById('connection-label')) {
      document.getElementById('connection-label').textContent = label ?? status;
    }
  });

  sseClient.connect();
  state.matchId = matchId;
}

export function stopStream() {
  sseClient?.disconnect();
  sseClient = null;
}

function handleEvent(ev) {
  // Update ball position
  state.ballPos = { x: ev.x, y: ev.y };
  updateBallDisplay(ev.x, ev.y);

  // Play earcon
  playEarcon(ev.type, ev.x, ev.y);

  // Update event log
  appendEventLog(ev);
}

// ─────────────────────────────────────────────
// UI helpers shared across screens
// ─────────────────────────────────────────────
function updateBallDisplay(x, y) {
  const pitchEl = document.getElementById('pitch-grid');
  if (!pitchEl) return;
  const rect   = pitchEl.getBoundingClientRect();
  const pad    = 8;
  const innerW = rect.width  - pad * 2;
  const innerH = rect.height - pad * 2;
  const nx = x / 120;
  const ny = y / 80;
  const dot = document.getElementById('ball-dot');
  if (dot) {
    dot.style.left = (pad + nx * innerW) + 'px';
    dot.style.top  = (pad + ny * innerH) + 'px';
    dot.style.display = 'block';
  }

  // Flash grid cell
  const { col, row } = getGridCell(x, y);
  const cells = document.querySelectorAll('.pitch-cell');
  const idx = row * 5 + col;
  if (cells[idx]) {
    cells[idx].classList.add('flash');
    setTimeout(() => cells[idx].classList.remove('flash'), 400);
  }
}

function appendEventLog(ev) {
  const log = document.getElementById('event-log');
  if (!log) return;

  const meta = EARCON_META[ev.type];
  const ts   = new Date(ev.timestamp);
  const mm   = String(ts.getMinutes()).padStart(2, '0');
  const ss   = String(ts.getSeconds()).padStart(2, '0');

  const entry = document.createElement('div');
  entry.className = 'event-entry';
  entry.setAttribute('role', 'listitem');
  entry.innerHTML = `
    <span class="event-time">${mm}:${ss}</span>
    <span class="event-icon" style="color:${meta?.color ?? '#aaa'}">${meta?.icon ?? '•'} ${meta?.label ?? ev.type}</span>
    <span class="event-zone">${getZoneLabel(ev.x, ev.y)}</span>
  `;
  entry.setAttribute('aria-label',
    `${mm}:${ss} — ${meta?.label ?? ev.type} — ${getZoneLabel(ev.x, ev.y)}`
  );

  log.prepend(entry);
  while (log.children.length > 30) log.removeChild(log.lastChild);
}

function getZoneLabel(x, y) {
  const col = Math.floor((x / 120) * 3);
  const row = Math.floor((y / 80) * 3);
  const colL = state.lang === 'ko'
    ? ['왼쪽', '중앙', '오른쪽'][Math.min(col, 2)]
    : ['Left', 'Center', 'Right'][Math.min(col, 2)];
  const rowL = state.lang === 'ko'
    ? ['근거리', '중간', '원거리'][Math.min(row, 2)]
    : ['Near', 'Mid', 'Far'][Math.min(row, 2)];
  return `${colL} ${rowL}`;
}

// ─────────────────────────────────────────────
// Language
// ─────────────────────────────────────────────
export function setLang(lang) {
  state.lang = lang;
  localStorage.setItem('sf-lang', lang);
  document.documentElement.lang = lang;
  // Trigger re-render of current screen
  navigate(state.screen);
}

// ─────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────
export function loadPrefs() {
  state.lang = localStorage.getItem('sf-lang') || 'ko';
  state.onboardingDone = localStorage.getItem('sf-onboarding-done') === '1';
  const muted = JSON.parse(localStorage.getItem('sf-muted') || '[]');
  muted.forEach(t => audio.toggleMute(t));
}

export function savePrefs() {
  localStorage.setItem('sf-lang', state.lang);
  localStorage.setItem('sf-muted', JSON.stringify([...audio.mutedTypes]));
}

// ─────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────
export function boot() {
  loadPrefs();

  // Register screens
  ['game-select', 'active-listening', 'onboarding', 'playground', 'settings']
    .forEach(id => {
      const el = document.getElementById(`screen-${id}`);
      if (el) registerScreen(id, el);
    });

  // Navigate to first screen
  if (!state.onboardingDone) {
    navigate('onboarding');
  } else {
    navigate('game-select');
  }
}

export { state, audio };
