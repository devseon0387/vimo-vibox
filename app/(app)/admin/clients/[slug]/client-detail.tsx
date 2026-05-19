"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  Plus,
  X,
  FileVideo,
  Loader2,
  Trash2,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { FilePickerDialog } from "@/components/FilePickerDialog";

type Client = {
  id: string;
  name: string;
  slug: string;
  contactEmail: string | null;
  notes: string | null;
  active: boolean;
  createdAt: number;
};

type Video = {
  id: string;
  filePath: string;
  addedAt: number;
  status: "draft" | "sent" | "approved" | "archived";
};

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}

export function ClientDetail({ client }: { client: Client }) {
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const load = async () => {
    const r = await fetch(`/api/clients/${client.id}/videos`);
    if (r.ok) {
      const data = (await r.json()) as { videos: Video[] };
      setVideos(data.videos);
    }
  };
  useEffect(() => {
    load();
  }, [client.id]);

  const addVideo = async (filePath: string) => {
    const r = await fetch(`/api/clients/${client.id}/videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: [filePath] }),
    });
    if (!r.ok) {
      toast.error("추가 실패");
      return;
    }
    const data = (await r.json()) as { added: number; skipped: number };
    if (data.added > 0) toast.success("영상 추가됨");
    else if (data.skipped > 0) toast.info("이미 추가되어 있어요");
    setShowPicker(false);
    load();
  };

  const removeVideo = async (filePath: string, name: string) => {
    const ok = await confirm({
      title: "이 클라에서 영상 제거",
      message: (
        <>
          <span className="font-semibold">{name}</span> 을 이 클라이언트에서
          제거합니다. (실제 파일은 그대로 남아요.)
        </>
      ),
      confirmLabel: "제거",
      variant: "danger",
    });
    if (!ok) return;
    const r = await fetch(`/api/clients/${client.id}/videos`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: [filePath] }),
    });
    if (r.ok) {
      toast.success("제거됨");
      load();
    } else {
      toast.error("제거 실패");
    }
  };

  return (
    <div className="px-4 md:px-8 py-4 md:py-6 max-w-[1100px]">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12.5px] text-text-muted mb-3">
        <Link
          href="/admin/clients"
          className="hover:text-text transition-colors inline-flex items-center gap-1"
        >
          <ArrowLeft size={12} strokeWidth={2} />
          클라이언트
        </Link>
        <ChevronRight size={13} className="text-text-faint" strokeWidth={2} />
        <span className="text-text font-medium truncate">{client.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-[22px] font-bold mb-1">{client.name}</h1>
          <div className="text-[12.5px] text-text-muted font-mono">
            /c/{client.slug}
          </div>
          {client.contactEmail && (
            <div className="text-[12px] text-text-soft mt-1">
              {client.contactEmail}
            </div>
          )}
        </div>
      </div>

      {/* 영상 목록 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-bold flex items-center gap-2">
            <FileVideo size={14} strokeWidth={2.2} />
            컬렉션 영상
            {videos && (
              <span className="text-[11.5px] font-semibold text-accent bg-accent-soft rounded-full px-2 py-0.5">
                {videos.length}
              </span>
            )}
          </h2>
          <button
            onClick={() => setShowPicker(true)}
            className="bg-text text-white hover:bg-[#333] px-3 py-1.5 rounded-md text-[12.5px] font-semibold inline-flex items-center gap-1.5"
          >
            <Plus size={13} strokeWidth={2.5} />
            영상 추가
          </button>
        </div>

        {videos === null ? (
          <div className="grid place-items-center py-12 text-text-faint text-[13px]">
            <Loader2 size={18} className="animate-spin mb-2" />
            불러오는 중…
          </div>
        ) : videos.length === 0 ? (
          <div className="border-2 border-dashed border-border rounded-xl py-12 px-6 text-center bg-white">
            <FileVideo
              size={26}
              strokeWidth={1.6}
              className="mx-auto text-text-faint mb-3"
            />
            <div className="text-[14px] font-semibold text-text mb-1">
              아직 영상이 없어요
            </div>
            <div className="text-[12.5px] text-text-muted">
              위 &quot;영상 추가&quot; 버튼으로 렌더링 폴더에서 골라 담으세요
            </div>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-lg divide-y divide-[#f5f5f5]">
            {videos.map((v) => {
              const name = v.filePath.split("/").pop() ?? v.filePath;
              return (
                <div
                  key={v.id}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <FileVideo
                    size={15}
                    strokeWidth={2}
                    className="text-text-soft shrink-0"
                  />
                  <Link
                    href={`/vimo-box?path=${encodeURIComponent(v.filePath)}`}
                    className="flex-1 min-w-0 hover:text-accent"
                  >
                    <div className="text-[13px] text-text truncate">{name}</div>
                    <div className="text-[11px] text-text-faint truncate font-mono">
                      {v.filePath}
                    </div>
                  </Link>
                  <span className="shrink-0 text-[10.5px] text-text-faint">
                    {formatDate(v.addedAt)}
                  </span>
                  <button
                    onClick={() => removeVideo(v.filePath, name)}
                    title="이 클라에서 제거"
                    className="shrink-0 p-1 rounded hover:bg-danger-soft text-text-faint hover:text-danger"
                  >
                    <X size={13} strokeWidth={2.2} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <FilePickerDialog
        open={showPicker}
        onClose={() => setShowPicker(false)}
        onPick={(p, entry) => {
          if (entry.isFolder) {
            toast.info("영상 파일을 선택해주세요");
            return;
          }
          addVideo(p);
        }}
        title={`"${client.name}" 에 영상 추가`}
        confirmLabel="추가"
        excludePaths={(videos ?? []).map((v) => v.filePath)}
      />
      {confirmDialog}
    </div>
  );
}
