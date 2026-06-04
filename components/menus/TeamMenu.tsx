"use client";

import { Users, Film, BookOpen } from "lucide-react";
import { MenuShell, MenuSearch, MenuSection, MenuItem } from "./MenuShell";

/**
 * 비모 프로젝트 컨텍스트 메뉴 — 팀 공유 폴더에 집중.
 * 받은편지함·검수 통계·공유 링크 등 작업 반응은 Rail "활동" 컨텍스트 (ActivityMenu)로 일원화.
 */
export function TeamMenu({ isPartner = false }: { isPartner?: boolean }) {
  // 파트너(외부 편집자)는 본인이 납품하는 공간만. 내부 영역(렌더링·자료실) 숨김.
  if (isPartner) {
    return (
      <MenuShell title="비모">
        <MenuSearch placeholder="내 작업물 검색" />

        <MenuSection label="공유 폴더" />
        <MenuItem href="/team" icon={Users} label="납품한 작업물" />
      </MenuShell>
    );
  }

  return (
    <MenuShell title="비모 프로젝트">
      <MenuSearch placeholder="비모 파일 검색" />

      <MenuSection label="공유 폴더" />
      <MenuItem href="/team" icon={Users} label="팀 전체" />
      <MenuItem
        href="/team?path=/Rendering"
        icon={Film}
        label="렌더링"
        matchQueryPath="/Rendering"
      />
      <MenuItem href="/vimo-box/library" icon={BookOpen} label="자료실" matchPrefix="/vimo-box/library" />
    </MenuShell>
  );
}
