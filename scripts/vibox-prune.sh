#!/usr/bin/env bash
# Vibox · traffic_log 정리 — 90일 이상 경과한 트래픽 로그 삭제
#
# launchd로 매일 새벽 3시 실행 (scripts/com.vibox.prune.plist 참조)
# 안전: sqlite3 직접 사용, HTTP 거치지 않음.
#
# DB 경로 결정 우선순위 (env-driven, 머신 무관 동작):
#   1. VIBOX_DB env 직접 지정
#   2. .env.local의 DATABASE_URL 자동 추출 (스크립트 위치 기준)
#   3. fallback: ../_data/vibox.db (스크립트 디렉토리 상대)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.local"

if [[ -n "${VIBOX_DB:-}" ]]; then
  DB="$VIBOX_DB"
elif [[ -f "$ENV_FILE" ]]; then
  DB="$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | head -1)"
fi
DB="${DB:-$SCRIPT_DIR/../_data/vibox.db}"

LOG="/tmp/com.vibox.prune.log"
KEEP_DAYS=90

[[ -f "$DB" ]] || { echo "[$(date)] DB 없음: $DB" >> "$LOG"; exit 1; }

# KEEP_DAYS 전 시각 (ms)
CUTOFF_MS=$(($(date +%s) * 1000 - KEEP_DAYS * 24 * 60 * 60 * 1000))

BEFORE=$(sqlite3 "$DB" "SELECT COUNT(*) FROM traffic_log")
DELETED=$(sqlite3 "$DB" "DELETE FROM traffic_log WHERE at < $CUTOFF_MS; SELECT changes();")
AFTER=$(sqlite3 "$DB" "SELECT COUNT(*) FROM traffic_log")

# VACUUM 제거 (2026-05-24) — VACUUM은 DB 전체 페이지 재작성 + WAL truncate로
# Litestream snapshot이 강제 재생성되어 PITR 구간이 망실됨. 대신 incremental
# wal_checkpoint(TRUNCATE)로 WAL 파일 크기만 정리. Litestream과 호환.
sqlite3 "$DB" "PRAGMA wal_checkpoint(TRUNCATE);" > /dev/null
VACUUMED="checkpoint"

echo "[$(date '+%F %T')] pruned=$DELETED before=$BEFORE after=$AFTER vacuum=$VACUUMED" >> "$LOG"

# 30일 지난 로그 자체도 삭제
find /tmp -maxdepth 1 -name 'com.vibox.prune.log' -mtime +30 -delete 2>/dev/null || true
