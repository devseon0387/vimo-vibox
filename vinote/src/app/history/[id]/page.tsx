"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RotateCcw, Check } from "lucide-react";
import {
  listVersions, getVersion, restoreVersion,
  type NoteVersion,
} from "@/lib/api";
import { Shell } from "@/components/Shell";

export default function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const notePath = decodeURIComponent(id);
  const router = useRouter();

  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [body, setBody] = useState<string>("");
  const [loadingBody, setLoadingBody] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listVersions(notePath).then((v) => {
      if (cancelled) return;
      setVersions(v);
      if (v.length > 0) setSelectedId(v[0].id);
    });
    return () => {
      cancelled = true;
    };
  }, [notePath]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoadingBody(true);
    setConfirmRestore(false);
    getVersion(selectedId).then((v) => {
      if (cancelled) return;
      setBody(v?.body ?? "");
      setLoadingBody(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function handleRestore() {
    if (!selectedId) return;
    if (!confirmRestore) {
      setConfirmRestore(true);
      setTimeout(() => setConfirmRestore(false), 3000);
      return;
    }
    setRestoring(true);
    const r = await restoreVersion(notePath, selectedId);
    setRestoring(false);
    if (r.ok) router.push(`/n/${encodeURIComponent(notePath)}`);
    else alert(`복원 실패: ${r.error}`);
  }

  const selected = versions.find((v) => v.id === selectedId);

  return (
    <Shell>
      <div className="mx-auto w-full max-w-5xl px-8 py-10">
        <div className="mb-4 flex items-center justify-between">
          <Link
            href={`/n/${encodeURIComponent(notePath)}`}
            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900"
          >
            <ArrowLeft size={12} /> 노트로 돌아가기
          </Link>
          <h1 className="text-lg font-semibold">버전 이력 ({versions.length})</h1>
        </div>

        <div className="grid grid-cols-[260px,1fr] gap-3">
          {/* 좌측 버전 목록 */}
          <aside className="overflow-y-auto rounded-lg border border-zinc-200 bg-white" style={{ maxHeight: "calc(100vh - 180px)" }}>
            {versions.length === 0 && (
              <div className="p-4 text-xs text-zinc-400">버전 이력이 아직 없습니다.</div>
            )}
            <ul>
              {versions.map((v) => (
                <li key={v.id}>
                  <button
                    onClick={() => setSelectedId(v.id)}
                    className={`flex w-full flex-col items-start gap-0.5 border-b border-zinc-100 px-3 py-2 text-left text-xs hover:bg-zinc-50 ${
                      selectedId === v.id ? "bg-zinc-100" : ""
                    }`}
                  >
                    <span className="font-medium text-zinc-900">
                      {new Date(v.savedAt).toLocaleString("ko-KR", { hour12: false })}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {labelReason(v.reason)} · {(v.bytes ?? 0).toLocaleString()}B
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* 우측 본문 미리보기 */}
          <section className="flex flex-col rounded-lg border border-zinc-200 bg-white" style={{ maxHeight: "calc(100vh - 180px)" }}>
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2">
              <div className="text-xs text-zinc-500">
                {selected ? (
                  <>
                    {new Date(selected.savedAt).toLocaleString("ko-KR", { hour12: false })} · {labelReason(selected.reason)}
                  </>
                ) : "버전을 선택하세요"}
              </div>
              {selected && (
                <button
                  onClick={handleRestore}
                  disabled={restoring}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs ${
                    confirmRestore ? "bg-red-500 text-white" : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  {confirmRestore ? <Check size={12} /> : <RotateCcw size={12} />}
                  {restoring ? "복원 중…" : confirmRestore ? "한번 더 클릭하면 복원" : "이 버전으로 복원"}
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingBody ? (
                <div className="text-xs text-zinc-400">불러오는 중…</div>
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-700">
                  {body || "(빈 본문)"}
                </pre>
              )}
            </div>
          </section>
        </div>
      </div>
    </Shell>
  );
}

function labelReason(reason: string | null): string {
  switch (reason) {
    case "manual": return "수동 저장";
    case "autosave": return "자동저장";
    case "conflict": return "충돌 해결";
    case "restore": return "복원 전 백업";
    default: return reason ?? "—";
  }
}
