"use client";

import {
  Inbox,
  Film,
  BookOpen,
  Star,
  Clock,
  Link as LinkIcon,
} from "lucide-react";
import { MenuShell, MenuSearch, MenuSection, MenuItem } from "./MenuShell";

export function HomeMenu() {
  return (
    <MenuShell title="홈">
      <MenuSearch />

      <MenuSection label="팀 작업" />
      <MenuItem
        href="/?path=/Rendering"
        icon={Film}
        label="렌더링 폴더"
        matchQueryPath="/Rendering"
      />
      <MenuItem
        href="/vimo-box/library"
        icon={BookOpen}
        label="자료실"
        matchPrefix="/vimo-box/library"
      />

      <MenuSection label="알림 / 인사이트" />
      <MenuItem href="/inbox" icon={Inbox} label="받은편지함" matchExact />
      <MenuItem href="/insights" icon={Star} label="검수 통계" matchExact />

      <MenuSection label="바로가기" />
      <MenuItem href="/shares" icon={LinkIcon} label="내 공유 링크" matchExact />
      <MenuItem href="/?path=/Rendering" icon={Clock} label="최근 본 파일" />
    </MenuShell>
  );
}
