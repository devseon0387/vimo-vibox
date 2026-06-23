"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Trash2,
  Lock,
  Link as LinkIcon,
  ExternalLink,
  Plus,
  X,
  ChevronDown,
  ChevronRight,
  Eye,
  MessageSquare,
  FileVideo,
} from "lucide-react";
import { useConfirm } from "./ConfirmDialog";
import { useToast } from "./Toast";
import { FilePickerDialog } from "./FilePickerDialog";
import { humanError } from "@/lib/human-error";

export type ShareRow = {
  id: string;
  token: string;
  filePath: string;
  paths: string[];
  title: string | null;
  mode: "preview" | "full";
  hasPassword: boolean;
  expiresAt: number | null;
  downloadCount: number;
  createdAt: number;
};

function basename(p: string): string {
  return p.split("/").pop() ?? p;
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const abs = Math.abs(diff);
  const day = 24 * 60 * 60 * 1000;
  if (abs < 60 * 1000) return "방금";
  if (abs < 60 * 60 * 1000)
    return `${Math.floor(abs / (60 * 1000))}분 ${diff > 0 ? "전" : "후"}`;
  if (abs < day)
    return `${Math.floor(abs / (60 * 60 * 1000))}시간 ${diff > 0 ? "전" : "후"}`;
  const d = Math.floor(abs / day);
  if (d < 30) return `${d}일 ${diff > 0 ? "전" : "후"}`;
  const date = new Date(ms);
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}`;
}

function expiryText(expiresAt: number | null): {
  text: string;
  tone: "ok" | "warn" | "expired";
} {
  if (!expiresAt) return { text: "만료 없음", tone: "ok" };
  const diff = expiresAt - Date.now();
  if (diff <= 0) return { text: "만료됨", tone: "expired" };
  const day = 24 * 60 * 60 * 1000;
  if (diff < day)
    return {
      text: `${Math.ceil(diff / (60 * 60 * 1000))}시간 뒤`,
      tone: "warn",
    };
  return {
    text: `${Math.ceil(diff / day)}일 뒤`,
    tone: diff < 3 * day ? "warn" : "ok",
  };
}

export function SharesView({ items }: { items: ShareRow[] }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const { success, error: toastError } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addingTo, setAddingTo] = useState<ShareRow | null>(null);

  const toggle = (id: string) => {
    setExpanded((s) => {
      const ns = new Set(s);
      if (ns.has(id)) ns.delete(id);
      else ns.add(id);
      return ns;
    });
  };

  const copyLink = async (token: string) => {
    const url = `${window.location.origin}/s/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      success("링크 복사됨");
    } catch {
      toastError("클립보드 접근 실패");
    }
  };

  const revoke = async (item: ShareRow) => {
    const filename = item.title ?? basename(item.filePath);
    const ok = await confirm({
      title: "공유 링크 취소",
      message: (
        <>
          <span className="font-semibold text-text">{filename}</span>
          {" "}링크를 취소할까요?
          <br />이 링크로는 더 이상 접근할 수 없게 돼요.
        </>
      ),
      confirmLabel: "취소하기",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(item.id);
    try {
      const res = await fetch(`/api/shares/${item.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toastError(humanError(body.error ?? res.statusText, "share"));
        return;
      }
      success("링크가 취소됐어요");
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const addVersion = async (item: ShareRow, pickedPath: string) => {
    setBusy(item.id);
    try {
      const res = await fetch(`/api/shares/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addPaths: [pickedPath] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toastError(humanError(body.error ?? res.statusText, "share"));
        return;
      }
      const data = await res.json();
      const label = `V${data.paths.length}`;
      success(
        <>
          <span className="font-semibold">{label}</span> 추가됨:{" "}
          <span className="text-white/80">{basename(pickedPath)}</span>
        </>,
      );
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const removeVersion = async (item: ShareRow, targetPath: string) => {
    if (item.paths.length <= 1) {
      toastError("최소 1개 파일은 남겨야 해요");
      return;
    }
    const ok = await confirm({
      title: "버전 제거",
      message: (
        <>
          이 링크에서{" "}
          <span className="font-semibold text-text">
            {basename(targetPath)}
          </span>
          을 제거할까요?
          <br />
          파일 자체는 삭제되지 않고, 이 링크에서만 보이지 않게 돼요.
        </>
      ),
      confirmLabel: "제거",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(item.id);
    try {
      const res = await fetch(`/api/shares/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removePaths: [targetPath] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toastError(humanError(body.error ?? res.statusText, "share"));
        return;
      }
      success("버전 제거됨");
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="mb-5">
        <h1 className="text-[22px] font-bold">공유 링크</h1>
        <p className="text-[12.5px] text-text-faint mt-1">
          내가 만든 공유 링크를 관리해요. 한 링크에 여러 버전을 누적해서 클라에게
          같은 주소로 계속 전달할 수 있어요.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-12 text-center">
          <LinkIcon
            size={32}
            className="mx-auto text-text-faint mb-3"
            strokeWidth={1.5}
          />
          <div className="text-[14px] text-text-muted">
            만든 공유 링크가 없어요
          </div>
          <div className="text-[12px] text-text-faint mt-1">
            파일 목록에서 공유 링크 아이콘을 눌러 링크를 만들 수 있어요
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => {
            const exp = expiryText(item.expiresAt);
            const isOpen = expanded.has(item.id);
            const multi = item.paths.length > 1;
            const displayTitle =
              item.title ??
              (multi
                ? `${basename(item.paths[0])} 외 ${item.paths.length - 1}건`
                : basename(item.filePath));
            const parent =
              item.filePath.split("/").slice(0, -1).join("/") || "/";

            return (
              <div
                key={item.id}
                className={`bg-white border border-border rounded-lg overflow-hidden transition-opacity ${
                  busy === item.id ? "opacity-40" : ""
                }`}
              >
                {/* 요약 행 */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => toggle(item.id)}
                    className="shrink-0 text-text-faint hover:text-text"
                    title={isOpen ? "접기" : "펼치기"}
                  >
                    {isOpen ? (
                      <ChevronDown size={15} strokeWidth={2.2} />
                    ) : (
                      <ChevronRight size={15} strokeWidth={2.2} />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13.5px] font-semibold text-text truncate">
                        {displayTitle}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-[10.5px] font-bold px-1.5 py-0.5 rounded ${
                          item.mode === "full"
                            ? "bg-sky-100 text-sky-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {item.mode === "full" ? (
                          <MessageSquare size={9} strokeWidth={2.5} />
                        ) : (
                          <Eye size={9} strokeWidth={2.5} />
                        )}
                        {item.mode === "full" ? "풀" : "프리뷰"}
                      </span>
                      {multi && (
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                          V1~V{item.paths.length}
                        </span>
                      )}
                      {item.hasPassword && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-accent">
                          <Lock size={10} strokeWidth={2.2} />
                        </span>
                      )}
                    </div>
                    <div className="text-[11.5px] text-text-faint truncate mt-0.5">
                      {parent}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-[11.5px] text-text-soft">
                    <span
                      className={
                        exp.tone === "expired"
                          ? "text-danger font-semibold"
                          : exp.tone === "warn"
                            ? "text-warning"
                            : ""
                      }
                      title="만료"
                    >
                      {exp.text}
                    </span>
                    <span title="다운로드 횟수">
                      {item.downloadCount}회
                    </span>
                    <span className="text-text-faint" title="생성">
                      {formatRelative(item.createdAt)}
                    </span>
                  </div>

                  <div className="flex gap-0.5 shrink-0">
                    <button
                      onClick={() => copyLink(item.token)}
                      title="링크 복사"
                      className="p-1.5 rounded hover:bg-hover text-text-soft hover:text-accent"
                    >
                      <Copy size={14} strokeWidth={2} />
                    </button>
                    <a
                      href={`/s/${item.token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="새 탭에서 열기"
                      className="p-1.5 rounded hover:bg-hover text-text-soft hover:text-accent"
                    >
                      <ExternalLink size={14} strokeWidth={2} />
                    </a>
                    <button
                      onClick={() => revoke(item)}
                      disabled={busy === item.id}
                      title="링크 취소"
                      className="p-1.5 rounded hover:bg-danger-soft text-text-soft hover:text-danger disabled:opacity-50"
                    >
                      <Trash2 size={14} strokeWidth={2} />
                    </button>
                  </div>
                </div>

                {/* 확장 — 파일/버전 목록 */}
                {isOpen && (
                  <div className="border-t border-border bg-surface px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[11.5px] font-bold uppercase tracking-wider text-text-soft">
                        버전 ({item.paths.length})
                      </div>
                      <button
                        onClick={() => setAddingTo(item)}
                        className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-accent hover:bg-accent-soft px-2 py-0.5 rounded"
                      >
                        <Plus size={11} strokeWidth={2.5} />
                        버전 추가
                      </button>
                    </div>
                    <ul className="space-y-1">
                      {item.paths.map((p, idx) => (
                        <li
                          key={p}
                          className="flex items-center gap-2 text-[12.5px] bg-white border border-border rounded-md px-2.5 py-1.5"
                        >
                          <span className="font-mono font-bold text-[10.5px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 shrink-0">
                            V{idx + 1}
                          </span>
                          <FileVideo
                            size={12}
                            className="text-text-faint shrink-0"
                            strokeWidth={2}
                          />
                          <span className="flex-1 truncate text-text">
                            {basename(p)}
                          </span>
                          <span className="text-[10.5px] text-text-faint truncate max-w-[240px]">
                            {p}
                          </span>
                          {item.paths.length > 1 && (
                            <button
                              onClick={() => removeVersion(item, p)}
                              disabled={busy === item.id}
                              className="text-text-faint hover:text-danger p-0.5 shrink-0"
                              title="이 버전 제거"
                            >
                              <X size={12} strokeWidth={2.2} />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <FilePickerDialog
        open={!!addingTo}
        onClose={() => setAddingTo(null)}
        onPick={(p) => {
          if (addingTo) addVersion(addingTo, p);
        }}
        title={addingTo ? `${addingTo.title ?? basename(addingTo.filePath)}에 버전 추가` : "버전 추가"}
        excludePaths={addingTo?.paths ?? []}
        confirmLabel="추가"
      />

      {dialog}
    </>
  );
}
