/**
 * SonicField — Tennis Data Module
 *
 * Sources (priority order):
 *   1. Tennis Match Charting Project (GitHub CSV)
 *      https://github.com/JeffSackmann/tennis_MatchChartingProject
 *   2. Generated realistic simulation (fallback)
 *
 * Coordinate convention (normalized):
 *   x: 0-100  left (deuce) → right (ad)
 *   y: 0-100  near baseline → far baseline (net = 50)
 */

const MCP_BASE = 'https://raw.githubusercontent.com/JeffSackmann/tennis_MatchChartingProject/master';

// ─────────────────────────────────────────────
// Shot direction → x,y position mapping
// Match Charting Project direction codes:
//   4=wide (deuce), 5=body, 6=T (ad/center)
//   b=backhand, f=forehand, n=net, o=out
// ─────────────────────────────────────────────
const DIRECTION_TO_POS = {
  4: { xNear: 10, xFar: 15 },   // wide (deuce side)
  5: { xNear: 50, xFar: 50 },   // body / center
  6: { xNear: 85, xFar: 80 },   // T / ad side
};

/**
 * Generate a realistic simulated tennis match.
 * Returns array of SFEvents sorted by time.
 *
 * Simulates ~40 minutes of match play (1.5 sets worth of points).
 */
export function generateTennisMatch(matchId = 'demo-tennis') {
  const events = [];
  let sec = 0;
  let gameCount = 0;

  // Simulate ~80 points
  for (let point = 0; point < 80; point++) {
    sec += 20 + Math.random() * 25; // 20-45s between points

    const isDeuce = Math.random() < 0.5;  // serving from deuce or ad side
    const serverX = isDeuce ? 25 : 75;    // server position

    // First serve
    const firstServeIn = Math.random() < 0.65;
    if (!firstServeIn) {
      // Fault
      events.push(makeEvent('fault', matchId, sec, serverX, 5));
      sec += 4;
      // Second serve
      const secondServeIn = Math.random() < 0.88;
      if (!secondServeIn) {
        // Double fault
        events.push(makeEvent('fault', matchId, sec, serverX, 5));
        continue;
      }
    }

    // Serve in — is it an ace?
    const isAce = Math.random() < 0.12;
    const serveLandX = isDeuce
      ? (Math.random() < 0.5 ? 15 + Math.random() * 20 : 55 + Math.random() * 20) // T or wide
      : (Math.random() < 0.5 ? 65 + Math.random() * 20 : 10 + Math.random() * 25);
    const serveLandY = 65 + Math.random() * 15; // service box (far side)

    if (isAce) {
      events.push(makeEvent('ace', matchId, sec, serveLandX, serveLandY));
      continue;
    }

    // Rally
    const rallyLength = Math.floor(2 + Math.random() * 10);
    if (rallyLength >= 5) {
      // Fire rally earcon mid-point
      const midSec = sec + (rallyLength * 1.8) / 2;
      const midX = 20 + Math.random() * 60;
      const midY = 20 + Math.random() * 60;
      events.push(makeEvent('rally', matchId, midSec, midX, midY));
    }

    // Point end — winner or error
    const pointEndSec = sec + rallyLength * 1.8;
    const isWinner = Math.random() < 0.35;
    const isBreakPoint = Math.random() < 0.15;

    const endX = 10 + Math.random() * 80;
    const endY = Math.random() < 0.6 ? 70 + Math.random() * 25 : 5 + Math.random() * 25;

    if (isBreakPoint) {
      events.push(makeEvent('breakpoint', matchId, pointEndSec - 0.5, 50, 50));
    }
    if (isWinner) {
      events.push(makeEvent('winner', matchId, pointEndSec, endX, endY));
    }

    // Game end every ~5 points
    gameCount++;
    if (gameCount % 5 === 0) {
      events.push(makeEvent('game', matchId, pointEndSec + 3, 50, 50));
    }
  }

  events.sort((a, b) => a._sec - b._sec);

  // Add relSec (relative to start) and min/max window
  const startSec = events[0]?._sec ?? 0;
  return events.map((e, i) => ({
    ...e,
    relSec: e._sec - startSec,
    seq: i,
  }));
}

let _eid = 0;
function makeEvent(type, matchId, sec, x, y) {
  return {
    event_id: `tennis-${++_eid}`,
    type,
    timestamp: new Date(sec * 1000).toISOString(),
    x: Math.round(Math.max(0, Math.min(100, x)) * 10) / 10,
    y: Math.round(Math.max(0, Math.min(100, y)) * 10) / 10,
    team: 'home',
    match_id: matchId,
    _sec: sec,
  };
}

/** Tennis match list for server */
export const TENNIS_MATCHES = [
  {
    match_id: 'korea-open-2024-sf',
    home: '정현 (Chung Hyeon)',
    away: 'Carlos Alcaraz',
    status: 'live',
    set_score: '1-0',
    game_score: '3-2',
    competition: '코리아오픈 2024 — 준결승',
  },
  {
    match_id: 'korea-open-2024-f',
    home: '권순우 (Kwon Soon-woo)',
    away: 'Novak Djokovic',
    status: 'live',
    set_score: '0-1',
    game_score: '4-4',
    competition: '코리아오픈 2024 — 결승',
  },
  {
    match_id: 'wimbledon-2024-demo',
    home: 'Carlos Alcaraz',
    away: 'Jannik Sinner',
    status: 'live',
    set_score: '2-1',
    game_score: '6-5',
    competition: 'Wimbledon 2024 — Final (Demo)',
  },
];
