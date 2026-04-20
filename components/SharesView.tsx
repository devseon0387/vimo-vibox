"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Trash2, Lock, Link as LinkIcon, ExternalLink } from "lucide-react";
import { useConfirm } from "./ConfirmDialog";
import { useToast } from "./Toast";

export type ShareRow = {
  id: string;
  token: string;
  filePath: string;
  hasPassword: boolean;
  expiresAt: number | null;
  downloadCount: number;
  createdAt: number;
};

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const abs = Math.abs(diff);
  const day = 24 * 60 * 60 * 1000;
  if (abs < 60 * 1000) return "방금";
  if (abs < 60 * 60 * 1000) return `${Math.floor(abs / (60 * 1000))}분 ${diff > 0 ? "전" : "후"}`;
  if (abs < day) return `${Math.floor(abs / (60 * 60 * 1000))}시간 ${diff > 0 ? "전" : "후"}`;
  const d = Math.floor(abs / day);
  if (d < 30) return `${d}일 ${diff > 0 ? "전" : "후"}`;
  const date = new Date(ms);
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}`;
}

function expiryText(expiresAt: number | null): { text: string; tone: "ok" | "warn" | "expired" } {
  if (!expiresAt) return { text: "만료 없음", tone: "ok" };
  const diff = expiresAt - Date.now();
  if (diff <= 0) return { text: "만료됨", tone: "expired" };
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return { text: `${Math.ceil(diff / (60 * 60 * 1000))}시간 뒤`, tone: "warn" };
  return { text: `${Math.ceil(diff / day)}일 뒤`, tone: diff < 3 * day ? "warn" : "ok" };
}

export function SharesView({ items }: { items: ShareRow[] }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const { success, error: toastError } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

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
    const filename = item.filePath.split("/").pop() ?? item.filePath;
    const ok = await confirm({
      title: "공유 링크 취소",
      message: (
        <>
          <span className="font-semibold text-text">{filename}</span>
          {" "}링크를 취소할까요?
          <br />이 링크로는 더 이상 다운로드할 수 없게 돼요.
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
        toastError("취소 실패: " + (body.error ?? res.statusText));
        return;
      }
      success("링크가 취소됐어요");
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
          내가 만든 공유 링크를 관리해요. 링크를 취소하면 즉시 접근이 막혀요.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-12 text-center">
          <LinkIcon size={32} className="mx-auto text-text-faint mb-3" strokeWidth={1.5} />
          <div className="text-[14px] text-text-muted">만든 공유 링크가 없어요</div>
          <div className="text-[12px] text-text-faint mt-1">
            파일 목록에서 공유 링크 아이콘을 눌러 링크를 만들 수 있어요
          </div>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-x-auto bg-white">
          <table className="w-full min-w-[780px] text-[13px]">
            <thead className="bg-surface border-b border-border">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold text-[11.5px] text-text-soft uppercase tracking-wider">
                  파일
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-[11.5px] text-text-soft uppercase tracking-wider w-[110px]">
                  보안
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-[11.5px] text-text-soft uppercase tracking-wider w-[110px]">
                  만료
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-[11.5px] text-text-soft uppercase tracking-wider w-[100px]">
                  다운로드
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-[11.5px] text-text-soft uppercase tracking-wider w-[110px]">
                  생성
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-[11.5px] text-text-soft uppercase tracking-wider w-[130px]">
                  작업
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const filename = item.filePath.split("/").pop() ?? item.filePath;
                const parent = item.filePath.split("/").slice(0, -1).join("/") || "/";
                const exp = expiryText(item.expiresAt);
                return (
                  <tr
                    key={item.id}
                    className={`border-b border-[#f5f5f5] hover:bg-surface transition-colors ${
                      busy === item.id ? "opacity-40" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="text-text truncate font-medium">{filename}</div>
                      <div className="text-[11.5px] text-text-faint truncate mt-0.5">
                        {parent}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {item.hasPassword ? (
                        <span className="inline-flex items-center gap-1 text-[12px] text-accent bg-accent-soft px-2 py-0.5 rounded">
                          <Lock size={11} strokeWidth={2.2} /> 비밀번호
                        </span>
                      ) : (
                        <span className="text-[12px] text-text-faint">없음</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-[12px] ${
                          exp.tone === "expired"
                            ? "text-danger font-semibold"
                            : exp.tone === "warn"
                              ? "text-warning"
                              : "text-text-soft"
                        }`}
                      >
                        {exp.text}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-text-soft">
                      {item.downloadCount}회
                    </td>
                    <td className="px-4 py-2.5 text-text-faint text-[12px]">
                      {formatRelative(item.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-0.5 items-center">
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialog}
    </>
  );
}
