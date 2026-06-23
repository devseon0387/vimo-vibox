"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Folder,
  Download,
  FileText,
  Film,
  Image as ImageIcon,
  Music,
  File as FileIcon,
  X,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { HlsVideo } from "@/components/HlsVideo";

type Entry = {
  name: string;
  path: string;
  isFolder: boolean;
  kind: string;
  size: number;
  modifiedAt: number;
};

function fmtSize(b: number): string {
  if (!b) return "";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let n = b;
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
}

function KindIcon({ e }: { e: Entry }) {
  if (e.isFolder) return <Folder size={18} className="text-accent shrink-0" />;
  if (e.kind === "video") return <Film size={18} className="text-slate-400 shrink-0" />;
  if (e.kind === "image") return <ImageIcon size={18} className="text-slate-400 shrink-0" />;
  if (e.kind === "audio") return <Music size={18} className="text-slate-400 shrink-0" />;
  if (e.kind === "doc") return <FileText size={18} className="text-slate-400 shrink-0" />;
  return <FileIcon size={18} className="text-slate-400 shrink-0" />;
}

export function ShareFolderBrowser({
  token,
  title,
  root,
  initialEntries,
  allowDownload,
  expired,
  expiresAt,
}: {
  token: string;
  title: string;
  root: string;
  initialEntries: Entry[];
  allowDownload: boolean;
  expired: boolean;
  expiresAt: string | null;
}) {
  const [cwd, setCwd] = useState(root);
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [loading, setLoading] = useState(false);
  const [viewer, setViewer] = useState<Entry | null>(null);

  const load = useCallback(
    async (p: string) => {
      setLoading(true);
      try {
        const r = await fetch(`/api/s/${token}/list?path=${encodeURIComponent(p)}`);
        const d = await r.json();
        setEntries(Array.isArray(d.entries) ? d.entries : []);
      } catch {
        setEntries([]);
      }
      setLoading(false);
    },
    [token],
  );

  useEffect(() => {
    if (cwd === root) {
      setEntries(initialEntries);
      return;
    }
    load(cwd);
  }, [cwd, root, initialEntries, load]);

  if (expired) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
        <div className="w-full max-w-[420px] text-center flex flex-col items-center">
          <AlertTriangle size={44} className="text-amber-500 mb-4" strokeWidth={1.8} />
          <h1 className="text-[20px] font-bold mb-2 text-slate-900">링크가 만료되었습니다</h1>
          <p className="text-[13.5px] text-slate-500">
            파일을 공유한 분에게 새 링크를 요청하세요.
          </p>
        </div>
      </div>
    );
  }

  const fileUrl = (p: string, dl = false) =>
    `/api/s/${token}?p=${encodeURIComponent(p)}${dl ? "&download=1" : ""}`;

  // breadcrumb: 공유 폴더 루트 이후만 노출 (루트 위로는 못 올라감)
  const rel = cwd === root ? "" : cwd.slice(root.length).replace(/^\//, "");
  const segs = rel ? rel.split("/") : [];
  const crumbTo = (i: number) => root + "/" + segs.slice(0, i + 1).join("/");

  const sorted = [...entries].sort((a, b) =>
    a.isFolder !== b.isFolder
      ? a.isFolder
        ? -1
        : 1
      : a.name.localeCompare(b.name, "ko"),
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <span className="shrink-0 text-[13px] font-extrabold tracking-tight text-slate-900">
            vi<span className="text-accent">.</span>box
          </span>
          <div className="h-4 w-px bg-slate-200" />
          <h1 className="text-[13px] font-semibold text-slate-700 truncate min-w-0 flex-1">
            {title}
          </h1>
          {expiresAt && (
            <span className="hidden md:inline text-[11px] text-slate-400 whitespace-nowrap">
              만료{" "}
              {new Date(expiresAt).toLocaleDateString("ko-KR", {
                year: "2-digit",
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 px-4 pb-2 text-[12px] text-slate-500 overflow-x-auto">
          <button
            onClick={() => setCwd(root)}
            className="hover:text-slate-900 shrink-0 font-medium"
          >
            {title}
          </button>
          {segs.map((s, i) => (
            <span key={i} className="flex items-center gap-1 shrink-0">
              <ChevronRight size={12} className="text-slate-300" />
              {i === segs.length - 1 ? (
                <span className="text-slate-900 font-medium truncate max-w-[160px]">{s}</span>
              ) : (
                <button
                  onClick={() => setCwd(crumbTo(i))}
                  className="hover:text-slate-900 truncate max-w-[120px]"
                >
                  {s}
                </button>
              )}
            </span>
          ))}
        </div>
      </header>

      <div className="flex-1 px-3 md:px-4 py-3 max-w-[1100px] w-full mx-auto">
        {loading ? (
          <div className="text-center text-[13px] text-slate-400 py-16">불러오는 중…</div>
        ) : sorted.length === 0 ? (
          <div className="text-center text-[13px] text-slate-400 py-16">빈 폴더예요</div>
        ) : (
          <ul className="grid gap-1">
            {sorted.map((e) => (
              <li key={e.path}>
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white border border-slate-200 hover:border-slate-300 transition-colors">
                  <button
                    onClick={() => (e.isFolder ? setCwd(e.path) : setViewer(e))}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left"
                  >
                    <KindIcon e={e} />
                    <span className="truncate text-[13.5px] text-slate-800">{e.name}</span>
                    {!e.isFolder && e.size > 0 && (
                      <span className="ml-auto text-[11px] text-slate-400 shrink-0">
                        {fmtSize(e.size)}
                      </span>
                    )}
                    {e.isFolder && (
                      <ChevronRight size={15} className="ml-auto text-slate-300 shrink-0" />
                    )}
                  </button>
                  {!e.isFolder && allowDownload && (
                    <a
                      href={fileUrl(e.path, true)}
                      className="shrink-0 text-slate-400 hover:text-slate-900 p-1"
                      aria-label="다운로드"
                      download
                    >
                      <Download size={16} />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {viewer && (
        <FileViewer
          entry={viewer}
          token={token}
          allowDownload={allowDownload}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}

function FileViewer({
  entry,
  token,
  allowDownload,
  onClose,
}: {
  entry: Entry;
  token: string;
  allowDownload: boolean;
  onClose: () => void;
}) {
  const url = `/api/s/${token}?p=${encodeURIComponent(entry.path)}`;
  const isPdf = entry.kind === "doc" && entry.name.toLowerCase().endsWith(".pdf");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col" onClick={onClose}>
      <div
        className="flex items-center gap-3 px-4 py-2.5 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-[13px] font-medium truncate flex-1">{entry.name}</span>
        {allowDownload && (
          <a
            href={`${url}&download=1`}
            download
            className="text-white/80 hover:text-white p-1"
            aria-label="다운로드"
          >
            <Download size={18} />
          </a>
        )}
        <button onClick={onClose} className="text-white/80 hover:text-white p-1" aria-label="닫기">
          <X size={18} />
        </button>
      </div>
      <div
        className="flex-1 flex items-center justify-center p-4 overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {entry.kind === "video" && (
          <div className="w-full max-w-[1200px] h-[calc(100vh-110px)] bg-black rounded-lg overflow-hidden flex flex-col">
            <HlsVideo
              filePath={entry.path}
              fallbackSrc={url}
              shareToken={token}
              chrome="custom"
              className="flex-1 min-h-0 w-full"
            />
          </div>
        )}
        {entry.kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={entry.name}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        )}
        {entry.kind === "audio" && (
          <div className="w-full max-w-[600px] bg-white rounded-xl p-8">
            <audio src={url} controls className="w-full" />
          </div>
        )}
        {isPdf && (
          <iframe
            src={url}
            className="w-full h-full min-h-[80vh] border-0 bg-white rounded-lg"
            title={entry.name}
          />
        )}
        {!["video", "image", "audio"].includes(entry.kind) && !isPdf && (
          <div className="bg-white p-12 text-center rounded-xl">
            <div className="text-[13.5px] text-slate-600 mb-3">이 파일은 미리볼 수 없어요</div>
            {allowDownload && (
              <a
                href={`${url}&download=1`}
                download
                className="inline-flex items-center gap-1.5 bg-slate-900 text-white px-3 py-1.5 rounded-md text-[12px] font-semibold"
              >
                <Download size={14} /> 다운로드
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
