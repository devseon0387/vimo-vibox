import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { listDirectory, searchFiles } from "@/lib/fs/storage";
import { FilesPane } from "@/components/FilesPane";
import { SearchBar } from "@/components/SearchBar";
import { FileTable } from "@/components/FileTable";

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const query = sp.q?.trim() ?? "";
  const currentPath = sp.path && sp.path.startsWith("/") ? sp.path : "/";

  if (query) {
    // 검색 모드
    const results = await searchFiles(query);
    return (
      <div className="px-8 py-6 max-w-[1400px]">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center gap-1.5 text-[14px] text-text-muted">
            <Link href="/" className="hover:text-text transition-colors">
              VIMO Cloud
            </Link>
            <ChevronRight size={14} className="text-text-faint" strokeWidth={2} />
            <span className="text-text font-semibold">검색</span>
          </div>
          <SearchBar />
        </div>

        <div className="text-[13px] text-text-muted mb-5">
          &quot;<span className="font-semibold text-text">{query}</span>&quot; 검색 결과{" "}
          <span className="font-semibold">{results.length}개</span>
        </div>

        <FileTable entries={results} basePath={currentPath} />
      </div>
    );
  }

  const entries = await listDirectory(currentPath);
  const segments =
    currentPath === "/"
      ? []
      : currentPath.split("/").filter(Boolean);

  return (
    <div className="px-8 py-6 max-w-[1400px]">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center gap-1.5 text-[14px] text-text-muted">
          <Link href="/" className="hover:text-text transition-colors">
            VIMO Cloud
          </Link>
          {segments.map((seg, i) => {
            const href =
              "/?path=" + encodeURIComponent("/" + segments.slice(0, i + 1).join("/"));
            const isLast = i === segments.length - 1;
            return (
              <span key={i} className="flex items-center gap-1.5">
                <ChevronRight size={14} className="text-text-faint" strokeWidth={2} />
                {isLast ? (
                  <span className="text-text font-semibold">{seg}</span>
                ) : (
                  <Link href={href} className="hover:text-text transition-colors">
                    {seg}
                  </Link>
                )}
              </span>
            );
          })}
        </div>

        <SearchBar />
      </div>

      <FilesPane entries={entries} currentPath={currentPath} />
    </div>
  );
}
