#!/usr/bin/env bash
set -euo pipefail

# Vibox · 자막 자동 검사 v4 (적응형 재스캔)
# 사용: ./scripts/subtitle-scan.sh <video-path> [output.json]
#
# 파이프라인:
#  [1] full-frame 프레임 추출
#  [2] OCR + Python 필터 (저신뢰 제거, 의심 플래그)
#  [3] Claude 1차 맞춤법 + needsRescan 플래그
#  [4] 의심 자막 full-frame 재스캔
#  [5] 업데이트된 자막에 Claude 2차 재평가
#  [6] 1·2차 이슈 병합
#  [7] Vision LLM 픽셀 검증 (프레임 이미지 직접 첨부 → OCR 오인식 걸러내기)
#  [8] 프레임 정밀 경계 탐지 (native fps + 픽셀 diff)

if [[ $# -lt 1 ]]; then
  echo "사용법: $0 <video-path> [output.json]"
  exit 1
fi

VIDEO="$1"
OUT="${2:-/tmp/subtitle-scan-$(basename "$VIDEO" .mp4).json}"
TMPDIR=$(mktemp -d -t vibox-subscan-XXXXXX)
trap "rm -rf '$TMPDIR'" EXIT

[[ ! -f "$VIDEO" ]] && { echo "영상 파일 없음: $VIDEO"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OCR_BIN="${OCR_BIN_PATH:-${SCRIPT_DIR}/ocr}"
CLAUDE_BIN="${CLAUDE_CLI_PATH:-$HOME/.local/bin/claude}"

[[ ! -x "$OCR_BIN" ]] && { echo "ocr 바이너리 없음: $OCR_BIN"; exit 1; }

DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VIDEO")
DURATION_MIN=$(python3 -c "print($DURATION / 60)")

echo "▸ 자막 검사 시작: $VIDEO (${DURATION}초)"
echo "  임시: $TMPDIR"

# ================================================================
# [1/8] 전체 프레임 추출 (자막 분류기가 스타일·위치 무관 자막 탐지)
# ================================================================
echo ""
echo "[1/8] 프레임 추출 (full-frame, 0.5초 간격)"
ffmpeg -hide_banner -loglevel error -i "$VIDEO" \
  -vf "fps=2.0" \
  "$TMPDIR/f_%04d.jpg"
FRAME_COUNT=$(ls "$TMPDIR"/f_*.jpg 2>/dev/null | wc -l | tr -d ' ')
echo "  → ${FRAME_COUNT} 프레임"

# ================================================================
# [2/8] OCR 배치 + Python 필터 (수명 + 의심 플래그)
# ================================================================
echo ""
echo "[2/8] Vision OCR + 필터"
BATCH="$TMPDIR/batch.jsonl"
"$OCR_BIN" --batch "$TMPDIR"/f_*.jpg > "$BATCH" 2>/dev/null || true

ALL="$TMPDIR/all.json"
FILTERED="$TMPDIR/filtered.json"

# 공용 필터 함수: args = $1:BATCH_FILE $2:OUT_FILTERED $3:CROP_Y_OFFSET $4:CROP_HEIGHT
# CROP_Y_OFFSET=0.7, CROP_HEIGHT=0.3 → 하단 30% 모드
# CROP_Y_OFFSET=0.0, CROP_HEIGHT=1.0 → full-frame 모드
run_filter() {
  local BATCH_FILE=$1
  local FILTERED_OUT=$2
  local CROP_Y=$3
  local CROP_H=$4
  local FRAME_PREFIX=$5  # f_ or full_
  local TIME_INTERVAL=$6  # 2 for fps=0.5

  # Step A: flatten OCR batch → items array with timeSec
  python3 - <<PY > "$TMPDIR/all_work.json"
import json, re
items = []
with open("$BATCH_FILE") as f:
    for line in f:
        try: obj = json.loads(line)
        except: continue
        fname = obj.get("file", "")
        m = re.search(r'${FRAME_PREFIX}(\d+)\.jpg', fname)
        if not m: continue
        idx = int(m.group(1)) - 1
        time_sec = idx * $TIME_INTERVAL
        for it in obj.get("items", []):
            it["timeSec"] = time_sec
            items.append(it)
print(json.dumps(items, ensure_ascii=False))
PY

  # Step B: filter + lifespan + clean + flags
  python3 - <<PY > "$FILTERED_OUT"
import json, difflib, re, sys
from collections import defaultdict

with open("$TMPDIR/all_work.json") as f:
    items = json.load(f)

# crop coord → full-frame coord
CROP_Y = $CROP_Y
CROP_H = $CROP_H
for it in items:
    it["bbox"]["y"] = CROP_Y + it["bbox"]["y"] * CROP_H
    it["bbox"]["h"] = it["bbox"]["h"] * CROP_H

def is_noise(t):
    t = t.strip()
    if len(t) < 2: return True
    if re.match(r'^[\W_]+$', t): return True
    return False

items = [it for it in items if not is_noise(it["text"])]

if not items:
    print("[]")
    sys.exit(0)

# ── [NEW] 자막 분류기: 영상 편집 자막 vs 영상 내 오브젝트 텍스트 ──
# Signal 1: Position Stability (같은 텍스트의 bbox 프레임간 이동 정도)
#   - 자막: 화면 좌표 고정 → drift ≈ 0
#   - 배경 오브젝트(간판 등): 카메라 움직임에 따라 이동 → drift 큼
import statistics
try:
    import numpy as np
    HAVE_NUMPY = True
except ImportError:
    HAVE_NUMPY = False

by_text = defaultdict(list)
for it in items:
    key = re.sub(r'\s+', ' ', it["text"].strip().lower())
    if len(key) >= 2:
        by_text[key].append(it)

for key, group in by_text.items():
    if len(group) < 2:
        drift = None
    else:
        xs = [it["bbox"]["x"] + it["bbox"]["w"]/2 for it in group]
        ys = [it["bbox"]["y"] + it["bbox"]["h"]/2 for it in group]
        x_std = statistics.stdev(xs) if len(xs) > 1 else 0
        y_std = statistics.stdev(ys) if len(ys) > 1 else 0
        drift = max(x_std, y_std)
    for it in group:
        it["_drift"] = drift

# Signal 2: Y-band 학습 (자막 영역 자동 탐지)
#   - 한글 포함 + 2글자 이상 텍스트들의 y-center 분포 히스토그램
#   - 밀도 peak 영역 = 자막 밴드 (영상마다 자동 적응)
y_cand = [it["bbox"]["y"] + it["bbox"]["h"]/2
         for it in items
         if len(it["text"].strip()) >= 2
         and re.search(r'[\uac00-\ud7a3]', it["text"])]

bands = []
if HAVE_NUMPY and len(y_cand) >= 10:
    hist, edges = np.histogram(y_cand, bins=20, range=(0.0, 1.0))
    mean_count = float(np.mean(hist))
    bin_threshold = max(3, mean_count * 1.5)
    in_b = False
    b_start = 0
    for i in range(len(hist)):
        if hist[i] >= bin_threshold:
            if not in_b:
                b_start = float(edges[i])
                in_b = True
        else:
            if in_b:
                bands.append((max(0, b_start - 0.03), min(1, float(edges[i]) + 0.03)))
                in_b = False
    if in_b:
        bands.append((max(0, b_start - 0.03), min(1, float(edges[-1]) + 0.03)))

print(f"[classify] y_bands: {[(round(a,3), round(b,3)) for a,b in bands]}", file=sys.stderr)

# Signal 3 + 4: 점수 종합 (position + y_band + text 특성)
subs = []
dropped = {"unstable": 0, "out_of_band": 0, "too_short": 0, "no_korean": 0}
for it in items:
    y_center = it["bbox"]["y"] + it["bbox"]["h"] / 2
    in_band = any(lo <= y_center <= hi for lo, hi in bands) if bands else True
    drift = it.get("_drift")
    text = it["text"].strip()

    score = 0.0
    # Position stability (최강 신호)
    if drift is None:
        # Singleton (한 프레임만 등장) — y-band만으로 판정
        score += 1.8 if in_band else 0.3
    elif drift < 0.005:
        score += 2.5  # 매우 안정적 → 자막 확률 높음
    elif drift < 0.015:
        score += 1.5
    elif drift < 0.03:
        score += 0.5
    else:
        score -= 1.0  # 프레임간 이동 큼 = 배경 오브젝트

    # Y-band match
    if in_band:
        score += 1.5

    # Text hints
    if re.search(r'[\uac00-\ud7a3]', text):
        score += 0.5  # 한글 포함
    if len(text) < 2:
        score -= 2.0
    elif len(text) >= 4:
        score += 0.3

    it["_subscore"] = score
    if score >= 2.5:
        subs.append(it)
    else:
        if drift is not None and drift > 0.03:
            dropped["unstable"] += 1
        elif not in_band and len(bands) > 0:
            dropped["out_of_band"] += 1
        elif len(text) < 2:
            dropped["too_short"] += 1
        elif not re.search(r'[\uac00-\ud7a3]', text):
            dropped["no_korean"] += 1

print(f"[classify] input={len(items)}, kept_as_subtitle={len(subs)}, dropped={dropped}", file=sys.stderr)
items = subs

if not items:
    print("[]")
    sys.exit(0)
# ── [NEW] 분류기 끝 ─────────────────────────────────

all_frames = sorted(set(it["timeSec"] for it in items))
total_frames = max(1, len(all_frames))

def norm(t):
    return re.sub(r'\s+', ' ', t.strip().lower())

block_frame_count = defaultdict(set)
for it in items:
    block_frame_count[norm(it["text"])].add(it["timeSec"])

# UI 제거: 전체 프레임의 30% 이상 또는 최소 3프레임에 등장
ui_threshold = max(3, int(total_frames * 0.3))
ui_keys = {k for k, fset in block_frame_count.items() if len(fset) >= ui_threshold}
print(f"[filter] total_frames={total_frames}, ui_removed={len(ui_keys)}", file=sys.stderr)

items = [it for it in items if norm(it["text"]) not in ui_keys]

# 같은 timeSec 블록 합치기
by_time = defaultdict(list)
for it in items:
    by_time[it["timeSec"]].append(it)

merged = []
for t, blocks in by_time.items():
    # y 순 정렬 후 y-proximity로 클러스터 분리 (로고/자막/인서트 따로 묶음)
    blocks.sort(key=lambda b: b["bbox"]["y"])
    clusters = []
    for b in blocks:
        if clusters:
            prev = clusters[-1][-1]
            prev_bottom = prev["bbox"]["y"] + prev["bbox"]["h"]
            gap = b["bbox"]["y"] - prev_bottom
            # 간격 15% 이하면 같은 클러스터 (두 줄 자막 등 인접), 이상이면 새 클러스터
            if gap < 0.15:
                clusters[-1].append(b)
                continue
        clusters.append([b])

    for cluster in clusters:
        cluster.sort(key=lambda b: (round(b["bbox"]["y"], 2), b["bbox"]["x"]))
        text = " ".join(b["text"] for b in cluster)
        xs = [b["bbox"]["x"] for b in cluster]
        ys = [b["bbox"]["y"] for b in cluster]
        x2s = [b["bbox"]["x"] + b["bbox"]["w"] for b in cluster]
        y2s = [b["bbox"]["y"] + b["bbox"]["h"] for b in cluster]
        merged.append({
            "timeSec": t,
            "text": text,
            "bbox": {"x": min(xs), "y": min(ys), "w": max(x2s) - min(xs), "h": max(y2s) - min(ys)},
            "confidence": sum(b["confidence"] for b in cluster) / len(cluster),
            "minConfidence": min(b["confidence"] for b in cluster)
        })

# 인접 유사 그룹화 → 그룹 내 최고 리딩 선택
# 유사도: Jaccard(단어 재배열에 강함) + SequenceMatcher(OCR 부분 오인식에 강함)의 max
def text_similarity(a, b):
    sm = difflib.SequenceMatcher(None, a, b).ratio()
    wa = a.lower().split()
    wb = b.lower().split()
    if len(wa) < 3 or len(wb) < 3:
        return sm
    sa, sb = set(wa), set(wb)
    if not (sa | sb): return sm
    jaccard = len(sa & sb) / len(sa | sb)
    return max(sm, jaccard)

merged.sort(key=lambda r: r["timeSec"])
groups = []
for r in merged:
    # 최근 3초 내 유사한 기존 그룹 찾아서 편입 (비순차 그룹 병합 지원)
    # 임계값 0.42: OCR 띄어쓰기 변화 같은 작은 차이도 같은 자막으로 묶음
    matched = None
    for g in reversed(groups):
        if r["timeSec"] - g[-1]["timeSec"] > 3:
            break
        if text_similarity(g[-1]["text"], r["text"]) > 0.42:
            matched = g
            break
    if matched is not None:
        matched.append(r)
    else:
        groups.append([r])

unique = []
singleton_noise = 0
for g in groups:
    all_readings_counter = defaultdict(int)
    for f in g:
        key = re.sub(r'\s+', ' ', f["text"].strip())
        all_readings_counter[key] += 1

    if len(g) == 1:
        only = g[0]
        if only["confidence"] < 0.5 or len(only["text"].strip()) < 8:
            singleton_noise += 1
            continue
        best = only
    else:
        # Consensus 선택: 같은 텍스트가 몇 번 등장 × 평균 confidence 최대
        buckets = defaultdict(list)
        for f in g:
            key = re.sub(r'\s+', ' ', f["text"].strip())
            buckets[key].append(f)
        def bucket_score(items):
            avg_conf = sum(it["confidence"] for it in items) / len(items)
            return len(items) * avg_conf
        best_key = max(buckets.keys(), key=lambda k: bucket_score(buckets[k]))
        best = max(buckets[best_key], key=lambda f: f["confidence"])
    best["frameCount"] = len(g)
    best["startSec"] = min(f["timeSec"] for f in g)
    best["endSec"] = max(f["timeSec"] for f in g)
    # 모든 OCR 리딩 저장 (OCR 노이즈 판정용)
    best["allReadings"] = [{"text": t, "count": c} for t, c in
                          sorted(all_readings_counter.items(), key=lambda x: -x[1])]
    unique.append(best)

# OCR 꼬리/머리 노이즈 정리
TAIL_NOISE = re.compile(r"\s+[^\uac00-\ud7a3?.!,…]{1,8}\s*$")
HEAD_NOISE = re.compile(r"^[^\uac00-\ud7a3Qq\"'\s]{1,5}\s+(?=[\uac00-\ud7a3])")
def clean_text(t):
    prev = None
    cur = t.strip()
    while prev != cur:
        prev = cur
        cur = TAIL_NOISE.sub("", cur).strip()
        cur = HEAD_NOISE.sub("", cur).strip()
    return cur

cleaned = 0
for r in unique:
    orig = r["text"]
    r["text"] = clean_text(orig)
    if r["text"] != orig:
        cleaned += 1
        r["_rawText"] = orig

print(f"[filter] singletons_dropped={singleton_noise}, groups={len(groups)}, kept={len(unique)}, cleaned={cleaned}", file=sys.stderr)

unique = [r for r in unique if len(r["text"].strip()) >= 5]

# ── 의심 플래그 (rule-based) ────────────────────────────────
# confidence < 0.45 → low_confidence
# bbox y가 crop 상단 경계 근처 (하단 30% 모드에서만) → top_clipped
# 정리 후에도 한글 + 고립 숫자/특수문자 혼합 → mixed_chars
# 1프레임만 등장 → low_persistence
HANGUL_RE = re.compile(r'[\uac00-\ud7a3]')
MIXED_TAIL_RE = re.compile(r'[\uac00-\ud7a3]\s+[^\uac00-\ud7a3\s?.!,…"\']{1,3}\s*$')

for r in unique:
    flags = []
    if r["minConfidence"] < 0.45:
        flags.append("low_confidence")
    # top_clipped: 하단 30% 모드에서 bbox top(y)가 crop 상단(0.7) 근처면 잘릴 확률
    if CROP_Y > 0 and r["bbox"]["y"] < CROP_Y + 0.03:
        flags.append("top_clipped")
    if MIXED_TAIL_RE.search(r["text"]):
        flags.append("mixed_chars")
    if r.get("frameCount", 1) == 1 and len(HANGUL_RE.findall(r["text"])) < 5:
        flags.append("low_persistence")
    if flags:
        r["flags"] = flags

flagged = sum(1 for r in unique if r.get("flags"))
print(f"[filter] suspects_flagged={flagged}", file=sys.stderr)

print(json.dumps(unique, ensure_ascii=False, indent=2))
PY
}

run_filter "$BATCH" "$FILTERED" 0.0 1.0 "f_" 0.5

UNIQUE_COUNT=$(jq 'length' "$FILTERED")
DENSITY=$(python3 -c "print(round($UNIQUE_COUNT / $DURATION_MIN, 1))")
echo "  → 유니크 자막 ${UNIQUE_COUNT}개, 밀도 ${DENSITY}/분"

# ================================================================
# [2.5] 자막 밀도가 매우 낮으면 full-frame 폴백 재스캔
# ================================================================
FALLBACK=0
if python3 -c "import sys; sys.exit(0 if $DENSITY < 5 else 1)"; then
  FALLBACK=1
  echo ""
  echo "  ⚠ 자막 밀도 낮음 — full-frame 폴백 재스캔"
  rm -f "$TMPDIR"/f_*.jpg
  ffmpeg -hide_banner -loglevel error -i "$VIDEO" \
    -vf "fps=2.0" \
    "$TMPDIR/f_%04d.jpg"
  FRAME_COUNT=$(ls "$TMPDIR"/f_*.jpg 2>/dev/null | wc -l | tr -d ' ')
  echo "  → ${FRAME_COUNT} 프레임 (full-frame)"

  "$OCR_BIN" --batch "$TMPDIR"/f_*.jpg > "$BATCH" 2>/dev/null || true
  run_filter "$BATCH" "$FILTERED" 0.0 1.0 "f_" 0.5
  UNIQUE_COUNT=$(jq 'length' "$FILTERED")
  echo "  → 폴백 후 자막 ${UNIQUE_COUNT}개"
fi

if [[ "$UNIQUE_COUNT" == "0" ]]; then
  echo '{"subtitles": [], "issues": []}' > "$OUT"
  echo "✓ 완료 (자막 없음) → $OUT"
  exit 0
fi

# ================================================================
# [3/8] Claude 1차 맞춤법 검사 (needsRescan 플래그 포함)
# ================================================================
echo ""
echo "[3/8] Claude 1차 맞춤법"

# 자막 목록에 OCR 리딩 변형 + 신뢰도 힌트 첨부
SUBS_TEXT=$(python3 - <<PY
import json, re
with open("$FILTERED") as f: subs = json.load(f)
lines = []
for i, s in enumerate(subs):
    text = s.get("text", "")
    text_norm = re.sub(r"\s+", " ", text.strip())
    readings = s.get("allReadings", [])
    line = f"#{i}: {text}"
    # 주 텍스트와 다른 OCR 변형 표시 (최대 3개)
    alts = [r for r in readings if r.get("text", "") != text_norm][:3]
    if alts:
        alt_str = ", ".join(f'"{r["text"]}"(x{r["count"]})' for r in alts)
        line += f" [OCR 변형: {alt_str}]"
    if s.get("confidence", 1.0) < 0.8 and s.get("frameCount", 1) < 2:
        line = "[OCR_UNSTABLE] " + line
    lines.append(line)
print("\n".join(lines))
PY
)

CLAUDE_PROMPT_1="다음은 영상 OCR로 추출한 한국어 자막입니다. 각 자막에서 오타/맞춤법/띄어쓰기 오류만 찾아주세요.

규칙:
- 구어체 영상이므로 구어 표현은 이슈 아님 (예: '이거요', '~있는데요' 같은 어미)
- 명백한 오타, 철자 오류, 띄어쓰기 오류만 지적
- 문체 차이는 무시
- OCR 꼬리/머리 쓰레기 무시: 문장 앞/뒤에 붙은 숫자/특수문자/의미없는 짧은 문자열
- **[OCR_UNSTABLE] 접두사가 붙은 자막은 OCR이 불안정하게 읽은 것이므로 오타로 지적하지 말 것**
- **[OCR 변형: \"X\", \"Y\"] 표시가 있으면 OCR이 프레임마다 다르게 읽은 것**
  - 주 텍스트나 변형 중 **어느 것이라도 자연스러운 한국어면 오타 아님** (OCR 노이즈)
  - 예: 주='업체들으' 변형=['업체들의']이면 '업체들의'가 맞고 '업체들으'는 OCR 오인식 → 오타 아님
- **한글 조사 오인식 주의**: 한국어 OCR은 '의', '으', '을', '은', '를', '로' 같은 조사를 자주 혼동합니다
  - 예: '업체들으' → 실제는 '업체들의/업체들을/업체들은' 중 하나 (OCR이 조사 끝 ㅣ를 ㅡ로 읽는 흔한 오류)
  - 조사만 이상한 자막은 **OCR 오인식으로 간주하고 오타로 지적하지 말 것**
  - 진짜 오타는 조사 외 부분에서 명확히 드러남 (예: '다같이', '하게된', '일하지말자')
- 문제 없으면 해당 자막은 출력에서 제외

**중요: wrong / correct는 자막 내의 틀린 단어/구문만 짧게 추출 (전체 문장 아님).**
- 올바른 예: wrong='다같이', correct='다 같이'
- 올바른 예: wrong='3번 째', correct='3번째'
- 올바른 예: wrong='소주', correct='소조'
- 틀린 예: wrong 필드에 전체 문장 넣지 말 것

needsRescan 필드 — 매우 보수적으로 판단할 것 (false positive 최소화가 우선):
- 다음 중 하나라도 해당하면 **무조건 needsRescan=true**:
  1. 표준 한국어 사전에 없는 단어가 포함됨 (예: '존명', '율덩이', '핑요' 등 — 한 글자만 어색)
  2. 비슷한 모양 글자 쌍 의심 (조/존, 을/울, 의/이/으, 던/단, 를/물, 이/리, 명/병 등 OCR이 자주 흔드는 글자)
  3. 일상 표현인데 띄어쓰기만 다른 경우 ('그이유가' → '그 이유가', '소주한잔' → '소주 한잔' 등)
  4. 2글자 이하의 짧은 단어가 문제로 잡혔을 때 (OCR 한 글자 오인식 빈도 매우 높음)
  5. wrong/correct 가 의미상 가깝지만 발음·획수가 거의 같은 경우 (조명/존명, 의자/이자)
- needsRescan=false 는 다음 모두 만족할 때만:
  - 띄어쓰기/접미사 명확 오류이고 (예: '하시는구나' vs '하시는 구나' 같은 명백한 어법 룰)
  - OCR 오인식 가능성 거의 없음 (글자 하나하나가 흔한 한글이고 변형 표시 없음)
  - 같은 자막이 여러 프레임에서 일관되게 동일 텍스트로 잡힘
- 확신이 80% 미만이면 무조건 needsRescan=true. 의심되면 true. 절대 needsRescan=false 를 남발하지 말 것.

출력 형식 (JSON 배열, 다른 설명 금지):
[{\"index\": 0, \"wrong\": \"틀린단어\", \"correct\": \"수정단어\", \"issue\": \"간단 설명\", \"needsRescan\": false}]

자막 목록:
${SUBS_TEXT}"

if [[ ! -x "$CLAUDE_BIN" ]]; then
  echo "  ⚠ Claude CLI 없음 — 맞춤법 검사 스킵"
  jq '{subtitles: [.[] | del(._rawText, .minConfidence)], issues: []}' "$FILTERED" > "$OUT"
  exit 0
fi

env -u CLAUDECODE "$CLAUDE_BIN" -p "$CLAUDE_PROMPT_1" --output-format text > "$TMPDIR/claude1.txt" 2>&1 || true

python3 - <<PY > "$TMPDIR/issues1.json"
import re, json
with open("$TMPDIR/claude1.txt") as f: raw = f.read()
m = re.search(r'\[[\s\S]*\]', raw)
if m:
    try: print(json.dumps(json.loads(m.group(0)), ensure_ascii=False))
    except: print("[]")
else: print("[]")
PY

ISSUE1_COUNT=$(jq 'length' "$TMPDIR/issues1.json")
NEED_RESCAN_COUNT=$(jq '[.[] | select(.needsRescan == true)] | length' "$TMPDIR/issues1.json")
echo "  → 1차 이슈 ${ISSUE1_COUNT}건 (재스캔 의심 ${NEED_RESCAN_COUNT}건)"

# ================================================================
# [4/8] 의심 자막 수집 + full-frame 재스캔
# ================================================================
echo ""
echo "[4/8] 의심 자막 재스캔"

# 의심 timeSec 수집 — 2026-05-26 정책 강화 (사용자 피드백 기반):
# false positive (OCR 오인식인데 오타로 잡힘) 가 사용자에게 가장 거슬리는 문제 →
# Claude 1차가 잡은 **모든** 이슈를 needsRescan 여부 상관없이 재스캔 대상에 포함.
# 추가 비용은 보통 5초 미만, 정확도 회수가 훨씬 큼.
python3 - <<PY > "$TMPDIR/suspects.json"
import json
with open("$FILTERED") as f: subs = json.load(f)
with open("$TMPDIR/issues1.json") as f: issues = json.load(f)

suspects = set()
# Claude 1차 이슈 전부 — needsRescan 무시
for iss in issues:
    idx = iss.get("index")
    if isinstance(idx, int) and 0 <= idx < len(subs):
        suspects.add(subs[idx]["timeSec"])

# Python 플래그도 추가 (저품질·top_clipped)
for s in subs:
    if s.get("flags"):
        if any(f in ("low_confidence", "top_clipped") for f in s["flags"]):
            suspects.add(s["timeSec"])

print(json.dumps(sorted(suspects)))
PY

SUSPECT_COUNT=$(jq 'length' "$TMPDIR/suspects.json")
echo "  → 재스캔 대상 ${SUSPECT_COUNT}개 시점"

if [[ "$FALLBACK" == "1" || "$SUSPECT_COUNT" == "0" ]]; then
  if [[ "$FALLBACK" == "1" ]]; then
    echo "  (이미 full-frame 폴백 모드 — 재스캔 스킵)"
  else
    echo "  (의심 없음 — 재스캔 스킵)"
  fi
  cp "$FILTERED" "$TMPDIR/filtered-v2.json"
else
  # 의심 시점만 full-frame 프레임 추출 (fast seek, 병렬)
  mkdir -p "$TMPDIR/rescan"
  for TS in $(jq -r '.[]' "$TMPDIR/suspects.json"); do
    (ffmpeg -hide_banner -loglevel error -ss "$TS" -i "$VIDEO" \
      -frames:v 1 "$TMPDIR/rescan/full_${TS}.jpg" 2>/dev/null || true) &
  done
  wait

  RESCAN_COUNT=$(ls "$TMPDIR/rescan"/full_*.jpg 2>/dev/null | wc -l | tr -d ' ')
  echo "  → ${RESCAN_COUNT}장 full-frame OCR"

  "$OCR_BIN" --batch "$TMPDIR"/rescan/full_*.jpg > "$TMPDIR/rescan.jsonl" 2>/dev/null || true

  # 재스캔 결과로 자막 업데이트
  python3 - <<PY > "$TMPDIR/filtered-v2.json"
import json, re, difflib, sys
with open("$FILTERED") as f: subs = json.load(f)
with open("$TMPDIR/suspects.json") as f: suspects = set(json.load(f))

# Load rescan OCR: {timeSec → [blocks]}
rescan_map = {}
with open("$TMPDIR/rescan.jsonl") as f:
    for line in f:
        try: obj = json.loads(line)
        except: continue
        fname = obj.get("file", "")
        m = re.search(r'full_([\d.]+)\.jpg', fname)
        if not m: continue
        ts = float(m.group(1))
        rescan_map[ts] = obj.get("items", [])

def clean_ocr(t):
    TAIL = re.compile(r"\s+[^\uac00-\ud7a3?.!,…]{1,8}\s*\$")
    HEAD = re.compile(r"^[^\uac00-\ud7a3Qq\"'\s]{1,5}\s+(?=[\uac00-\ud7a3])")
    prev = None
    cur = t.strip()
    while prev != cur:
        prev = cur
        cur = TAIL.sub("", cur).strip()
        cur = HEAD.sub("", cur).strip()
    return cur

stats = {"dropped": 0, "updated": 0, "confirmed": 0}
result = []
for sub in subs:
    if sub["timeSec"] not in suspects:
        result.append(sub)
        continue

    ts = sub["timeSec"]
    blocks = rescan_map.get(ts, [])
    orig_y_center = sub["bbox"]["y"] + sub["bbox"]["h"] / 2

    # 원본 bbox y 중심과 가까운 블록만 (±20% 프레임 높이 — seek 오차 고려)
    near = [b for b in blocks if abs((b["bbox"]["y"] + b["bbox"]["h"]/2) - orig_y_center) < 0.2]

    if not near:
        # 재스캔에서 못 찾음 → 원본 유지 (공격적 dropping 대신 보수적 유지)
        sub["_action"] = "confirmed"
        stats["confirmed"] += 1
        result.append(sub)
        continue

    near.sort(key=lambda b: b["bbox"]["x"])
    merged_text = clean_ocr(" ".join(b["text"] for b in near))
    merged_conf = sum(b["confidence"] for b in near) / len(near)

    if len(merged_text) < 3:
        # 재스캔에서 내용이 거의 없음 = OCR 노이즈 확정
        sub["_action"] = "dropped"
        stats["dropped"] += 1
        result.append(sub)
        continue

    ratio = difflib.SequenceMatcher(None, sub["text"], merged_text).ratio()

    if ratio < 0.3:
        # 완전히 다른 내용 → 재스캔이 정확, 원본 교체 (dropped 대신 update)
        sub["_action"] = "updated"
        sub["_original_text"] = sub["text"]
        sub["text"] = merged_text
        xs = [b["bbox"]["x"] for b in near]
        ys = [b["bbox"]["y"] for b in near]
        x2s = [b["bbox"]["x"] + b["bbox"]["w"] for b in near]
        y2s = [b["bbox"]["y"] + b["bbox"]["h"] for b in near]
        sub["bbox"] = {"x": min(xs), "y": min(ys), "w": max(x2s) - min(xs), "h": max(y2s) - min(ys)}
        sub["confidence"] = merged_conf
        stats["updated"] += 1
        result.append(sub)
        continue

    if ratio < 0.92 and len(merged_text) >= len(sub["text"]) * 0.7:
        # 유사하지만 다름 → 재스캔이 더 정확
        sub["_action"] = "updated"
        sub["_original_text"] = sub["text"]
        sub["text"] = merged_text
        xs = [b["bbox"]["x"] for b in near]
        ys = [b["bbox"]["y"] for b in near]
        x2s = [b["bbox"]["x"] + b["bbox"]["w"] for b in near]
        y2s = [b["bbox"]["y"] + b["bbox"]["h"] for b in near]
        sub["bbox"] = {"x": min(xs), "y": min(ys), "w": max(x2s) - min(xs), "h": max(y2s) - min(ys)}
        sub["confidence"] = merged_conf
        stats["updated"] += 1
    else:
        sub["_action"] = "confirmed"
        stats["confirmed"] += 1

    result.append(sub)

print(f"[rescan] dropped={stats['dropped']}, updated={stats['updated']}, confirmed={stats['confirmed']}", file=sys.stderr)
print(json.dumps(result, ensure_ascii=False, indent=2))
PY
fi

mv "$TMPDIR/filtered-v2.json" "$FILTERED"
NEW_COUNT=$(jq 'length' "$FILTERED")
echo "  → 재스캔 후 자막 ${NEW_COUNT}개"

# ================================================================
# [5/8] Claude 2차 (업데이트된/재확인된 자막만)
# ================================================================
echo ""
echo "[5/8] Claude 2차 (업데이트 재평가)"

# 재평가 대상: _action in ("updated", "confirmed")
python3 - <<PY > "$TMPDIR/subs_to_recheck.json"
import json
with open("$FILTERED") as f: subs = json.load(f)
result = [{"orig_idx": i, "timeSec": s["timeSec"], "text": s["text"]}
          for i, s in enumerate(subs)
          if s.get("_action") in ("updated", "confirmed")]
print(json.dumps(result, ensure_ascii=False))
PY

RECHECK_COUNT=$(jq 'length' "$TMPDIR/subs_to_recheck.json")
echo "  → 재평가 대상 ${RECHECK_COUNT}건"

if [[ "$RECHECK_COUNT" -gt 0 ]]; then
  RECHECK_TEXT=$(jq -r 'to_entries | map("#\(.key): \(.value.text)") | join("\n")' "$TMPDIR/subs_to_recheck.json")
  CLAUDE_PROMPT_2="다음은 영상 OCR로 재스캔한 한국어 자막입니다. 오타/맞춤법만 지적해주세요.

규칙:
- 구어체 영상이므로 구어 표현은 이슈 아님
- 명백한 오타, 철자 오류, 띄어쓰기 오류만 지적
- 고유명사/브랜드명(한글 2~3글자, 영어이름)은 오타로 오해하지 말 것 (예: '소조', '비모' 같은 이름은 유지)
- 확신이 없으면 지적하지 말 것 — 강한 확신의 명백한 오류만 출력
- 문제 없으면 해당 자막은 출력에서 제외

**중요: wrong / correct는 자막 내의 틀린 단어/구문만 짧게 추출 (전체 문장 아님).**
- 올바른 예: wrong='다같이', correct='다 같이'
- 틀린 예: wrong 필드에 전체 문장 넣지 말 것

출력 형식 (JSON 배열, 다른 설명 금지):
[{\"index\": 0, \"wrong\": \"틀린단어\", \"correct\": \"수정단어\", \"issue\": \"간단 설명\"}]

자막 목록:
${RECHECK_TEXT}"

  env -u CLAUDECODE "$CLAUDE_BIN" -p "$CLAUDE_PROMPT_2" --output-format text > "$TMPDIR/claude2.txt" 2>&1 || true

  python3 - <<PY > "$TMPDIR/issues2.json"
import re, json
with open("$TMPDIR/claude2.txt") as f: raw = f.read()
m = re.search(r'\[[\s\S]*\]', raw)
if m:
    try: print(json.dumps(json.loads(m.group(0)), ensure_ascii=False))
    except: print("[]")
else: print("[]")
PY

  ISSUE2_COUNT=$(jq 'length' "$TMPDIR/issues2.json")
  echo "  → 2차 이슈 ${ISSUE2_COUNT}건"
else
  echo "[]" > "$TMPDIR/issues2.json"
fi

# ================================================================
# [6/8] 1차 + 2차 이슈 병합
# ================================================================
echo ""
echo "[6/8] 1·2차 병합"

# 1차 issues에서: 의심(_action 있음)된 자막의 이슈는 제외
# 2차 issues: recheck 인덱스를 원본 subs 인덱스로 매핑해서 추가
python3 - <<PY > "$TMPDIR/final_issues.json"
import json
with open("$FILTERED") as f: subs = json.load(f)
with open("$TMPDIR/issues1.json") as f: issues1 = json.load(f)
with open("$TMPDIR/suspects.json") as f: suspects = set(json.load(f))
with open("$TMPDIR/issues2.json") as f: issues2 = json.load(f)
with open("$TMPDIR/subs_to_recheck.json") as f: recheck = json.load(f)

def is_ocr_minority(wrong, sub):
    """wrong 키워드가 그룹 OCR 리딩의 소수(<50%)에만 나타나면 OCR 노이즈로 판정."""
    if not wrong: return False
    readings = sub.get("allReadings", [])
    if not readings: return False
    total = sum(r.get("count", 0) for r in readings)
    if total <= 1: return False  # singleton은 이 판정에서 제외
    with_wrong = sum(r.get("count", 0) for r in readings if wrong in r.get("text", ""))
    return total > 0 and (with_wrong / total) < 0.5

result = []
ocr_noise_dropped = 0

# 1차 중 의심 아닌 것만 유지 (의심은 2차에서 재평가)
for iss in issues1:
    idx = iss.get("index")
    if not isinstance(idx, int): continue
    if not (0 <= idx < len(subs)): continue
    sub = subs[idx]
    if sub["timeSec"] in suspects:
        continue  # 의심은 2차로
    if sub.get("_action") == "dropped":
        continue  # 재스캔에서 노이즈로 확정
    # OCR 소수 리딩 체크
    if is_ocr_minority(iss.get("wrong", ""), sub):
        ocr_noise_dropped += 1
        continue
    result.append(iss)

# 2차 결과를 원본 인덱스로 매핑
for iss in issues2:
    idx = iss.get("index")
    if not isinstance(idx, int): continue
    if 0 <= idx < len(recheck):
        iss_out = dict(iss)
        iss_out["index"] = recheck[idx]["orig_idx"]
        # OCR 소수 리딩 체크
        orig_sub = subs[recheck[idx]["orig_idx"]]
        if is_ocr_minority(iss_out.get("wrong", ""), orig_sub):
            ocr_noise_dropped += 1
            continue
        result.append(iss_out)

import sys
print(f"[merge] ocr_noise_dropped={ocr_noise_dropped}", file=sys.stderr)

print(json.dumps(result, ensure_ascii=False))
PY

# 최종 output 생성
jq -n \
  --slurpfile subs "$FILTERED" \
  --slurpfile issues "$TMPDIR/final_issues.json" \
  '{
    subtitles: [$subs[0][] | select(._action != "dropped") | del(._action, ._original_text, ._rawText, .minConfidence, .flags, .allReadings)],
    issues: [$issues[0][] | . as $iss |
      ($subs[0] | to_entries | map(select(.key == $iss.index))[0]) as $sub |
      if $sub and ($sub.value._action != "dropped")
         and (($iss.correct // $iss.suggestion // "") | length > 1)
      then {
        timeSec: $sub.value.timeSec,
        startSec: ($sub.value.startSec // $sub.value.timeSec),
        endSec: ($sub.value.endSec // $sub.value.timeSec),
        bbox: $sub.value.bbox,
        fullText: $sub.value.text,
        wrong: ($iss.wrong // $sub.value.text),
        correct: ($iss.correct // $iss.suggestion // ""),
        issue: $iss.issue,
        suggestion: ($iss.correct // $iss.suggestion // "")
      } else empty end
    ]
  }' > "$OUT"

FINAL_COUNT=$(jq '.issues | length' "$OUT")
echo "  → 병합 이슈 ${FINAL_COUNT}건"

# ================================================================
# [7/8] Vision LLM 검증 (프레임 이미지로 OCR 오인식 걸러내기)
# ================================================================
# OCR 이 일관되게 잘못 읽은 경우 (예: 화면엔 '조명' 인데 매번 '존명' 리딩) →
# 텍스트 스트림에 머무는 한 Claude 1·2 차로 못 잡음. 프레임 이미지를 직접 보여
# 'wrong' vs 'correct' 중 어느 글자가 실제로 적혀있는지 픽셀 검증.
if [[ "$FINAL_COUNT" -gt 0 ]]; then
  echo ""
  echo "[7/8] Vision LLM 검증 (${FINAL_COUNT}건 픽셀 직접 확인)"

  mkdir -p "$TMPDIR/vision"

  # 각 이슈에 대한 검증 계획: idx / timeSec / wrong / correct / fullText
  python3 - <<PY > "$TMPDIR/vision_plan.json"
import json
with open("$OUT") as f: data = json.load(f)
plan = []
for i, iss in enumerate(data.get("issues", [])):
    plan.append({
        "idx": i,
        "timeSec": iss.get("timeSec", 0),
        "wrong": iss.get("wrong", ""),
        "correct": iss.get("correct") or iss.get("suggestion") or "",
        "fullText": iss.get("fullText", ""),
    })
print(json.dumps(plan, ensure_ascii=False))
PY

  # rescan 단계에서 추출되지 않은 timeSec 은 즉석에서 프레임 1장 추출
  for TS in $(jq -r '.[].timeSec' "$TMPDIR/vision_plan.json"); do
    SRC="$TMPDIR/rescan/full_${TS}.jpg"
    DST="$TMPDIR/vision/full_${TS}.jpg"
    if [[ -f "$SRC" ]]; then
      ln -sf "$SRC" "$DST" 2>/dev/null || cp "$SRC" "$DST"
    elif [[ ! -f "$DST" ]]; then
      (ffmpeg -hide_banner -loglevel error -ss "$TS" -i "$VIDEO" \
        -frames:v 1 "$DST" 2>/dev/null || true) &
    fi
  done
  wait

  # 각 이슈를 병렬로 Claude CLI 에 픽셀 검증 의뢰
  PIDS=()
  COUNT=$(jq 'length' "$TMPDIR/vision_plan.json")
  for IDX in $(seq 0 $((COUNT - 1))); do
    (
      ENTRY=$(jq ".[$IDX]" "$TMPDIR/vision_plan.json")
      TS=$(echo "$ENTRY" | jq -r '.timeSec')
      WRONG=$(echo "$ENTRY" | jq -r '.wrong')
      CORRECT=$(echo "$ENTRY" | jq -r '.correct')
      FULLTEXT=$(echo "$ENTRY" | jq -r '.fullText')
      IMG="$TMPDIR/vision/full_${TS}.jpg"

      if [[ ! -f "$IMG" ]]; then
        echo "{\"idx\":$IDX,\"answer\":\"unknown\",\"reason\":\"no_image\"}" > "$TMPDIR/vision/result_${IDX}.json"
        exit 0
      fi

      PROMPT="다음은 영상에서 추출한 프레임 이미지입니다. 파일: $IMG

이 프레임의 자막에 실제로 어떤 글자가 적혀있는지 확인하세요.

OCR 이 읽은 자막 전문: \"${FULLTEXT}\"
의심 부분: OCR 은 \"${WRONG}\" 라고 읽었고, 맞춤법 검사기는 \"${CORRECT}\" 가 맞다고 함.

프레임 이미지를 직접 보고 판단:
- 화면에 정확히 \"${WRONG}\" 라고 적혀있으면 → {\"answer\":\"wrong\"}  (= 진짜 오타)
- 화면에 \"${CORRECT}\" 라고 적혀있으면 → {\"answer\":\"correct\"}  (= OCR 오인식, 이슈 아님)
- 이미지 불명확/판독 불가 → {\"answer\":\"unknown\"}

JSON 한 줄로만 답하세요. 다른 설명·생각·코멘트 금지."

      env -u CLAUDECODE "$CLAUDE_BIN" -p "$PROMPT" --output-format text \
        --allowedTools Read --permission-mode bypassPermissions 2>/dev/null \
        > "$TMPDIR/vision/raw_${IDX}.txt" || true

      python3 - <<PYINNER > "$TMPDIR/vision/result_${IDX}.json"
import re, json
with open("$TMPDIR/vision/raw_${IDX}.txt") as f: raw = f.read()
m = re.search(r'\{[^{}]*"answer"\s*:\s*"(wrong|correct|unknown)"[^{}]*\}', raw)
if m:
    try:
        ans = json.loads(m.group(0))
        ans["idx"] = $IDX
        print(json.dumps(ans, ensure_ascii=False))
    except:
        print(json.dumps({"idx": $IDX, "answer": "unknown", "reason": "parse_fail"}))
else:
    print(json.dumps({"idx": $IDX, "answer": "unknown", "reason": "no_match"}))
PYINNER
    ) &
    PIDS+=($!)
  done

  for pid in "${PIDS[@]}"; do wait "$pid" 2>/dev/null || true; done

  # 검증 결과 반영: 'correct' 응답은 issue 제거, 나머지는 유지
  python3 - <<PY > "$TMPDIR/out-vision.json" 2>"$TMPDIR/vision.err"
import json, glob, sys
with open("$OUT") as f: data = json.load(f)
issues = data.get("issues", [])

results = {}
for path in glob.glob("$TMPDIR/vision/result_*.json"):
    try:
        with open(path) as f: r = json.load(f)
        results[r["idx"]] = r
    except:
        continue

new_issues = []
stats = {"kept_wrong": 0, "removed_correct": 0, "kept_unknown": 0}
for i, iss in enumerate(issues):
    ans = results.get(i, {}).get("answer", "unknown")
    if ans == "correct":
        stats["removed_correct"] += 1
        continue
    elif ans == "wrong":
        stats["kept_wrong"] += 1
    else:
        stats["kept_unknown"] += 1
    new_issues.append(iss)

data["issues"] = new_issues
print(f"[vision] kept_wrong={stats['kept_wrong']}, removed_correct={stats['removed_correct']}, kept_unknown={stats['kept_unknown']}", file=sys.stderr)
print(json.dumps(data, ensure_ascii=False, indent=2))
PY

  if [[ -s "$TMPDIR/out-vision.json" ]] && jq empty "$TMPDIR/out-vision.json" 2>/dev/null; then
    mv "$TMPDIR/out-vision.json" "$OUT"
    FINAL_COUNT=$(jq '.issues | length' "$OUT")
    echo "  → Vision 검증 후 ${FINAL_COUNT}건"
    cat "$TMPDIR/vision.err" 2>/dev/null | head -3
  else
    VISION_ERR=$(head -c 500 "$TMPDIR/vision.err" 2>/dev/null)
    echo "  → Vision 검증 스킵 ($VISION_ERR) — [6/8] 결과 사용"
  fi
fi

# ================================================================
# [8/8] 프레임 정밀 경계 탐지 (영상 native fps + 픽셀 diff)
# ================================================================
if [[ "$FINAL_COUNT" -gt 0 ]]; then
  echo ""
  # 영상 native fps 감지 (예: 24000/1001 = 23.976)
  FPS_RATIO=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$VIDEO")
  FPS_FLOAT=$(python3 -c "n, d = '$FPS_RATIO'.split('/'); print(float(n) / float(d))")
  FRAME_MS=$(python3 -c "print(1000.0 / $FPS_FLOAT)")
  echo "[8/8] 프레임 정밀 경계 (native ${FPS_RATIO} = ${FPS_FLOAT}fps, ${FRAME_MS}ms/frame)"

  mkdir -p "$TMPDIR/pixdiff"

  # 이슈별 boundary 2개 (start 전후 / end 전후), bbox 영역만 crop 정보 포함
  python3 - <<PY > "$TMPDIR/boundary_plan.txt"
import json
with open("$OUT") as f: data = json.load(f)
for idx, iss in enumerate(data.get("issues", [])):
    start = iss.get("startSec", iss.get("timeSec", 0))
    end = iss.get("endSec", iss.get("timeSec", 0))
    bb = iss["bbox"]
    # 5% 패딩으로 bbox 확장 (OCR bbox가 자막 일부 누락 가능)
    bx = max(0, bb["x"] - 0.05)
    by = max(0, bb["y"] - 0.05)
    bw = min(1 - bx, bb["w"] + 0.10)
    bh = min(1 - by, bb["h"] + 0.10)
    # 시작 윈도우: [start - 1.2, start + 0.6] = 1.8초 구간 (짧은 자막 edge 놓치지 않음)
    # 끝 윈도우:   [end - 0.6, end + 1.2]
    print(f"{idx} start {max(0, start - 1.2):.3f} {bx:.4f} {by:.4f} {bw:.4f} {bh:.4f}")
    print(f"{idx} end {max(0, end - 0.6):.3f} {bx:.4f} {by:.4f} {bw:.4f} {bh:.4f}")
PY

  # bbox 영역만 native fps로 프레임 추출 (1.8초 구간)
  while read IDX POS WIN_START BX BY BW BH; do
    WIN_START_MS=$(python3 -c "print(int($WIN_START * 1000))")
    (ffmpeg -hide_banner -loglevel error -ss "$WIN_START" -t 1.8 -i "$VIDEO" \
      -vf "crop=iw*${BW}:ih*${BH}:iw*${BX}:ih*${BY}" -q:v 3 \
      "$TMPDIR/pixdiff/p_${IDX}_${POS}_${WIN_START_MS}_%03d.jpg" 2>/dev/null) &
  done < "$TMPDIR/boundary_plan.txt"
  wait

  FRAME_COUNT=$(ls "$TMPDIR"/pixdiff/p_*.jpg 2>/dev/null | wc -l | tr -d ' ')
  echo "  → ${FRAME_COUNT}개 frame 추출 (bbox 영역만)"

  # 픽셀 diff 분석 → transition 프레임 탐지
  # 실패해도(PIL 누락 등) 전체 검수가 죽지 않도록 || true 로 격리.
  python3 - <<PY > "$TMPDIR/out-refined.json" 2>"$TMPDIR/refine.err" || true
import json, re, glob, os, sys
try:
    from PIL import Image
    import numpy as np
except ImportError as e:
    print(f"[refine] skipped: {e}", file=sys.stderr)
    with open("$OUT") as f: print(f.read())
    sys.exit(0)

with open("$OUT") as f: data = json.load(f)

FRAME_MS = $FRAME_MS
FILE_RE = re.compile(r'p_(\d+)_(start|end)_(\d+)_(\d+)\.jpg')

# 프레임 그룹핑: (issue_idx, pos, win_start_ms) → [(frame_num, path), ...]
groups = {}
for path in glob.glob("$TMPDIR/pixdiff/p_*.jpg"):
    fname = os.path.basename(path)
    m = FILE_RE.match(fname)
    if not m: continue
    idx, pos, win_ms, fnum = int(m.group(1)), m.group(2), int(m.group(3)), int(m.group(4))
    groups.setdefault((idx, pos, win_ms), []).append((fnum, path))

def find_transition(frames):
    """프레임 간 픽셀 diff 최대 지점 찾기.
    returns (peak_diff_index, max_diff) — peak는 frames[peak]과 frames[peak+1] 사이 전환
    """
    frames = sorted(frames)
    arrs = []
    for _, path in frames:
        try:
            img = Image.open(path).convert("L")  # 그레이스케일
            # 최대 800 width까지 허용 (텍스트 디테일 보존)
            if img.width > 800:
                img = img.resize((800, max(50, int(800 * img.height / img.width))))
            arrs.append(np.asarray(img, dtype=np.int16))
        except Exception:
            arrs.append(None)

    diffs = []
    for i in range(1, len(arrs)):
        a, b = arrs[i-1], arrs[i]
        if a is None or b is None or a.shape != b.shape:
            diffs.append(0.0)
            continue
        diffs.append(float(np.abs(b - a).mean()))

    if not diffs: return None, 0.0
    peak = int(np.argmax(diffs))
    return peak, diffs[peak]

issues = data.get("issues", [])
# 이슈별로 start/end 후보를 따로 수집 후 validate
proposals = {}
for (idx, pos, win_ms), flist in groups.items():
    if idx >= len(issues): continue
    peak, max_diff = find_transition(flist)
    if peak is None or max_diff < 2.0:
        continue
    if pos == "start":
        proposals.setdefault(idx, {})["start"] = win_ms + (peak + 1) * FRAME_MS
    else:
        proposals.setdefault(idx, {})["end"] = win_ms + peak * FRAME_MS

refined_count = 0
for idx, prop in proposals.items():
    orig_start = issues[idx].get("startSec", 0) * 1000
    orig_end = issues[idx].get("endSec", 0) * 1000
    new_start = prop.get("start", orig_start)
    new_end = prop.get("end", orig_end)

    # Validate: start ≤ end, 둘 다 합리적 범위
    if new_end < new_start:
        # Anomaly: 둘 중 하나만 refinement 수용 가능? → 보수적으로 둘 다 폴백
        continue
    if new_end - new_start > 15000:  # 15초 이상 스팬은 이상함
        continue

    issues[idx]["startSec"] = round(new_start / 1000, 3)
    issues[idx]["endSec"] = round(new_end / 1000, 3)
    refined_count += 1

print(f"[refine] native_fps_boundaries={refined_count}/{len(issues)}", file=sys.stderr)
print(json.dumps(data, ensure_ascii=False, indent=2))
PY

  # refined 결과가 유효 JSON 일 때만 교체. 비었거나 깨졌으면 step 6 결과 보존.
  if [[ -s "$TMPDIR/out-refined.json" ]] && jq empty "$TMPDIR/out-refined.json" 2>/dev/null; then
    mv "$TMPDIR/out-refined.json" "$OUT"
    echo "  → 경계 정밀화 완료 (프레임 단위)"
  else
    REFINE_ERR=$(head -c 500 "$TMPDIR/refine.err" 2>/dev/null)
    echo "  → 경계 정밀화 스킵 ($REFINE_ERR) — step 6 결과 사용"
  fi
fi

echo ""
echo "✓ 완료 → $OUT"
echo ""
jq '{subtitles_total: (.subtitles | length), issues_count: (.issues | length)}' "$OUT"
