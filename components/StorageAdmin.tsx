"use client";

import { useState } from "react";
import {
  HardDrive,
  Search,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useConfirm } from "./ConfirmDialog";
import { useToast } from "./Toast";
import { humanError } from "@/lib/human-error";
import type { ReconcileReport } from "@/lib/reconcile";

function formatBytes(n: number): string {
  if (n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function StorageAdmin() {
  const [report, setReport] = useState<ReconcileReport | null>(null);
  const [loading, setLoading] = useState<"scan" | "apply" | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const toast = useToast();

  const runScan = async (apply: boolean) => {
    setLoading(apply ? "apply" : "scan");
    try {
      const res = await fetch("/api/admin/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(humanError(body.error ?? res.statusText, "general"));
        return;
      }
      setReport(body.report);
      if (apply) {
        toast.success(
          <>
            <span className="font-semibold">
              {formatBytes(body.report.totalBytesFreed)}
            </span>{" "}
            회수됨
          </>,
        );
      }
    } finally {
      setLoading(null);
    }
  };

  const onApply = async () => {
    if (!report || nothingToDo) return;
    if (report.storageSuspect) return; // 마운트 의심 시 삭제 차단 (서버도 거부)
    const ok = await confirm({
      title: "저장소 정리 실행",
      message: (
        <>
          아래 항목을 <span className="font-semibold text-text">완전히 삭제</span>{" "}
          합니다. 되돌릴 수 없어요.
          <br />
          <span className="text-[12px] text-text-muted">
            회수 용량: {formatBytes(report.totalBytesFreed)}
          </span>
        </>
      ),
      confirmLabel: "삭제",
      variant: "danger",
    });
    if (!ok) return;
    await runScan(true);
  };

  const nothingToDo =
    report &&
    report.legacyDir === null &&
    report.orphanThumbs.length === 0 &&
    report.orphanChunks.length === 0 &&
    report.orphanDb.comments.length === 0 &&
    report.orphanDb.fileUploads.length === 0 &&
    report.orphanDb.shareLinks.length === 0 &&
    report.orphanDb.scanHistory.length === 0 &&
    (report.oldTrafficLogs ?? 0) === 0;

  return (
    <>
      <div className="flex items-center gap-2 mb-1">
        <HardDrive size={18} strokeWidth={2.5} className="text-text" />
        <h1 className="text-[22px] font-bold">저장소 정리</h1>
      </div>
      <p className="text-[13px] text-text-muted mb-6">
        SSD 실제 파일과 DB/썸네일/청크 업로드를 대조해서 고아 데이터를 찾아내고 정리합니다.
      </p>

      {/* 액션 버튼 */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => runScan(false)}
          disabled={loading !== null}
          className="bg-text text-white hover:bg-[#333] disabled:opacity-60 transition-colors px-3.5 py-2 rounded-md text-[13px] font-semibold flex items-center gap-1.5"
        >
          {loading === "scan" ? (
            <Loader2 size={14} strokeWidth={2.5} className="animate-spin" />
          ) : (
            <Search size={14} strokeWidth={2.5} />
          )}
          스캔 (드라이런)
        </button>
        {report && !nothingToDo && !report.applied && !report.storageSuspect && (
          <button
            onClick={onApply}
            disabled={loading !== null}
            className="bg-danger text-white hover:opacity-90 disabled:opacity-60 transition-opacity px-3.5 py-2 rounded-md text-[13px] font-semibold flex items-center gap-1.5"
          >
            {loading === "apply" ? (
              <Loader2 size={14} strokeWidth={2.5} className="animate-spin" />
            ) : (
              <Trash2 size={14} strokeWidth={2.5} />
            )}
            삭제 실행 ({formatBytes(report.totalBytesFreed)})
          </button>
        )}
      </div>

      {/* 결과 */}
      {!report && (
        <div className="border border-dashed border-border rounded-lg py-12 px-6 text-center bg-white">
          <Search size={28} className="mx-auto text-text-faint mb-3" strokeWidth={1.5} />
          <div className="text-[14px] text-text-muted">스캔을 실행해 주세요</div>
          <div className="text-[12px] text-text-faint mt-1">
            드라이런이라 삭제되지 않아요
          </div>
        </div>
      )}

      {report && report.applied && (
        <div className="border border-[#bbf7d0] bg-success-soft rounded-lg p-4 mb-5 flex items-start gap-2.5">
          <CheckCircle2
            size={18}
            strokeWidth={2.5}
            className="text-success mt-0.5 shrink-0"
          />
          <div>
            <div className="text-[13.5px] font-semibold text-text">
              정리 완료 · {formatBytes(report.totalBytesFreed)} 회수
            </div>
            <div className="text-[12px] text-text-muted mt-0.5">
              SSD 활성 파일 {report.liveFileCount}개 기준
            </div>
          </div>
        </div>
      )}

      {report && report.storageSuspect && !report.applied && (
        <div className="border border-[#fed7aa] bg-[#fff7ed] rounded-lg p-4 mb-5 flex items-start gap-2.5">
          <AlertTriangle
            size={18}
            strokeWidth={2.5}
            className="text-danger mt-0.5 shrink-0"
          />
          <div>
            <div className="text-[13.5px] font-semibold text-text">
              스토리지 마운트 의심 — 삭제가 차단됐어요
            </div>
            <div className="text-[12px] text-text-muted mt-0.5">
              DB는 참조하는데 디스크엔 파일이 0개인 영역:{" "}
              <span className="font-semibold text-text">
                {report.suspectZones.join(", ")}
              </span>
              . 외장 볼륨이 언마운트됐을 수 있어요. 이 상태로 삭제하면 해당 영역의 DB
              기록이 통째로 지워집니다. STORAGE_ROOT 마운트를 확인한 뒤 다시 스캔하세요.
            </div>
          </div>
        </div>
      )}

      {report && nothingToDo && !report.storageSuspect && !report.applied && (
        <div className="border border-border rounded-lg py-10 px-6 text-center bg-white">
          <CheckCircle2
            size={28}
            className="mx-auto text-success mb-3"
            strokeWidth={2}
          />
          <div className="text-[14px] font-medium text-text">깨끗해요</div>
          <div className="text-[12px] text-text-muted mt-1">
            정리할 고아 데이터가 없어요 (활성 파일 {report.liveFileCount}개)
          </div>
        </div>
      )}

      {report && !nothingToDo && (
        <div className="space-y-3">
          {report.legacyDir && (
            <Section
              title="레거시 디렉터리"
              size={report.legacyDir.sizeBytes}
              count={report.legacyDir.files}
              unit="개 파일"
            >
              <div className="text-[12.5px] text-text-muted">
                <code className="bg-hover px-1 py-0.5 rounded font-mono">
                  {report.legacyDir.path}/
                </code>
                {" — "}이전 폴더명 (vimo-cloud → vibox 리네임 전) 잔해
              </div>
            </Section>
          )}

          <Section
            title="고아 썸네일"
            size={report.orphanThumbs.reduce((s, t) => s + t.sizeBytes, 0)}
            count={report.orphanThumbs.length}
            unit="개"
            hideIfEmpty
          >
            <ul className="text-[12px] text-text-muted space-y-1 max-h-32 overflow-y-auto">
              {report.orphanThumbs.slice(0, 20).map((t) => (
                <li key={t.path} className="font-mono">
                  {t.path} <span className="text-text-faint">· {formatBytes(t.sizeBytes)}</span>
                </li>
              ))}
              {report.orphanThumbs.length > 20 && (
                <li className="text-text-faint">
                  ... 외 {report.orphanThumbs.length - 20}개
                </li>
              )}
            </ul>
          </Section>

          <Section
            title="고아 청크 업로드"
            size={report.orphanChunks.reduce((s, c) => s + c.sizeBytes, 0)}
            count={report.orphanChunks.length}
            unit="개 세션"
            hideIfEmpty
          >
            <ul className="text-[12px] text-text-muted space-y-1">
              {report.orphanChunks.map((c) => (
                <li key={c.fileId} className="flex items-center gap-2">
                  <span className="font-medium text-text">
                    {c.filename ?? c.fileId.slice(0, 8)}
                  </span>
                  <span>
                    {formatBytes(c.sizeBytes)} · {c.ageHours}h 경과
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <DbSection orphanDb={report.orphanDb} />

          {(report.oldTrafficLogs ?? 0) > 0 && (
            <div className="border border-border bg-white rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[13.5px] font-semibold text-text">
                  오래된 트래픽 로그
                </span>
                <span className="text-[11.5px] text-text-muted bg-hover px-1.5 py-0.5 rounded">
                  {report.oldTrafficLogs}개
                </span>
              </div>
              <div className="text-[12.5px] text-text-muted">
                90일 이상 된 요청 기록. 디스크 용량만 소량 차지해요.
              </div>
            </div>
          )}
        </div>
      )}

      {confirmDialog}
    </>
  );
}

function Section({
  title,
  size,
  count,
  unit,
  children,
  hideIfEmpty,
}: {
  title: string;
  size: number;
  count: number;
  unit: string;
  children: React.ReactNode;
  hideIfEmpty?: boolean;
}) {
  if (hideIfEmpty && count === 0) return null;
  return (
    <div className="border border-border bg-white rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-semibold text-text">{title}</span>
          <span className="text-[11.5px] text-text-muted bg-hover px-1.5 py-0.5 rounded">
            {count}
            {unit}
          </span>
        </div>
        {size > 0 && (
          <span className="text-[12px] font-semibold text-danger">
            {formatBytes(size)}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function DbSection({
  orphanDb,
}: {
  orphanDb: ReconcileReport["orphanDb"];
}) {
  const total =
    orphanDb.comments.length +
    orphanDb.fileUploads.length +
    orphanDb.shareLinks.length +
    orphanDb.scanHistory.length;
  if (total === 0) return null;

  return (
    <div className="border border-border bg-white rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[13.5px] font-semibold text-text">DB 고아 행</span>
        <span className="text-[11.5px] text-text-muted bg-hover px-1.5 py-0.5 rounded">
          {total}개
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[12.5px]">
        <Stat label="댓글" count={orphanDb.comments.length} />
        <Stat label="업로드 소유권" count={orphanDb.fileUploads.length} />
        <Stat label="공유 링크" count={orphanDb.shareLinks.length} />
        <Stat label="검수 이력" count={orphanDb.scanHistory.length} />
      </div>
    </div>
  );
}

function Stat({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between px-2.5 py-1.5 bg-surface rounded">
      <span className="text-text-muted">{label}</span>
      <span className={`font-semibold ${count > 0 ? "text-danger" : "text-text-faint"}`}>
        {count}
      </span>
    </div>
  );
}
