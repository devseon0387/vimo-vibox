"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  Loader2,
  Check,
  X,
  AlertCircle,
} from "lucide-react";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

type Candidate = {
  erpId: string;
  name: string;
  email: string | null;
  contactPerson: string | null;
  company: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  alreadyImported: boolean;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "2-digit",
    month: "short",
    day: "numeric",
  });
}

export function ErpImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const toast = useToast();
  const [list, setList] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setList(null);
    setError(null);
    setSelected(new Set());
    (async () => {
      const r = await fetch("/api/clients/import");
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(body.error ?? r.statusText);
        setList([]);
        return;
      }
      const data = (await r.json()) as { candidates: Candidate[] };
      setList(data.candidates);
    })();
  }, [open]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllNew = () => {
    if (!list) return;
    setSelected(
      new Set(list.filter((c) => !c.alreadyImported).map((c) => c.erpId)),
    );
  };

  const doImport = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    try {
      const r = await fetch("/api/clients/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ erpIds: Array.from(selected) }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        toast.error("가져오기 실패: " + (body.error ?? r.statusText));
        return;
      }
      const data = (await r.json()) as { added: number; skipped: number };
      toast.success(
        `${data.added}개 가져옴${data.skipped > 0 ? ` (${data.skipped}개 이미 있음)` : ""}`,
      );
      onImported();
      onClose();
    } finally {
      setImporting(false);
    }
  };

  const newCount = list?.filter((c) => !c.alreadyImported).length ?? 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Building2 size={15} strokeWidth={2.2} />
          비모 ERP에서 클라이언트 가져오기
        </span>
      }
      maxWidth="max-w-xl"
    >
      <div className="p-5">
        <div className="text-[12px] text-text-muted mb-3">
          비모 ERP의 26-03-01 이후 등록된 클라이언트 목록입니다. 가져올 항목을
          선택하세요. 이미 가져온 건 회색 처리 됨.
        </div>

        {list === null ? (
          <div className="grid place-items-center py-12 text-text-faint text-[13px]">
            <Loader2 size={18} className="animate-spin mb-2" />
            ERP 에서 불러오는 중…
          </div>
        ) : error ? (
          <div className="bg-rose-50 border border-rose-200 rounded-md p-4 text-[12.5px] text-rose-700">
            <AlertCircle
              size={14}
              strokeWidth={2.2}
              className="inline-block mr-1 -mt-0.5"
            />
            <span className="font-semibold">ERP 연결 실패</span>
            <div className="mt-1 font-mono text-[11.5px] text-rose-600">
              {error}
            </div>
            <div className="mt-2 text-[11.5px] text-rose-600">
              <code>.env.local</code> 에 <code>ERP_SUPABASE_URL</code> 과{" "}
              <code>ERP_SUPABASE_SERVICE_ROLE_KEY</code> 가 설정돼있는지 확인하세요.
            </div>
          </div>
        ) : list.length === 0 ? (
          <div className="text-[13px] text-text-faint py-8 text-center">
            ERP 에 가져올 클라이언트가 없어요.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2 text-[12px]">
              <span className="text-text-soft">
                <span className="font-semibold text-text">{newCount}</span>개
                새 항목 / 총 {list.length}
              </span>
              {newCount > 0 && (
                <button
                  onClick={selectAllNew}
                  className="text-accent hover:underline"
                >
                  새 항목 모두 선택
                </button>
              )}
            </div>
            <div className="bg-surface border border-border rounded-md max-h-[360px] overflow-y-auto">
              {list.map((c) => {
                const isSelected = selected.has(c.erpId);
                const disabled = c.alreadyImported;
                return (
                  <button
                    key={c.erpId}
                    onClick={() => !disabled && toggle(c.erpId)}
                    disabled={disabled}
                    className={`w-full flex items-start gap-2.5 px-3 py-2 text-left border-b border-[#f0f0f0] last:border-b-0 transition-colors ${
                      disabled
                        ? "opacity-50 cursor-not-allowed"
                        : isSelected
                          ? "bg-accent-soft"
                          : "hover:bg-white"
                    }`}
                  >
                    <span className="mt-0.5 shrink-0 w-4">
                      {disabled ? (
                        <Check
                          size={13}
                          strokeWidth={2.5}
                          className="text-emerald-600"
                        />
                      ) : (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          className="cursor-pointer"
                        />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-text truncate">
                        {c.name}
                        {disabled && (
                          <span className="ml-2 text-[10.5px] font-normal text-emerald-600">
                            가져옴
                          </span>
                        )}
                      </div>
                      <div className="text-[11.5px] text-text-faint truncate">
                        {c.email ?? c.contactPerson ?? c.company ?? "—"}
                        {" · "}
                        {formatDate(c.createdAt)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-[13.5px] font-medium text-text-muted hover:text-text hover:bg-hover rounded-md transition-colors"
          >
            취소
          </button>
          <button
            onClick={doImport}
            disabled={importing || selected.size === 0}
            className="flex-1 bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed py-2 rounded-md text-[13.5px] font-semibold inline-flex items-center justify-center gap-1.5"
          >
            {importing && <Loader2 size={13} className="animate-spin" />}
            {importing
              ? "가져오는 중…"
              : selected.size > 0
                ? `${selected.size}개 가져오기`
                : "선택해주세요"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
