/**
 * StatsBomb Open Data Adapter
 * Fetches from: https://raw.githubusercontent.com/statsbomb/open-data/master/data/
 * Normalizes events to SonicField internal schema.
 */

const SB_BASE = 'https://raw.githubusercontent.com/statsbomb/open-data/master/data';

// StatsBomb event type → SonicField internal type
const SB_TYPE_MAP = {
  'Shot':           (ev) => ev.shot?.outcome?.name === 'Goal' ? 'goal' : 'shot',
  'Foul Committed': () => 'foul',
  'Duel':           () => 'tackle',
  '50/50':          () => 'tackle',
  'Corner Kick':    () => 'corner',
  'Penalty':        () => 'penalty',
  'Substitution':   () => 'substitution',
};

export async function fetchCompetitions() {
  const res = await fetch(`${SB_BASE}/competitions.json`);
  return res.json();
}

export async function fetchMatches(competitionId, seasonId) {
  const res = await fetch(`${SB_BASE}/matches/${competitionId}/${seasonId}.json`);
  return res.json();
}

export async function fetchEvents(matchId) {
  const res = await fetch(`${SB_BASE}/events/${matchId}.json`);
  return res.json();
}

/**
 * Normalize a StatsBomb event to SonicField schema.
 * Returns null if the event type is not relevant.
 *
 * @param {object} sbEvent  - Raw StatsBomb event
 * @param {string} matchId
 * @returns {SFEvent|null}
 */
export function normalizeEvent(sbEvent, matchId) {
  const mapFn = SB_TYPE_MAP[sbEvent.type?.name];
  if (!mapFn) return null;
  if (!sbEvent.location) return null;

  const type = mapFn(sbEvent);

  return {
    event_id:  sbEvent.id,
    type,
    timestamp: sbTimestampToISO(sbEvent),
    x: sbEvent.location[0],
    y: sbEvent.location[1],
    team:  sbEvent.team?.name?.toLowerCase().includes('away') ? 'away' : 'home',
    match_id: String(matchId),
    meta: {
      player:  sbEvent.player?.name,
      rawType: sbEvent.type?.name,
      period:  sbEvent.period,
      minute:  sbEvent.minute,
      second:  sbEvent.second,
    },
  };
}

function sbTimestampToISO(ev) {
  const [h, m, s] = (ev.timestamp || '0:00:00.000').split(':').map(Number);
  const periodOffset = ((ev.period ?? 1) - 1) * 45 * 60;
  const totalSec = periodOffset + h * 3600 + m * 60 + s;
  return new Date(totalSec * 1000).toISOString();
}

/**
 * Find the most event-dense 10-minute window in a match.
 * Returns { startSec, events } where events are already normalized.
 */
export function findBestSegment(sbEvents, matchId, windowSecs = 600) {
  const normalized = sbEvents
    .map(e => normalizeEvent(e, matchId))
    .filter(Boolean);

  if (normalized.length === 0) return { startSec: 0, events: [] };

  // Convert timestamp to seconds
  const withSec = normalized.map(e => ({
    ...e,
    _sec: Date.parse(e.timestamp) / 1000,
  }));
  withSec.sort((a, b) => a._sec - b._sec);

  const minSec = withSec[0]._sec;
  const maxSec = withSec[withSec.length - 1]._sec;

  let bestStart = minSec;
  let bestCount = 0;
  for (let s = minSec; s <= maxSec - windowSecs; s += 30) {
    const count = withSec.filter(e => e._sec >= s && e._sec < s + windowSecs).length;
    if (count > bestCount) { bestCount = count; bestStart = s; }
  }

  const segmentEvents = withSec
    .filter(e => e._sec >= bestStart && e._sec < bestStart + windowSecs)
    .map(e => ({ ...e, relSec: e._sec - bestStart }));

  return { startSec: bestStart, events: segmentEvents };
}
