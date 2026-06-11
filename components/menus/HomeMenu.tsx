"use client";

import {
  LayoutDashboard,
  Upload,
  Link as LinkIcon,
  Package,
  Users,
  Film,
  BookOpen,
  Activity,
  Trash2,
} from "lucide-react";
import { MenuSection, MenuItem } from "./MenuShell";

/**
 * 홈(대시보드) 컨텍스트 메뉴 — 두 공간(My box · 비모 프로젝트) 명시.
 * 업로더 시점: 1순위는 "바로가기"(홈·올리기·내 공유), 그 다음 두 공간 섹션.
 *
 * 파트너(외부 편집자)는 내부 영역(렌더링·자료실·내 기록·휴지통·받은편지함)을 숨기고,
 * 본인이 쓰는 것만 — 대시보드·내 공유 링크 / 내 보관함 / 비모 납품. PartnerHome 두 공간 모델과 일치.
 */
export function HomeMenu({ isPartner = false }: { isPartner?: boolean }) {
  if (isPartner) {
    return (
      <>
        <MenuSection label="바로가기" />
        <MenuItem href="/" icon={LayoutDashboard} label="대시보드" matchExact />
        <MenuItem href="/shares" icon={LinkIcon} label="내 공유 링크" matchExact />

        <MenuSection label="내 보관함" />
        <MenuItem href="/my/box" icon={Package} label="모든 파일" matchPrefix="/my/box" />

        <MenuSection label="비모" />
        <MenuItem
          href="/team?path=/Rendering"
          icon={Users}
          label="납품한 작업물"
          matchQueryPath="/Rendering"
        />
      </>
    );
  }

  return (
    <>
      <MenuSection label="바로가기" />
      <MenuItem href="/" icon={LayoutDashboard} label="대시보드" matchExact />
      <MenuItem href="/?upload=1" icon={Upload} label="새로 올리기" />
      <MenuItem href="/shares" icon={LinkIcon} label="내 공유 링크" matchExact />

      <MenuSection label="My box" />
      <MenuItem href="/my/box" icon={Package} label="모든 파일" matchPrefix="/my/box" />
      <MenuItem href="/my/stats" icon={Activity} label="내 기록" matchExact />

      <MenuSection label="비모 프로젝트" />
      <MenuItem href="/team" icon={Users} label="팀 전체" matchExact />
      <MenuItem href="/team?path=/Rendering" icon={Film} label="렌더링" />
      <MenuItem href="/vimo-box/library" icon={BookOpen} label="자료실" matchPrefix="/vimo-box/library" />

      <MenuSection label="기타" />
      <MenuItem href="/trash" icon={Trash2} label="휴지통" matchExact />
    </>
  );
}
