# VIMO Cloud — 기술 스택 결정 문서

> 내부 팀용 웹 기반 파일 공유 플랫폼. "우리만의 드롭박스"가 목표.

작성: 2026-04-19

---

## 스택 한눈에

| 계층 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | **Next.js 16 (App Router)** | 팀 전 프로젝트 공통 스택, Turbopack 빠름 |
| 언어 | **TypeScript** | 타입 안정성 |
| 스타일 | **Tailwind CSS 4** (@theme inline) | Next.js 16 기본 셋업, 라이트 테마 고정 |
| 폰트 | **Pretendard + Nanum Myeongjo** | 메뉴한컷과 통일된 한글 타이포 |
| DB | **SQLite + Drizzle ORM** | Supabase 회피 철학. 단일 파일, 무설정 |
| 파일 저장 | **로컬 파일시스템** `/Volumes/T5 EVO/Shared/` | 직접 호스팅, 8TB SSD 활용 |
| 인증 | **NextAuth v5 (Auth.js)** — credentials provider | 계정/비밀번호 방식, 추후 Google SSO 확장 |
| 업로드 | **tus-js-client** (resumable chunked) | 대용량 영상 끊겨도 이어올리기 |
| 미리보기 | `<video>` / `<img>` 네이티브 + PDF.js | 서버 변환 없이 브라우저가 처리 |
| 썸네일 | **ffmpeg**로 최초 접근 시 생성 | 영상 첫 프레임 자동 추출, 디스크 캐시 |
| 배포 | **아이맥에 `pm2` 또는 `brew services`** | 24/7 백그라운드 실행 |
| 외부 노출 | **Cloudflare Tunnel** (검토 중) | 포트포워딩 없이 HTTPS, 무료 |

---

## 왜 이 조합인가 (핵심 결정 근거)

### 1. Next.js + SQLite + 로컬 파일시스템
- **철학**: "간단히 시작해서 필요할 때만 확장"
- Supabase 같은 복잡한 BaaS 회피
- SQLite 파일 하나로 메타데이터 전부 관리 (팀 10명 수준까지 넉넉)
- 파일은 실체는 SSD에, DB엔 메타데이터(경로·소유자·공유설정)만

### 2. NextAuth credentials (SSO 나중에)
- 팀원에게 ID/PW 발급 → 가장 단순
- 외부 계정(Google) 연동은 **필요해지면** 붙임
- 초기엔 팀 규모가 작아서 계정 운영 부담 없음

### 3. tus 프로토콜 업로드
- 영상 파일(수 GB) 업로드 중 네트워크 끊어지면 **처음부터 다시** 올리는 고통
- tus = **chunk 단위로 끊겨도 이어올리기**
- Dropbox·Vimeo·Figma도 tus 또는 유사 프로토콜 씀
- 영상 회사엔 필수 기능

### 4. ffmpeg 썸네일
- 영상 파일 첫 프레임을 자동 뽑아서 목록에서 미리보기
- Synology Drive 수준의 UX가 이거 하나로 확보됨
- `brew install ffmpeg` 한 번으로 끝

### 5. Cloudflare Tunnel (검토)
- 대안: Tailscale만 (더 안전, but 팀원 전원 설치 필요)
- 대안: 공유기 포트포워딩 (보안 위험 ❌)
- Cloudflare Tunnel = 공유기 건드리지 않고 `cloud.vimo.*` 같은 도메인으로 접근
- HTTPS 자동, 무료

---

## 기능 스코프 (단계별)

### Phase 1 — MVP (약 1주)
- [ ] 로그인 (관리자가 계정 발급)
- [ ] 파일 브라우저 (리스트/그리드 전환)
- [ ] 업로드 (드래그앤드롭, 다중, tus chunked)
- [ ] 다운로드 (단일/ZIP 묶음)
- [ ] 폴더 생성/이름변경/삭제
- [ ] 미리보기 (이미지·영상·PDF)
- [ ] 공유 링크 (시한부, 선택적 비밀번호)

### Phase 2 — 편의성 (1~2주)
- [ ] 검색 (파일명·태그)
- [ ] 활동 로그 (누가 뭐 올리고 지웠나)
- [ ] 관리자 페이지 (유저 CRUD, 쿼터)
- [ ] 휴지통·복구
- [ ] 영상 썸네일 자동 생성 (ffmpeg)
- [ ] 모바일 반응형 (폰에서 간단히 파일 보기·업로드)

### Phase 3 — 확장 (Phase 2 이후)
- [ ] 댓글 (파일별)
- [ ] 외부 클라이언트 공유 (비공개 워크스페이스)
- [ ] 비모 ERP 연동 (프로젝트 생성 시 자동 폴더 등)
- [ ] Google SSO
- [ ] 웹훅 (업로드·다운로드 이벤트 → Slack/카톡 알림)

### 하지 않을 것 (지금)
- ❌ 자체 데스크톱 싱크 클라이언트 (웹만)
- ❌ 버전 히스토리 (그냥 덮어쓰기, 필요해지면 `.versions/` 추가)
- ❌ 실시간 협업 편집 (오피스 문서 동시편집 등)
- ❌ E2E 암호화 (내부 팀용이라 불필요)

---

## 디렉터리 구조 (예상)

```
~/Desktop/Dev/vimo-cloud/          ← 개발 리포
├── app/                           ← Next.js App Router
│   ├── (auth)/login/
│   ├── (app)/files/
│   ├── (app)/share/[token]/
│   └── api/
│       ├── auth/[...nextauth]/
│       ├── files/
│       ├── upload/                ← tus endpoint
│       └── share/
├── components/
├── lib/
│   ├── db/schema.ts               ← Drizzle 스키마
│   ├── db/client.ts
│   └── fs/paths.ts                ← 실파일 경로 해석
├── drizzle/                        ← 마이그레이션
├── public/
├── data/
│   └── vimo-cloud.db              ← SQLite 파일 (dev)
└── tech-stack.md

실제 파일:
/Volumes/T5 EVO/Shared/            ← 아이맥 외장 SSD (prod)
├── .vimo-cloud/                   ← 시스템 메타 (썸네일, 임시 업로드)
├── users/{username}/              ← 개인 폴더
├── team/                          ← 팀 공용
└── projects/                      ← 프로젝트별
```

---

## 데이터 모델 (초안)

```typescript
// users
{
  id: string
  username: string         // 로그인 ID
  email: string
  name: string
  role: 'admin' | 'member'
  quotaGb: number          // 개인 폴더 쿼터
  createdAt: Date
  passwordHash: string
}

// files (메타데이터만, 실체는 파일시스템)
{
  id: string
  path: string             // 상대 경로 (/team/projects/A/...)
  name: string
  size: bigint
  mimeType: string
  ownerId: string
  parentId: string | null  // 폴더 계층
  isFolder: boolean
  createdAt: Date
  updatedAt: Date
  thumbPath: string | null // 썸네일 파일 경로
}

// share_links
{
  id: string
  token: string            // URL에 쓰는 랜덤 식별자
  fileId: string
  createdBy: string
  expiresAt: Date | null
  passwordHash: string | null
  downloadLimit: number | null
  downloadCount: number
  createdAt: Date
}

// activity_logs (Phase 2)
{
  id: string
  userId: string
  action: 'upload' | 'download' | 'delete' | 'share' | ...
  fileId: string | null
  metadata: json
  createdAt: Date
}
```

---

## 포트 / 도메인

| 환경 | URL | 포트 |
|---|---|---|
| 개발 (맥북) | http://localhost:4200 | 4200 |
| 스테이징 (아이맥 로컬) | http://vimo-imac:4200 | 4200 |
| 운영 (Cloudflare Tunnel) | https://cloud.vimo.* (TBD) | 443 → 4200 |

> 포트 4200 선정 이유: 기존 사용 포트(3000, 3100, 3200, 3500, 4000, 5050, 7777, 8080) 피함.

---

## 결정 보류 (사용자 답변 대기)

1. **도메인** — VIMO가 보유한 메인 도메인?
2. **접근 정책** — 인터넷 공개(Cloudflare Tunnel) vs Tailscale 내부만?
3. **초기 팀원 수** — Phase 1 타겟 인원
