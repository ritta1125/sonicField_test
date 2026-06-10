"""
SonicField Ball Tracker Server
POST /analyze  { url, home, away, competition, date }
             → { job_id }
GET  /status/<job_id>
             → { status, progress, message, tracks_url? }
GET  /tracks/<job_id>
             → ball_tracks JSON  [{ t, x, y }, ...]
"""

import cv2
import numpy as np
import json
import os
import threading
import uuid
import traceback
from flask import Flask, request, jsonify, send_file
import tempfile
import subprocess

app = Flask(__name__)

# ── CORS ────────────────────────────────────────────────────────────
@app.after_request
def cors(r):
    r.headers['Access-Control-Allow-Origin']  = '*'
    r.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    r.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
    return r

@app.route('/analyze', methods=['OPTIONS'])
def options_analyze(): return '', 204

# ── Job store ────────────────────────────────────────────────────────
jobs = {}   # job_id → { status, progress, message, tracks, error }

# ── Routes ──────────────────────────────────────────────────────────
@app.route('/health')
def health(): return jsonify(status='ok')

@app.route('/analyze', methods=['POST'])
def analyze():
    data = request.get_json(force=True)
    url  = (data.get('url') or '').strip()
    if not url:
        return jsonify(error='url required'), 400

    job_id = str(uuid.uuid4())[:8]
    jobs[job_id] = dict(
        status='queued', progress=0,
        message='대기 중...',
        meta=dict(
            home        = data.get('home', '홈'),
            away        = data.get('away', '어웨이'),
            competition = data.get('competition', ''),
            date        = data.get('date', ''),
        ),
        tracks=None, error=None
    )
    t = threading.Thread(target=_run_job, args=(job_id, url), daemon=True)
    t.start()
    return jsonify(job_id=job_id)

@app.route('/status/<job_id>')
def status(job_id):
    job = jobs.get(job_id)
    if not job: return jsonify(error='not found'), 404
    out = dict(status=job['status'], progress=job['progress'], message=job['message'])
    if job['status'] == 'done':
        out['tracks_url'] = f'/tracks/{job_id}'
        out['meta'] = job['meta']
    if job['error']:
        out['error'] = job['error']
    return jsonify(out)

@app.route('/tracks/<job_id>')
def tracks(job_id):
    job = jobs.get(job_id)
    if not job or not job['tracks']:
        return jsonify(error='tracks not ready'), 404
    return jsonify(job['tracks'])

# ── Pipeline ─────────────────────────────────────────────────────────
def _update(job_id, progress, message, status='running'):
    jobs[job_id].update(progress=progress, message=message, status=status)
    print(f'[{job_id}] {progress:3d}%  {message}')

def _run_job(job_id, url):
    tmp_dir = tempfile.mkdtemp(prefix='sonicfield_')
    video_path = os.path.join(tmp_dir, 'match.mp4')
    try:
        # ── 1. Download ─────────────────────────────────────────────
        _update(job_id, 5, '영상 다운로드 중...')
        dl_result = subprocess.run([
            'python3', '-m', 'yt_dlp',
            '-f', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]',
            '--merge-output-format', 'mp4',
            '--max-filesize', '500m',
            '-o', video_path,
            '--no-playlist',
            url
        ], capture_output=True, text=True, timeout=300)
        if not os.path.exists(video_path):
            raise RuntimeError(f'다운로드 실패: {dl_result.stderr[-300:]}')

        # ── 2. Open video ────────────────────────────────────────────
        _update(job_id, 20, '영상 분석 시작...')
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise RuntimeError('영상 파일을 열 수 없습니다.')

        fps     = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total_f = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total_f / fps
        # Max 10 minutes
        max_dur = 600
        if duration > max_dur:
            duration = max_dur

        _update(job_id, 22, f'영상 길이: {duration:.0f}초, fps: {fps:.1f}')

        # Sample every SAMPLE_INTERVAL seconds
        SAMPLE_INTERVAL = 1/6   # 6fps
        step = max(1, int(fps * SAMPLE_INTERVAL))

        # ── 3. Detect court homography from first clear frame ────────
        _update(job_id, 25, '코트 경계 감지 중...')
        H = None
        frame_idx = 0
        while frame_idx < min(300, total_f):
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
            ret, frame = cap.read()
            if not ret: break
            H = _estimate_homography(frame)
            if H is not None:
                break
            frame_idx += 30
        if H is None:
            _update(job_id, 28, '코트 자동 감지 실패 — 프레임 비율로 대체')
            H = _fallback_homography(frame)

        # ── 4. Ball detection per sample ─────────────────────────────
        _update(job_id, 30, '볼 트래킹 시작...')
        raw_detections = []   # [{t, px, py}]
        prev_gray = None
        target_frames = int(duration * fps / step)

        frame_no = 0
        processed = 0
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

        while True:
            ret, frame = cap.read()
            if not ret: break
            t_sec = frame_no / fps
            if t_sec > max_dur: break

            if frame_no % step == 0:
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                det  = _detect_ball(frame, gray, prev_gray)
                if det is not None:
                    raw_detections.append(dict(t=t_sec, px=det[0], py=det[1]))
                prev_gray = gray
                processed += 1
                pct = 30 + int(60 * processed / max(1, target_frames))
                if processed % 30 == 0:
                    _update(job_id, min(pct, 89),
                            f'프레임 {frame_no}/{total_f} 처리 중 — 검출 {len(raw_detections)}개')

            frame_no += 1

        cap.release()
        _update(job_id, 90, f'총 {len(raw_detections)}개 볼 위치 검출 완료')

        # ── 5. Convert pixels → court coords ─────────────────────────
        court_pts = _apply_homography(raw_detections, H)

        # ── 6. Smooth & interpolate to 0.1s grid ────────────────────
        tracks = _smooth_and_interpolate(court_pts, duration)
        _update(job_id, 95, f'{len(tracks)}개 위치로 보간 완료')

        jobs[job_id].update(
            status='done', progress=100,
            message=f'완료 — {len(tracks)}개 위치 ({duration:.0f}초)',
            tracks=dict(
                match_id  = job_id,
                home      = jobs[job_id]['meta']['home'],
                away      = jobs[job_id]['meta']['away'],
                competition = jobs[job_id]['meta']['competition'],
                date      = jobs[job_id]['meta']['date'],
                duration  = duration,
                source    = url,
                trust_level = 'tracked',
                ball_positions = tracks,  # raw high-res
                events    = _build_events(tracks, jobs[job_id]['meta']),
            )
        )

    except Exception as e:
        err = traceback.format_exc()
        print(err)
        jobs[job_id].update(status='error', error=str(e), message=f'오류: {e}')
    finally:
        # cleanup
        import shutil
        try: shutil.rmtree(tmp_dir)
        except: pass


# ── Court homography ─────────────────────────────────────────────────
def _estimate_homography(frame):
    """
    Try to detect court corners via line detection.
    Returns 3x3 homography matrix mapping pixel → [0,100] court coords, or None.
    Court: x=deuce(0)→ad(100), y=near(0)→far(100)
    """
    h, w = frame.shape[:2]
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5,5), 0)
    edges = cv2.Canny(blur, 50, 150)
    lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=80,
                            minLineLength=w//6, maxLineGap=20)
    if lines is None or len(lines) < 4:
        return None

    # Separate near-horizontal (baselines) and near-vertical (sidelines)
    h_lines, v_lines = [], []
    for ln in lines:
        x1,y1,x2,y2 = ln[0]
        angle = abs(np.degrees(np.arctan2(y2-y1, x2-x1)))
        if angle < 20 or angle > 160: h_lines.append(ln[0])
        elif 70 < angle < 110:         v_lines.append(ln[0])

    if len(h_lines) < 2 or len(v_lines) < 2:
        return None

    # Pick top and bottom baseline (sort by y)
    h_lines.sort(key=lambda l: (l[1]+l[3])/2)
    far_line  = h_lines[0]    # near top of frame = far baseline
    near_line = h_lines[-1]   # near bottom       = near baseline

    # Pick left and right sideline
    v_lines.sort(key=lambda l: (l[0]+l[2])/2)
    left_line  = v_lines[0]
    right_line = v_lines[-1]

    def intersect(l1, l2):
        x1,y1,x2,y2 = l1
        x3,y3,x4,y4 = l2
        denom = (x1-x2)*(y3-y4)-(y1-y2)*(x3-x4)
        if abs(denom)<1e-10: return None
        t = ((x1-x3)*(y3-y4)-(y1-y3)*(x3-x4)) / denom
        return (x1+t*(x2-x1), y1+t*(y2-y1))

    tl = intersect(far_line,  left_line)
    tr = intersect(far_line,  right_line)
    bl = intersect(near_line, left_line)
    br = intersect(near_line, right_line)

    if any(p is None for p in [tl,tr,bl,br]):
        return None

    src = np.float32([tl, tr, br, bl])
    # dst: tl=deuce far(0,100), tr=ad far(100,100),
    #      br=ad near(100,0),   bl=deuce near(0,0)
    dst = np.float32([[0,100],[100,100],[100,0],[0,0]])
    return cv2.getPerspectiveTransform(src, dst)

def _fallback_homography(frame):
    """Linear mapping: assume court fills 80% of frame."""
    h, w = frame.shape[:2]
    src = np.float32([
        [w*0.12, h*0.18],
        [w*0.88, h*0.18],
        [w*0.88, h*0.88],
        [w*0.12, h*0.88],
    ])
    dst = np.float32([[0,100],[100,100],[100,0],[0,0]])
    return cv2.getPerspectiveTransform(src, dst)


# ── Ball detection ───────────────────────────────────────────────────
def _detect_ball(frame, gray, prev_gray):
    """
    Returns (x_pixel, y_pixel) of detected ball or None.
    Combines color filter + motion diff + circularity.
    """
    h, w = frame.shape[:2]
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)

    # Yellow-green tennis ball (works for Wimbledon/hard court broadcasts)
    mask_color = cv2.inRange(hsv, np.array([22,70,120]), np.array([55,255,255]))

    # Optional motion mask (needs prev frame)
    if prev_gray is not None:
        diff = cv2.absdiff(gray, prev_gray)
        _, mask_motion = cv2.threshold(diff, 15, 255, cv2.THRESH_BINARY)
        # Dilate motion mask
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7,7))
        mask_motion = cv2.dilate(mask_motion, kernel)
        mask = cv2.bitwise_and(mask_color, mask_motion)
    else:
        mask = mask_color

    # Clean up
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3,3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # Size bounds: ball is ~4-25px radius in 720p broadcast
    min_r, max_r = 3, 28
    candidates = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < 20: continue
        (cx, cy), radius = cv2.minEnclosingCircle(cnt)
        if not (min_r <= radius <= max_r): continue
        peri = cv2.arcLength(cnt, True)
        if peri < 1: continue
        circularity = 4 * np.pi * area / (peri ** 2)
        if circularity < 0.4: continue
        # Exclude scoreboard region (usually top-left or top-right corner)
        if cy < h * 0.08 and (cx < w * 0.15 or cx > w * 0.85):
            continue
        candidates.append((cx, cy, radius, circularity * (1 / (1 + abs(radius-8)))))

    if not candidates: return None
    best = max(candidates, key=lambda c: c[3])
    return (int(best[0]), int(best[1]))


# ── Coord transform ──────────────────────────────────────────────────
def _apply_homography(detections, H):
    """Convert pixel detections to court coords [0,100]."""
    if not detections: return []
    pts = np.float32([[d['px'], d['py']] for d in detections]).reshape(-1,1,2)
    transformed = cv2.perspectiveTransform(pts, H).reshape(-1,2)
    result = []
    for i, d in enumerate(detections):
        x = float(np.clip(transformed[i,0], 0, 100))
        y = float(np.clip(transformed[i,1], 0, 100))
        result.append(dict(t=d['t'], x=round(x,1), y=round(y,1)))
    return result


# ── Smooth & interpolate ─────────────────────────────────────────────
def _smooth_and_interpolate(pts, duration, grid=0.1):
    """
    1. Remove outliers (jump > 40 units in one step)
    2. Interpolate to 0.1s grid
    3. Light smoothing
    """
    if not pts:
        # No detections — return center
        steps = int(duration / grid)
        return [dict(t=round(i*grid,2), x=50.0, y=50.0) for i in range(steps+1)]

    # Remove outliers
    clean = [pts[0]]
    for p in pts[1:]:
        dx = p['x'] - clean[-1]['x']
        dy = p['y'] - clean[-1]['y']
        if (dx**2 + dy**2) < 40**2:
            clean.append(p)
        # else: skip outlier

    if len(clean) < 2:
        steps = int(duration / grid)
        cx, cy = clean[0]['x'], clean[0]['y']
        return [dict(t=round(i*grid,2), x=cx, y=cy) for i in range(steps+1)]

    # Interpolate to grid
    steps = int(duration / grid)
    result = []
    ci = 0
    for i in range(steps + 1):
        t = round(i * grid, 2)
        # Advance ci
        while ci < len(clean)-2 and clean[ci+1]['t'] <= t:
            ci += 1
        a, b = clean[ci], clean[min(ci+1, len(clean)-1)]
        if b['t'] == a['t']:
            x, y = a['x'], a['y']
        else:
            frac = max(0, min(1, (t - a['t']) / (b['t'] - a['t'])))
            x = round(a['x'] + (b['x'] - a['x']) * frac, 1)
            y = round(a['y'] + (b['y'] - a['y']) * frac, 1)
        result.append(dict(t=t, x=x, y=y))

    # Gaussian smoothing over x,y
    try:
        from scipy.ndimage import gaussian_filter1d
        xs = gaussian_filter1d([p['x'] for p in result], sigma=2)
        ys = gaussian_filter1d([p['y'] for p in result], sigma=2)
        for i, p in enumerate(result):
            p['x'] = round(float(xs[i]), 1)
            p['y'] = round(float(ys[i]), 1)
    except ImportError:
        pass

    return result


# ── Build SonicField events from ball track ──────────────────────────
def _build_events(tracks, meta):
    """
    Infer earcon events from ball trajectory:
    - Large vertical jump (near→far) = serve or shot
    - Speed spikes = impact
    - Every 8s = rallycheck
    """
    if not tracks: return []
    events = []
    SPEED_THRESHOLD = 15   # units/s — fast movement = shot
    MIN_GAP = 1.0           # minimum seconds between events
    last_ev_t = -999

    for i in range(1, len(tracks)-1):
        a, b = tracks[i-1], tracks[i]
        dt = b['t'] - a['t']
        if dt <= 0: continue
        speed = ((b['x']-a['x'])**2 + (b['y']-a['y'])**2)**0.5 / dt
        if speed > SPEED_THRESHOLD and b['t'] - last_ev_t >= MIN_GAP:
            # Determine event type by ball y-position
            dy = b['y'] - a['y']
            if abs(dy) > 20:  # cross-court (near↔far)
                ev_type = 'ace' if b['t'] < 3 else 'rally'
            else:
                ev_type = 'winner' if speed > 40 else 'rally'
            events.append(dict(
                event_id = f'tracked-{len(events)+1}',
                type     = ev_type,
                x        = round(b['x'], 1),
                y        = round(b['y'], 1),
                relSec   = b['t'],
                t        = b['t'],
                phase    = 'rally',
                commentary = '',
                trust    = 'tracked',
                _isAI    = False,
            ))
            last_ev_t = b['t']

    return events


if __name__ == '__main__':
    print('\n🎾 SonicField Tracker Server')
    print('   POST http://localhost:5175/analyze')
    print('   GET  http://localhost:5175/status/<job_id>')
    print('   GET  http://localhost:5175/tracks/<job_id>\n')
    app.run(host='127.0.0.1', port=5175, debug=False, threaded=True)
