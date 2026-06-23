"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Star,
  Share2,
  MoreHorizontal,
  ExternalLink,
  Plus,
  Filter,
  FileText,
  Copy,
  Check,
  Pencil,
  FolderInput,
  Trash2,
} from "lucide-react";
import type { NoteFolder, NoteSummary, NoteDetail } from "@/lib/notes";
import { humanError } from "@/lib/human-error";
import { NoteEditor } from "./NoteEditor";

type Props = {
  folders: NoteFolder[];
  notes: NoteSummary[];
  initialFolder: string | null;
  initialId: string | null;
  initialDetail: NoteDetail | null;
};

export function NotesPane({
  folders,
  notes,
  initialFolder,
  initialId,
  initialDetail,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const currentFolder = sp.get("folder") ?? initialFolder;
  const currentId = sp.get("id") ?? initialId;

  const [detail, setDetail] = useState<NoteDetail | null>(initialDetail);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Escape로 더보기 메뉴 닫기
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setMoveOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  useEffect(() => {
    // 노트가 바뀌면 편집 모드 강제 종료 (안전장치)
    setEditing(false);
    if (!currentId) {
      setDetail(null);
      return;
    }
    if (currentId === initialId && initialDetail) {
      setDetail(initialDetail);
      return;
    }
    let aborted = false;
    setLoadingDetail(true);
    fetch(`/api/dev/notes/file?id=${encodeURIComponent(currentId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: NoteDetail | null) => {
        if (!aborted) setDetail(d);
      })
      .finally(() => {
        if (!aborted) setLoadingDetail(false);
      });
    return () => {
      aborted = true;
    };
  }, [currentId, initialId, initialDetail]);

  const selectNote = (id: string) => {
    if (editing) {
      if (!window.confirm("편집 중입니다. 저장하지 않은 내용은 사라집니다. 이동할까요?")) {
        return;
      }
      setEditing(false);
    }
    const next = new URLSearchParams(sp.toString());
    next.set("id", id);
    router.push(`/dev/notes?${next.toString()}`);
  };

  const handleSaveEdit = async ({ title, content }: { title: string; content: string }) => {
    if (!detail) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (title !== detail.title) body.title = title;
      if (content !== detail.content) body.content = content;
      const r = await callPatch(body);
      if (!r.ok) {
        alert(humanError(r.error, "general"));
        return;
      }
      // 저장 성공 — 로컬 상태 업데이트
      setDetail({ ...detail, title, content, updated: Date.now() });
      setEditing(false);
      // 제목이 바뀌면 id도 바뀔 수 있음 (slug 재생성). 응답의 id로 이동.
      if (r.id && r.id !== detail.id) {
        await refresh(r.id);
      } else {
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  };

  const refresh = async (newId?: string) => {
    if (newId !== undefined) {
      const next = new URLSearchParams(sp.toString());
      if (newId) next.set("id", newId);
      else next.delete("id");
      router.push(`/dev/notes?${next.toString()}`);
    }
    router.refresh();
  };

  const callPatch = async (
    body: Record<string, unknown>,
  ): Promise<{ ok: true; id: string } | { ok: false; error: string }> => {
    if (!detail) return { ok: false, error: "no note" };
    const r = await fetch(
      `/api/dev/notes/mutate?id=${encodeURIComponent(detail.id)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      return { ok: false, error: j.error ?? "failed" };
    }
    const j = await r.json();
    return { ok: true, id: j.id };
  };

  const toggleStar = async () => {
    if (!detail || busy) return;
    setBusy(true);
    const r = await callPatch({ starred: !detail.starred });
    setBusy(false);
    if (r.ok) {
      setDetail({ ...detail, starred: !detail.starred });
      router.refresh();
    } else {
      alert(humanError(r.error, "general"));
    }
  };

  const renameNoteAction = async () => {
    if (!detail) return;
    setMenuOpen(false);
    const newTitle = window.prompt("새 제목", detail.title);
    if (!newTitle || newTitle.trim() === detail.title) return;
    setBusy(true);
    const r = await callPatch({ title: newTitle.trim() });
    setBusy(false);
    if (r.ok) {
      setDetail({ ...detail, title: newTitle.trim() });
      router.refresh();
    } else {
      alert(humanError(r.error, "rename"));
    }
  };

  const moveNoteAction = async (targetFolder: string) => {
    if (!detail || busy) return;
    setMoveOpen(false);
    setMenuOpen(false);
    if (targetFolder === detail.folder) return;
    setBusy(true);
    const r = await callPatch({ move: { folder: targetFolder } });
    setBusy(false);
    if (r.ok) {
      await refresh(r.id);
    } else {
      alert(humanError(r.error, "move"));
    }
  };

  const deleteNoteAction = async () => {
    if (!detail) return;
    setMenuOpen(false);
    if (!window.confirm(`"${detail.title}" 노트를 삭제할까요? 휴지통 없이 즉시 삭제됩니다.`)) return;
    setBusy(true);
    const r = await fetch(
      `/api/dev/notes/mutate?id=${encodeURIComponent(detail.id)}`,
      { method: "DELETE" },
    );
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(humanError(j.error, "delete"));
      return;
    }
    setDetail(null);
    await refresh("");
  };

  const headTitle = currentFolder ?? "전체 노트";
  const totalSize = notes.reduce((s, n) => s + n.size, 0);

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-[400px] flex-shrink-0 border-r border-border bg-white flex flex-col min-h-0">
        <div className="px-5 pt-5 pb-3 border-b border-border bg-white">
          <div className="flex items-baseline justify-between mb-1">
            <div>
              <div className="text-xl font-bold text-text">{headTitle}</div>
              <div className="text-sm text-text-faint mt-0.5">
                {notes.length}개 노트 · {(totalSize / 1024).toFixed(1)} KB
              </div>
            </div>
            <div className="flex gap-1.5">
              <button className="px-2.5 py-1.5 rounded-md text-sm text-text-soft bg-surface border border-border hover:bg-hover flex items-center gap-1">
                <Filter size={11} strokeWidth={2.4} /> 필터
              </button>
              <button className="px-2.5 py-1.5 rounded-md text-sm font-semibold bg-accent text-white border border-accent hover:bg-accent-hover flex items-center gap-1">
                <Plus size={11} strokeWidth={2.4} /> 새 노트
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {notes.length === 0 ? (
            <div className="p-10 text-center text-text-faint text-base">
              노트가 없습니다.
            </div>
          ) : (
            notes.map((n) => {
              const sel = n.id === currentId;
              return (
                <button
                  key={n.id}
                  onClick={() => selectNote(n.id)}
                  className={`block w-full text-left px-5 py-3.5 border-b border-border ${
                    sel
                      ? "bg-accent-soft border-l-[3px] border-l-accent pl-[17px]"
                      : "hover:bg-surface"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-md font-semibold truncate flex-1 text-text">
                      {n.title}
                    </span>
                    {n.starred && (
                      <Star
                        size={11}
                        className="fill-accent text-accent shrink-0"
                      />
                    )}
                  </div>
                  <div className="text-sm text-text-soft line-clamp-2 mb-1.5 leading-snug">
                    {n.excerpt}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-text-faint">
                    {n.tags.slice(0, 2).map((t) => (
                      <span
                        key={t}
                        className="px-1.5 py-px rounded bg-surface-2 text-text-soft text-2xs"
                      >
                        #{t}
                      </span>
                    ))}
                    <span className="ml-auto">{relativeTime(n.updated)}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="flex-1 min-w-0 min-h-0 bg-white flex flex-col relative">
        {!detail ? (
          <div className="flex-1 grid place-items-center text-text-faint text-base p-10 text-center">
            <div>
              <div className="w-16 h-16 rounded-full bg-surface mx-auto mb-4 grid place-items-center">
                <FileText size={26} strokeWidth={1.6} />
              </div>
              <div className="font-semibold text-text mb-1.5 text-lg">
                노트를 선택하세요
              </div>
              <div className="max-w-[260px] mx-auto leading-relaxed">
                왼쪽 리스트에서 노트를 클릭하면 본문이 여기 표시됩니다.
              </div>
            </div>
          </div>
        ) : editing ? (
          <NoteEditor
            noteId={detail.id}
            initialTitle={detail.title}
            initialContent={detail.content}
            saving={saving}
            onSave={handleSaveEdit}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <div className="px-6 pt-3.5 pb-2.5 border-b border-border flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <div className="text-sm text-text-faint">
                  <span>{detail.folder}</span>
                  <span className="mx-1.5 opacity-50">/</span>
                  <span className="text-text font-semibold">{detail.title}</span>
                </div>
                <div className="ml-auto flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  disabled={busy}
                  className="h-[30px] px-3 rounded-md border border-border bg-white text-text-soft hover:bg-surface flex items-center gap-1.5 text-sm font-semibold disabled:opacity-50"
                  title="수정"
                >
                  <Pencil size={13} strokeWidth={2.2} />
                  수정
                </button>
                <button
                  type="button"
                  onClick={toggleStar}
                  disabled={busy}
                  className="w-[30px] h-[30px] rounded-md border border-border bg-white text-text-soft hover:bg-surface grid place-items-center disabled:opacity-50"
                  title={detail.starred ? "즐겨찾기 해제" : "즐겨찾기"}
                >
                  <Star
                    size={14}
                    strokeWidth={2}
                    className={detail.starred ? "fill-accent text-accent" : ""}
                  />
                </button>
                <button
                  className="w-[30px] h-[30px] rounded-md border border-border bg-white text-text-soft hover:bg-surface grid place-items-center"
                  title="공유"
                >
                  <Share2 size={14} strokeWidth={2} />
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen((v) => !v);
                      setMoveOpen(false);
                    }}
                    className="w-[30px] h-[30px] rounded-md border border-border bg-white text-text-soft hover:bg-surface grid place-items-center"
                    title="더보기"
                  >
                    <MoreHorizontal size={14} strokeWidth={2} />
                  </button>
                  {menuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => {
                          setMenuOpen(false);
                          setMoveOpen(false);
                        }}
                      />
                      <div className="absolute right-0 mt-1 z-40 w-48 bg-white border border-border rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.08)] py-1">
                        <MenuButton
                          icon={Pencil}
                          label="이름 변경"
                          onClick={renameNoteAction}
                        />
                        <MenuButton
                          icon={FolderInput}
                          label="폴더 이동"
                          onClick={() => setMoveOpen((v) => !v)}
                          submenu={moveOpen}
                        />
                        {moveOpen && (
                          <div className="ml-3 border-l border-border pl-2 my-1 max-h-60 overflow-y-auto">
                            {folders.map((f) => (
                              <button
                                key={f.name}
                                type="button"
                                onClick={() => moveNoteAction(f.name)}
                                disabled={f.name === detail.folder}
                                className={`block w-full text-left px-3 py-1.5 text-sm rounded ${
                                  f.name === detail.folder
                                    ? "text-text-faint"
                                    : "text-text-soft hover:bg-surface"
                                }`}
                              >
                                {f.name === "_inbox" ? "수신함" : f.name}
                                {f.name === detail.folder && " (현재)"}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="my-1 border-t border-border" />
                        <MenuButton
                          icon={Trash2}
                          label="삭제"
                          onClick={deleteNoteAction}
                          danger
                        />
                      </div>
                    </>
                  )}
                </div>
                {process.env.NEXT_PUBLIC_SEON_HUB_URL && (
                  <a
                    href={`${process.env.NEXT_PUBLIC_SEON_HUB_URL}/notes/${encodeURIComponent(detail.id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-[30px] px-3 rounded-md bg-accent text-white text-sm font-semibold hover:bg-accent-hover flex items-center gap-1.5"
                  >
                    <ExternalLink size={13} strokeWidth={2.2} />
                    SEON Hub에서 편집
                  </a>
                )}
              </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(detail.path);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1400);
                  } catch {}
                }}
                className="self-start group flex items-center gap-1.5 text-xs text-text-faint hover:text-accent font-mono transition-colors"
                title="경로 복사"
              >
                <span className="opacity-80 group-hover:opacity-100">{detail.path}</span>
                {copied ? (
                  <Check size={11} strokeWidth={2.4} className="text-accent" />
                ) : (
                  <Copy size={11} strokeWidth={2} className="opacity-0 group-hover:opacity-70" />
                )}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-14 py-8">
              <div className="max-w-[760px]">
                <h1 className="text-[26px] font-extrabold mb-1.5 text-text">
                  {detail.title}
                </h1>
                <div className="text-text-faint text-sm mb-6 flex gap-3 items-center">
                  <span>{relativeTime(detail.updated)}</span>
                  <span>·</span>
                  <span>{(detail.size / 1024).toFixed(1)} KB</span>
                  {detail.tags.length > 0 && (
                    <>
                      <span>·</span>
                      <span>
                        {detail.tags.map((t) => `#${t}`).join(" ")}
                      </span>
                    </>
                  )}
                </div>
                <article>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={mdComponents}
                  >
                    {detail.content}
                  </ReactMarkdown>
                </article>
              </div>
            </div>
            {loadingDetail && (
              <div className="absolute top-3 right-3 text-xs text-text-faint bg-white px-2 py-1 rounded border border-border">
                로딩 중…
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

const mdComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-2xl font-bold mt-6 mb-3 text-text">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-xl font-bold mt-6 mb-2.5 text-text">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-lg font-bold mt-5 mb-2 text-text">{children}</h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-md leading-[1.75] text-text-muted mb-3">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc pl-6 mb-3 space-y-1">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal pl-6 mb-3 space-y-1">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-md leading-[1.7] text-text-muted">{children}</li>
  ),
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    const isBlock = Boolean(className);
    if (isBlock) return <code className={className}>{children}</code>;
    return (
      <code className="bg-surface-2 text-accent px-1.5 py-0.5 rounded text-sm font-mono">
        {children}
      </code>
    );
  },
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="bg-surface-2 p-4 rounded-md text-sm overflow-x-auto mb-3 font-mono leading-snug">
      {children}
    </pre>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-[3px] border-accent bg-accent-soft py-2 px-4 my-3 text-text-soft text-base rounded-r">
      {children}
    </blockquote>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="text-text font-semibold">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent underline underline-offset-2 hover:text-accent-hover"
    >
      {children}
    </a>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto mb-4">
      <table className="text-base border-collapse w-full">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border border-border px-3 py-2 text-left font-semibold bg-surface text-text">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border border-border px-3 py-2 text-text-muted">
      {children}
    </td>
  ),
  hr: () => <hr className="my-6 border-border" />,
};

function MenuButton({
  icon: Icon,
  label,
  onClick,
  danger,
  submenu,
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
  danger?: boolean;
  submenu?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left ${
        danger ? "text-danger hover:bg-danger-soft" : "text-text-soft hover:bg-surface"
      } ${submenu ? "bg-surface" : ""}`}
    >
      <Icon size={13} strokeWidth={2} className="opacity-80" />
      <span>{label}</span>
      {submenu !== undefined && (
        <span className="ml-auto text-2xs opacity-60">
          {submenu ? "▾" : "▸"}
        </span>
      )}
    </button>
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
