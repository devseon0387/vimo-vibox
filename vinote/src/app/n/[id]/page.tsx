"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { use } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { ArrowLeft, Check, Star, AlertCircle, Sparkles, History } from "lucide-react";
import { getNote, saveNote, starNote, type NoteDetail, type SaveResult } from "@/lib/api";
import { Editor, getEditorMarkdown } from "@/components/Editor";
import { AiMenu, ProposalCard, PolishDiff, type Proposal, type PolishPreview } from "@/components/AiMenu";
import { WikiLinkSuggest } from "@/components/WikiLinkSuggest";

const AUTOSAVE_DEBOUNCE_MS = 600;

export default function NoteEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const notePath = decodeURIComponent(id);

  const [note, setNote] = useState<NoteDetail | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [starred, setStarred] = useState(false);
  const [mtimeMs, setMtimeMs] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "edited" | "saving" | "saved" | "error" | "conflict">("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [conflictBody, setConflictBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBody = useRef<string | null>(null);
  const pendingTitle = useRef<string | null>(null);
  const editorRef = useRef<TiptapEditor | null>(null);
  const [editorInstance, setEditorInstance] = useState<TiptapEditor | null>(null);

  // AI 관련 상태
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [polishPreview, setPolishPreview] = useState<PolishPreview | null>(null);

  // 초기 로드
  useEffect(() => {
    let cancelled = false;
    getNote(notePath).then((n) => {
      if (cancelled) return;
      if (!n) {
        setError("노트를 찾을 수 없습니다");
        return;
      }
      setNote(n);
      const m = n.meta as { title?: string; starred?: boolean };
      setTitle(m.title ?? "");
      setBody(n.body);
      setStarred(!!m.starred);
      setMtimeMs(n.mtimeMs);
    });
    return () => {
      cancelled = true;
    };
  }, [notePath]);

  // beforeunload — 저장 안 된 변경 보호
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (saveStatus === "edited" || saveStatus === "saving") {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveStatus]);

  // 단축키 (Cmd+. 집중모드)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault();
        setFocusMode((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function performSave(manual = false): Promise<void> {
    if (mtimeMs === null) return; // 아직 로드 전
    const nextBody = pendingBody.current ?? body;
    const nextTitle = pendingTitle.current ?? title;
    setSaveStatus("saving");
    const result: SaveResult = await saveNote({
      path: notePath,
      body: nextBody,
      meta: { ...(note?.meta ?? {}), title: nextTitle, starred, updated: new Date().toISOString() },
      ifMatch: mtimeMs,
      manual,
    });
    if (result.ok) {
      setMtimeMs(result.mtimeMs);
      setSaveStatus("saved");
      setSavedAt(Date.now());
      pendingBody.current = null;
      pendingTitle.current = null;
      return;
    }
    if (result.conflict) {
      setConflictBody(result.serverBody);
      setSaveStatus("conflict");
      return;
    }
    setSaveStatus("error");
    setError(result.error);
  }

  function scheduleSave() {
    setSaveStatus("edited");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void performSave(false);
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  function onBodyChange(md: string) {
    setBody(md);
    pendingBody.current = md;
    scheduleSave();
  }

  function onTitleChange(t: string) {
    setTitle(t);
    pendingTitle.current = t;
    scheduleSave();
  }

  // 현재 selection 추출
  function getSelectionCtx(): { start: number; end: number; text: string } | null {
    const editor = editorRef.current;
    if (!editor) return null;
    const { from, to } = editor.state.selection;
    if (from === to) return null;
    const text = editor.state.doc.textBetween(from, to, "\n").trim();
    if (!text) return null;
    return { start: from, end: to, text };
  }

  function applyProposalToEnd(p: Proposal) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.chain().focus("end").insertContent("\n\n" + p.text).run();
    setProposals((arr) => arr.filter((x) => x.id !== p.id));
  }

  function dismissProposal(id: string) {
    setProposals((arr) => arr.filter((x) => x.id !== id));
  }

  function applyPolish() {
    if (!polishPreview) return;
    const editor = editorRef.current;
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertContentAt({ from: polishPreview.selStart, to: polishPreview.selEnd }, polishPreview.suggested)
      .run();
    setPolishPreview(null);
  }

  function forceSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    void performSave(true);
  }

  async function toggleStar() {
    const next = !starred;
    setStarred(next);
    await starNote(notePath, next);
  }

  function resolveConflictTakeMine() {
    if (conflictBody === null) return;
    // 내 본문 유지 + 서버 mtime을 새 ifMatch로 다음 저장 시도 → 덮어씀
    setConflictBody(null);
    setSaveStatus("edited");
    // mtimeMs를 서버 것으로 갱신 (다음 save가 통과)
    void (async () => {
      const fresh = await getNote(notePath);
      if (fresh) setMtimeMs(fresh.mtimeMs);
      void performSave(true);
    })();
  }

  function resolveConflictTakeServer() {
    if (conflictBody === null) return;
    setBody(conflictBody);
    pendingBody.current = null;
    setConflictBody(null);
    void (async () => {
      const fresh = await getNote(notePath);
      if (fresh) {
        setMtimeMs(fresh.mtimeMs);
        setNote(fresh);
        setSaveStatus("saved");
      }
    })();
  }

  if (error && !note) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-zinc-500">
        {error}
      </div>
    );
  }

  return (
    <div className={`mx-auto flex min-h-screen flex-col ${focusMode ? "" : "max-w-[760px]"} px-6`}>
      {!focusMode && (
        <header className="flex items-center justify-between gap-3 py-4 text-sm text-zinc-500">
          <Link href="/" className="inline-flex items-center gap-1 hover:text-zinc-900">
            <ArrowLeft size={14} /> 홈
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href={`/history/${encodeURIComponent(notePath)}`}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
              title="버전 이력"
            >
              <History size={14} /> 이력
            </Link>
            <button
              onClick={() => setAiMenuOpen(true)}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-zinc-500 hover:bg-zinc-100 hover:text-violet-700"
              title="AI 어시스트 (⌘/)"
            >
              <Sparkles size={14} /> AI
            </button>
            <button
              onClick={toggleStar}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 ${
                starred ? "text-amber-500" : "text-zinc-400 hover:text-zinc-700"
              }`}
              title="즐겨찾기"
            >
              <Star size={14} fill={starred ? "currentColor" : "none"} />
            </button>
            <SaveBadge status={saveStatus} savedAt={savedAt} />
          </div>
        </header>
      )}

      <input
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="제목"
        className="bg-transparent py-4 text-3xl font-semibold tracking-tight outline-none placeholder:text-zinc-300"
      />

      {/* AI 제안 카드 + 다듬기 모달 */}
      {proposals.map((p) => (
        <ProposalCard
          key={p.id}
          proposal={p}
          onInsert={() => applyProposalToEnd(p)}
          onDismiss={() => dismissProposal(p.id)}
        />
      ))}
      {polishPreview && (
        <PolishDiff preview={polishPreview} onApply={applyPolish} onCancel={() => setPolishPreview(null)} />
      )}

      <div className="flex-1 pb-32">
        <Editor
          initialMarkdown={body}
          onChange={onBodyChange}
          onSaveShortcut={forceSave}
          onAiShortcut={() => setAiMenuOpen(true)}
          onMount={(ed) => {
            editorRef.current = ed;
            setEditorInstance(ed);
            const current = getEditorMarkdown(ed);
            if (body && body !== current) {
              ed.commands.setContent(body, { emitUpdate: false });
            }
          }}
          placeholder="여기서부터 글을 쓰세요. ⌘+. 집중 모드 · ⌘+/ AI."
        />
      </div>

      <AiMenu
        open={aiMenuOpen}
        onClose={() => setAiMenuOpen(false)}
        ctx={{ body, selection: getSelectionCtx() }}
        onProposal={(p) => setProposals((arr) => [p, ...arr])}
        onPolish={setPolishPreview}
      />

      <WikiLinkSuggest editor={editorInstance} />

      {conflictBody !== null && (
        <ConflictModal
          mine={body}
          server={conflictBody}
          onTakeMine={resolveConflictTakeMine}
          onTakeServer={resolveConflictTakeServer}
        />
      )}
    </div>
  );
}

function SaveBadge({
  status,
  savedAt,
}: {
  status: "idle" | "edited" | "saving" | "saved" | "error" | "conflict";
  savedAt: number | null;
}) {
  if (status === "idle") return null;
  if (status === "edited") return <span className="text-amber-600">편집됨</span>;
  if (status === "saving")
    return (
      <span className="inline-flex items-center gap-1">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400" /> 저장 중…
      </span>
    );
  if (status === "saved")
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600">
        <Check size={12} /> 저장됨
        {savedAt && ` · ${rel(savedAt)}`}
      </span>
    );
  if (status === "conflict")
    return (
      <span className="inline-flex items-center gap-1 text-red-600">
        <AlertCircle size={12} /> 충돌
      </span>
    );
  return <span className="text-red-600">저장 실패</span>;
}

function ConflictModal({
  mine,
  server,
  onTakeMine,
  onTakeServer,
}: {
  mine: string;
  server: string;
  onTakeMine: () => void;
  onTakeServer: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-3xl rounded-md border border-zinc-200 bg-white shadow-xl">
        <div className="border-b border-zinc-100 px-5 py-3">
          <h3 className="text-sm font-semibold">충돌 — 다른 곳에서 이 노트가 수정됐어요</h3>
          <p className="mt-1 text-xs text-zinc-500">
            어느 버전을 유지할지 선택하세요. 선택 안 한 쪽은 사라집니다.
          </p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-zinc-100">
          <div className="p-4">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-400">내가 쓴 것</div>
            <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded border border-zinc-100 bg-zinc-50 p-2 text-xs leading-relaxed">
              {mine || "(빈 본문)"}
            </div>
          </div>
          <div className="p-4">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-400">서버 현재</div>
            <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded border border-zinc-100 bg-zinc-50 p-2 text-xs leading-relaxed">
              {server || "(빈 본문)"}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-100 px-5 py-3">
          <button onClick={onTakeServer} className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700">
            서버 버전 가져오기
          </button>
          <button onClick={onTakeMine} className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700">
            내 변경 유지 (덮어쓰기)
          </button>
        </div>
      </div>
    </div>
  );
}

function rel(ts: number) {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 5) return "방금";
  if (d < 60) return `${d}초 전`;
  return `${Math.floor(d / 60)}분 전`;
}
