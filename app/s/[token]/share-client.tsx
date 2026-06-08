"use client";

import { useState } from "react";
import { Download, AlertTriangle } from "lucide-react";
import { HlsVideo } from "@/components/HlsVideo";

type Kind = "video" | "image" | "audio" | "pdf" | "other";
type FileItem = { path: string; name: string; kind: Kind };

/**
 * 비회원(외부) 공유 시청 페이지 — 미니멀.
 * 스코프: 시청(재생·풀스크린) + 다운로드. 의견/승인 없음(풀모드 FeedbackModal·환영 모달 제거).
 * 브랜드: 비박스 로고(/logo.png). 영상은 검은 플레이어, 페이지는 밝게.
 */
export function SharePageClient({
  token,
  title,
  files,
  expired,
  expiresAt,
  allowDownload,
  sender,
}: {
  token: string;
  title: string;
  files: FileItem[];
  expired: boolean;
  expiresAt: string | null;
  allowDownload: boolean;
  sender?: string | null;
}) {
  const [activeIdx, setActiveIdx] = useState(Math.max(0, files.length - 1));

  if (files.length === 0) {
    return (
      <CenteredNarrow>
        <p className="text-[13.5px] text-slate-500">이 공유 링크에 표시할 파일이 없어요.</p>
      </CenteredNarrow>
    );
  }

  if (expired) {
    return (
      <CenteredNarrow>
        <AlertTriangle size={44} className="text-amber-500 mb-4" strokeWidth={1.8} />
        <h1 className="text-[20px] font-bold mb-2 text-slate-900">링크가 만료되었습니다</h1>
        <p className="text-[13.5px] text-slate-500">
          이 공유 링크는 더 이상 사용할 수 없습니다.
          <br />
          파일을 공유한 분에게 새 링크를 요청하세요.
        </p>
      </CenteredNarrow>
    );
  }

  const activeFile = files[Math.min(activeIdx, files.length - 1)];
  const fileUrl = `/api/s/${token}?p=${encodeURIComponent(activeFile.path)}`;
  const dlLabel = activeFile.kind === "video" ? "영상 다운로드" : "다운로드";

  const download = () => {
    if (!allowDownload) return;
    const a = document.createElement("a");
    a.href = fileUrl + "&download=1";
    a.download = activeFile.name;
    a.click();
  };

  const expLabel = expiresAt
    ? new Date(expiresAt).toLocaleDateString("ko-KR", {
        year: "2-digit",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* 비박스 로고 */}
      <header className="flex justify-center pt-5 pb-1 shrink-0">
        <span className="inline-flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="비박스" className="h-[22px] w-auto" />
          <span className="text-[15px] font-extrabold tracking-tight text-slate-900">비박스</span>
        </span>
      </header>

      <div className="flex-1 flex flex-col w-full max-w-[760px] mx-auto px-5">
        {/* 뷰어 — 영상은 검은 플레이어 카드, 그 외 종류별 */}
        <div className="mt-7">
          {activeFile.kind === "video" && (
            <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.13)]">
              <HlsVideo
                key={activeFile.path}
                filePath={activeFile.path}
                fallbackSrc={fileUrl}
                shareToken={token}
                className="w-full h-full"
              />
            </div>
          )}
          {activeFile.kind === "image" && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={fileUrl}
              alt={activeFile.name}
              className="w-full max-h-[70vh] object-contain rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.13)]"
            />
          )}
          {activeFile.kind === "audio" && (
            <div className="w-full bg-slate-50 rounded-2xl p-8 shadow-sm">
              <audio src={fileUrl} controls className="w-full" />
            </div>
          )}
          {activeFile.kind === "pdf" && (
            <iframe
              src={fileUrl}
              className="w-full min-h-[70vh] border-0 bg-white rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.13)]"
              title={activeFile.name}
            />
          )}
          {activeFile.kind === "other" && (
            <div className="bg-slate-50 rounded-2xl p-12 text-center">
              <div className="text-[13.5px] text-slate-600 mb-1">
                이 파일은 브라우저에서 미리볼 수 없습니다
              </div>
              <div className="text-[12px] text-slate-400">아래 버튼으로 받아주세요</div>
            </div>
          )}
        </div>

        {/* 제목 + 보낸이 */}
        <h1 className="text-center text-[18px] font-bold text-slate-900 mt-6 tracking-tight break-keep">
          {title}
        </h1>
        {sender && (
          <p className="text-center text-[12px] text-slate-400 mt-1.5">{sender} 드림</p>
        )}

        {/* 다중 버전(여러 파일) — 작은 선택 */}
        {files.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 mt-3.5 flex-wrap">
            {files.map((f, i) => {
              const isActive = i === activeIdx;
              const isLatest = i === files.length - 1;
              return (
                <button
                  key={f.path}
                  onClick={() => setActiveIdx(i)}
                  className={`px-2.5 py-1 rounded-full text-[11.5px] font-semibold ${
                    isActive
                      ? "bg-slate-900 text-white"
                      : "bg-white border border-slate-200 text-slate-500 hover:border-slate-400"
                  }`}
                >
                  V{i + 1}
                  {isLatest ? " · 최신" : ""}
                </button>
              );
            })}
          </div>
        )}

        {/* 다운로드 (소프트 화이트) + 만료 — 하단 고정 */}
        <div className="mt-auto pt-10 pb-8 flex flex-col items-center gap-3">
          {allowDownload && (
            <button
              onClick={download}
              className="inline-flex items-center justify-center gap-2.5 bg-white text-slate-900 border border-slate-200 rounded-2xl px-7 py-3.5 text-[14px] font-extrabold shadow-[0_8px_20px_rgba(0,0,0,0.09)] active:translate-y-px transition-transform"
            >
              <Download size={17} strokeWidth={2.2} className="text-accent" />
              {dlLabel}
            </button>
          )}
          {expLabel && (
            <p className="text-[11px] text-slate-400">{expLabel} 만료</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CenteredNarrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-white">
      <div className="w-full max-w-[420px] text-center flex flex-col items-center">
        {children}
      </div>
    </div>
  );
}
