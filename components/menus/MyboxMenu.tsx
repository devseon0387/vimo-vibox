"use client";

import { FolderOpen, Clock, Star, Trash2, Activity } from "lucide-react";
import { MenuShell, MenuSearch, MenuSection, MenuItem } from "./MenuShell";

export function MyboxMenu() {
  return (
    <MenuShell title="내 박스">
      <MenuSearch placeholder="내 파일 검색" />

      {/* 사용량 게이지 — 추후 server-side에서 실제 값 주입 */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between text-[11px] text-text-faint mb-1.5">
          <span>스토리지</span>
          <span>12.4 GB / 100 GB</span>
        </div>
        <div className="h-1 rounded-full bg-surface overflow-hidden">
          <div
            className="h-full bg-accent"
            style={{ width: "12.4%" }}
          />
        </div>
      </div>

      <MenuSection label="바로가기" />
      <MenuItem href="/my/box" icon={FolderOpen} label="모든 파일" matchExact />
      <MenuItem href="/my/box?recent=1" icon={Clock} label="최근" />
      <MenuItem href="/my/box?starred=1" icon={Star} label="즐겨찾기" />

      <MenuSection label="기록" />
      <MenuItem href="/my/stats" icon={Activity} label="내 기록" matchExact />

      <MenuSection label="기타" />
      <MenuItem href="/trash" icon={Trash2} label="휴지통" matchExact />
    </MenuShell>
  );
}
