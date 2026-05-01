# TODOS — SonicField

## P0 — Blocks everything

### [ ] User Research: Talk to 3 acquired-blind sports fans
**What**: Real conversations (not articles). Name, sport, current workaround, specific frustration.
**Why**: Biggest gap in demand evidence. Gate 1 of the validation sequence. If 2/3 don't confirm the problem, reassess before building.
**Where to find them**: 한국시각장애인연합회, disability sports orgs, Reddit r/Blind, Facebook groups for visually impaired sports fans.
**Pass criteria**: 2/3 confirm (a) audio commentary is inadequate, (b) would try spatial audio, (c) own or would buy spatial-audio headphones.
**Effort**: ~1 week to find + schedule. **Priority**: P0.
**Depends on**: Nothing. Do this first.

---

## P1 — Core v1 features

### [ ] StatsBomb + Web Audio API Prototype (Gate 2 validation)
**What**: One HTML page, StatsBomb historical data, 5 earcons, 10-min match segment, HRTF PannerNode.
**Why**: Validates that spatial audio encoding of sports events actually works for users before building live infrastructure.
**Pass criteria**: 2/3 participants identify shot zone (left/center/right) from audio alone.
**Effort**: ~2 days (human) / ~30 min (CC). **Priority**: P1.
**Depends on**: Gate 1 (user discovery) completed.

### [ ] K-League API + Broadcast Rights Research (Gate 0)
**What**: Confirm affordable K-League event API. Confirm broadcast rights for server-side CV.
**Why**: Both are existential risks. No API = no K-League launch. Rights violation = CV approach blocked.
**Fallback**: Premier League via Sportradar trial if K-League unavailable.
**Effort**: ~2-3 days. **Priority**: P1.
**Depends on**: Nothing. Run in parallel with Gate 1.

### [ ] Canonical Internal Event Schema
**What**: Define the internal JSON event format that both K-League and PL APIs normalize into. Include: event_id, type, timestamp, x (0-100), y (0-100), team, match_id.
**Why**: Load-bearing architecture decision. All audio engine code depends on this. Wrong schema = painful refactor.
**Effort**: ~0.5 day. **Priority**: P1.
**Depends on**: Gate 0 (which APIs are available).

### [ ] Event Data Schema with Replay Support
**What**: Design v1 event storage schema to include position + timestamp per event. Required so v2 Highlight Reel can replay without data refactor.
**Why**: Adding position fields later means re-processing all historical match data.
**Effort**: ~0.5 day added to schema design above. **Priority**: P1.
**Depends on**: Canonical event schema.

---

## P2 — High value, not blocking v1 launch

### [ ] Companion / Sighted Friend View
**What**: Companion screen (phone/tablet/laptop) showing real-time pitch map, earcon legend, recent events for sighted friends watching alongside blind users.
**Why**: Social growth loop. Sighted family members become SonicField advocates. Word-of-mouth from sighted people is a key growth channel for an accessibility product.
**Pros**: Turns SonicField into shared family experience; expands audience.
**Cons**: Doubles surface area; primary blind user UX must be validated first.
**Effort**: ~3 days (human) / ~3 hrs (CC). **Priority**: P2.
**Depends on**: v1 Active Listening screen stable and user-tested.

### [ ] Half-Time Spatial Highlight Reel
**What**: Replay top 3 spatial audio moments (goals, near-misses, tackles) post-match or at half-time as compressed earcon + spatial sequence.
**Why**: Shareable moments = organic growth. "Listen to how the goal felt from the goalkeeper's end" is press-worthy.
**Pros**: Viral/shareable; turns SonicField from live tool into sports memory.
**Cons**: Requires data storage and replay infrastructure.
**Critical**: v1 event schema MUST include position + timestamp to enable this without refactor (see P1 above).
**Effort**: Replay UI ~1 week (human) / ~4 hrs (CC). **Priority**: P2.
**Depends on**: Event data schema with replay support (P1).

---

## P3 — Good ideas, explicitly deferred

### [ ] Headphone Profile Compensation (v1.1)
**What**: Custom HRTF filter coefficients per headphone model (AirPods, Sony WH-1000XM, generic) using ConvolverNode + MIT KEMAR dataset.
**Why**: Headphone frequency response affects spatial audio quality. Default PannerNode HRTF is generic.
**Effort**: ~1-2 weeks (requires acoustic research + integration). **Priority**: P3.
**Depends on**: Gate 2 data on whether headphone type significantly impacts user experience.

### [ ] Developer SDK / Platform Layer
**Skipped for v1**: Building a public SDK before product-market fit is premature abstraction.
**When to revisit**: After SonicField has 500+ MAU and other sports developers express interest.
**Design note**: Audio engine must be written with clean sport-agnostic interfaces (sport config = data, not code) so SDK doesn't require an engine rewrite.
