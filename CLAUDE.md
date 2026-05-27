@AGENTS.md

## 운영 규칙

### 상용화 X — 내부 전용
Vibox는 비모 회사 내부 도구로만 운영함. SaaS화·결제·multi-tenant·외부 가입·서브도메인 분리·공개 가격 페이지 등 **상용화 관련 제안 금지** (2026-04-30 사용자 명시). 내부 워크플로 통합·권한 모델·UX·운영 강화 제안은 OK.

### 커밋 author = vimo <dev.vimo0387@gmail.com>
모든 git 커밋은 `vimo <dev.vimo0387@gmail.com>` 로 수행. 글로벌 기본값 hype5(seon@hype5.co.kr) 적용 금지. author 묻지 않고 자동 적용.

이전: `seon <seon@vi-mo.kr>` (2026-04-21 ~ 2026-05-27, 49건). 2026-05-27 사용자 지시로 video-moment·hype5-erp 와 동일한 vimo 계정으로 통일.

### 운영은 launchd (PM2 X)
2026-05-05부터 맥미니 운영을 PM2 → LaunchDaemon 6개로 전환. **PM2 명령 사용 금지** (`pm2 list/restart/logs` 동작 안 함).
- 상태 확인: `sudo launchctl list | grep vibox`
- 재시작: `sudo launchctl kickstart -k system/cloud.vibox.app`
- 로그: `tail -f ~/vibox/logs/stderr.log` 또는 `/tmp/com.vibox.{cloudflared,litestream}.{out,err}`
- 6개 LaunchDaemon: `cloud.vibox.app`, `com.vibox.{cloudflared,litestream,mirror,prune,mount-volumes}`

상세 운영 메모(배포·맥미니 이전·디스크 인벤토리·Cloudflare 스트리밍)는 글로벌 메모리 `migrated/` 또는 옵시디언 참조.
