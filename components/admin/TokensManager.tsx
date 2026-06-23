"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Copy,
  Check,
  Trash2,
  Key,
  Clock,
  AlertTriangle,
  Shield,
} from "lucide-react";
import type { Scope } from "@/lib/api-auth";
import { humanError } from "@/lib/human-error";

export type TokenRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: Scope[];
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
};

const SCOPE_DESC: Record<Scope, string> = {
  "notes:read": "노트 목록·본문 읽기",
  "notes:write": "노트 저장·생성",
};

export function TokensManager({
  initial,
  availableScopes,
}: {
  initial: TokenRow[];
  availableScopes: readonly Scope[];
}) {
  const router = useRouter();
  const [tokens, setTokens] = useState<TokenRow[]>(initial);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [chosenScopes, setChosenScopes] = useState<Set<Scope>>(
    new Set(["notes:read", "notes:write"]),
  );
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ token: TokenRow; raw: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  const onCreate = async () => {
    if (!name.trim()) {
      setError("이름을 입력해주세요");
      return;
    }
    if (chosenScopes.size === 0) {
      setError("최소 하나의 scope 선택");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/admin/tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          scopes: Array.from(chosenScopes),
        }),
      });
      let data: {
        id?: string;
        name?: string;
        prefix?: string;
        scopes?: Scope[];
        createdAt?: number;
        raw?: string;
        error?: string;
      };
      try {
        data = (await res.json()) as typeof data;
      } catch {
        setError(`서버 오류 (${res.status})`);
        return;
      }
      if (!res.ok) {
        setError(humanError(data.error ?? String(res.status), "general"));
        return;
      }
      const newToken: TokenRow = {
        id: data.id ?? "",
        name: data.name ?? "",
        prefix: data.prefix ?? "",
        scopes: data.scopes ?? [],
        createdAt: data.createdAt ?? Date.now(),
        lastUsedAt: null,
        revokedAt: null,
      };
      setTokens((t) => [newToken, ...t]);
      setRevealed({ token: newToken, raw: data.raw ?? "" });
      setName("");
      setChosenScopes(new Set(["notes:read", "notes:write"]));
      setShowCreate(false);
      router.refresh();
    } finally {
      setCreating(false);
    }
  };

  const onRevoke = async (id: string) => {
    if (!confirm("이 토큰을 회수하시겠습니까? 사용 중인 클라이언트는 즉시 차단됩니다.")) return;
    const res = await fetch(`/api/admin/tokens/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("회수 실패");
      return;
    }
    setTokens((arr) =>
      arr.map((t) => (t.id === id ? { ...t, revokedAt: Date.now() } : t)),
    );
    router.refresh();
  };

  return (
    <>
      {/* 발급 직후 1회 노출 모달 */}
      {revealed && (
        <RevealedTokenBanner
          token={revealed.token}
          raw={revealed.raw}
          copied={copied}
          onCopy={async () => {
            try {
              await navigator.clipboard.writeText(revealed.raw);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } catch {}
          }}
          onClose={() => {
            setRevealed(null);
            setCopied(false);
          }}
        />
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="text-[13px] text-text-faint">
          {tokens.filter((t) => !t.revokedAt).length}개 활성 · {tokens.length}개 전체
        </div>
        <button
          onClick={() => {
            setShowCreate((v) => !v);
            setError(null);
          }}
          className="px-3 py-1.5 rounded-md text-[12.5px] font-semibold bg-accent text-white hover:bg-accent-hover flex items-center gap-1.5"
        >
          <Plus size={12} strokeWidth={2.4} /> 토큰 발급
        </button>
      </div>

      {showCreate && (
        <div className="border border-accent/30 bg-accent-soft rounded-xl p-5 mb-5">
          <div className="text-[13px] font-bold text-accent mb-3">새 토큰 발급</div>
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-widest text-text-faint mb-1.5">
                이름
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: Claude — 맥북, iPhone Shortcut"
                className="w-full px-3 py-2 rounded-md border border-border bg-white text-[13.5px] outline-none focus:border-accent"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-widest text-text-faint mb-1.5">
                권한 scope
              </label>
              <div className="flex flex-col gap-1.5">
                {availableScopes.map((s) => {
                  const checked = chosenScopes.has(s);
                  return (
                    <label
                      key={s}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-md bg-white border border-border cursor-pointer hover:border-border-hover"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setChosenScopes((cur) => {
                            const next = new Set(cur);
                            if (e.target.checked) next.add(s);
                            else next.delete(s);
                            return next;
                          });
                        }}
                        className="accent-accent"
                      />
                      <code className="text-[12px] font-mono text-accent">{s}</code>
                      <span className="text-[12px] text-text-soft">{SCOPE_DESC[s]}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            {error && (
              <div className="text-[12px] text-danger bg-danger-soft px-3 py-2 rounded">
                {error}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={onCreate}
                disabled={creating}
                className="px-4 py-1.5 rounded-md text-[12.5px] font-semibold bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {creating ? "발급 중..." : "발급"}
              </button>
              <button
                onClick={() => {
                  setShowCreate(false);
                  setError(null);
                }}
                className="px-4 py-1.5 rounded-md text-[12.5px] text-text-soft border border-border bg-white hover:bg-surface"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {tokens.length === 0 ? (
        <div className="border border-border rounded-xl bg-white px-6 py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-surface mx-auto mb-4 grid place-items-center text-text-faint">
            <Key size={22} strokeWidth={1.6} />
          </div>
          <div className="text-[15px] font-semibold text-text mb-1.5">토큰이 없습니다</div>
          <div className="text-[13px] text-text-soft">
            "토큰 발급"을 눌러 첫 토큰을 만들어 주세요.
          </div>
        </div>
      ) : (
        <div className="border border-border rounded-xl bg-white overflow-hidden divide-y divide-border">
          {tokens.map((t) => (
            <TokenRowItem key={t.id} token={t} onRevoke={() => onRevoke(t.id)} />
          ))}
        </div>
      )}

      <UsageHint />
    </>
  );
}

function RevealedTokenBanner({
  token,
  raw,
  copied,
  onCopy,
  onClose,
}: {
  token: TokenRow;
  raw: string;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  return (
    <div className="border border-accent rounded-xl bg-white p-5 mb-6 shadow-[0_4px_16px_rgba(232,80,8,0.08)]">
      <div className="flex items-start gap-3">
        <Shield size={18} className="text-accent shrink-0 mt-1" strokeWidth={2.2} />
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-bold text-text mb-1">
            "{token.name}" 토큰이 발급됐습니다
          </div>
          <div className="text-[12.5px] text-text-soft mb-3">
            아래 토큰은 <strong className="text-danger">지금 한 번만 표시</strong>됩니다.
            안전한 곳(맥북 환경변수 / 1Password 등)에 즉시 저장하세요.
          </div>
          <div className="flex items-center gap-2 mb-3">
            <code className="flex-1 px-3 py-2 rounded-md bg-surface-2 text-[12.5px] font-mono break-all text-text">
              {raw}
            </code>
            <button
              onClick={onCopy}
              className="px-3 h-9 rounded-md bg-accent text-white text-[12px] font-semibold hover:bg-accent-hover flex items-center gap-1.5 shrink-0"
            >
              {copied ? (
                <>
                  <Check size={12} strokeWidth={2.4} /> 복사됨
                </>
              ) : (
                <>
                  <Copy size={12} strokeWidth={2.2} /> 복사
                </>
              )}
            </button>
          </div>
          <div className="text-[11.5px] text-text-faint font-mono bg-surface px-3 py-2 rounded">
            export VIBOX_API_TOKEN={raw}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-text-faint hover:text-text text-[12px] px-2 py-1"
        >
          닫기
        </button>
      </div>
    </div>
  );
}

function TokenRowItem({
  token,
  onRevoke,
}: {
  token: TokenRow;
  onRevoke: () => void;
}) {
  const revoked = !!token.revokedAt;
  return (
    <div className={`px-5 py-4 flex items-center gap-4 ${revoked ? "opacity-50" : ""}`}>
      <div className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${revoked ? "bg-surface text-text-faint" : "bg-accent-soft text-accent"}`}>
        <Key size={16} strokeWidth={2.2} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[14px] font-bold text-text truncate">{token.name}</span>
          {revoked && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-px rounded bg-danger-soft text-danger">
              <AlertTriangle size={9} /> 회수됨
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11.5px] text-text-faint">
          <code className="font-mono text-text-soft">{token.prefix}…</code>
          <span>·</span>
          <div className="flex gap-1">
            {token.scopes.map((s) => (
              <span key={s} className="px-1.5 py-px rounded bg-surface text-[10.5px] font-mono text-text-soft">
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="hidden md:flex flex-col items-end text-[11px] text-text-faint gap-0.5 shrink-0">
        <div className="flex items-center gap-1">
          <Clock size={10} />
          <span>최근: {token.lastUsedAt ? relativeTime(token.lastUsedAt) : "사용 안 됨"}</span>
        </div>
        <div>발급: {relativeTime(token.createdAt)}</div>
      </div>
      {!revoked && (
        <button
          onClick={onRevoke}
          title="회수"
          className="w-8 h-8 grid place-items-center rounded-md text-text-faint hover:bg-danger-soft hover:text-danger"
        >
          <Trash2 size={14} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

function UsageHint() {
  return (
    <div className="mt-6 border border-border rounded-xl bg-surface px-6 py-5">
      <div className="text-[13px] font-semibold text-text mb-3">사용 예 — 노트 저장</div>
      <pre className="text-[11.5px] font-mono leading-relaxed bg-white border border-border rounded-md p-4 overflow-x-auto">
{`curl -X POST https://vibox.cloud/api/notes/save \\
  -H "Authorization: Bearer $VIBOX_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "folder": "회의",
    "title": "제목",
    "tags": ["회의", "기획"],
    "content": "# 본문\\n\\n마크다운 본문..."
  }'`}
      </pre>
      <div className="text-[11px] text-text-faint mt-3 leading-relaxed">
        성공 시 응답: <code className="font-mono text-accent">{"{ ok, id, path, url, created }"}</code>.
        Notes/{"<folder>"}/{"<slug>"}.md 형태로 외장 SSD에 저장됩니다.
        <br />
        <code className="font-mono">folder</code> 미지정 시 <code className="font-mono">_inbox</code>로 저장.
        같은 이름 충돌 시 <code className="font-mono">-2, -3</code> suffix 자동 부여 (overwrite=true 면 덮어쓰기).
      </div>
    </div>
  );
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const sec = diff / 1000;
  if (sec < 60) return "방금";
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}일 전`;
  const d = new Date(ms);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}
