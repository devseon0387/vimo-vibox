import { Sidebar } from "@/components/Sidebar";
import { AppShell } from "@/components/AppShell";
import { UploadProvider } from "@/lib/upload-store";
import { GlobalUploadDock } from "@/components/GlobalUploadDock";

// 인증 보호 + 동적 검색/경로 상태 사용 → 프리렌더 대상 아님
export const dynamic = "force-dynamic";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UploadProvider>
      <AppShell sidebar={<Sidebar />}>{children}</AppShell>
      <GlobalUploadDock />
    </UploadProvider>
  );
}
