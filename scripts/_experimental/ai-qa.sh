#!/usr/bin/env bash
set -euo pipefail

# Vibox AI 품질 검사
# 사용법: ./scripts/ai-qa.sh <video-path> [output.json]
#
# 검사 항목:
#  1. 블랙 프레임 (ffmpeg blackdetect)
#  2. 튀는 프레임 / 1~2프레임 글리치 (ffmpeg scdet 근접 쌍)
#  3. 자막 오타/맞춤법 (Claude CLI + 프레임 OCR)

if [[ $# -lt 1 ]]; then
  echo "사용법: $0 <video-path> [output.json]"
  exit 1
fi

VIDEO="$1"
OUT="${2:-/tmp/vibox-qa-$(basename "$VIDEO" .mp4).json}"
TMPDIR=$(mktemp -d -t vibox-qa-XXXXXX)
trap "rm -rf '$TMPDIR'" EXIT

[[ ! -f "$VIDEO" ]] && { echo "영상 파일 없음: $VIDEO"; exit 1; }

echo "▸ AI QA 시작: $VIDEO"
echo "  임시: $TMPDIR"
echo ""

# ================================================================
# 1. 블랙 프레임 감지
# ================================================================
echo "[1/3] 블랙 프레임 감지..."
BLACK_JSON="$TMPDIR/black.json"
ffmpeg -hide_banner -i "$VIDEO" \
  -vf "blackdetect=d=0.03:pic_th=0.95" \
  -f null - 2>&1 |
  grep -oE "black_start:[0-9.]+ black_end:[0-9.]+ black_duration:[0-9.]+" |
  awk '{
    gsub("black_start:","",$1); gsub("black_end:","",$2); gsub("black_duration:","",$3);
    printf "{\"start\":%s,\"end\":%s,\"duration\":%s}\n", $1, $2, $3
  }' |
  jq -s '.' > "$BLACK_JSON"

BLACK_COUNT=$(jq 'length' < "$BLACK_JSON")
echo "  → ${BLACK_COUNT}건 감지"

# ================================================================
# 2. 튀는 프레임 감지 (scene change 스파이크)
# ================================================================
echo "[2/3] 튀는 프레임 감지..."
SCENES_TXT="$TMPDIR/scenes.txt"
ffmpeg -hide_banner -i "$VIDEO" \
  -vf "select=gt(scene\,0.3),showinfo" \
  -f null - 2>&1 |
  grep -oE "pts_time:[0-9.]+" |
  sed 's/pts_time://' > "$SCENES_TXT"

GLITCH_JSON="$TMPDIR/glitch.json"
python3 << PY > "$GLITCH_JSON"
import json
times = []
with open("$SCENES_TXT") as f:
  for line in f:
    line = line.strip()
    if line:
      try: times.append(float(line))
      except: pass
times.sort()
glitches = []
for i in range(len(times) - 1):
  diff = times[i+1] - times[i]
  if diff < 0.15:  # 150ms 이내 = 1~3 프레임
    glitches.append({
      "start": round(times[i], 3),
      "end": round(times[i+1], 3),
      "gap_ms": round(diff * 1000, 1),
    })
print(json.dumps(glitches, ensure_ascii=False))
PY
GLITCH_COUNT=$(jq 'length' < "$GLITCH_JSON")
echo "  → ${GLITCH_COUNT}건 감지"

# ================================================================
# 3. 자막 오타/맞춤법 (Claude CLI)
# ================================================================
echo "[3/3] 자막 오타 검사 (Claude)..."
FRAMES_DIR="$TMPDIR/frames"
mkdir -p "$FRAMES_DIR"

# 영상 길이 측정
DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VIDEO" | cut -d. -f1)
echo "  영상 길이: ${DURATION}s"

# 5초 간격 프레임 추출 (파일명에 초 인코딩)
# 한 번에 Claude에 보낼 수 있는 개수 제한: 최대 20장
INTERVAL=5
MAX_FRAMES=20
ACTUAL_INTERVAL=$INTERVAL
if (( DURATION / INTERVAL > MAX_FRAMES )); then
  ACTUAL_INTERVAL=$((DURATION / MAX_FRAMES + 1))
fi
echo "  샘플 간격: ${ACTUAL_INTERVAL}s"

for ((t=0; t<DURATION; t+=ACTUAL_INTERVAL)); do
  ffmpeg -hide_banner -loglevel error -ss $t -i "$VIDEO" \
    -frames:v 1 -vf "scale=640:-1" \
    "$FRAMES_DIR/t${t}s.jpg" -y 2>/dev/null
done

FRAME_COUNT=$(ls "$FRAMES_DIR"/*.jpg 2>/dev/null | wc -l | tr -d ' ')
echo "  → ${FRAME_COUNT} 프레임 추출됨"

# 프롬프트에 @파일 참조 embed
FRAME_REFS=""
for f in "$FRAMES_DIR"/*.jpg; do
  FRAME_REFS+="@${f} "
done

CLAUDE_PROMPT="한국어 자막 QA 검수. 아래 영상 프레임들을 보고 각 프레임의 자막(있다면)을 읽고 오타/맞춤법/띄어쓰기 이슈를 찾으세요.

파일명 형식: t{초}s.jpg (예: t45s.jpg = 영상 45초 지점)

JSON 배열로만 출력 (다른 설명 절대 금지):
[{\"timeSec\": 숫자, \"subtitle\": \"자막 원문\", \"issue\": \"문제\", \"suggestion\": \"수정안\"}]

규칙:
- 자막 없는 프레임은 출력에 포함하지 않음
- 오타/맞춤법 이슈가 있는 프레임만 포함
- 같은 자막이 여러 프레임에 걸쳐 있으면 첫 번째 timeSec만 기록

이슈 없으면 빈 배열 []만 출력.

${FRAME_REFS}"

SUBTITLE_JSON="$TMPDIR/subtitles.json"
RAW="$TMPDIR/claude-raw.txt"

env -u CLAUDECODE claude -p "$CLAUDE_PROMPT" --output-format text > "$RAW" 2>&1 || true

# 결과에서 JSON 배열 추출
python3 << PY > "$SUBTITLE_JSON"
import re, json
with open("$RAW") as f:
  raw = f.read()
# 첫 JSON 배열 찾기
m = re.search(r'\[[\s\S]*?\](?=\s*$|\s*\n|$)', raw)
if m:
  try:
    parsed = json.loads(m.group(0))
    print(json.dumps(parsed, ensure_ascii=False))
  except:
    # 더 관대한 매칭
    m2 = re.search(r'\[[\s\S]*\]', raw)
    if m2:
      try: print(json.dumps(json.loads(m2.group(0)), ensure_ascii=False))
      except: print("[]")
    else: print("[]")
else:
  print("[]")
PY

SUB_COUNT=$(jq 'length' < "$SUBTITLE_JSON" 2>/dev/null || echo 0)
echo "  → 자막 이슈 ${SUB_COUNT}건"

# ================================================================
# 최종 결과 합치기
# ================================================================
jq -n \
  --arg video "$VIDEO" \
  --slurpfile black "$BLACK_JSON" \
  --slurpfile glitch "$GLITCH_JSON" \
  --slurpfile subtitles "$SUBTITLE_JSON" \
  '{
    video: $video,
    black_frames: $black[0],
    glitches: $glitch[0],
    subtitle_issues: $subtitles[0],
    summary: {
      black: ($black[0] | length),
      glitch: ($glitch[0] | length),
      subtitle: ($subtitles[0] | length)
    }
  }' > "$OUT"

echo ""
echo "✓ 완료 → $OUT"
echo ""
jq '.summary' < "$OUT"
