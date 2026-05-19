/**
 * 비박스 changelog (수동 갱신).
 *
 * 매 배포 전:
 *   1. lib/version.ts 의 APP_VERSION + APP_LAST_UPDATED 갱신
 *   2. 본 파일 상단(가장 최신 위)에 새 entry 추가
 *
 * 비모 ERP와 동일한 톤. type별 배지, 펼쳐서 상세 항목.
 */

export type UpdateType = "feature" | "fix" | "improvement" | "breaking";

export type ChangelogEntry = {
  id: string; // sortable + unique (timestamp-ish or version)
  version: string; // "v0.1.0"
  date: string; // "2026-05-02"
  title: string; // 한 줄 제목
  description: string; // 1~2 문장 요약
  type: UpdateType;
  /** 펼쳤을 때 보일 상세 — features / fixes 두 그룹으로 나눠 보여줌 */
  features?: string[];
  fixes?: string[];
  /** 단일 그룹으로 묶은 raw 항목 (features/fixes 안 쓸 때) */
  details?: string[];
};

/**
 * 최신순(맨 위가 가장 최근).
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    id: "20260503-0.1.4",
    version: "v0.1.4",
    date: "2026-05-03",
    title: "Hydration mismatch 수정 (수정일 표시)",
    description:
      "서버(UTC) vs 클라(KST) timezone 차이로 '오늘'/'어제' 판정이 갈리며 hydration error 발생하던 문제 해결. SSR은 절대 날짜로 통일.",
    type: "fix",
    fixes: [
      "TimeCell 신규 — SSR은 항상 절대 날짜('5월 1일'), 클라 mount 후 상대 표기('오늘 14:22', '어제')로 swap",
      "FileTable / FileCardGrid — formatTime 직접 호출을 <TimeCell ms=...>로 교체",
    ],
  },
  {
    id: "20260503-0.1.3",
    version: "v0.1.3",
    date: "2026-05-03",
    title: "StatusBar admin 전용으로 전환",
    description:
      "하단 상태바(항목 카운트·시스템 상태·단축키 힌트)는 매니저/파트너에겐 거슬려서 admin 전용으로 변경.",
    type: "improvement",
    fixes: [
      "FilesPane — session.isAdmin 가드 추가, StatusBar는 admin 사용자만 노출",
      "매니저(member) / 파트너에겐 깨끗한 화면",
    ],
  },
  {
    id: "20260503-0.1.2",
    version: "v0.1.2",
    date: "2026-05-03",
    title: "사이드바 고정 (스크롤 분리)",
    description:
      "왼쪽 사이드바가 메인 콘텐츠와 함께 스크롤되던 문제 수정. 데스크톱에선 사이드바 viewport 높이 고정 + 메인만 자체 스크롤.",
    type: "fix",
    fixes: [
      "AppShell — md:flex에 md:h-screen md:overflow-hidden 적용, sidebar는 md:relative md:h-screen 고정",
      "main에 md:overflow-y-auto md:h-screen — 내용이 길어지면 main만 스크롤",
      "기존 md:sticky 방식이 flex-stretched item에서 잘 안 동작하던 문제 해결",
      "모바일 drawer 동작은 기존과 동일 (fixed inset-y-0 + translate-x)",
    ],
  },
  {
    id: "20260502-0.1.1",
    version: "v0.1.1",
    date: "2026-05-02",
    title: "애니메이션 자연스러움 보강 + 단축키 도움말 갱신",
    description:
      "Modal/Backdrop close 페이드, ContextMenu 등장 scale, DropZone 드래그 진입/이탈 fade, ShortcutHelp에 새 단축키 추가.",
    type: "improvement",
    features: [
      "Modal close 애니메이션 — dialog-out + backdrop-out (200ms cubic-bezier ease-in)",
      "ContextMenu 등장 — scale(0.94→1) + opacity, 100ms cubic-bezier(0.16, 1, 0.3, 1), transform-origin 좌상단",
      "DropZone fade in/out — 드래그 진입/이탈 시 150ms 부드럽게",
      "ShortcutHelp 갱신 — 파일 네비게이션(↑↓←→/Home/End/Enter/Space), 파일 작업(F2/Delete/⌫/⌘A/Shift+클릭/⌘+클릭), Quick Look(←→/Space/Esc) 섹션 추가",
    ],
  },
  {
    id: "20260502-0.1.0",
    version: "v0.1.0",
    date: "2026-05-02",
    title: "UX 대규모 개편 + 운영 머신 Mac mini 이전",
    description:
      "키보드 네비게이션, Quick Look 미리보기, Squish & Pop 토스트, 컨텍스트 메뉴, EmptyState/StatusBar/Skeleton 신설. iMac → Mac mini 운영 이전 완료.",
    type: "feature",
    features: [
      "키보드 네비게이션 — ↑↓ focus, Enter open, Space 미리보기, F2 이름변경, ⌫ 삭제, Home/End. 그리드는 ←→로 컬럼 이동",
      "Quick Look 미리보기 — Space로 모달, ←→로 previewable 항목 사이 순회, Esc/Space로 닫기 (macOS Finder UX)",
      "Squish & Pop 토스트 — white pill 디자인, 풍선처럼 부풀어 오르는 spring 애니메이션 (cubic-bezier overshoot)",
      "우클릭 컨텍스트 메뉴 — macOS compact 스타일, 키보드 ↑↓+Enter 지원, viewport 클램프, 단축키 hint",
      "EmptyState (Mockup C) — 큰 dropzone + 폴더 추천 chip (미팅 자료/촬영 원본/참고) + 새 폴더 prompt",
      "Status Bar (Mockup B) — 항목 카운트, 단축키 힌트, admin/member에겐 Litestream/디스크/미러 백업 상태",
      "Loading skeleton — shimmer 애니메이션, app/(app)/loading.tsx로 페이지 전환 시 자동 표시",
      "사이드바 하단 버전 표시 — VIBOX v0.1.0 · 2026.05.02 (비모 ERP 톤 통일)",
      "관리 > 업데이트 메뉴 — changelog 페이지 신설",
      "운영 머신 이전 — iMac → Mac mini, vibox.cloud는 CF Tunnel로 변동 없이 유지",
      "deploy.sh — Mac mini용 SSH alias + node@22 LTS PATH + 롤백 스냅샷 자동화",
    ],
    fixes: [
      "키보드 핸들러 stale array 버그 — rename 후 잘못된 entries 참조하던 문제 (deps에 rows/entries 추가)",
      "EmptyState dropzone 어포던스 거짓 — cursor-pointer만 있고 onClick 없던 문제 (FilesPane hidden picker 연결)",
      "Member 역할이 health 정보 못 보던 문제 — canSeeHealth를 admin OR member로 분기",
      "ContextMenu viewport 클램프 한 번도 안 일어나던 문제 — mounted 게이트 제거",
      "ContextMenu 매 부모 렌더마다 listener 재등록 — itemsRef + activeRef로 안정화",
      "Toast cleanup에서 :remove 타이머 키 leak — Map에서 함께 제거",
      "PreviewModal navigation — entries + onNavigate prop, footer kbd hint, 카운터",
      "StatusBar fetch에 AbortController — 페이지 이동 시 in-flight 요청 중단",
      "Node v25 → v22 LTS — Next.js 16 + better-sqlite3 ABI 호환",
    ],
  },
];

/** 가장 최신 entry */
export function latestChange(): ChangelogEntry | null {
  return CHANGELOG[0] ?? null;
}
