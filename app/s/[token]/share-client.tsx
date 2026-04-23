"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, AlertTriangle } from "lucide-react";
import { FeedbackModal, type ShareContext } from "@/components/FeedbackModal";
import type { FileEntry } from "@/lib/fs/storage";

type Kind = "video" | "image" | "audio" | "pdf" | "other";
type FileItem = { path: string; name: string; kind: Kind };

function toFileEntry(f: FileItem): FileEntry {
  const kindMap: Record<Kind, FileEntry["kind"]> = {
    video: "video",
    image: "image",
    audio: "audio",
    pdf: "doc",
    other: "other",
  };
  return {
    name: f.name,
    path: f.path,
    isFolder: false,
    size: 0,
    modifiedAt: Date.now(),
    kind: kindMap[f.kind],
  };
}

export function SharePageClient({
  token,
  title,
  files,
  expired,
  expiresAt,
  allowComments,
  allowDownload,
  mode = "preview",
}: {
  token: string;
  title: string;
  files: FileItem[];
  expired: boolean;
  expiresAt: string | null;
  allowComments: boolean;
  allowDownload: boolean;
  mode?: "preview" | "full";
}) {
  const [activeIdx, setActiveIdx] = useState(Math.max(0, files.length - 1));
  const [guestName, setGuestName] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("vibox.guestName");
      if (saved) setGuestName(saved);
    } catch {}
  }, []);

  const onSetGuestName = useCallback((n: string) => {
    setGuestName(n);
    try {
      localStorage.setItem("vibox.guestName", n);
    } catch {}
  }, []);

  const activeFile = files[activeIdx];
  const fileUrl = (() => {
    const qs = new URLSearchParams();
    qs.set("p", activeFile.path);
    return `/api/s/${token}?${qs.toString()}`;
  })();

  const download = () => {
    if (!fileUrl || !allowDownload) return;
    const a = document.createElement("a");
    a.href = fileUrl + "&download=1";
    a.download = activeFile.name;
    a.click();
  };

  // 풀모드 + 영상 → FeedbackModal UI 그대로 재사용
  const useFeedbackUI =
    mode === "full" && allowComments && activeFile.kind === "video";

  const shareContext = useMemo<ShareContext>(
    () => ({ token, password: "", guestName, onSetGuestName }),
    [token, guestName, onSetGuestName],
  );

  if (expired) {
    return (
      <CenteredNarrow>
        <AlertTriangle
          size={44}
          className="text-amber-500 mb-4"
          strokeWidth={1.8}
        />
        <h1 className="text-[20px] font-bold mb-2 text-slate-900">
          링크가 만료되었습니다
        </h1>
        <p className="text-[13.5px] text-slate-500 mb-6">
          이 공유 링크는 더 이상 사용할 수 없습니다.
          <br />
          파일을 공유한 분에게 새 링크를 요청하세요.
        </p>
      </CenteredNarrow>
    );
  }

  if (useFeedbackUI) {
    return (
      <FeedbackModal
        key={activeFile.path}
        entry={toFileEntry(activeFile)}
        backHref="#"
        currentUserId="guest"
        isAdmin={false}
        role="partner"
        shareContext={shareContext}
      />
    );
  }

  // 프리뷰 모드 또는 비디오 아닌 경우
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="border-b border-slate-200 bg-white">
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
          {allowDownload && (
            <button
              onClick={download}
              className="shrink-0 bg-slate-900 text-white hover:bg-slate-700 px-3 py-1.5 rounded-md text-[12px] font-semibold inline-flex items-center gap-1.5"
            >
              <Download size={13} strokeWidth={2.3} />
              다운로드
            </button>
          )}
        </div>
        {files.length > 1 && (
          <div className="flex items-center gap-1.5 px-4 pb-2 overflow-x-auto">
            {files.map((f, i) => {
              const isActive = i === activeIdx;
              const isLatest = i === files.length - 1;
              return (
                <button
                  key={f.path}
                  onClick={() => setActiveIdx(i)}
                  className={`shrink-0 px-2.5 py-1 rounded-md text-[11.5px] font-semibold inline-flex items-center gap-1.5 ${
                    isActive
                      ? "bg-slate-900 text-white"
                      : "bg-white border border-slate-200 text-slate-600 hover:border-slate-400"
                  }`}
                >
                  <span
                    className={`font-mono text-[10px] px-1 rounded ${
                      isActive ? "bg-white/20" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    V{i + 1}
                  </span>
                  <span className="truncate max-w-[180px]">{f.name}</span>
                  {isLatest && !isActive && (
                    <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1 rounded">
                      NEW
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </header>
      <div className="flex-1 flex items-center justify-center p-4 bg-slate-100">
        {activeFile.kind === "video" && (
          <div className="w-full max-w-[1400px] aspect-video bg-black rounded-lg overflow-hidden shadow-md">
            <video
              key={activeFile.path}
              src={fileUrl!}
              controls
              preload="metadata"
              className="w-full h-full"
            />
          </div>
        )}
        {activeFile.kind === "image" && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={fileUrl!}
            alt={activeFile.name}
            className="max-w-full max-h-full object-contain rounded-lg shadow-md"
          />
        )}
        {activeFile.kind === "audio" && (
          <div className="w-full max-w-[600px] bg-white rounded-xl p-8 shadow-md">
            <audio src={fileUrl!} controls className="w-full" />
          </div>
        )}
        {activeFile.kind === "pdf" && (
          <iframe
            src={fileUrl!}
            className="w-full h-full min-h-[75vh] border-0 bg-white rounded-lg shadow-md"
            title={activeFile.name}
          />
        )}
        {activeFile.kind === "other" && (
          <div className="bg-white p-12 text-center rounded-xl shadow-md">
            <div className="text-[13.5px] text-slate-600 mb-1">
              이 파일은 브라우저에서 미리볼 수 없습니다
            </div>
            <div className="text-[12px] text-slate-400">
              위 다운로드 버튼을 눌러주세요
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CenteredNarrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
      <div className="w-full max-w-[420px] text-center flex flex-col items-center">
        {children}
      </div>
    </div>
  );
}
