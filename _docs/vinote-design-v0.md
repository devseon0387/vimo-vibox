# vinote — 비박스 글쓰기 전용 컴패니언 (Design v0)

작성: 2026-05-24
상태: 설계 확정, 구현 착수

---

## 1. 정체성

비노트 = **"열면 0.5초 안에 글이 써지는 도구"**.

- 비박스 = 회사 파일 보관소 (영상·큰 파일·공유 워크플로)
- 비노트 = 본인 글쓰기 (기획서·시나리오·블로그·회의록·일기·메모)

비박스는 노트도 보고 간단 수정 가능 (0.1.5 그대로). 진지한 글쓰기는 비노트에서.

**비노트가 일부러 안 하는 것**:
- 파일 매니저 (그건 비박스)
- 회사 협업/승인 워크플로
- 영상 댓글
- 대용량 업로드

## 2. 아키텍처 한 줄

```
note.vibox.cloud (port 4300)
    │
    ├─ 자체 Next.js 16 앱 (apps/vinote 또는 vibox 내 vinote/)
    ├─ 백엔드 = vibox API 호출 (cross-subdomain, cookie 공유)
    ├─ DB·Storage·Auth·Litestream = vibox 한 벌 그대로
    └─ PWA (v0.2부터)
```

## 3. 결정 사항 (확정)

| # | 결정 | 근거 |
|---|---|---|
| 1 | 리포 = vibox 모노레포 내 `vinote/` 서브디렉 | lib 공유 트리비얼, 마이그레이션 동시 적용, 배포 동기화 |
| 2 | 통신 = 비노트 → 비박스 API (HTTP) | 두 writer로 인한 SQLITE_BUSY 차단, CORS 한 번 설정으로 끝 |
| 3 | 에디터 출력 = Markdown | 비박스 0.1.5와 round-trip 호환, 파일 truth 유지 |
| 4 | 첫 화면 = 인박스 + 최근 + [+ 새 글] | 빈 화면 공포 < 컨텍스트 회복 가치 |
| 5 | AI = claude CLI | plick-novel 패턴 재사용, BYOK 별도 키 필요 X |
| 6 | 데이터 = `Notes/*.md` (truth) + DB 인덱스 (검색·이력) | 비박스 호환 0 손상, 검색은 FTS5 |
| 7 | 충돌 = mtime ETag (optimistic lock) | 1인 멀티디바이스에 충분, CRDT는 오버스펙 |
| 8 | 비박스 노트 = 유지 (보기/간단 수정) | 호환성, 비박스에서 빠른 수정 use case |

## 4. URL 구조

```
note.vibox.cloud
├─ /              인박스 + 최근 + [+ 새 글] (홈)
├─ /n/[id]        글 쓰기 화면
├─ /n/new         즉시 새 글
├─ /all           전체 노트 목록·트리
├─ /tag/[t]       태그별
├─ /search?q=     풀텍스트 검색 (Cmd+K)
├─ /history/[id]  버전 이력
└─ /settings      AI·단축키·테마·내보내기
```

## 5. 데이터 모델

기존: `Notes/{folder}/{slug}.md` (frontmatter + body)

**신규 테이블** (vibox DB에 추가):

```sql
CREATE TABLE IF NOT EXISTS note_index (
  path        TEXT PRIMARY KEY,
  title       TEXT,
  excerpt     TEXT,
  tags        TEXT,             -- JSON array
  folder      TEXT,
  word_count  INTEGER,
  modified_at INTEGER NOT NULL, -- mtime ms (ETag)
  indexed_at  INTEGER NOT NULL,
  starred     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_note_index_modified ON note_index(modified_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_index_folder   ON note_index(folder);

CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
  path UNINDEXED, title, body, content=''
);

CREATE TABLE IF NOT EXISTS note_versions (
  id        TEXT PRIMARY KEY,
  path      TEXT NOT NULL,
  body      TEXT NOT NULL,
  saved_at  INTEGER NOT NULL,
  saved_by  TEXT,
  reason    TEXT,               -- autosave | manual | conflict | restore
  bytes     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_note_versions_path_saved
  ON note_versions(path, saved_at DESC);
```

**원칙**: 파일이 master. DB 인덱스/이력은 보조. DB 날아가도 `/api/notes/v2/reindex`로 복구.

## 6. API (vibox에 추가, `/api/notes/v2/*` 네임스페이스)

기존 `/api/notes/*` (API token 기반)·`/api/dev/notes/*` (admin only)는 손대지 않고 새로.

| Method | Path | 인증 | 응답 |
|---|---|---|---|
| GET | `/api/notes/v2/list?folder&tag&starred&q&limit&cursor` | cookie | `{items: NoteSummary[], nextCursor?}` |
| GET | `/api/notes/v2/get?path` | cookie | `{path, body, meta, mtimeMs}` |
| POST | `/api/notes/v2/save` `{path, body, ifMatch?}` | cookie | `200 {mtimeMs}` 또는 `409 {serverBody, mtimeMs}` |
| POST | `/api/notes/v2/star` `{path, starred}` | cookie | `{ok}` |
| GET | `/api/notes/v2/versions?path&limit` | cookie | `{versions: Version[]}` |
| POST | `/api/notes/v2/restore` `{path, versionId}` | cookie | `{ok, mtimeMs}` |
| GET | `/api/notes/v2/search?q&limit` | cookie | `{hits: Hit[]}` (FTS5 bm25 + 스니펫) |
| GET | `/api/notes/v2/suggest?prefix&kind` | cookie | `{suggestions: string[]}` (title/tag/wikilink) |
| POST | `/api/notes/v2/reindex` | cookie + admin | `{indexed: N}` |

쓰기/이동/삭제는 기존 `/api/files` PATCH·DELETE 재사용.

## 7. 인증·통신

- `COOKIE_DOMAIN=.vibox.cloud` 이미 설정 → 비노트가 `vimo_session` 자동 수신
- CORS: `lib/auth/cors.ts SAME_ZONE_HOSTNAMES` 에 `note.vibox.cloud` 추가
- CSRF: 기존 `checkSameOrigin`이 `.vibox.cloud` 서브도메인 다 통과

## 8. 에디터

- 기반: TipTap 3.23 (비박스 0.1.5 동일, 재사용)
- 출력: Markdown (`tiptap-markdown` 사용)
- 블록: 단락 / H1~H4 / 인용 / 코드블록·인라인 / 리스트·체크박스 / 표 / 이미지 / 링크 / 구분선
- 특수: `[[제목]]` wiki-link, `#태그`
- 저장: 600ms 디바운스 + 강제 저장(`Cmd+S`)
- 충돌: `ifMatch: mtimeMs` → 409 diff 모달
- 버전: 자동저장 매번 X. `(5분 + 200자)` OR `Cmd+S` OR 충돌 해결 시
- 이미지: 비박스 storage 업로드 (`/api/files/upload` 재사용) → `/api/files?path=` URL

## 9. 단축키

| 키 | 동작 |
|---|---|
| `Cmd+N` | 새 글 |
| `Cmd+S` | 강제 저장 |
| `Cmd+K` | 빠른 검색·이동 |
| `Cmd+Shift+P` | 명령 팔레트 |
| `Cmd+/` | AI 어시스트 |
| `Cmd+.` | 집중 모드 |
| `Cmd+\` | 좌 사이드바 토글 |
| `Cmd+B/I/U` | 굵게/기울임/밑줄 |
| `Cmd+] / [` | 들여쓰기 |
| `[[` | 노트 링크 자동완성 |
| `#` (줄 시작) | 태그 자동완성 |
| `F11` | 풀스크린 |
| `Esc` | 패널 닫고 본문으로 |

## 10. 검색

- 저장 시 `note_fts` 자동 갱신
- cron 1시간마다 풀스캔 (vibox에서 파일 직접 수정 케이스 흡수)
- UI: 입력 즉시 결과, bm25 랭킹, 스니펫 하이라이트
- 필터: 폴더 / 태그 / 별표

## 11. 버전 이력

- 기록 조건: `(5분 + 200자)` OR `Cmd+S` OR 충돌 OR 복원
- Thinning: 최근 50개 + 7일/30일/3개월 단위 보존
- UI: 사이드 슬라이드 + diff + 복원 버튼

## 12. PWA (v0.2)

- Manifest: name=비노트, display=standalone, theme=off-white
- Service Worker:
  - 앱 셸: precache + cache-first
  - 노트 본문: cache-first + 백그라운드 stale-while-revalidate
  - 저장 큐: offline 시 IndexedDB → online 회복 자동 flush
  - 충돌: flush 중 ETag 불일치 → 모달
- 설치 프롬프트: 첫 방문 3분 후 노출
- 아이콘: 192/512px + favicon

## 13. 배포

| 항목 | 설정 |
|---|---|
| LaunchDaemon | `cloud.vinote.app` (port 4300) |
| Caddy | `note.vibox.cloud → :4300` |
| Litestream | vibox DB 잡 그대로 (별도 없음) |
| 빌드 | vibox deploy 스크립트에 vinote 빌드 단계 추가 |
| 리포 | vibox 모노레포 내 `vinote/` 서브디렉 |
| Node 의존성 | vinote는 자체 package.json (vibox lib는 안 import, HTTP만) |

## 14. 단계별 스코프

### v0.1 (2주) — 글쓰기 MVP
- [ ] vibox 마이그레이션: `note_index` / `note_fts` / `note_versions`
- [ ] vibox API: `/api/notes/v2/*` 9개
- [ ] vibox CORS: `note.vibox.cloud` 화이트리스트
- [ ] vinote 스캐폴드 (Next.js 16, port 4300)
- [ ] 홈 페이지 (인박스 + 최근 + 새 글)
- [ ] 편집 페이지 (TipTap + 자동저장 + ETag 충돌)
- [ ] 좌 사이드바 (인박스/최근/폴더/태그/별표)
- [ ] Cmd+K 퀵 스위처
- [ ] 검색 페이지 (FTS5)
- [ ] 집중 모드 + 풀스크린
- [ ] reindex 1회 실행 → 기존 노트 인덱싱

### v0.2 (1주) — PWA + 갤탭
- [ ] manifest + 아이콘
- [ ] Service Worker (precache + SWR + offline queue)
- [ ] AI (Cmd+/, claude CLI)
- [ ] 모바일/태블릿 터치 최적화
- [ ] 갤럭시탭에 설치 + 1주 실사용

### v0.3+ (검증 후)
- 버전 이력 UI
- [[wiki-link]] 자동완성 + 그래프
- AI 명령 팔레트
- 협업 (필요해지면)
- 네이티브 (PWA 한계 도달 시)

## 15. 리스크

| 리스크 | 가능성 | 영향 | 완화 |
|---|---|---|---|
| 두 앱 동시 writer SQLITE_BUSY | 중 | 중 | 비노트는 vibox API 통해서만 쓰기 (직접 DB writer X) |
| SW 옛 본문 캐시 | 중 | 중 | SWR + 강제 새로고침 단축키 |
| Offline 큐 flush 충돌 | 낮 | 중 | conflict 모달 |
| Galaxy Tab BT 키보드 단축키 동작 X | 중 | 중 | 1주 검증 후 fallback 키맵 |
| `note.vibox.cloud` cookie 미수신 | 낮 | 높 | 부팅 시 set-cookie 검증 스크립트 |
| TipTap markdown round-trip 손실 | 중 | 중 | fixture 테스트 (헤딩/리스트/표/wikilink) |
| Litestream 두 writer 못 견딤 | 낮 | 매우높 | reader-only 정책 + 모니터링 |

## 16. 비박스에서 진입점

비박스 헤더에 "비노트로 가기" 링크 (target=_blank). 작가가 글쓰기 모드 진입 시 1클릭.
