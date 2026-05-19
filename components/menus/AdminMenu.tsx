"use client";

import {
  Users,
  Link as LinkIcon,
  Building2,
  BarChart3,
  HardDrive,
  Trash2,
  ClipboardList,
  Key,
  Plug,
  Eye,
  Sparkles,
} from "lucide-react";
import { MenuShell, MenuSearch, MenuSection, MenuItem } from "./MenuShell";

export function AdminMenu() {
  return (
    <MenuShell title="관리">
      <MenuSearch placeholder="관리 항목 검색" />

      <MenuSection label="팀" />
      <MenuItem href="/admin/users" icon={Users} label="사용자" matchPrefix="/admin/users" />
      <MenuItem href="/shares" icon={LinkIcon} label="공유 링크" matchExact />
      <MenuItem href="/admin/share-intel" icon={Eye} label="공유 인텔리전스" matchPrefix="/admin/share-intel" />
      <MenuItem href="/admin/clients" icon={Building2} label="클라이언트" matchPrefix="/admin/clients" />

      <MenuSection label="시스템" />
      <MenuItem href="/admin/stats" icon={BarChart3} label="통계" matchPrefix="/admin/stats" />
      <MenuItem href="/admin/disks" icon={HardDrive} label="디스크" matchPrefix="/admin/disks" />
      <MenuItem href="/admin/storage" icon={HardDrive} label="저장소 점검" matchPrefix="/admin/storage" />
      <MenuItem href="/trash" icon={Trash2} label="휴지통 관리" matchExact />
      <MenuItem href="/admin/activity" icon={ClipboardList} label="활동 로그" matchPrefix="/admin/activity" />

      <MenuSection label="통합" />
      <MenuItem href="/admin/keys" icon={Key} label="API 키" matchPrefix="/admin/keys" />
      <MenuItem href="/admin/integrations" icon={Plug} label="SEON Hub 연동" matchPrefix="/admin/integrations" />

      <MenuSection label="앱" />
      <MenuItem href="/admin/updates" icon={Sparkles} label="업데이트" matchPrefix="/admin/updates" />
    </MenuShell>
  );
}
