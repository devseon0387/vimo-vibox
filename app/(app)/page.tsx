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
          <div className="border border-dashed border-border rounded-lg p-12 text-center">
            <div className="text-[14px] text-text-muted">
              일치하는 파일이 없어요
            </div>
          </div>
        ) : (
          <FileTable entries={results} basePath={currentPath} />
        )}
      </div>
    );
  }

  const entries = await listDirectory(currentPath);
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

      <FilesPane entries={entries} currentPath={currentPath} />
    </div>
  );
}
