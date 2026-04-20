#!/usr/bin/env bash
set -euo pipefail

# Vibox 배포 스크립트
# 실행: ./scripts/deploy.sh
# 요구: SSH vimo-imac 접근 가능

REMOTE_HOST="vimo-imac"
REMOTE_PATH="/Users/vimo/vimo-cloud"
LOCAL_PATH="$(cd "$(dirname "$0")/.." && pwd)"
TS="$(date +%Y%m%d-%H%M%S)"

echo "▸ Vibox 배포 시작 (${TS})"
echo "  source: ${LOCAL_PATH}"
echo "  target: ${REMOTE_HOST}:${REMOTE_PATH}"

# [1/5] DB 백업
echo ""
echo "[1/5] DB 백업"
ssh "${REMOTE_HOST}" "cp ${REMOTE_PATH}/_data/vimo-cloud.db ${REMOTE_PATH}/_data/vimo-cloud.db.backup-${TS} && ls -la ${REMOTE_PATH}/_data/ | head -6"

# [2/5] 코드 rsync (--delete로 잔해 정리)
# 보호 제외: .env.local, _data/, _storage/, node_modules/, .next/, .playwright-mcp/
echo ""
echo "[2/5] 코드 rsync"
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

# [3/5] DB 마이그레이션 (IF NOT EXISTS로 멱등)
echo ""
echo "[3/5] DB 마이그레이션"
ssh "${REMOTE_HOST}" "sqlite3 ${REMOTE_PATH}/_data/vimo-cloud.db < ${REMOTE_PATH}/scripts/migrate.sql && echo '  ✓ migrate.sql applied'"

# [4/5] 의존성 + 빌드
echo ""
echo "[4/5] 의존성 + 빌드"
ssh "${REMOTE_HOST}" "cd ${REMOTE_PATH} && /usr/local/bin/npm install --no-audit --no-fund 2>&1 | tail -5 && /usr/local/bin/npm run build 2>&1 | tail -20"

# [5/5] PM2 재시작
echo ""
echo "[5/5] PM2 재시작"
ssh "${REMOTE_HOST}" "/usr/local/bin/pm2 restart vimo-cloud"

echo ""
echo "✓ 배포 완료"
echo "  - 내부: http://vimo-imac:4200"
echo "  - 외부: https://vibox.cloud"
