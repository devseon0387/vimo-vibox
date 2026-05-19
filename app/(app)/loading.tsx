import { FileTableSkeleton } from "@/components/Skeleton";

const SHIMMER_STYLE: React.CSSProperties = {
  background:
    "linear-gradient(90deg, var(--surface) 0%, #e7e5e4 50%, var(--surface) 100%)",
  backgroundSize: "200% 100%",
  animation: "vibox-shimmer 1.5s ease-in-out infinite",
};

function ShimmerBox({
  className = "",
  width,
  height,
}: {
  className?: string;
  width?: number | string;
  height?: number | string;
}) {
  return (
    <div
      className={`opacity-70 ${className}`}
      style={{ ...SHIMMER_STYLE, width, height }}
    />
  );
}

export default function FilesLoading() {
  return (
    <div className="px-4 md:px-8 py-4 md:py-6 max-w-[1400px]">
      {/* breadcrumb skeleton */}
      <ShimmerBox className="rounded mb-4" width={192} height={16} />

      {/* action bar skeleton */}
      <div className="flex justify-between mb-5">
        <div className="flex gap-2">
          <ShimmerBox className="rounded-md" width={78} height={36} />
          <ShimmerBox className="rounded-md" width={78} height={36} />
          <ShimmerBox className="rounded-md" width={78} height={36} />
        </div>
        <div className="flex gap-2">
          <ShimmerBox className="rounded-md" width={96} height={36} />
          <ShimmerBox className="rounded-md" width={80} height={36} />
        </div>
      </div>

      <FileTableSkeleton />
    </div>
  );
}
