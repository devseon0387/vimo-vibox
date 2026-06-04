"use client";

import { usePathname } from "next/navigation";
import { railFromPath } from "@/lib/rail";
import { HomeMenu } from "./HomeMenu";
import { MyboxMenu } from "./MyboxMenu";
import { TeamMenu } from "./TeamMenu";
import { ActivityMenu } from "./ActivityMenu";
import { AdminMenu } from "./AdminMenu";

/**
 * 현재 URL을 기준으로 적절한 컨텍스트 메뉴를 렌더.
 * Rail 액티브 상태와 1:1 매핑.
 */
export function MenuRouter({
  isAdmin,
  isPartner = false,
}: {
  isAdmin: boolean;
  isPartner?: boolean;
}) {
  const pathname = usePathname();
  const rail = railFromPath(pathname);

  // Admin 가드 — admin 아닌데 admin URL이면 home으로 fallback
  if (rail === "admin" && !isAdmin) {
    return <HomeMenu isPartner={isPartner} />;
  }
  // 파트너 가드 — 활동(받은편지함)은 내부 검수 큐라 파트너에게 노출 X
  if (rail === "activity" && isPartner) {
    return <HomeMenu isPartner />;
  }

  switch (rail) {
    case "mybox":
      return <MyboxMenu isPartner={isPartner} />;
    case "team":
      return <TeamMenu isPartner={isPartner} />;
    case "activity":
      return <ActivityMenu />;
    case "admin":
      return <AdminMenu />;
    case "home":
    default:
      return <HomeMenu isPartner={isPartner} />;
  }
}
