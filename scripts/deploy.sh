#!/usr/bin/env bash
set -euo pipefail

# Vibox 배포 스크립트
# 사용법:
#   ./scripts/deploy.sh             # 배포
#   ./scripts/deploy.sh --rollback  # 직전 배포 취소 (코드 + DB 복원)

REMOTE_HOST="vimo-imac"
REMOTE_PATH="/Users/vimo/vimo-cloud"
ROLLBACK_DIR="/Users/vimo/vimo-cloud-rollback"
LOCAL_PATH="$(cd "$(dirname "$0")/.." && pwd)"
TS="$(date +%Y%m%d-%H%M%S)"

# 원격 node/npm PATH (Homebrew) — node@22 (LTS) 사용. Node 25 에선 Next.js 16 런타임 이슈
REMOTE_PATH_ENV="export PATH=/usr/local/opt/node@22/bin:/usr/local/bin:\$PATH"

# -------- ROLLBACK --------
if [[ "${1:-}" == "--rollback" ]]; then
  echo "▸ Vibox 롤백 시작"
  ssh "${REMOTE_HOST}" "test -d ${ROLLBACK_DIR}" || {
    echo "✗ 롤백 스냅샷 없음 (${ROLLBACK_DIR}). 배포 이력이 없거나 초기 배포 상태입니다"
    exit 1
  }

  echo "[1/3] 코드 복원 (rollback snapshot → prod)"
  ssh "${REMOTE_HOST}" "rsync -a --delete \
    --exclude='_data/' --exclude='_storage/' --exclude='node_modules/' \
    ${ROLLBACK_DIR}/ ${REMOTE_PATH}/"

  echo "[2/3] DB 복원"
  ssh "${REMOTE_HOST}" "test -f ${REMOTE_PATH}/_data/vimo-cloud.db.rollback && \
    cp ${REMOTE_PATH}/_data/vimo-cloud.db ${REMOTE_PATH}/_data/vimo-cloud.db.pre-rollback-${TS} && \
    cp ${REMOTE_PATH}/_data/vimo-cloud.db.rollback ${REMOTE_PATH}/_data/vimo-cloud.db && \
    echo '  ✓ DB 복원됨 (현재 DB는 pre-rollback-${TS}로 보관)'"

  echo "[3/3] PM2 재시작"
  ssh "${REMOTE_HOST}" "${REMOTE_PATH_ENV} && pm2 restart vimo-cloud"

  echo ""
  echo "✓ 롤백 완료. 검증: https://vibox.cloud"
  exit 0
fi

# -------- DEPLOY --------
echo "▸ Vibox 배포 시작 (${TS})"
echo "  source: ${LOCAL_PATH}"
echo "  target: ${REMOTE_HOST}:${REMOTE_PATH}"

# [1/6] 배포 전 스냅샷 (롤백용)
echo ""
echo "[1/6] 롤백 스냅샷 저장 (코드 + DB)"
ssh "${REMOTE_HOST}" "rsync -a --delete \
  --exclude='_data/' --exclude='_storage/' --exclude='node_modules/' \
  ${REMOTE_PATH}/ ${ROLLBACK_DIR}/ && \
  cp ${REMOTE_PATH}/_data/vimo-cloud.db ${REMOTE_PATH}/_data/vimo-cloud.db.rollback && \
  cp ${REMOTE_PATH}/_data/vimo-cloud.db ${REMOTE_PATH}/_data/vimo-cloud.db.backup-${TS} && \
  echo '  ✓ snapshot → ${ROLLBACK_DIR}, DB → vimo-cloud.db.rollback + backup-${TS}'"

# [2/6] 코드 rsync (잔해 정리, 민감 경로 보호)
echo ""
echo "[2/6] 코드 rsync"
rsync -avz --delete \
  --exclude '.env.local' \
  --exclude '_data/' \
  --exclude '_storage/' \
  --exclude 'node_modules/' \
  --exclude '.next/' \
  --exclude '.playwright-mcp/' \
  --exclude '.git/' \
  --exclude '*.log' \
  --exclude '.DS_Store' \
  "${LOCAL_PATH}/" "${REMOTE_HOST}:${REMOTE_PATH}/"

# [3/6] DB 마이그레이션 (IF NOT EXISTS로 멱등)
# SQLite ALTER ADD COLUMN은 IF NOT EXISTS 미지원 → 재실행 시 "duplicate column" 에러 발생하지만
# migrate.sql 의도상 무시해야 멱등성 유지. 그 외 에러는 실패 처리.
echo ""
echo "[3/6] DB 마이그레이션"
ssh "${REMOTE_HOST}" 'set +e
  err=$(sqlite3 '"${REMOTE_PATH}"'/_data/vimo-cloud.db < '"${REMOTE_PATH}"'/scripts/migrate.sql 2>&1)
  unexpected=$(printf "%s\n" "$err" | grep -v "duplicate column name" | grep -v "already exists" | grep -v "^$")
  if [ -n "$unexpected" ]; then
    echo "$unexpected" >&2
    exit 1
  fi
  echo "  ✓ migrate.sql applied"'

# [4/6] 의존성 + 빌드 + 네이티브 바이너리 컴파일
echo ""
echo "[4/6] 의존성 + 네이티브 바이너리 + 빌드"
ssh "${REMOTE_HOST}" "${REMOTE_PATH_ENV} && cd ${REMOTE_PATH} && \
  npm install --no-audit --no-fund 2>&1 | tail -5 && \
  (which swiftc >/dev/null && swiftc -O scripts/ocr.swift -o scripts/ocr && echo '  ✓ ocr 바이너리 컴파일됨' || echo '  ⚠ swiftc 없음 — OCR 비활성') && \
  npm run build 2>&1 | tail -20"

# [5/6] PM2 재시작
echo ""
echo "[5/6] PM2 재시작"
ssh "${REMOTE_HOST}" "${REMOTE_PATH_ENV} && pm2 restart vimo-cloud"

# [6/6] 스모크 체크 (핵심 엔드포인트 상태코드 확인)
echo ""
echo "[6/6] 스모크 체크"
sleep 3
check() {
  local url="$1" expected="$2" label="$3"
  local code
  code=$(/usr/bin/curl -s -o /dev/null -w "%{http_code}" "${url}")
  if [[ "$code" == "$expected" ]]; then
    echo "  ✓ ${label}: ${code}"
  else
    echo "  ✗ ${label}: ${code} (expected ${expected}) — 롤백 고려"
    return 1
  fi
}

check "https://vibox.cloud/login" "200" "로그인 페이지"
check "https://vibox.cloud/" "307" "인증 리다이렉트"

echo ""
echo "✓ 배포 완료"
echo "  - https://vibox.cloud"
echo "  - 롤백: ./scripts/deploy.sh --rollback"
