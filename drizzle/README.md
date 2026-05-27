# Vibox 스키마 마이그레이션

이 폴더는 `drizzle-kit` 으로 생성한 SQL 마이그레이션 파일을 git 추적한다.
prod/local DB 의 모든 스키마 변경은 여기를 거친다 (수동 ALTER 금지).

## 워크플로

1. `lib/db/schema.ts` 수정 (테이블/컬럼 추가·변경)
2. `npx drizzle-kit generate --name <feature>` — `drizzle/NNNN_<feature>.sql` 생성
3. local 검증: `sqlite3 ./_data/vibox.db < drizzle/NNNN_<feature>.sql`
4. PR 에 SQL 파일 포함 → 머지
5. prod 배포: `ssh macmini "sqlite3 ~/vibox/_data/vibox.db < drizzle/NNNN_<feature>.sql"`

## 0000_baseline.sql

2026-05-26 시점 prod·local 동기 완료된 스키마 스냅샷.
이미 모든 테이블이 존재하므로 **신규 DB 에만 적용** (예: 새 데스크탑 dev 환경).
기존 prod/local 에 다시 실행하면 CREATE TABLE 충돌 — 절대 재실행 금지.

## 알려진 드리프트 히스토리 (2026-05-26 이전)

`scripts/migrate.sql` 이 raw SQL 마이그레이션을 누적 보관하던 레거시 — baseline 이후엔 drizzle/ 폴더로 일원화.

| 시점 | 변경 |
|---|---|
| 2026-05-24 | share_links.revoked_at, users.deactivated_at, note_index/note_versions/note_fts 추가 — local 만 적용 (prod 누락) |
| 2026-05-26 | prod 동기 적용 + drizzle/ baseline 시작 (이 문서) |
