"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, Lock, AlertTriangle } from "lucide-react";

type Kind = "video" | "image" | "audio" | "pdf" | "other";

export function SharePageClient({
  token,
  filename,
  kind,
  expired,
  needPassword,
  expiresAt,
}: {
  token: string;
  filename: string;
  kind: Kind;
  expired: boolean;
  needPassword: boolean;
  expiresAt: string | null;
}) {
  const [password, setPassword] = useState("");
  const [verified, setVerified] = useState(!needPassword);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const verify = async () => {
    setChecking(true);
    setError(null);
    try {
      const url = `/api/s/${token}?password=${encodeURIComponent(password)}`;
      const r = await fetch(url, { method: "HEAD" });
      if (r.status === 200) setVerified(true);
      else if (r.status === 401) setError("비밀번호가 맞지 않습니다");
      else if (r.status === 410) setError("만료된 링크입니다");
      else setError("확인 실패");
    } finally {
      setChecking(false);
    }
  };

  const fileUrl = (() => {
    if (!verified) return null;
    const q = password ? `?password=${encodeURIComponent(password)}` : "";
    return `/api/s/${token}${q}`;
  })();

  const download = () => {
    if (!fileUrl) return;
    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = filename;
    a.click();
  };

  if (expired) {
    return (
      <CenteredNarrow>
        <AlertTriangle size={44} className="text-warning mb-4" strokeWidth={1.8} />
        <h1 className="text-[20px] font-bold mb-2">링크가 만료되었습니다</h1>
        <p className="text-[13.5px] text-text-soft mb-6">
          이 공유 링크는 더 이상 사용할 수 없습니다. 파일을 공유한 분에게 새 링크를 요청하세요.
        </p>
      </CenteredNarrow>
    );
  }

  // 비번 필요한데 아직 미검증
  if (!verified) {
    return (
      <CenteredNarrow>
        <div className="text-[11px] font-bold tracking-wider text-text-faint uppercase mb-2">
          VIMO CLOUD · 공유 링크
        </div>
        <h1 className="text-[22px] font-bold mb-6 break-all">{filename}</h1>

        <div className="w-full bg-white border border-border rounded-lg p-5 mb-4">
          <div className="flex items-center gap-2 text-[13px] font-semibold mb-3 text-text">
            <Lock size={15} strokeWidth={2} />
            비밀번호가 필요해요
          </div>
          <input
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") verify();
            }}
            type="password"
            placeholder="비밀번호"
            autoFocus
            className="w-full px-3 py-2 border border-border rounded-md text-[14px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft mb-3"
          />
          {error && <div className="text-[12px] text-danger mb-3">{error}</div>}
          <button
            onClick={verify}
            disabled={checking || !password}
            className="w-full bg-text text-white hover:bg-[#333] disabled:opacity-60 py-2 rounded-md text-[14px] font-semibold"
          >
            {checking ? "확인 중..." : "확인"}
          </button>
        </div>
      </CenteredNarrow>
    );
  }

  // 검증됨 → 실제 미리보기 + 다운로드
  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-[900px] mx-auto px-4 py-10">
        {/* 상단 헤더 */}
        <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold tracking-wider text-text-faint uppercase mb-1.5">
              VIMO CLOUD · 공유 링크
            </div>
            <h1 className="text-[20px] font-bold text-text break-all">
              {filename}
            </h1>
            {expiresAt && (
              <div className="mt-1 text-[12px] text-text-faint">
                만료: {new Date(expiresAt).toLocaleString("ko-KR")}
              </div>
            )}
          </div>
          <button
            onClick={download}
            className="shrink-0 bg-accent text-white hover:bg-accent-hover px-4 py-2 rounded-md text-[13.5px] font-semibold flex items-center gap-2"
          >
            <Download size={14} strokeWidth={2.5} />
            다운로드
          </button>
        </div>

        {/* 미디어 프리뷰 */}
        <div className="rounded-xl overflow-hidden shadow-lg">
          {kind === "video" && (
            <div className="bg-black grid place-items-center">
              <video
                src={fileUrl!}
                controls
                autoPlay={false}
                preload="auto"
                className="w-full max-h-[70vh]"
              />
            </div>
          )}
          {kind === "image" && (
            <div className="bg-[#1a1a1a] grid place-items-center p-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileUrl!}
                alt={filename}
                className="max-w-full max-h-[70vh] object-contain"
              />
            </div>
          )}
          {kind === "audio" && (
            <div className="bg-white p-8 border border-border">
              <audio src={fileUrl!} controls className="w-full" />
            </div>
          )}
          {kind === "pdf" && (
            <div className="bg-[#1a1a1a] h-[75vh]">
              <iframe src={fileUrl!} className="w-full h-full border-0" title={filename} />
            </div>
          )}
          {kind === "other" && (
            <div className="bg-white border border-border p-12 text-center">
              <div className="text-[14px] text-text-muted mb-1">
                이 파일은 브라우저에서 미리볼 수 없습니다
              </div>
              <div className="text-[12.5px] text-text-faint">
                위 다운로드 버튼을 눌러주세요
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="text-[11.5px] text-text-faint hover:text-text">
            vimo.cloud →
          </Link>
        </div>
      </div>
    </div>
  );
}

function CenteredNarrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface">
      <div className="w-full max-w-[420px] text-center flex flex-col items-center">
        {children}
      </div>
    </div>
  );
}
