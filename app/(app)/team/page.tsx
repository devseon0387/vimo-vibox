import Link from "next/link";
import { inArray } from "drizzle-orm";
import { ChevronRight, Users } from "lucide-react";
import { listDirectory, searchFiles } from "@/lib/fs/storage";
import { FilesPane } from "@/components/FilesPane";
import { SearchBar } from "@/components/SearchBar";
import { getCurrentSession } from "@/lib/auth/session";
import { getFileStats } from "@/lib/db/file-stats";
import { db } from "@/lib/db/client";
import { fileUploads } from "@/lib/db/schema";

/**
 * 비모 프로젝트 (팀 공유 영역) 루트.
 * 기존 / 페이지의 listDirectory + 검색 + partner 필터 로직을 그대로 이전.
 * /team?path=/Rendering 같은 형태로 폴더 진입.
 */
export const dynamic = "force-dynamic";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const query = sp.q?.trim() ?? "";
  const currentPath = sp.path && sp.path.startsWith("/") ? sp.path : "/";
  const session = await getCurrentSession();
  const sessionInfo = session
    ? {
        id: session.sub,
        isAdmin: session.role === "admin",
        canSeeHealth: session.role === "admin" || session.role === "member",
      }
    : { id: "", isAdmin: false, canSeeHealth: false };

  if (query) {
    const results = await searchFiles(query);
    return (
      <div className="px-4 md:px-8 py-4 md:py-6 max-w-[1400px]">
        <div className="flex items-center gap-1.5 text-sm text-text-muted mb-3">
          <Link href="/team" className="hover:text-text transition-colors">
            비모 프로젝트
          </Link>
          <ChevronRight size={13} className="text-text-faint" strokeWidth={2} />
          <span className="text-text font-medium">검색</span>
        </div>

        <div className="flex items-start md:items-center justify-between gap-3 flex-col md:flex-row mb-5">
          <h1 className="text-2xl font-bold">
            &quot;{query}&quot; 검색 결과{" "}
            <span className="text-text-faint font-medium text-lg">
              {results.length}개
            </span>
          </h1>
          <div className="hidden md:block md:flex-1 md:max-w-[360px] md:ml-auto">
            <SearchBar />
          </div>
        </div>

        {results.length === 0 ? (
          <div className="border-2 border-dashed border-border rounded-xl p-12 text-center bg-white">
            <div className="text-md text-text-muted mb-1">
              일치하는 파일이 없어요
            </div>
            <div className="text-sm text-text-faint">
              검색어를 다른 표현으로 바꿔보거나 ⌘K 로 댓글·공유 링크까지 검색해보세요
            </div>
          </div>
        ) : (
          <FilesPane
            entries={results}
            currentPath="/"
            session={sessionInfo}
          />
        )}
      </div>
    );
  }

  let entries = await listDirectory(currentPath);

  // partner 권한: 본인이 업로드한 파일만 보임
  if (session?.role === "partner") {
    const filePaths = entries.filter((e) => !e.isFolder).map((e) => e.path);
    let ownedSet = new Set<string>();
    if (filePaths.length > 0) {
      const owned = await db
        .select({ path: fileUploads.path, uploadedBy: fileUploads.uploadedBy })
        .from(fileUploads)
        .where(inArray(fileUploads.path, filePaths));
      ownedSet = new Set(
        owned.filter((o) => o.uploadedBy === session.sub).map((o) => o.path),
      );
    }
    entries = entries.filter((e) => e.isFolder || ownedSet.has(e.path));
  }

  const videoPaths = entries.filter((e) => !e.isFolder).map((e) => e.path);
  const statsMap = await getFileStats(videoPaths);
  const stats: Record<
    string,
    { commentCount: number; openCount: number; uploaderName?: string | null }
  > = {};
  for (const [p, s] of statsMap) stats[p] = s;
  const allSegments =
    currentPath === "/" ? [] : currentPath.split("/").filter(Boolean);
  const isRenderingTree =
    allSegments.length >= 1 && allSegments[0] === "Rendering";
  const segments = allSegments;
  const currentName = (() => {
    if (segments.length === 0) return "비모 프로젝트";
    if (isRenderingTree && segments.length === 1) return "렌더링";
    return segments[segments.length - 1];
  })();

  return (
    <div className="px-4 md:px-8 py-4 md:py-6 max-w-[1400px]">
      {segments.length > 0 && !(isRenderingTree && segments.length === 1) && (
        <div className="flex items-center gap-1.5 text-sm text-text-muted mb-3 overflow-x-auto">
          {!isRenderingTree && (
            <Link href="/team" className="hover:text-text transition-colors shrink-0">
              비모 프로젝트
            </Link>
          )}
          {segments.map((seg, i) => {
            const href =
              "/team?path=" + encodeURIComponent("/" + segments.slice(0, i + 1).join("/"));
            const isLast = i === segments.length - 1;
            const displaySeg = isRenderingTree && i === 0 ? "렌더링" : seg;
            const showSeparator = i > 0 || !isRenderingTree;
            return (
              <span key={i} className="flex items-center gap-1.5 shrink-0">
                {showSeparator && (
                  <ChevronRight size={13} className="text-text-faint" strokeWidth={2} />
                )}
                {isLast ? (
                  <span className="text-text font-medium truncate max-w-[200px]">{displaySeg}</span>
                ) : (
                  <Link
                    href={href}
                    className="hover:text-text transition-colors truncate max-w-[120px]"
                  >
                    {displaySeg}
                  </Link>
                )}
              </span>
            );
          })}
        </div>
      )}

      <div className="flex items-start md:items-center justify-between gap-3 flex-col md:flex-row mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="w-1 h-6 rounded-sm shrink-0"
            style={{ background: "var(--team-color)" }}
            aria-hidden
          />
          <h1 className="text-2xl font-bold truncate">{currentName}</h1>
          <span
            className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-text-faint shrink-0"
            title="비모 프로젝트 공간"
          >
            <Users size={12} strokeWidth={2.2} />
            비모
          </span>
        </div>
        <div className="hidden md:block md:flex-1 md:max-w-[360px] md:ml-auto">
          <SearchBar />
        </div>
      </div>

      <FilesPane
        entries={entries}
        currentPath={currentPath}
        session={sessionInfo}
        stats={stats}
      />
    </div>
  );
}
