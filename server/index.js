/**
 * SonicField SSE Server — Tennis Edition
 * GET /matches  — live match list
 * GET /stream   — SSE event stream
 * GET /health   — health check
 */

import express from 'express';
import cors from 'cors';
import { startStream } from './mock-events.js';

const app  = express();
const PORT = process.env.PORT ?? 3000;

app.use(cors());
app.use(express.static('src'));

const MATCHES = [
  { match_id: 'korea-open-sf', home: '정현 (Chung Hyeon)', away: 'Carlos Alcaraz', status: 'live', set_score: '1-0', game_score: '3-2', competition: '코리아오픈 2024 — 준결승' },
  { match_id: 'korea-open-f',  home: '권순우 (Kwon Soon-woo)', away: 'Novak Djokovic', status: 'live', set_score: '0-1', game_score: '4-4', competition: '코리아오픈 2024 — 결승' },
  { match_id: 'wimbledon-demo', home: 'Carlos Alcaraz', away: 'Jannik Sinner', status: 'live', set_score: '2-1', game_score: '6-5', competition: 'Wimbledon 2024 (Demo)' },
];

app.get('/health',  (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
app.get('/matches', (_, res) => res.json(MATCHES));

app.get('/stream', (req, res) => {
  const matchId = req.query.match_id ?? 'demo';
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.write(`event: event\ndata: ${JSON.stringify({ event_id:'connect-0', type:'connected', timestamp: new Date().toISOString(), x:50, y:50, team:'home', match_id:matchId })}\n\n`);
  console.log(`[SSE] connected — match: ${matchId}`);
  const cleanup = startStream(res, matchId);
  req.on('close', () => { cleanup(); console.log(`[SSE] disconnected — match: ${matchId}`); });
});

app.listen(PORT, () => {
  console.log(`\n🎾 SonicField (Tennis) server: http://localhost:${PORT}`);
  console.log(`   Stream:  http://localhost:${PORT}/stream?match_id=korea-open-sf`);
  console.log(`   Matches: http://localhost:${PORT}/matches\n`);
});
