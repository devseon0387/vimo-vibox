#!/usr/bin/env bash
set -euo pipefail

# Vibox 배포 스크립트
# 사용법:
#   ./scripts/deploy.sh             # 배포 (코드만 — DB는 Baseon에서 관리)
#   ./scripts/deploy.sh --rollback  # 직전 배포 코드로 복원
#
# 2026-05-02 — 운영 머신을 iMac → Mac mini로 이전. SSH alias `macmini` 필요.
# 2026-06-13 — DB가 SQLite(_data/vibox.db) → Baseon PostgreSQL(맥미니)로 이전됨.
#   런타임은 DATABASE_URL(postgres)만 사용한다. 배포는 코드 rsync + 빌드 + 재시작만 수행하고
#   DB는 건드리지 않는다: 스키마 = drizzle-kit push + 수동 DDL(baseon_admin), 백업 = Baseon 암호화 백업/스트리밍 복제.
#   (예전 _data/vibox.db 는 런타임 미사용 stale 파일 — 마이그레이션/백업 단계 제거됨.)

REMOTE_HOST="${VIBOX_DEPLOY_HOST:-macmini}"
REMOTE_PATH="${VIBOX_DEPLOY_PATH:-/Users/vimo_server/vibox}"
ROLLBACK_DIR="${VIBOX_ROLLBACK_DIR:-/Users/vimo_server/vibox-rollback}"
LAUNCHD_LABEL="${VIBOX_LAUNCHD_LABEL:-cloud.vibox.app}"
LOCAL_PATH="$(cd "$(dirname "$0")/.." && pwd)"
TS="$(date +%Y%m%d-%H%M%S)"

# 원격 node/npm PATH — node@22 LTS 우선 (Next.js 16 + better-sqlite3 호환).
# Node 25 이상에서 native module ABI 차이로 ERR_DLOPEN_FAILED 발생.
REMOTE_PATH_ENV="export PATH=/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:\$PATH"

# 운영 환경 전용 파일 — 배포로 덮어쓰면 안 됨
PROTECTED_EXCLUDES=(
  --exclude '.env.local'
  --exclude '_data/'
  --exclude '_storage/'
  --exclude 'node_modules/'
  --exclude '.next/'
  --exclude '.playwright-mcp/'
  --exclude '.git/'
  --exclude '*.log'
  --exclude '.DS_Store'
  --exclude 'Notes/'
  --exclude 'Library/'
  --exclude 'Personal/'
  # 운영 머신에서만 관리하는 config (덮어쓰기 금지)
  --exclude 'litestream.yml'
  --exclude 'scripts/com.vibox.*.plist'
)

# -------- ROLLBACK --------
if [[ "${1:-}" == "--rollback" ]]; then
  echo "▸ Vibox 롤백 시작 (코드만 — DB는 Baseon에서 별도 관리)"
  ssh "${REMOTE_HOST}" "test -d ${ROLLBACK_DIR}" || {
    echo "✗ 롤백 스냅샷 없음 (${ROLLBACK_DIR}). 배포 이력이 없거나 초기 배포 상태입니다"
    exit 1
  }

  echo "[1/2] 코드 복원 (rollback snapshot → prod)"
  ssh "${REMOTE_HOST}" "rsync -a --delete \
    --exclude='_data/' --exclude='_storage/' --exclude='node_modules/' \
    --exclude='Notes/' --exclude='Library/' --exclude='Personal/' \
    --exclude='litestream.yml' --exclude='scripts/com.vibox.*.plist' \
    ${ROLLBACK_DIR}/ ${REMOTE_PATH}/"

  echo "[2/2] LaunchDaemon 재시작"
  ssh "${REMOTE_HOST}" "sudo launchctl kickstart -k system/${LAUNCHD_LABEL}"

  echo ""
  echo "✓ 롤백 완료. 검증: https://vibox.cloud"
  exit 0
fi

# -------- DEPLOY --------
echo "▸ Vibox 배포 시작 (${TS})"
echo "  source: ${LOCAL_PATH}"
echo "  target: ${REMOTE_HOST}:${REMOTE_PATH}"

# [1/5] 배포 전 코드 스냅샷 (롤백용)
echo ""
echo "[1/5] 롤백 스냅샷 저장 (코드)"
ssh "${REMOTE_HOST}" "rsync -a --delete \
  --exclude='_data/' --exclude='_storage/' --exclude='node_modules/' \
  --exclude='Notes/' --exclude='Library/' --exclude='Personal/' \
  --exclude='logs/' \
  ${REMOTE_PATH}/ ${ROLLBACK_DIR}/ && \
  echo '  ✓ snapshot → ${ROLLBACK_DIR}'"

# [2/5] 코드 rsync (잔해 정리, 민감 경로 보호)
echo ""
echo "[2/5] 코드 rsync"
rsync -avz --delete \
  "${PROTECTED_EXCLUDES[@]}" \
  "${LOCAL_PATH}/" "${REMOTE_HOST}:${REMOTE_PATH}/"

# [3/5] 의존성 + 빌드 + 네이티브 바이너리 컴파일
echo ""
echo "[3/5] 의존성 + 네이티브 바이너리 + 빌드"
ssh "${REMOTE_HOST}" "${REMOTE_PATH_ENV} && cd ${REMOTE_PATH} && \
  npm install --no-audit --no-fund 2>&1 | tail -5 && \
  (which swiftc >/dev/null && swiftc -O scripts/ocr.swift -o scripts/ocr && echo '  ✓ ocr 바이너리 컴파일됨' || echo '  ⚠ swiftc 없음 — OCR 비활성') && \
  npm run build 2>&1 | tail -20"

# [4/5] LaunchDaemon 재시작 (cloud.vibox.app은 부팅 시 자동 시작 등록됨)
echo ""
echo "[4/5] LaunchDaemon 재시작"
ssh "${REMOTE_HOST}" "sudo launchctl kickstart -k system/${LAUNCHD_LABEL}"

# [5/5] 스모크 체크 (핵심 엔드포인트 상태코드 확인)
echo ""
echo "[5/5] 스모크 체크"
sleep 3
SMOKE_FAIL=0
check() {
  local url="$1" expected="$2" label="$3"
  local code
  code=$(/usr/bin/curl -s -o /dev/null -w "%{http_code}" -m 10 "${url}")
  if [[ "$code" == "$expected" ]]; then
    echo "  ✓ ${label}: ${code}"
  else
    echo "  ✗ ${label}: ${code} (expected ${expected})"
    SMOKE_FAIL=1
  fi
}

check "https://vibox.cloud/login" "200" "로그인 페이지"
check "https://vibox.cloud/" "307" "인증 리다이렉트"

if [[ "${SMOKE_FAIL}" == "1" ]]; then
  echo ""
  echo "✗ 스모크 체크 실패 — 자동 롤백 권장: ./scripts/deploy.sh --rollback"
  exit 1
fi

echo ""
echo "✓ 배포 완료"
echo "  - https://vibox.cloud"
echo "  - 롤백: ./scripts/deploy.sh --rollback"
