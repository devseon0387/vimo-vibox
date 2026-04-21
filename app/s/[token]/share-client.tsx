"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Download,
  Lock,
  AlertTriangle,
  MessageSquare,
  Send,
  User as UserIcon,
} from "lucide-react";

type Kind = "video" | "image" | "audio" | "pdf" | "other";
type FileItem = { path: string; name: string; kind: Kind };

type GuestComment = {
  id: string;
  filePath: string;
  videoTimeMs: number;
  body: string;
  guestName: string | null;
  authorName: string;
  createdAt: number;
};

export function SharePageClient({
  token,
  title,
  files,
  expired,
  needPassword,
  expiresAt,
  allowComments,
  allowDownload,
}: {
  token: string;
  title: string;
  files: FileItem[];
  expired: boolean;
  needPassword: boolean;
  expiresAt: string | null;
  allowComments: boolean;
  allowDownload: boolean;
}) {
  const [password, setPassword] = useState("");
  const [verified, setVerified] = useState(!needPassword);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

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

  const activeFile = files[activeIdx];
  const fileUrl = (() => {
    if (!verified) return null;
    const q = password ? `?password=${encodeURIComponent(password)}` : "";
    return `/api/s/${token}${q}&p=${encodeURIComponent(activeFile.path)}`;
  })();
  const fileUrlSimple = (() => {
    if (!verified) return null;
    const qs = new URLSearchParams();
    if (password) qs.set("password", password);
    qs.set("p", activeFile.path);
    return `/api/s/${token}?${qs.toString()}`;
  })();

  const download = () => {
    if (!fileUrlSimple || !allowDownload) return;
    const a = document.createElement("a");
    a.href = fileUrlSimple + "&download=1";
    a.download = activeFile.name;
    a.click();
  };

  if (expired) {
    return (
      <CenteredNarrow>
        <AlertTriangle size={44} className="text-amber-500 mb-4" strokeWidth={1.8} />
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

  if (!verified) {
    return (
      <CenteredNarrow>
        <div className="text-[11px] font-bold tracking-wider text-slate-400 uppercase mb-2">
          VIBOX · 공유 링크
        </div>
        <h1 className="text-[22px] font-bold mb-6 break-all text-slate-900">
          {title}
        </h1>

        <div className="w-full bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <div className="flex items-center gap-2 text-[13px] font-semibold mb-3 text-slate-900">
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
            className="w-full px-3 py-2 border border-slate-200 rounded-md text-[14px] outline-none focus:border-slate-400 mb-3"
          />
          {error && (
            <div className="text-[12px] text-red-600 mb-3">{error}</div>
          )}
          <button
            onClick={verify}
            disabled={checking || !password}
            className="w-full bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-60 py-2 rounded-md text-[14px] font-semibold"
          >
            {checking ? "확인 중..." : "확인"}
          </button>
        </div>
      </CenteredNarrow>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-[1000px] mx-auto px-4 py-6">
        {/* 상단 — 프로젝트 타이틀 + 메타 */}
        <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-bold tracking-wider text-slate-400 uppercase mb-1">
              VIBOX · 프리뷰
            </div>
            <h1 className="text-[22px] font-bold text-slate-900 break-all">
              {title}
            </h1>
            <div className="mt-1 flex items-center gap-3 text-[11.5px] text-slate-400">
              <span>{files.length}개 파일</span>
              {expiresAt && (
                <span>
                  만료{" "}
                  {new Date(expiresAt).toLocaleDateString("ko-KR", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              )}
            </div>
          </div>
          {allowDownload && (
            <button
              onClick={download}
              className="shrink-0 bg-slate-900 text-white hover:bg-slate-700 px-4 py-2 rounded-md text-[13px] font-semibold inline-flex items-center gap-2 shadow-sm"
            >
              <Download size={14} strokeWidth={2.3} />
              다운로드
            </button>
          )}
        </div>

        {/* 버전 탭 (2개 이상일 때만) */}
        {files.length > 1 && (
          <div className="mb-4 flex items-center gap-1.5 overflow-x-auto pb-1">
            {files.map((f, i) => (
              <button
                key={f.path}
                onClick={() => setActiveIdx(i)}
                className={`shrink-0 px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
                  i === activeIdx
                    ? "bg-slate-900 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:border-slate-400"
                }`}
              >
                {f.name}
              </button>
            ))}
          </div>
        )}

        {/* 미디어 프리뷰 */}
        <div className="rounded-xl overflow-hidden shadow-md bg-white border border-slate-200">
          {activeFile.kind === "video" && (
            <div className="bg-black aspect-video">
              <video
                key={activeFile.path}
                src={fileUrl!}
                controls
                preload="auto"
                className="w-full h-full"
              />
            </div>
          )}
          {activeFile.kind === "image" && (
            <div className="bg-slate-900 grid place-items-center p-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileUrl!}
                alt={activeFile.name}
                className="max-w-full max-h-[70vh] object-contain"
              />
            </div>
          )}
          {activeFile.kind === "audio" && (
            <div className="bg-white p-8">
              <audio src={fileUrl!} controls className="w-full" />
            </div>
          )}
          {activeFile.kind === "pdf" && (
            <div className="bg-slate-900 h-[75vh]">
              <iframe
                src={fileUrl!}
                className="w-full h-full border-0"
                title={activeFile.name}
              />
            </div>
          )}
          {activeFile.kind === "other" && (
            <div className="bg-white p-12 text-center">
              <div className="text-[13.5px] text-slate-600 mb-1">
                이 파일은 브라우저에서 미리볼 수 없습니다
              </div>
              <div className="text-[12px] text-slate-400">
                위 다운로드 버튼을 눌러주세요
              </div>
            </div>
          )}
        </div>

        {/* 게스트 댓글 */}
        {allowComments && (
          <GuestComments
            token={token}
            filePath={activeFile.path}
            password={password}
          />
        )}

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="text-[11px] text-slate-400 hover:text-slate-600"
          >
            vi.box →
          </Link>
        </div>
      </div>
    </div>
  );
}

function GuestComments({
  token,
  filePath,
  password,
}: {
  token: string;
  filePath: string;
  password: string;
}) {
  const [comments, setComments] = useState<GuestComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // 로컬 저장된 이름 복원
    const saved = localStorage.getItem("vibox.guestName");
    if (saved) setName(saved);
  }, []);

  const fetchComments = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("p", filePath);
      if (password) qs.set("password", password);
      const res = await fetch(`/api/s/${token}/comments?${qs.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments ?? []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  const submit = async () => {
    if (!text.trim() || !name.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/s/${token}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: filePath,
          body: text.trim(),
          guestName: name.trim(),
          password,
        }),
      });
      if (res.ok) {
        localStorage.setItem("vibox.guestName", name.trim());
        setText("");
        await fetchComments();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const formatRelative = (ms: number) => {
    const diff = Date.now() - ms;
    if (diff < 60_000) return "방금";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
    const d = new Date(ms);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  };

  return (
    <div className="mt-6 bg-white border border-slate-200 rounded-xl shadow-sm">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <MessageSquare size={14} className="text-slate-500" strokeWidth={2.2} />
        <h3 className="text-[13.5px] font-semibold text-slate-900">피드백</h3>
        <span className="text-[11px] text-slate-400">
          {comments.length}개
        </span>
      </div>

      <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
        {loading ? (
          <div className="text-[12px] text-slate-400 text-center py-6">
            불러오는 중...
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-6 text-slate-400">
            <div className="text-[12.5px]">아직 피드백이 없어요</div>
            <div className="text-[11px] mt-1">첫 의견을 남겨보세요 ✨</div>
          </div>
        ) : (
          comments.map((c) => (
            <div
              key={c.id}
              className="flex items-start gap-2.5 py-2 border-b border-slate-50 last:border-0"
            >
              <div className="shrink-0 w-7 h-7 rounded-full bg-slate-100 grid place-items-center">
                <UserIcon size={13} className="text-slate-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[12.5px] font-semibold text-slate-900">
                    {c.guestName ?? c.authorName}
                  </span>
                  <span className="text-[10.5px] text-slate-400">
                    {formatRelative(c.createdAt)}
                  </span>
                </div>
                <div className="text-[13px] text-slate-700 whitespace-pre-wrap break-words">
                  {c.body}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-slate-100 p-3 bg-slate-50">
        <div className="flex items-center gap-2 mb-2">
          <UserIcon size={12} className="text-slate-400" strokeWidth={2.2} />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름"
            className="flex-1 text-[12.5px] bg-white border border-slate-200 rounded px-2 py-1 outline-none focus:border-slate-400"
          />
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="의견을 남겨주세요 (⌘+Enter로 전송)"
            rows={2}
            className="flex-1 text-[12.5px] bg-white border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-slate-400 resize-none"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button
            onClick={submit}
            disabled={submitting || !name.trim() || !text.trim()}
            className="shrink-0 w-8 h-8 rounded-md bg-slate-900 text-white grid place-items-center hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none"
          >
            <Send size={14} strokeWidth={2.3} />
          </button>
        </div>
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
