/**
 * Mock K-League Event Generator
 * Streams realistic football match events via SSE.
 * Simulates: goals, fouls, tackles, corners, penalties.
 *
 * In production: replace with real K-League API polling.
 */

const EVENT_TYPES = ['goal', 'foul', 'tackle', 'corner', 'penalty', 'substitution'];

// Weighted distribution (tackles are most common, goals least)
const EVENT_WEIGHTS = {
  tackle:       40,
  foul:         25,
  corner:       15,
  shot:         12,
  goal:          3,
  penalty:       3,
  substitution:  2,
};

const TOTAL_WEIGHT = Object.values(EVENT_WEIGHTS).reduce((a, b) => a + b, 0);

function weightedRandom() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const [type, w] of Object.entries(EVENT_WEIGHTS)) {
    r -= w;
    if (r <= 0) return type;
  }
  return 'tackle';
}

function randomPosition(type) {
  // Different event types have realistic position distributions
  switch (type) {
    case 'goal':
    case 'shot':
      // Shots cluster near goal mouths (x=105-115 or x=5-15)
      return Math.random() < 0.7
        ? { x: 100 + Math.random() * 18, y: 25 + Math.random() * 30 }
        : { x: 5 + Math.random() * 10, y: 25 + Math.random() * 30 };
    case 'corner':
      // Corners at corner flags: (0,0), (0,80), (120,0), (120,80)
      const corner = Math.floor(Math.random() * 4);
      return [
        { x: 1, y: 1  }, { x: 1,   y: 79 },
        { x: 119, y: 1 }, { x: 119, y: 79 },
      ][corner];
    case 'penalty':
      // Penalty spot at each end
      return Math.random() < 0.5 ? { x: 108, y: 40 } : { x: 12, y: 40 };
    case 'foul':
      // Fouls anywhere but common in midfield
      return {
        x: 20 + Math.random() * 80,
        y: 5  + Math.random() * 70,
      };
    default:
      // Tackles/general: all over the pitch
      return {
        x: 5 + Math.random() * 110,
        y: 5 + Math.random() * 70,
      };
  }
}

let eventCounter = 0;
let matchMinute  = 0;

/**
 * Generate a single random match event.
 * @param {string} matchId
 * @returns {SFEvent}
 */
export function generateEvent(matchId) {
  const type = weightedRandom();
  const pos  = randomPosition(type);
  matchMinute += 0.1 + Math.random() * 0.5; // roughly real-time minute progression

  return {
    event_id:  `mock-${++eventCounter}`,
    type,
    timestamp: new Date().toISOString(),
    x: Math.round(pos.x * 10) / 10,
    y: Math.round(pos.y * 10) / 10,
    team:     Math.random() < 0.5 ? 'home' : 'away',
    match_id: matchId,
    meta: {
      minute: Math.floor(matchMinute),
    },
  };
}

/**
 * Start streaming events to an SSE response.
 * @param {import('express').Response} res
 * @param {string} matchId
 * @returns {Function} cleanup function
 */
export function startStream(res, matchId) {
  // Randomize interval: 4-12 seconds between events (realistic match cadence)
  let timeout;

  function sendNext() {
    const ev = generateEvent(matchId);
    res.write(`event: event\ndata: ${JSON.stringify(ev)}\n\n`);

    const nextIn = 4000 + Math.random() * 8000;
    timeout = setTimeout(sendNext, nextIn);
  }

  // Heartbeat every 15s (keep SSE connection alive through proxies)
  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\ndata: ping\n\n`);
  }, 15000);

  sendNext();

  return () => {
    clearTimeout(timeout);
    clearInterval(heartbeat);
  };
}
