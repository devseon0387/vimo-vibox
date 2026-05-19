"use client";

const SHIMMER_STYLE = {
  background:
    "linear-gradient(90deg, var(--surface) 0%, #e7e5e4 50%, var(--surface) 100%)",
  backgroundSize: "200% 100%",
  animation: "vibox-shimmer 1.5s ease-in-out infinite",
} as const;

function Bar({
  className = "",
  width,
  height = 12,
}: {
  className?: string;
  width?: string;
  height?: number;
}) {
  return (
    <div
      className={`rounded-[4px] ${className}`}
      style={{ ...SHIMMER_STYLE, width, height }}
    />
  );
}

/** FileTable과 동일 그리드의 skeleton 행 */
export function FileTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-md overflow-hidden" aria-hidden="true">
      {/* Header (real header 스타일을 단순화) */}
      <div className="border-b border-border px-4 py-3 flex gap-3 text-[11.5px] uppercase tracking-wider text-text-faint font-semibold">
        <span className="w-4" />
        <span className="flex-1">이름</span>
        <span className="w-[120px]">업로더</span>
        <span className="w-[140px]">수정일</span>
        <span className="w-[100px]">크기</span>
        <span className="w-[170px]">작업</span>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="border-b border-[#f5f5f5] px-4 py-2.5 flex items-center gap-3"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div
            className="w-4 h-4 rounded-[3px]"
            style={SHIMMER_STYLE}
          />
          <div
            className="w-9 h-9 rounded-[4px] shrink-0"
            style={SHIMMER_STYLE}
          />
          <div className="flex-1">
            <Bar width={`${50 + ((i * 13) % 30)}%`} height={12} />
          </div>
          <Bar className="w-[100px]" height={10} />
          <Bar className="w-[80px]" height={10} />
          <Bar className="w-[60px]" height={10} />
          <Bar className="w-[150px]" height={14} />
        </div>
      ))}
    </div>
  );
}
