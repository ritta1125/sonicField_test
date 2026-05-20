/**
 * SonicField — Internal Event Schema
 *
 * All data sources (K-League API, StatsBomb, CV pipeline, mock)
 * normalize into this format before reaching the audio engine.
 *
 * x, y: StatsBomb convention (0-120 × 0-80) for consistency.
 * The audio engine converts to 3D coordinates internally.
 */

/**
 * @typedef {Object} SFEvent
 * @property {string} event_id    - Unique event identifier
 * @property {EventType} type     - Normalized event type
 * @property {string} timestamp   - ISO 8601
 * @property {number} x           - Pitch x position, 0-120 (StatsBomb convention)
 * @property {number} y           - Pitch y position, 0-80 (StatsBomb convention)
 * @property {'home'|'away'} team - Which team
 * @property {string} match_id    - Match identifier
 * @property {object} [meta]      - Source-specific metadata (optional)
 */

/**
 * @typedef {'goal'|'shot'|'foul'|'tackle'|'corner'|'penalty'|'substitution'} EventType
 */

export const EVENT_TYPES = Object.freeze({
  GOAL:         'goal',
  SHOT:         'shot',          // shot that didn't result in goal
  FOUL:         'foul',
  TACKLE:       'tackle',
  CORNER:       'corner',
  PENALTY:      'penalty',
  SUBSTITUTION: 'substitution',
});

/** Which event types trigger a spatial earcon */
export const SPATIAL_EARCON_TYPES = new Set([
  'goal', 'foul', 'tackle', 'corner', 'penalty',
]);

/** Which event types are played at center (no spatial pan) */
export const CENTER_EARCON_TYPES = new Set([
  'substitution',
]);

/**
 * Validate an event object against the schema.
 * Returns { valid: true } or { valid: false, errors: string[] }
 */
export function validateEvent(ev) {
  const errors = [];
  if (!ev.event_id) errors.push('event_id required');
  if (!EVENT_TYPES[ev.type?.toUpperCase()?.replace(/-/g, '_')] && !Object.values(EVENT_TYPES).includes(ev.type)) {
    errors.push(`type "${ev.type}" not recognized`);
  }
  if (typeof ev.x !== 'number' || ev.x < 0 || ev.x > 120) errors.push('x must be 0-120');
  if (typeof ev.y !== 'number' || ev.y < 0 || ev.y > 80)  errors.push('y must be 0-80');
  if (!ev.match_id) errors.push('match_id required');
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/**
 * Convert 0-120/0-80 (StatsBomb) to 0-100/0-100 (normalized)
 */
export function normalizePitchCoords(x, y) {
  return {
    nx: (x / 120) * 100,
    ny: (y / 80)  * 100,
  };
}

/**
 * Get the 5×3 grid cell for a position.
 * Returns { col: 0-4, row: 0-2 }
 */
export function getGridCell(x, y) {
  return {
    col: Math.min(4, Math.floor((x / 120) * 5)),
    row: Math.min(2, Math.floor((y / 80) * 3)),
  };
}
