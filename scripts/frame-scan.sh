#!/usr/bin/env bash
set -euo pipefail

# Vibox · 프레임 이상 감지
# 사용: ./scripts/frame-scan.sh <video> [output.json]
#
# 감지 대상:
#   1. 블랙 프레임 (밝기 10% 미만, 0.1초 이상 지속)
#   2. 정지 프레임 (같은 프레임 0.3초 이상 반복)

if [[ $# -lt 1 ]]; then
  echo "사용법: $0 <video-path> [output.json]"
  exit 1
fi

VIDEO="$1"
OUT="${2:-/tmp/frame-scan-$(basename "$VIDEO" .mp4).json}"
TMPDIR=$(mktemp -d -t vibox-framescan-XXXXXX)
trap "rm -rf '$TMPDIR'" EXIT

[[ ! -f "$VIDEO" ]] && { echo "영상 파일 없음: $VIDEO"; exit 1; }

echo "▸ 프레임 검수 시작: $VIDEO"

# ================================================================
# 1. 블랙 프레임 감지
#    - d=0.1 : 최소 0.1초 지속
#    - pix_th=0.10 : 픽셀의 90% 이상이 검정(threshold) 일 때 판정
# ================================================================
echo ""
echo "[1/3] 블랙 프레임 감지"
ffmpeg -hide_banner -nostats -i "$VIDEO" \
  -vf "blackdetect=d=0.1:pix_th=0.10:pic_th=0.98" \
  -an -f null - 2>"$TMPDIR/black.txt" || true

BLACK_COUNT=$(grep -c "black_start" "$TMPDIR/black.txt" || true)
echo "  → 블랙 프레임 ${BLACK_COUNT}건"

# ================================================================
# 2. 정지 프레임 감지
#    - n=-50dB : noise threshold 완화 (인터뷰 영상 배경 noise 무시)
#    - d=1.0 : 최소 1초 이상 지속되는 명확한 정지만 감지
# ================================================================
echo ""
echo "[2/3] 정지 프레임 감지"
ffmpeg -hide_banner -nostats -i "$VIDEO" \
  -vf "freezedetect=n=-50dB:d=1.0" \
  -map 0:v:0 -f null - 2>"$TMPDIR/freeze.txt" || true

FREEZE_COUNT=$(grep -c "freeze_start" "$TMPDIR/freeze.txt" || true)
echo "  → 정지 프레임 ${FREEZE_COUNT}건"

# ================================================================
# 3. JSON 합성
# ================================================================
echo ""
echo "[3/3] 결과 합성"

python3 - <<PY > "$OUT"
import re, json

issues = []

# 블랙 프레임 파싱
# 예: [blackdetect @ 0x...] black_start:12.345 black_end:12.567 black_duration:0.222
with open("$TMPDIR/black.txt") as f:
    for line in f:
        m = re.search(
            r'black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)\s+black_duration:\s*([\d.]+)',
            line,
        )
        if m:
            start = float(m.group(1))
            end = float(m.group(2))
            duration = float(m.group(3))
            issues.append({
                "type": "black",
                "startSec": round(start, 3),
                "endSec": round(end, 3),
                "duration": round(duration, 3),
                "severity": "high" if duration > 0.5 else "medium",
                "title": f"블랙 프레임 {duration:.2f}초",
                "desc": f"화면이 검게 표시됨 ({duration:.2f}초)",
            })

# 정지 프레임 파싱
# freezedetect 출력 포맷:
#   [freezedetect @ ...] lavfi.freezedetect.freeze_start: 12.345
#   [freezedetect @ ...] lavfi.freezedetect.freeze_duration: 0.789
#   [freezedetect @ ...] lavfi.freezedetect.freeze_end: 13.134
with open("$TMPDIR/freeze.txt") as f:
    content = f.read()

# freeze_start 들과 duration/end 매칭
starts = re.findall(r'freeze_start:\s*([\d.]+)', content)
durations = re.findall(r'freeze_duration:\s*([\d.]+)', content)
ends = re.findall(r'freeze_end:\s*([\d.]+)', content)

# 순서대로 매칭 (같은 인덱스끼리)
for i in range(min(len(starts), len(ends))):
    start = float(starts[i])
    end = float(ends[i])
    duration = end - start
    if duration >= 1.0:
        issues.append({
            "type": "freeze",
            "startSec": round(start, 3),
            "endSec": round(end, 3),
            "duration": round(duration, 3),
            "severity": "high" if duration > 1.0 else "medium",
            "title": f"정지 프레임 {duration:.2f}초",
            "desc": f"영상이 정지된 상태 ({duration:.2f}초)",
        })

# 시간 순 정렬
issues.sort(key=lambda x: x["startSec"])

print(json.dumps({"issues": issues}, ensure_ascii=False, indent=2))
PY

TOTAL=$(jq '.issues | length' "$OUT")
echo "  → 총 ${TOTAL}건 감지"
echo ""
echo "✓ 완료 → $OUT"
jq '.issues[0:3]' "$OUT" 2>/dev/null || true
