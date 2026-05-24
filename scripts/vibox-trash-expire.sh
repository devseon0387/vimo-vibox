#!/usr/bin/env bash
# Vibox · 휴지통 자동 만료 (30일 경과 항목 영구 삭제)
#
# 이전엔 GET /api/trash 호출 시마다 트리거 → race + 의도치 않은 destructive 위험.
# launchd 매일 새벽 4시 실행 권장. (scripts/com.vibox.trash-expire.plist)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.local"

if [[ -n "${VIBOX_DB:-}" ]]; then
  DB="$VIBOX_DB"
elif [[ -f "$ENV_FILE" ]]; then
  DB="$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | head -1)"
fi
DB="${DB:-$SCRIPT_DIR/../_data/vibox.db}"

# 휴지통 파일 디렉터리 (STORAGE_ROOT/.vibox/trash)
if [[ -n "${STORAGE_ROOT:-}" ]]; then
  ROOT="$STORAGE_ROOT"
elif [[ -f "$ENV_FILE" ]]; then
  ROOT="$(grep '^STORAGE_ROOT=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | head -1)"
fi
TRASH_DIR="${ROOT:-}/.vibox/trash"

LOG="/tmp/com.vibox.trash-expire.log"
KEEP_DAYS=30

[[ -f "$DB" ]] || { echo "[$(date)] DB 없음: $DB" >> "$LOG"; exit 1; }

CUTOFF_MS=$(($(date +%s) * 1000 - KEEP_DAYS * 24 * 60 * 60 * 1000))

# 만료 대상 ID 조회 → 파일 삭제 → DB row 삭제
EXPIRED_IDS=$(sqlite3 "$DB" "SELECT id FROM trash_items WHERE deleted_at < $CUTOFF_MS")
COUNT=0
if [[ -n "$EXPIRED_IDS" ]]; then
  while IFS= read -r id; do
    [[ -z "$id" ]] && continue
    rm -rf "$TRASH_DIR/$id" 2>/dev/null || true
    COUNT=$((COUNT + 1))
  done <<< "$EXPIRED_IDS"
  sqlite3 "$DB" "DELETE FROM trash_items WHERE deleted_at < $CUTOFF_MS"
fi

echo "[$(date '+%F %T')] expired=$COUNT cutoff_ms=$CUTOFF_MS" >> "$LOG"

# 30일 지난 로그 자체도 삭제
find /tmp -maxdepth 1 -name 'com.vibox.trash-expire.log' -mtime +30 -delete 2>/dev/null || true
