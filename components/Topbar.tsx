import { Search, ChevronRight } from "lucide-react";

export function Topbar({
  breadcrumb,
  current,
}: {
  breadcrumb?: string[];
  current: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="flex items-center gap-1.5 text-[14px] text-text-muted">
        {breadcrumb?.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span>{crumb}</span>
            <ChevronRight size={14} className="text-text-faint" strokeWidth={2} />
          </span>
        ))}
        <span className="text-text font-semibold">{current}</span>
      </div>

      <div className="relative flex-1 max-w-[360px] ml-auto">
        <Search
          size={14}
          strokeWidth={2.2}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint"
        />
        <input
          placeholder="파일 검색..."
          className="w-full pl-9 pr-3 py-1.5 border border-border rounded-md text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all bg-white"
        />
      </div>
    </div>
  );
}
