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
export function MenuRouter({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const rail = railFromPath(pathname);

  // Admin 가드 — admin 아닌데 admin URL이면 home으로 fallback
  if (rail === "admin" && !isAdmin) {
    return <HomeMenu />;
  }

  switch (rail) {
    case "mybox":
      return <MyboxMenu />;
    case "team":
      return <TeamMenu />;
    case "activity":
      return <ActivityMenu />;
    case "admin":
      return <AdminMenu />;
    case "home":
    default:
      return <HomeMenu />;
  }
}
