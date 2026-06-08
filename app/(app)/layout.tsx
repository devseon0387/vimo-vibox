import { getCurrentSession } from "@/lib/auth/session";
import { Sidebar } from "@/components/Sidebar";
import { AppShell } from "@/components/AppShell";
import { PartnerSidebar } from "@/components/PartnerSidebar";
import { UploadProvider } from "@/lib/upload-store";
import { GlobalUploadDock } from "@/components/GlobalUploadDock";

// 인증 보호 + 동적 검색/경로 상태 사용 → 프리렌더 대상 아님
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 셸을 역할로 분기한다.
  // - 파트너(외부 편집자): AppShell + PartnerSidebar(세그먼트 사이드바). 모바일은 Bell·활동탭 숨김(isPartner).
  // - 매니저(admin/member)·일반: AppShell + Sidebar(SegmentSidebar).
  const session = await getCurrentSession();
  const isPartner = session?.role === "partner";

  return (
    <UploadProvider>
      {isPartner ? (
        <AppShell
          isPartner
          sidebar={
            <PartnerSidebar
              userName={session?.name ?? session?.username ?? ""}
              initials={(session?.name ?? session?.username ?? "?").slice(0, 2).toUpperCase()}
            />
          }
        >
          {children}
        </AppShell>
      ) : (
        <AppShell sidebar={<Sidebar />}>{children}</AppShell>
      )}
      <GlobalUploadDock />
    </UploadProvider>
  );
}
