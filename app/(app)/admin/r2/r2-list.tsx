"use client";

import { useEffect, useState } from "react";
import { Trash2, Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/components/Toast";
import { humanError } from "@/lib/human-error";

type Item = { path: string; name: string; bytes: number; cachedAt: number };
type Data = {
  enabled: boolean;
  items: Item[];
  total: number;
  count: number;
  capBytes: number;
};

const gb = (b: number) => (b / 1e9).toFixed(2) + " GB";
const mb = (b: number) => Math.round(b / 1048576).toLocaleString() + " MB";
function ago(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "방금";
  if (s < 3600) return Math.floor(s / 60) + "분 전";
  if (s < 86400) return Math.floor(s / 3600) + "시간 전";
  return Math.floor(s / 86400) + "일 전";
}

export function R2List() {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const r = await fetch("/api/admin/r2");
    if (r.ok) setData((await r.json()) as Data);
    else {
      toast.error("불러오기 실패");
      setData({ enabled: false, items: [], total: 0, count: 0, capBytes: 1e10 });
    }
  };
  useEffect(() => {
    load();
  }, []);

  const del = async (path: string, name: string) => {
    if (!confirm(`"${name}" 를 R2에서 내릴까요?\n(서버 정본은 그대로, 다운로드는 서버로 폴백됩니다)`)) return;
    setBusy(path);
    try {
      const r = await fetch("/api/admin/r2", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        toast.error(humanError(b.error ?? r.statusText, "general"));
        return;
      }
      toast.success("R2에서 내림");
      await load();
    } finally {
      setBusy(null);
    }
  };

  const delAll = async () => {
    if (!data?.count) return;
    if (!confirm(`R2 캐시 ${data.count}개를 전부 내릴까요?`)) return;
    setBusy("__all__");
    try {
      const r = await fetch("/api/admin/r2", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!r.ok) {
        toast.error("삭제 실패");
        return;
      }
      toast.success("전체 내림");
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (!data)
    return (
      <div className="flex items-center gap-2 text-text-muted text-sm">
        <Loader2 className="animate-spin" size={16} /> 불러오는 중…
      </div>
    );
  if (!data.enabled)
    return <div className="text-sm text-text-muted">R2가 설정되지 않았습니다 (env 없음).</div>;

  const pct = Math.min(100, Math.round((data.total / data.capBytes) * 100));

  return (
    <div>
      <div className="mb-6 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-sm font-medium">
            사용량 {gb(data.total)}{" "}
            <span className="text-text-muted">/ {gb(data.capBytes)} · {data.count}개</span>
          </span>
          <button
            onClick={load}
            className="text-text-muted hover:text-text inline-flex items-center gap-1 text-xs"
          >
            <RefreshCw size={13} /> 새로고침
          </button>
        </div>
        <div className="h-2 rounded-full bg-hover overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: pct + "%" }}
          />
        </div>
      </div>

      {data.count === 0 ? (
        <div className="text-sm text-text-muted py-10 text-center">
          R2에 올라간 영상이 없습니다. 영상을 업로드하면 자동으로 채워집니다.
        </div>
      ) : (
        <>
          <div className="flex justify-end mb-2">
            <button
              onClick={delAll}
              disabled={busy === "__all__"}
              className="text-sm text-red-600 hover:text-red-700 inline-flex items-center gap-1 disabled:opacity-50"
            >
              {busy === "__all__" ? (
                <Loader2 className="animate-spin" size={14} />
              ) : (
                <Trash2 size={14} />
              )}{" "}
              전체 내리기
            </button>
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-text-muted">
                <tr>
                  <th className="text-left font-medium px-3 py-2">영상</th>
                  <th className="text-right font-medium px-3 py-2 w-24">크기</th>
                  <th className="text-right font-medium px-3 py-2 w-24">적재</th>
                  <th className="px-3 py-2 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it) => (
                  <tr key={it.path} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="font-medium truncate max-w-[440px]" title={it.path}>
                        {it.name}
                      </div>
                      <div className="text-xs text-text-muted truncate max-w-[440px]">
                        {it.path}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{mb(it.bytes)}</td>
                    <td className="px-3 py-2 text-right text-text-muted">{ago(it.cachedAt)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => del(it.path, it.name)}
                        disabled={busy === it.path}
                        title="R2에서 내리기"
                        className="text-text-muted hover:text-red-600 disabled:opacity-50"
                      >
                        {busy === it.path ? (
                          <Loader2 className="animate-spin" size={15} />
                        ) : (
                          <Trash2 size={15} />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
