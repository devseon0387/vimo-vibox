#!/usr/bin/env bash
set -euo pipefail

# Vibox 배포 스크립트
# 사용법:
#   ./scripts/deploy.sh             # 배포 (코드만 — DB는 Baseon에서 관리)
#   ./scripts/deploy.sh --dry-run   # 실제 전송 없이 rsync 변경분만 미리보기
#   ./scripts/deploy.sh --rollback  # 직전 배포 코드로 복원
#
# 이력:
# 2026-05-02 iMac→Mac mini(M1) / 2026-06-13 SQLite→Baseon PG / 2026-06-28 M1→M2 컷오버.
# 2026-07-02 — **SFF 통합 반영**. prod = SFF Proxmox `pve-sff` 안의 LXC 112(name=vibox, Debian 13).
#   더 이상 macOS(M2)가 아님. 런타임 = systemd `vibox.service` → `next start -p 4200`, User=vibox.
#   앞단 = caddy + cloudflared-vibox (둘 다 컨테이너 안). 코드=/opt/vibox (git 아님, rsync 반영).
#   접속: 호스트가 socat `100.70.168.63:2222 → 컨테이너 192.168.50.22:22`를 포워드하므로
#         로컬 맥 → `ssh -p 2222 root@100.70.168.63` 로 컨테이너 직결(내 키 root 인가됨).
#         (LAN에선 192.168.50.22 직결도 가능하나, 기본은 Tailscale socat 경로 사용.)
#   DB는 건드리지 않는다: 스키마 = drizzle-kit push + 수동 DDL(baseon_admin), 백업 = Baseon 측.
#   /opt/vibox 는 root로 접속해 rsync 반영 후 root 소유 파일만 vibox로 chown(macOS openrsync는 --chown 미지원).
#   ⚠️ --delete 는 쓰지 않는다: prod엔 repo에 없는 운영 파일(scripts/ddns.sh 등)이 있어 삭제되면 안 됨.

SSH_HOST="${VIBOX_DEPLOY_HOST:-100.70.168.63}"
SSH_PORT="${VIBOX_DEPLOY_PORT:-2222}"
SSH_USER="${VIBOX_DEPLOY_USER:-root}"
REMOTE_PATH="${VIBOX_DEPLOY_PATH:-/opt/vibox}"
ROLLBACK_DIR="${VIBOX_ROLLBACK_DIR:-/opt/vibox-rollback}"
APP_USER="${VIBOX_APP_USER:-vibox}"
APP_GROUP="${VIBOX_APP_GROUP:-vibox}"
SERVICE="${VIBOX_SERVICE:-vibox.service}"
LOCAL_PATH="$(cd "$(dirname "$0")/.." && pwd)"
TS="$(date +%Y%m%d-%H%M%S)"

SSH_OPTS=(-p "${SSH_PORT}" -o ConnectTimeout=12 -o StrictHostKeyChecking=accept-new)
RSH="ssh ${SSH_OPTS[*]}"
remote() { ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" "$@"; }

# 운영 환경 전용 파일 — 배포로 덮어쓰면 안 됨 (host-agnostic)
PROTECTED_EXCLUDES=(
  # prod 전용 운영 파일 — repo에 없음. systemd vibox-ddns.service(ExecStart=/opt/vibox/scripts/ddns.sh)가
  # 참조하므로 절대 삭제/덮어쓰기 금지 (SFF 이전 때 생성된 현장 파일).
  --exclude 'scripts/ddns.sh'
  --exclude '.env.local'
  --exclude '_data/'
  --exclude '_storage/'
  --exclude 'node_modules/'
  --exclude '.next/'
  --exclude '.playwright-mcp/'
  --exclude '.git/'
  --exclude '*.log'
  --exclude 'logs/'
  --exclude '.DS_Store'
  --exclude 'Notes/'
  --exclude 'Library/'
  --exclude 'Personal/'
  # 운영 현장 핫픽스 백업·롤백 잔재 (배포로 삭제/churn 금지)
  --exclude '*.bak*'
  --exclude '.dedup-rollback/'
  # 디자인 시안 HTML — 런타임 무관, 로컬 전용
  --exclude 'design/'
  # 빌드 산출물 (원격 npm run build 가 재생성)
  --exclude 'tsconfig.tsbuildinfo'
  # macOS(구 M2) 잔재 — SFF엔 없지만 혹시 있으면 보호
  --exclude 'litestream.yml'
  --exclude 'scripts/com.vibox.*.plist'
)
# 롤백 스냅샷용 (런타임 데이터만 제외, 코드는 전부 복사). 원격 문자열로 전개되므로 glob(*) 패턴은 넣지 않음.
SNAP_EXCLUDES=(
  --exclude '_data/' --exclude '_storage/' --exclude 'node_modules/'
  --exclude '.next/' --exclude 'logs/'
  --exclude 'Notes/' --exclude 'Library/' --exclude 'Personal/'
)

# -------- ROLLBACK --------
if [[ "${1:-}" == "--rollback" ]]; then
  echo "▸ Vibox 롤백 시작 (코드만 — DB는 Baseon에서 별도 관리)"
  remote "test -d ${ROLLBACK_DIR}" || {
    echo "✗ 롤백 스냅샷 없음 (${ROLLBACK_DIR}). 배포 이력이 없습니다"
    exit 1
  }
  echo "[1/2] 코드 복원 (rollback snapshot → prod)"
  remote "rsync -a --delete ${SNAP_EXCLUDES[*]} ${ROLLBACK_DIR}/ ${REMOTE_PATH}/ && chown -R ${APP_USER}:${APP_GROUP} ${REMOTE_PATH}"
  echo "[2/2] 서비스 재시작"
  remote "systemctl restart ${SERVICE} && systemctl is-active ${SERVICE}"
  echo ""
  echo "✓ 롤백 완료. 검증: https://vibox.cloud"
  exit 0
fi

# -------- DRY RUN --------
DRY=""
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY="--dry-run"
  echo "▸ DRY-RUN (실제 전송/빌드/재시작 없음) — rsync 변경분만 미리보기"
fi

# -------- DEPLOY --------
echo "▸ Vibox 배포 ${DRY:+(dry-run) }시작 (${TS})"
echo "  source: ${LOCAL_PATH}"
echo "  target: ${SSH_USER}@${SSH_HOST}:${SSH_PORT} → ${REMOTE_PATH} (LXC112/systemd ${SERVICE})"

if [[ -z "${DRY}" ]]; then
  echo ""
  echo "[1/5] 롤백 스냅샷 저장 (코드)"
  remote "rsync -a --delete ${SNAP_EXCLUDES[*]} ${REMOTE_PATH}/ ${ROLLBACK_DIR}/ && echo '  ✓ snapshot → ${ROLLBACK_DIR}'"
fi

echo ""
echo "[2/5] 코드 rsync ${DRY:+(dry-run)}"
# ⚠️ --delete 미사용: prod /opt/vibox 에는 repo에 없는 운영 파일(scripts/ddns.sh 등)이 있어
#    --delete 시 삭제되어 systemd 타이머가 깨진다. 삭제 대신 추가/갱신만 한다.
#    (repo에서 지운 소스가 prod에 남는 churn은 감수 — 데이터 유실보다 안전 우선.)
rsync -avz ${DRY} \
  "${PROTECTED_EXCLUDES[@]}" \
  -e "ssh ${SSH_OPTS[*]}" \
  "${LOCAL_PATH}/" "${SSH_USER}@${SSH_HOST}:${REMOTE_PATH}/"

if [[ -n "${DRY}" ]]; then
  echo ""
  echo "✓ dry-run 완료 (아무것도 변경하지 않음). 실제 배포는 인자 없이 실행."
  exit 0
fi

echo ""
echo "[3/5] 소유권 정리(root→${APP_USER}) + 의존성 + 빌드"
# openrsync(macOS)는 --chown 미지원 → 전송(root 소유) 후 remote에서 root 소유 파일만 vibox로 (node_modules 제외).
remote "find ${REMOTE_PATH} -path ${REMOTE_PATH}/node_modules -prune -o -user root -exec chown ${APP_USER}:${APP_GROUP} {} +"
remote "runuser -u ${APP_USER} -- bash -lc 'cd ${REMOTE_PATH} && npm install --no-audit --no-fund 2>&1 | tail -5 && npm run build 2>&1 | tail -20'"

echo ""
echo "[4/5] 서비스 재시작"
remote "systemctl restart ${SERVICE}"
sleep 2
echo "  is-active: $(remote "systemctl is-active ${SERVICE}")"

echo ""
echo "[5/5] 스모크 체크"
sleep 2
SMOKE_FAIL=0
check() {
  local url="$1" expected="$2" label="$3" code
  code=$(/usr/bin/curl -s -o /dev/null -w "%{http_code}" -m 12 "${url}")
  if [[ "$code" == "$expected" ]]; then echo "  ✓ ${label}: ${code}"; else echo "  ✗ ${label}: ${code} (expected ${expected})"; SMOKE_FAIL=1; fi
}
# 컨테이너 내부 (caddy/터널 우회, 앱 직접)
INT=$(remote "curl -s -o /dev/null -w '%{http_code}' -m 10 http://127.0.0.1:4200/login" || echo "ERR")
if [[ "$INT" == "200" ]]; then echo "  ✓ 내부 /login(4200): ${INT}"; else echo "  ✗ 내부 /login(4200): ${INT}"; SMOKE_FAIL=1; fi
# 외부 (caddy + cloudflared 경유)
check "https://vibox.cloud/login" "200" "외부 로그인 페이지"
check "https://vibox.cloud/" "307" "외부 인증 리다이렉트"

if [[ "${SMOKE_FAIL}" == "1" ]]; then
  echo ""
  echo "✗ 스모크 체크 실패 — 롤백 권장: ./scripts/deploy.sh --rollback"
  exit 1
fi

echo ""
echo "✓ 배포 완료"
echo "  - https://vibox.cloud"
echo "  - 롤백: ./scripts/deploy.sh --rollback"
