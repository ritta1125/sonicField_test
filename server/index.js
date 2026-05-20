/**
 * SonicField — SSE Server
 *
 * Endpoints:
 *   GET /stream?match_id=xxx  — SSE event stream
 *   GET /matches              — List of mock live matches
 *   GET /health               — Health check
 *
 * Production: swap mock-events.js for real K-League API adapter.
 */

import express from 'express';
import cors from 'cors';
import { startStream } from './mock-events.js';

const app  = express();
const PORT = process.env.PORT ?? 3000;

app.use(cors());
app.use(express.static('src')); // Serve the web app

// ─────────────────────────────────────────────
// Mock match list
// ─────────────────────────────────────────────
const MOCK_MATCHES = [
  {
    match_id: 'klg-2024-001',
    home: '전북 현대 모터스',
    away: '울산 현대',
    status: 'live',
    minute: 34,
    score: { home: 1, away: 0 },
    competition: 'K리그1 2024',
  },
  {
    match_id: 'klg-2024-002',
    home: '수원 FC',
    away: '인천 유나이티드',
    status: 'live',
    minute: 67,
    score: { home: 0, away: 2 },
    competition: 'K리그1 2024',
  },
  {
    match_id: 'pl-2024-001',
    home: 'Manchester City',
    away: 'Arsenal',
    status: 'live',
    minute: 22,
    score: { home: 0, away: 0 },
    competition: 'Premier League (fallback)',
  },
];

// ─────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────
app.get('/health', (_, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

app.get('/matches', (_, res) => {
  res.json(MOCK_MATCHES);
});

app.get('/stream', (req, res) => {
  const matchId = req.query.match_id ?? 'demo';

  // Set SSE headers
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable Nginx buffering

  // Send initial connected event
  res.write(`event: event\ndata: ${JSON.stringify({
    event_id:  'connect-0',
    type:      'connected',
    timestamp: new Date().toISOString(),
    x: 60, y: 40,
    team: 'home',
    match_id: matchId,
    meta: { message: 'SonicField stream connected' },
  })}\n\n`);

  console.log(`[SSE] Client connected — match: ${matchId}`);

  const cleanup = startStream(res, matchId);

  req.on('close', () => {
    cleanup();
    console.log(`[SSE] Client disconnected — match: ${matchId}`);
  });
});

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎧 SonicField server running at http://localhost:${PORT}`);
  console.log(`   Stream:  http://localhost:${PORT}/stream?match_id=klg-2024-001`);
  console.log(`   Matches: http://localhost:${PORT}/matches`);
  console.log(`   App:     http://localhost:${PORT}/index.html\n`);
});
