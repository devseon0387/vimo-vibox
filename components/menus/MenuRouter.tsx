"use client";

import { usePathname } from "next/navigation";
import { railFromPath } from "@/lib/rail";
import { HomeMenu } from "./HomeMenu";
import { DevMenu } from "./DevMenu";
import { MyboxMenu } from "./MyboxMenu";
import { AdminMenu } from "./AdminMenu";

/**
 * 현재 URL을 기준으로 적절한 컨텍스트 메뉴를 렌더.
 * Rail 액티브 상태와 1:1 매핑.
 */
export function MenuRouter({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const rail = railFromPath(pathname);

  // Admin 가드 — admin 아닌데 dev/admin URL이면 home으로 fallback (server에서도 차단 별도 필요)
  if ((rail === "dev" || rail === "admin") && !isAdmin) {
    return <HomeMenu />;
  }

  switch (rail) {
    case "dev":
      return <DevMenu />;
    case "mybox":
      return <MyboxMenu />;
    case "admin":
      return <AdminMenu />;
    case "home":
    default:
      return <HomeMenu />;
  }
}
