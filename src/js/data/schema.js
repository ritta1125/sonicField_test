/**
 * SonicField — Internal Event Schema (Tennis Edition)
 *
 * x: 0-100  left (deuce side) → right (ad side)
 * y: 0-100  near baseline (0) → net (50) → far baseline (100)
 *
 * Tennis court:
 *   - Singles width: 8.23m  → normalized to 0-100
 *   - Court length:  23.77m → normalized to 0-100 (net = 50)
 *
 * 3×3 grid cells:
 *   col 0 (x 0-33):  왼쪽 듀스 사이드
 *   col 1 (x 33-67): 센터
 *   col 2 (x 67-100): 오른쪽 어드 사이드
 *   row 0 (y 0-33):  근거리 베이스라인
 *   row 1 (y 33-67): 서비스박스 / 네트
 *   row 2 (y 67-100): 원거리 베이스라인
 */

export const EVENT_TYPES = Object.freeze({
  ACE:        'ace',
  FAULT:      'fault',
  WINNER:     'winner',
  BREAKPOINT: 'breakpoint',
  RALLY:      'rally',
  GAME:       'game',     // game/set end — center, no spatial pan
});

export const SPATIAL_EARCON_TYPES = new Set([
  'ace', 'fault', 'winner', 'breakpoint', 'rally',
]);

export const CENTER_EARCON_TYPES = new Set(['game']);

/** Get 3×3 grid cell {col: 0-2, row: 0-2} from normalized coords */
export function getGridCell(x, y) {
  return {
    col: Math.min(2, Math.floor((x / 100) * 3)),
    row: Math.min(2, Math.floor((y / 100) * 3)),
  };
}

/** Human-readable zone label */
export function getZoneLabel(x, y, lang = 'ko') {
  const col = Math.min(2, Math.floor((x / 100) * 3));
  const row = Math.min(2, Math.floor((y / 100) * 3));
  if (lang === 'ko') {
    const colL = ['왼쪽(듀스)', '센터', '오른쪽(어드)'][col];
    const rowL = ['근거리 베이스라인', '서비스박스', '원거리 베이스라인'][row];
    return `${colL} ${rowL}`;
  }
  const colL = ['Left (Deuce)', 'Center', 'Right (Ad)'][col];
  const rowL = ['Near Baseline', 'Service Box', 'Far Baseline'][row];
  return `${colL} — ${rowL}`;
}

export function validateEvent(ev) {
  const errors = [];
  if (!ev.event_id) errors.push('event_id required');
  if (!Object.values(EVENT_TYPES).includes(ev.type)) errors.push(`unknown type: ${ev.type}`);
  if (typeof ev.x !== 'number' || ev.x < 0 || ev.x > 100) errors.push('x must be 0-100');
  if (typeof ev.y !== 'number' || ev.y < 0 || ev.y > 100) errors.push('y must be 0-100');
  if (!ev.match_id) errors.push('match_id required');
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
