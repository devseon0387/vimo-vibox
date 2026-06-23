import { redirect } from "next/navigation";
import path from "node:path";
import Link from "next/link";
import { ChevronRight, Package } from "lucide-react";
import { getCurrentSession } from "@/lib/auth/session";
import { listDirectory, ensureDir, type FileEntry } from "@/lib/fs/storage";
import { getPersonalUsage } from "@/lib/fs/usage";
import { getPartnerPanelData } from "@/lib/dashboard/queries";
import { FilesPane } from "@/components/FilesPane";
import { PartnerContextPanel } from "@/components/PartnerContextPanel";
import { QuotaBar } from "@/components/QuotaBar";

// My Box — 개인 드라이브 (드롭박스 스타일, 피드백·주석 없음).
// 표준 FilesPane 으로 렌더해 드래그 이동·폴더 공유·미리보기를 그대로 얻되,
// 내부는 FULL 경로(/personal/{userId}/...)지만 displayPrefix 로 사용자에겐 prefix 를 가린다.
export const dynamic = "force-dynamic";

export default async function MyBoxPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login?from=/my/box");

  const sp = await searchParams;
  let relPath = sp.path && sp.path.startsWith("/") ? sp.path : "/";

  const prefix = `/personal/${session.sub}`;
  // traversal/박스밖 방어: prefix + relPath 를 정규화해 본인 드라이브 하위가 아니면
  // 본인 루트로 클램프한다. RSC 는 /api/files 의 personal 게이트를 우회해 listDirectory 를
  // 직접 부르므로, `?path=/../{타인ID}`(normalize 시 `/personal/{타인ID}`)로 남의 드라이브가
  // 새지 않게 막아야 한다. (redirect 는 layout 스트리밍 시 200 으로 처리돼 불안정 → 클램프)
  let fullPath = path.posix.normalize(
    relPath === "/" ? prefix : prefix + relPath,
  );
  if (fullPath !== prefix && !fullPath.startsWith(prefix + "/")) {
    fullPath = prefix;
    relPath = "/";
  }

  // 신규 유저 개인 루트 자동 생성. 없는 하위 경로는 빈 목록으로(에러 페이지 대신).
  try {
    await ensureDir(prefix);
  } catch {}
  let entries: FileEntry[];
  try {
    entries = await listDirectory(fullPath);
  } catch {
    entries = [];
  }

  const usage = await getPersonalUsage(session.sub);
  const segments = relPath === "/" ? [] : relPath.split("/").filter(Boolean);
  const sessionInfo = {
    id: session.sub,
    isAdmin: session.role === "admin",
    canSeeHealth: false,
  };
  const userName = session.name ?? session.username;
  // 폴더 내비 패널용 데이터 (My box 폴더 트리)
  const panelData = await getPartnerPanelData(session.sub);

  return (
    <div className="md:flex md:items-start">
      {/* 드롭박스식 폴더 사이드메뉴 (즐겨찾기 + 트리) — My box 전용 두 번째 패널 */}
      <PartnerContextPanel data={panelData} />
      <div className="flex-1 min-w-0 px-4 md:px-8 py-4 md:py-6 max-w-[1400px]">
      {/* 브레드크럼 — 상대경로(prefix 가림), 루트 = My Box */}
      <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-3 overflow-x-auto">
        <Package size={14} className="text-slate-400 shrink-0" strokeWidth={2} />
        <Link
          href="/my/box"
          className="hover:text-slate-900 transition-colors shrink-0"
        >
          My Box
        </Link>
        {segments.map((seg, i) => {
          const href =
            "/my/box?path=" +
            encodeURIComponent("/" + segments.slice(0, i + 1).join("/"));
          const isLast = i === segments.length - 1;
          return (
            <span key={i} className="flex items-center gap-1.5 shrink-0">
              <ChevronRight
                size={13}
                className="text-slate-300"
                strokeWidth={2}
              />
              {isLast ? (
                <span className="text-slate-900 font-medium truncate max-w-[200px]">
                  {seg}
                </span>
              ) : (
                <Link
                  href={href}
                  className="hover:text-slate-900 transition-colors truncate max-w-[120px]"
                >
                  {seg}
                </Link>
              )}
            </span>
          );
        })}
      </div>

      {/* 헤더 — 업로드·새 폴더 버튼은 FilesPane 의 ActionBar 가 제공 */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">
          {segments.length === 0 ? "My Box" : segments[segments.length - 1]}
        </h1>
        <div className="text-xs text-slate-400 mt-0.5">
          {userName}님의 개인 드라이브
        </div>
      </div>

      <QuotaBar usage={usage} />

      <FilesPane
        entries={entries}
        currentPath={fullPath}
        displayPrefix={prefix}
        session={sessionInfo}
      />
      </div>
    </div>
  );
}
