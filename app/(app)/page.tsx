import Link from "next/link";
import { inArray } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import { listDirectory, searchFiles } from "@/lib/fs/storage";
import { FilesPane } from "@/components/FilesPane";
import { SearchBar } from "@/components/SearchBar";
import { WelcomeCard } from "@/components/WelcomeCard";
import { getCurrentSession } from "@/lib/auth/session";
import { getFileStats } from "@/lib/db/file-stats";
import { db } from "@/lib/db/client";
import { fileUploads } from "@/lib/db/schema";

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const query = sp.q?.trim() ?? "";
  const currentPath = sp.path && sp.path.startsWith("/") ? sp.path : "/";
  const session = await getCurrentSession();
  const sessionInfo = session
    ? { id: session.sub, isAdmin: session.role === "admin" }
    : { id: "", isAdmin: false };

  if (query) {
    const results = await searchFiles(query);
    return (
      <div className="px-4 md:px-8 py-4 md:py-6 max-w-[1400px]">
        <div className="flex items-center gap-1.5 text-[12.5px] text-text-muted mb-3">
          <Link href="/" className="hover:text-text transition-colors">
            파일
          </Link>
          <ChevronRight size={13} className="text-text-faint" strokeWidth={2} />
          <span className="text-text font-medium">검색</span>
        </div>

        <div className="flex items-start md:items-center justify-between gap-3 flex-col md:flex-row mb-5">
          <h1 className="text-[22px] font-bold">
            &quot;{query}&quot; 검색 결과{" "}
            <span className="text-text-faint font-medium text-[16px]">
              {results.length}개
            </span>
          </h1>
          <SearchBar />
        </div>

        {results.length === 0 ? (
          <div className="border-2 border-dashed border-border rounded-xl p-12 text-center bg-white">
            <div className="text-[14px] text-text-muted mb-1">
              일치하는 파일이 없어요
            </div>
            <div className="text-[12px] text-text-faint">
              검색어를 다른 표현으로 바꿔보거나 ⌘K 로 댓글·공유 링크까지 검색해보세요
            </div>
          </div>
        ) : (
          // 검색 결과도 FilesPane 으로 — ActionBar(업로드)·정렬·다중 선택·뷰 토글 모두 살아있음.
          // 업로드 시엔 currentPath('/')를 기본으로. 사용자는 결과 클릭으로 실제 폴더에 진입할 수 있음.
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

  // partner 권한: 본인이 업로드한 파일만 보임 (폴더는 그대로 노출 — 진입은 가능, 안에서 다시 필터됨)
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
  const stats: Record<string, { commentCount: number; openCount: number }> = {};
  for (const [p, s] of statsMap) stats[p] = s;
  const segments =
    currentPath === "/" ? [] : currentPath.split("/").filter(Boolean);
  const currentName = segments.length === 0 ? "파일" : segments[segments.length - 1];

  return (
    <div className="px-4 md:px-8 py-4 md:py-6 max-w-[1400px]">
      {segments.length > 0 && (
        <div className="flex items-center gap-1.5 text-[12.5px] text-text-muted mb-3 overflow-x-auto">
          <Link href="/" className="hover:text-text transition-colors shrink-0">
            파일
          </Link>
          {segments.map((seg, i) => {
            const href =
              "/?path=" + encodeURIComponent("/" + segments.slice(0, i + 1).join("/"));
            const isLast = i === segments.length - 1;
            return (
              <span key={i} className="flex items-center gap-1.5 shrink-0">
                <ChevronRight size={13} className="text-text-faint" strokeWidth={2} />
                {isLast ? (
                  <span className="text-text font-medium truncate max-w-[200px]">{seg}</span>
                ) : (
                  <Link
                    href={href}
                    className="hover:text-text transition-colors truncate max-w-[120px]"
                  >
                    {seg}
                  </Link>
                )}
              </span>
            );
          })}
        </div>
      )}

      <div className="flex items-start md:items-center justify-between gap-3 flex-col md:flex-row mb-5">
        <h1 className="text-[22px] font-bold truncate">{currentName}</h1>
        <SearchBar />
      </div>

      {currentPath === "/" && <WelcomeCard name={session?.name ?? null} />}

      <FilesPane
        entries={entries}
        currentPath={currentPath}
        session={sessionInfo}
        stats={stats}
      />
    </div>
  );
}
