"use client";

import { Inbox, Eye, BarChart3, Link as LinkIcon } from "lucide-react";
import { MenuSection, MenuItem } from "./MenuShell";

/**
 * 활동 컨텍스트 — 업로더의 작업 반응 + 매니저 검수 작업을 한 곳에.
 * 받은편지함·검수 통계는 여기에만 노출 (TeamMenu에서 제거).
 * /inbox 는 새 코멘트 + 검수 대기를 함께 보여주므로 별도 "새 코멘트" 항목 X.
 */
export function ActivityMenu() {
  return (
    <>
      <MenuSection label="내 작업 반응" />
      <MenuItem href="/shares" icon={LinkIcon} label="내 공유 링크" />
      <MenuItem href="/insights" icon={Eye} label="공유 조회" />

      <MenuSection label="매니저" />
      <MenuItem href="/inbox" icon={Inbox} label="받은편지함" />
      <MenuItem href="/insights" icon={BarChart3} label="검수 통계" />
    </>
  );
}
