"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Upload as UploadIcon,
  FolderPlus,
  ChevronRight,
  Folder,
  File as FileIcon,
  FileVideo,
  FileImage,
  FileText,
  FileAudio,
  FileArchive,
  Trash2,
  Download,
  Loader2,
  Package,
} from "lucide-react";
import { startUpload } from "@/lib/upload";
import type { FileEntry } from "@/lib/fs/storage";
import { useToast } from "@/components/Toast";

type Usage = {
  usedBytes: number;
  quotaBytes: number;
  fileCount: number;
  pct: number;
};

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log10(n) / 3));
  return `${(n / Math.pow(1000, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

function iconFor(entry: FileEntry) {
  if (entry.isFolder) return <Folder size={18} className="text-amber-500" strokeWidth={2} />;
  const m = {
    video: <FileVideo size={18} className="text-violet-500" strokeWidth={2} />,
    image: <FileImage size={18} className="text-emerald-500" strokeWidth={2} />,
    audio: <FileAudio size={18} className="text-sky-500" strokeWidth={2} />,
    zip: <FileArchive size={18} className="text-rose-500" strokeWidth={2} />,
    doc: <FileText size={18} className="text-slate-500" strokeWidth={2} />,
    other: <FileIcon size={18} className="text-slate-400" strokeWidth={2} />,
  };
  return m[entry.kind as keyof typeof m] ?? m.other;
}

export function MyBoxClient({
  initialPath,
  userId,
  userName,
}: {
  initialPath: string;
  userId: string;
  userName: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentPath = searchParams.get("path") ?? initialPath;
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [uploading, setUploading] = useState<{
    pct: number;
    sent: number;
    total: number;
  } | null>(null);

  const fullTargetPath = `/personal/${userId}${currentPath === "/" ? "" : currentPath}`;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/my/box/files?path=${encodeURIComponent(currentPath)}`,
      );
      const data = await r.json();
      if (r.ok) setEntries(data.entries ?? []);
    } finally {
      setLoading(false);
    }
    try {
      const r = await fetch("/api/my/box/usage");
      if (r.ok) setUsage(await r.json());
    } catch {}
  }, [currentPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // PWA Web Share Target 인입 알림 (claim 자동화는 후속 작업).
  useEffect(() => {
    const sharedId = searchParams.get("sharedFiles");
    const shareEmpty = searchParams.get("shareEmpty");
    if (sharedId) {
      toast.info(
        `공유된 파일이 임시 보관함에 저장됐어요. 관리자에게 정식 인입을 요청하세요. (ID: ${sharedId.slice(0, 8)})`,
      );
    } else if (shareEmpty) {
      toast.error("공유 데이터를 읽을 수 없어요.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ?upload=1 로 진입하면 파일 피커를 바로 연다 (CTA가 폴더만 열고 끝나는 죽은 링크가 되지 않도록).
  // 클릭 → 클라이언트 내비게이션 직후라 같은 document 의 transient activation 이 살아 있어 대부분 동작한다.
  useEffect(() => {
    if (searchParams.get("upload") !== "1") return;
    fileInputRef.current?.click();
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("upload");
    router.replace(`/my/box${sp.toString() ? `?${sp.toString()}` : ""}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSelectFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const total = arr.reduce((s, f) => s + f.size, 0);
    setUploading({ pct: 0, sent: 0, total });
    const h = startUpload(fullTargetPath, arr, (sent, t) => {
      setUploading({ pct: t > 0 ? sent / t : 0, sent, total: t });
    });
    h.done.then((res) => {
      setUploading(null);
      if (res.ok) {
        toast.success(`${arr.length}개 업로드 완료`);
        refresh();
      } else {
        toast.error(`업로드 실패: ${res.error ?? "unknown"}`);
      }
    });
  };

  const onNewFolder = async () => {
    const name = window.prompt("새 폴더 이름");
    if (!name) return;
    const r = await fetch("/api/my/box/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: currentPath, name }),
    });
    if (r.ok) {
      toast.success("폴더 생성됨");
      refresh();
    } else {
      const { error } = await r.json().catch(() => ({ error: "failed" }));
      toast.error(`폴더 생성 실패: ${error}`);
    }
  };

  const onDelete = async (entry: FileEntry) => {
    if (!window.confirm(`"${entry.name}"을 휴지통으로 이동할까요?`)) return;
    const r = await fetch(
      `/api/my/box/files?path=${encodeURIComponent(entry.path)}`,
      { method: "DELETE" },
    );
    if (r.ok) {
      toast.success("휴지통으로 이동");
      refresh();
    } else {
      toast.error("삭제 실패");
    }
  };

  const onClickEntry = (entry: FileEntry) => {
    if (entry.isFolder) {
      router.push(`/my/box?path=${encodeURIComponent(entry.path)}`);
      return;
    }
    // 파일 → 다운로드
    // personal zone download: use /api/download (canAccessFile이 personal 체크함)
    const url = `/api/download?path=${encodeURIComponent(
      `/personal/${userId}${entry.path}`,
    )}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = entry.name;
    a.click();
  };

  // breadcrumb 세그먼트
  const segments =
    currentPath === "/" ? [] : currentPath.split("/").filter(Boolean);

  const pct = usage ? Math.min(1, usage.pct) * 100 : 0;
  const pctTone =
    pct >= 95
      ? "bg-rose-500"
      : pct >= 85
        ? "bg-amber-500"
        : "bg-sky-500";

  return (
    <div className="px-4 md:px-8 py-4 md:py-6 max-w-[1400px]">
      {/* 헤더 + 경로 + 쿼타 */}
      <div className="flex items-center gap-1.5 text-[12.5px] text-slate-500 mb-3 overflow-x-auto">
        <Package size={14} className="text-slate-400 shrink-0" strokeWidth={2} />
        <Link href="/my/box" className="hover:text-slate-900 transition-colors shrink-0">
          My Box
        </Link>
        {segments.map((seg, i) => {
          const href =
            "/my/box?path=" +
            encodeURIComponent("/" + segments.slice(0, i + 1).join("/"));
          const isLast = i === segments.length - 1;
          return (
            <span key={i} className="flex items-center gap-1.5 shrink-0">
              <ChevronRight size={13} className="text-slate-300" strokeWidth={2} />
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

      <div className="flex items-start md:items-center justify-between gap-3 flex-col md:flex-row mb-4">
        <div>
          <h1 className="text-[22px] font-bold text-slate-900">
            {segments.length === 0 ? "My Box" : segments[segments.length - 1]}
          </h1>
          <div className="text-[11.5px] text-slate-400 mt-0.5">
            {userName}님의 개인 드라이브
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onNewFolder}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
          >
            <FolderPlus size={13} strokeWidth={2.2} />
            새 폴더
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-700"
          >
            <UploadIcon size={13} strokeWidth={2.3} />
            업로드
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => onSelectFiles(e.target.files)}
          />
        </div>
      </div>

      {/* 쿼타 바 */}
      {usage && (
        <div className="mb-4 bg-white border border-slate-200 rounded-lg px-4 py-3">
          <div className="flex items-center justify-between text-[11.5px] mb-1.5">
            <span className="text-slate-500">
              사용{" "}
              <span className="font-semibold text-slate-900 tabular-nums">
                {formatBytes(usage.usedBytes)}
              </span>
              <span className="text-slate-400"> / {formatBytes(usage.quotaBytes)}</span>
              <span className="text-slate-400"> · {usage.fileCount}개 파일</span>
            </span>
            <span
              className={`font-bold tabular-nums ${pct >= 95 ? "text-rose-600" : pct >= 85 ? "text-amber-600" : "text-slate-700"}`}
            >
              {pct.toFixed(1)}%
            </span>
          </div>
          <div className="relative h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 ${pctTone} transition-all`}
              style={{ width: `${pct.toFixed(1)}%` }}
            />
          </div>
        </div>
      )}

      {/* 업로드 진행 */}
      {uploading && (
        <div className="mb-4 bg-sky-50 border border-sky-200 rounded-lg px-4 py-3">
          <div className="flex items-center justify-between text-[12px] mb-1.5">
            <span className="text-sky-900 font-semibold inline-flex items-center gap-1.5">
              <Loader2 size={14} className="animate-spin" strokeWidth={2.3} />
              업로드 중 · {formatBytes(uploading.sent)} / {formatBytes(uploading.total)}
            </span>
            <span className="font-bold text-sky-800 tabular-nums">
              {(uploading.pct * 100).toFixed(1)}%
            </span>
          </div>
          <div className="relative h-1.5 bg-white/70 rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-sky-500"
              style={{ width: `${(uploading.pct * 100).toFixed(1)}%` }}
            />
          </div>
        </div>
      )}

      {/* 파일 목록 */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-[13px] text-slate-400">
          불러오는 중…
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-lg p-12 text-center">
          <Package size={32} className="text-slate-300 mx-auto mb-3" strokeWidth={1.5} />
          <div className="text-[14px] text-slate-500 mb-1">
            아직 파일이 없어요
          </div>
          <div className="text-[12px] text-slate-400">
            우측 상단 업로드 버튼이나 파일을 여기로 드래그해서 추가해봐요
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-700">이름</th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-700 w-[100px]">크기</th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-700 w-[140px]">수정</th>
                <th className="px-4 py-2.5 w-[80px]"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.path} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <button
                      onClick={() => onClickEntry(e)}
                      className="inline-flex items-center gap-2 text-left w-full"
                    >
                      <span className="shrink-0">{iconFor(e)}</span>
                      <span className="text-slate-900 font-medium truncate">{e.name}</span>
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right text-slate-500 tabular-nums">
                    {e.isFolder ? "—" : formatBytes(e.size)}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-500 tabular-nums">
                    {new Date(e.modifiedAt).toLocaleDateString("ko-KR", {
                      month: "2-digit",
                      day: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      {!e.isFolder && (
                        <button
                          onClick={() => onClickEntry(e)}
                          className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"
                          title="다운로드"
                        >
                          <Download size={13} strokeWidth={2.2} />
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(e)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                        title="삭제"
                      >
                        <Trash2 size={13} strokeWidth={2.2} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
