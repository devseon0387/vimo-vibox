#!/usr/bin/env bash
# Vibox · Tier 2 Warm 백업 — Vibox Storage A → Vibox Mirror
#
# 전략: rsync --link-dest 기반 하드링크 세대 스냅샷
#   - 오늘 폴더를 어제 폴더와 하드링크 공유 → 변경분만 신규 공간 소모
#   - `latest` 심볼릭 링크로 최신 스냅샷 빠른 접근
#   - 30일 이전 스냅샷 자동 삭제
#
# 3-zone 모두 백업: Shared (렌더링) · Library (자료실) · Personal (개인 드라이브)
# 볼륨 루트 전체를 미러링 — 스냅샷 안에 Shared/, Library/, Personal/ 로 구분됨
#
# launchd로 매 6시간 자동 실행 (scripts/com.vibox.mirror.plist 참조)
set -euo pipefail

SRC='/Volumes/Vibox Storage A'
DST='/Volumes/Vibox Mirror/daily'
LOG_DIR='/Volumes/Vibox Mirror/logs'

TODAY=$(date +%Y-%m-%d)
YESTERDAY=$(date -v-1d +%Y-%m-%d)

if [[ ! -d "$SRC" ]]; then
  echo "[$(date)] ERROR: SRC not mounted ($SRC)" >&2
  exit 1
fi
if [[ ! -d "$DST" ]]; then
  echo "[$(date)] ERROR: DST not mounted ($DST)" >&2
  exit 1
fi

LOGFILE="$LOG_DIR/$TODAY.log"
echo "[$(date '+%F %T')] START rsync" >> "$LOGFILE"

# rsync 제외 목록: macOS 시스템 메타데이터 + 업로드 중 임시 청크
# (영상 업로드 중이면 그 청크들은 완료 전이라 백업할 필요 없음)
EXCLUDES=(
  --exclude='.DS_Store'
  --exclude='.Spotlight-V100'
  --exclude='.fseventsd'
  --exclude='.Trashes'
  --exclude='.TemporaryItems'
  --exclude='**/.vibox/uploads/'
)

# 어제 스냅샷이 있으면 하드링크 기반 증분, 없으면 풀복사
# (macOS bash 3.2 호환을 위해 배열 대신 조건부 실행)
if [[ -d "$DST/$YESTERDAY" ]]; then
  rsync -a --delete --human-readable \
    "${EXCLUDES[@]}" \
    --link-dest="$DST/$YESTERDAY" \
    "$SRC/" "$DST/$TODAY/" \
    >> "$LOGFILE" 2>&1
else
  rsync -a --delete --human-readable \
    "${EXCLUDES[@]}" \
    "$SRC/" "$DST/$TODAY/" \
    >> "$LOGFILE" 2>&1
fi

# latest 포인터 업데이트
rm -f "$DST/latest"
ln -s "$TODAY" "$DST/latest"

# 30일 이전 스냅샷 삭제 (YYYY-MM-DD 패턴만 대상)
find "$DST" -maxdepth 1 -type d -name '????-??-??' -mtime +30 -print0 | while IFS= read -r -d '' OLD; do
  echo "[$(date '+%F %T')] PRUNE: $OLD" >> "$LOGFILE"
  rm -rf "$OLD"
done

# 오래된 로그도 60일 지나면 삭제
find "$LOG_DIR" -maxdepth 1 -type f -name '*.log' -mtime +60 -delete

echo "[$(date '+%F %T')] DONE" >> "$LOGFILE"
