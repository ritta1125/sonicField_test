/**
 * Mock Tennis Event Generator — SSE stream
 * Simulates realistic tennis point-by-point events.
 * Replace with real ATP/WTA/Korea Open API in production.
 */

// Weighted event distribution
const WEIGHTS = {
  ace:        8,
  fault:      18,
  winner:     20,
  rally:      35,
  breakpoint: 8,
  game:       11,
};
const TOTAL = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

function weightedRandom() {
  let r = Math.random() * TOTAL;
  for (const [type, w] of Object.entries(WEIGHTS)) {
    r -= w;
    if (r <= 0) return type;
  }
  return 'rally';
}

// Realistic tennis positions (x: 0-100 left→right, y: 0-100 near→far)
function positionFor(type) {
  const isDeuce = Math.random() < 0.5;
  switch (type) {
    case 'ace':
      // Lands in far service box (T or wide)
      return { x: isDeuce ? 10 + Math.random() * 30 : 60 + Math.random() * 30, y: 62 + Math.random() * 12 };
    case 'fault':
      // Net fault: y near 50, out: y>75 or y<0
      return Math.random() < 0.5
        ? { x: 20 + Math.random() * 60, y: 48 + Math.random() * 5 }   // net
        : { x: 5 + Math.random() * 90,  y: 78 + Math.random() * 15 }; // long
    case 'winner':
      return { x: 5 + Math.random() * 90, y: Math.random() < 0.7 ? 72 + Math.random() * 22 : 5 + Math.random() * 20 };
    case 'breakpoint':
      return { x: 50, y: 50 }; // announce at center
    case 'rally':
      return { x: 15 + Math.random() * 70, y: 20 + Math.random() * 60 };
    case 'game':
      return { x: 50, y: 50 };
    default:
      return { x: 50, y: 50 };
  }
}

let counter = 0;

export function generateEvent(matchId) {
  const type = weightedRandom();
  const pos  = positionFor(type);
  return {
    event_id:  `mock-${++counter}`,
    type,
    timestamp: new Date().toISOString(),
    x: Math.round(pos.x * 10) / 10,
    y: Math.round(pos.y * 10) / 10,
    team:     Math.random() < 0.5 ? 'home' : 'away',
    match_id: matchId,
    meta: {},
  };
}

export function startStream(res, matchId) {
  let timeout;
  function sendNext() {
    const ev = generateEvent(matchId);
    res.write(`event: event\ndata: ${JSON.stringify(ev)}\n\n`);
    // Tennis: 6-20 seconds between events (point duration)
    timeout = setTimeout(sendNext, 6000 + Math.random() * 14000);
  }
  const heartbeat = setInterval(() => res.write(`event: heartbeat\ndata: ping\n\n`), 15000);
  sendNext();
  return () => { clearTimeout(timeout); clearInterval(heartbeat); };
}
