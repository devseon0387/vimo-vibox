"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, AlertTriangle } from "lucide-react";
import { FeedbackModal, type ShareContext } from "@/components/FeedbackModal";
import { HlsVideo } from "@/components/HlsVideo";
import { ShortformReview } from "@/components/ShortformReview";
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
    // 0 = 안정값. Date.now()면 매 렌더마다 바뀌어 검수 뷰어의 캐시버스팅(&v=)이
    // 영상 src를 계속 갈아끼워 재버퍼링 + SSR/클라 하이드레이션 미스매치를 유발한다.
    // 게스트 신선도는 공유 라우트의 ETag + must-revalidate 가 담당(0이면 &v= 미부착).
    modifiedAt: 0,
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

  // 모바일 뷰포트 감지 (숏폼 분기용). null = 아직 판별 전(SSR/첫 페인트)
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // 영상 종횡비 프로브 — 모바일 검수일 때만. portrait=세로(숏폼). null=판별 중
  const [portrait, setPortrait] = useState<boolean | null>(null);
  useEffect(() => {
    if (isMobile !== true || files.length === 0) {
      setPortrait(null);
      return;
    }
    const af = files[Math.min(activeIdx, files.length - 1)];
    const isReview = mode === "full" && allowComments && af.kind === "video";
    if (!isReview) {
      setPortrait(null);
      return;
    }
    setPortrait(null);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    const onMeta = () => {
      if (v.videoWidth && v.videoHeight)
        setPortrait(v.videoHeight > v.videoWidth);
    };
    v.addEventListener("loadedmetadata", onMeta);
    v.src = `/api/s/${token}?p=${encodeURIComponent(af.path)}`;
    // 메타데이터 못 읽으면 3초 후 표준(가로)으로 폴백
    const fb = setTimeout(() => setPortrait((p) => (p === null ? false : p)), 3000);
    return () => {
      clearTimeout(fb);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeAttribute("src");
      v.load();
    };
  }, [isMobile, files, activeIdx, mode, allowComments, token]);

  // files=[] 가드 — 빈 공유 링크 (모든 path 제거됨) 시 TypeError 방지
  if (files.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center text-zinc-500">
        이 공유 링크에 표시할 파일이 없어요.
      </div>
    );
  }
  const activeFile = files[Math.min(activeIdx, files.length - 1)];
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
        <p className="text-base text-slate-500 mb-6">
          이 공유 링크는 더 이상 사용할 수 없습니다.
          <br />
          파일을 공유한 분에게 새 링크를 요청하세요.
        </p>
      </CenteredNarrow>
    );
  }

  if (useFeedbackUI) {
    // 판별 전 / 세로 프로브 중 — 깜빡임 방지로 검은 화면
    if (isMobile === null || (isMobile && portrait === null)) {
      return <div className="h-screen bg-black" />;
    }
    // 모바일 + 세로 영상 → 숏폼 몰입 검수
    if (isMobile && portrait) {
      return (
        <ShortformReview
          key={activeFile.path}
          token={token}
          filePath={activeFile.path}
          fallbackSrc={fileUrl}
          title={title}
          allowDownload={allowDownload}
          guestName={guestName}
          onSetGuestName={onSetGuestName}
        />
      );
    }
    // 데스크톱 또는 모바일 가로 → 기존 검수 뷰어
    return (
      <div className="h-screen overflow-hidden">
        <FeedbackModal
          key={activeFile.path}
          entry={toFileEntry(activeFile)}
          backHref="#"
          currentUserId="guest"
          isAdmin={false}
          role="partner"
          shareContext={shareContext}
        />
      </div>
    );
  }

  // 프리뷰 모드 또는 비디오 아닌 경우
  return (
    <>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3 px-4 py-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="shrink-0 w-6 h-6 object-contain" />
          <span className="shrink-0 text-base font-extrabold tracking-tight text-slate-900">
            vi<span className="text-accent">.</span>box
          </span>
          <div className="h-4 w-px bg-slate-200" />
          <h1 className="text-base font-semibold text-slate-700 truncate min-w-0 flex-1">
            {title}
          </h1>
          {allowDownload && (
            <button
              onClick={download}
              className="shrink-0 bg-slate-900 text-white hover:bg-slate-700 px-2.5 sm:px-3 py-1.5 rounded-md text-sm font-semibold inline-flex items-center gap-1.5 min-h-[36px]"
              aria-label="다운로드"
            >
              <Download size={14} strokeWidth={2.3} />
              <span className="hidden sm:inline">다운로드</span>
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
                  className={`shrink-0 px-2.5 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 ${
                    isActive
                      ? "bg-slate-900 text-white"
                      : "bg-white border border-slate-200 text-slate-600 hover:border-slate-400"
                  }`}
                >
                  <span
                    className={`font-mono text-2xs px-1 rounded ${
                      isActive ? "bg-white/20" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    V{i + 1}
                  </span>
                  <span className="truncate max-w-[180px]">{f.name}</span>
                  {isLatest && !isActive && (
                    <span className="text-2xs font-bold text-emerald-600 bg-emerald-50 px-1 rounded">
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
          <div className="w-full max-w-[1400px] h-[calc(100vh-100px)] bg-black rounded-lg overflow-hidden shadow-md flex flex-col">
            <HlsVideo
              key={activeFile.path}
              filePath={activeFile.path}
              fallbackSrc={fileUrl!}
              shareToken={token}
              chrome="custom"
              className="flex-1 min-h-0 w-full"
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
            <div className="text-base text-slate-600 mb-1">
              이 파일은 브라우저에서 미리볼 수 없습니다
            </div>
            <div className="text-sm text-slate-400">
              위 다운로드 버튼을 눌러주세요
            </div>
          </div>
        )}
        </div>
      </div>
    </>
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
