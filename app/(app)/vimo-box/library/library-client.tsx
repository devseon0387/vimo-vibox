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
  BookOpen,
  Loader2,
} from "lucide-react";
import { startUpload } from "@/lib/upload";
import type { FileEntry } from "@/lib/fs/storage";
import { useToast } from "@/components/Toast";
import { humanError } from "@/lib/human-error";

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

export function LibraryClient({
  initialPath,
  isStaff,
}: {
  initialPath: string;
  isStaff: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentPath = searchParams.get("path") ?? initialPath;
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<{
    pct: number;
    sent: number;
    total: number;
  } | null>(null);

  const fullTargetPath = `/library${currentPath === "/" ? "" : currentPath}`;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/library/files?path=${encodeURIComponent(currentPath)}`,
      );
      const data = await r.json();
      if (r.ok) setEntries(data.entries ?? []);
    } finally {
      setLoading(false);
    }
  }, [currentPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
        toast.error(humanError(res.error, "upload"));
      }
    });
  };

  const onNewFolder = async () => {
    const name = window.prompt("새 폴더 이름");
    if (!name) return;
    const r = await fetch("/api/library/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: currentPath, name }),
    });
    if (r.ok) {
      toast.success("폴더 생성됨");
      refresh();
    } else {
      const { error } = await r.json().catch(() => ({ error: "failed" }));
      toast.error(humanError(error, "library-write"));
    }
  };

  const onDelete = async (entry: FileEntry) => {
    if (!window.confirm(`"${entry.name}"을 휴지통으로 이동할까요?`)) return;
    const r = await fetch(
      `/api/library/files?path=${encodeURIComponent(entry.path)}`,
      { method: "DELETE" },
    );
    if (r.ok) {
      toast.success("휴지통으로 이동");
      refresh();
    } else {
      const body = await r.json().catch(() => ({}));
      toast.error(humanError(body.error ?? r.statusText, "delete"));
    }
  };

  const onClickEntry = (entry: FileEntry) => {
    if (entry.isFolder) {
      router.push(`/vimo-box/library?path=${encodeURIComponent(entry.path)}`);
      return;
    }
    const url = `/api/download?path=${encodeURIComponent(`/library${entry.path}`)}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = entry.name;
    a.click();
  };

  const segments =
    currentPath === "/" ? [] : currentPath.split("/").filter(Boolean);

  return (
    <div className="px-4 md:px-8 py-4 md:py-6 max-w-[1400px]">
      <div className="flex items-center gap-1.5 text-[12.5px] text-slate-500 mb-3 overflow-x-auto">
        <BookOpen size={14} className="text-slate-400 shrink-0" strokeWidth={2} />
        <Link
          href="/vimo-box/library"
          className="hover:text-slate-900 transition-colors shrink-0"
        >
          자료실
        </Link>
        {segments.map((seg, i) => {
          const href =
            "/vimo-box/library?path=" +
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
            {segments.length === 0 ? "자료실" : segments[segments.length - 1]}
          </h1>
          <div className="text-[11.5px] text-slate-400 mt-0.5">
            팀 공용 레퍼런스·템플릿·자산
            {!isStaff && " · 읽기 전용"}
          </div>
        </div>

        {isStaff && (
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
        )}
      </div>

      {uploading && (
        <div className="mb-4 bg-sky-50 border border-sky-200 rounded-lg px-4 py-3">
          <div className="flex items-center justify-between text-[12px] mb-1.5">
            <span className="text-sky-900 font-semibold inline-flex items-center gap-1.5">
              <Loader2 size={14} className="animate-spin" strokeWidth={2.3} />
              업로드 중 · {formatBytes(uploading.sent)} /{" "}
              {formatBytes(uploading.total)}
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

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-[13px] text-slate-400">
          불러오는 중…
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-lg p-12 text-center">
          <BookOpen
            size={32}
            className="text-slate-300 mx-auto mb-3"
            strokeWidth={1.5}
          />
          <div className="text-[14px] text-slate-500 mb-1">
            아직 자료가 없어요
          </div>
          <div className="text-[12px] text-slate-400">
            {isStaff
              ? "레퍼런스·템플릿·브랜드 자산을 올려봐요"
              : "팀에서 자료가 추가되면 여기에 보여요"}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-700">
                  이름
                </th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-700 w-[100px]">
                  크기
                </th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-700 w-[140px]">
                  수정
                </th>
                <th className="px-4 py-2.5 w-[80px]"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr
                  key={e.path}
                  className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-2">
                    <button
                      onClick={() => onClickEntry(e)}
                      className="inline-flex items-center gap-2 text-left w-full"
                    >
                      <span className="shrink-0">{iconFor(e)}</span>
                      <span className="text-slate-900 font-medium truncate">
                        {e.name}
                      </span>
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
                      {isStaff && (
                        <button
                          onClick={() => onDelete(e)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                          title="삭제"
                        >
                          <Trash2 size={13} strokeWidth={2.2} />
                        </button>
                      )}
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
