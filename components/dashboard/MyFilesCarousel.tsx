import Link from "next/link";
import { FolderOpen, ChevronRight, MessageCircle, Eye, Lock, Check, ArrowUp } from "lucide-react";
import type { MyRecentFile } from "@/lib/dashboard/queries";
import { SpaceLabel } from "./SpaceLabel";

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "방금";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return `${Math.floor(diff / 86_400_000)}일 전`;
}

function formatBytesShort(b: number | null | undefined): string {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(0)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function fileHref(file: MyRecentFile): string {
  if (file.space === "personal") {
    // /personal/{userId}/sub/file.ext → /my/box?path=/sub
    const parts = file.path.split("/").filter(Boolean);
    const sub = "/" + parts.slice(2, -1).join("/");
    return `/my/box?path=${encodeURIComponent(sub || "/")}`;
  }
  // 비모 zone: vimo-box 피드백 페이지로 (영상)
  return `/vimo-box?path=${encodeURIComponent(file.path)}`;
}

export function MyFilesCarousel({ files }: { files: MyRecentFile[] }) {
  if (files.length === 0) {
    return (
      <div className="border border-dashed border-border rounded-xl bg-white py-10 text-center">
        <div className="text-[13px] text-text-muted mb-1">아직 올린 파일이 없어요</div>
        <div className="text-[11.5px] text-text-faint">
          위 두 공간 카드의 업로드 버튼으로 시작하세요
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[14px] font-bold flex items-center gap-2">
          <FolderOpen size={16} strokeWidth={2.2} className="text-text-soft" />
          내가 올린 파일
          <span className="text-text-faint text-[11.5px] font-medium">최근 {files.length}개</span>
        </h2>
        <Link
          href="/my/box?recent=1"
          className="text-[11.5px] text-text-soft hover:text-accent flex items-center gap-0.5 transition"
        >
          모두 보기 <ChevronRight size={12} strokeWidth={2.2} />
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-3">
        {files.map((f) => (
          <Link
            key={f.path}
            href={fileHref(f)}
            className="block bg-white border border-border rounded-xl overflow-hidden hover:border-border-hover transition group"
          >
            <div className="aspect-[4/3] relative bg-surface">
              {/* 썸네일 — /api/thumb 활용. 영상 아니면 placeholder */}
              {/* 썸네일 없는 파일은 bg-surface 그대로 노출 — 안전한 client/server 호환 */}
              <img
                src={`/api/thumb?path=${encodeURIComponent(f.path)}`}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute top-1.5 left-1.5">
                <SpaceLabel space={f.space} size="sm" />
              </div>
              <div className="absolute top-1.5 right-1.5 flex flex-col gap-1 items-end">
                {f.needsNewVersion && (
                  <span
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-white text-[9.5px] font-bold"
                    style={{ background: "var(--accent)" }}
                  >
                    <ArrowUp size={9} strokeWidth={3} /> 새 버전
                  </span>
                )}
                {f.approved && !f.needsNewVersion && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-white/95 text-[color:var(--success)]">
                    <Check size={10} strokeWidth={3} /> OK
                  </span>
                )}
              </div>
            </div>
            <div className="px-2.5 py-2">
              <div className="text-[12.5px] font-semibold truncate">{f.filename}</div>
              <div className="flex items-center gap-1.5 mt-0.5 text-[10.5px] text-text-faint">
                <span>{relativeTime(f.uploadedAt)}</span>
                {f.commentCount > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    · <MessageCircle size={9} strokeWidth={2.4} />
                    {f.commentCount}
                  </span>
                )}
                {f.shareViewCount > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    · <Eye size={9} strokeWidth={2.4} />
                    {f.shareViewCount}
                  </span>
                )}
                {!f.hasShareLink && (
                  <span className="inline-flex items-center gap-0.5 text-text-faint">
                    · <Lock size={9} strokeWidth={2.4} />
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
