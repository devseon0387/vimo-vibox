import { getCurrentSession } from "@/lib/auth/session";
import { Sidebar } from "@/components/Sidebar";
import { AppShell } from "@/components/AppShell";
import { PartnerShell } from "@/components/PartnerShell";
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
  // - 파트너(외부 편집자): 사이드바 없는 미니멀 상단바(PartnerShell). 공간 전환은 홈 본문 두 탭이 담당.
  // - 매니저(admin/member)·일반: 좌측 사이드바(Rail + 컨텍스트 메뉴) 유지.
  const session = await getCurrentSession();
  const isPartner = session?.role === "partner";

  return (
    <UploadProvider>
      {isPartner ? (
        <PartnerShell
          userName={session?.name ?? session?.username ?? ""}
          initials={(session?.name ?? session?.username ?? "?").slice(0, 2).toUpperCase()}
        >
          {children}
        </PartnerShell>
      ) : (
        <AppShell sidebar={<Sidebar />}>{children}</AppShell>
      )}
      <GlobalUploadDock />
    </UploadProvider>
  );
}
