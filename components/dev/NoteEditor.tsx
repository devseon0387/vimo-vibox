"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import LinkExt from "@tiptap/extension-link";
import ImageExt from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { humanError } from "@/lib/human-error";
import {
  Bold,
  Italic,
  Underline as UIcon,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link2,
  Quote,
  Minus,
  Image as ImageIcon,
  Eye,
  Pencil,
  Smartphone,
  Monitor,
} from "lucide-react";

type Props = {
  noteId: string; // "folder/slug"
  initialTitle: string;
  initialContent: string; // markdown
  saving: boolean;
  onSave: (next: { title: string; content: string }) => Promise<void> | void;
  onCancel: () => void;
};

type Mode = "edit" | "preview";
type Device = "desktop" | "mobile";

export function NoteEditor({
  noteId,
  initialTitle,
  initialContent,
  saving,
  onSave,
  onCancel,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [mode, setMode] = useState<Mode>("edit");
  const [device, setDevice] = useState<Device>("desktop");
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        code: false,
        strike: false,
        // Tiptap 3에서 default false인 것들도 명시
      }),
      Underline,
      LinkExt.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      ImageExt.configure({
        allowBase64: false,
        inline: false,
      }),
      Placeholder.configure({
        placeholder: "내용을 작성하세요. 이미지는 끌어다 놓거나 붙여넣기로 추가할 수 있어요.",
      }),
      Markdown.configure({
        html: false,
        tightLists: true,
        bulletListMarker: "-",
        breaks: true,
        transformPastedText: true,
      }),
    ],
    content: initialContent,
    onUpdate: () => {
      dirtyRef.current = true;
    },
  });

  useEffect(() => {
    editor?.setEditable(mode === "edit");
  }, [editor, mode]);

  // ===== 이미지 업로드 =====
  const uploadFile = useCallback(
    async (file: File): Promise<string | null> => {
      if (!file.type.startsWith("image/")) {
        showToast("이미지 파일만 업로드 가능합니다");
        return null;
      }
      const fd = new FormData();
      fd.append("noteId", noteId);
      fd.append("file", file);
      fd.append("filename", file.name || `image-${Date.now()}.png`);
      setUploading(true);
      try {
        const r = await fetch("/api/dev/notes/attachment", {
          method: "POST",
          body: fd,
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          showToast(humanError(j.error ?? String(r.status), "upload"));
          return null;
        }
        const j = await r.json();
        return j.url as string;
      } finally {
        setUploading(false);
      }
    },
    [noteId],
  );

  const insertImageFromFile = useCallback(
    async (file: File) => {
      const url = await uploadFile(file);
      if (url && editor) {
        editor.chain().focus().setImage({ src: url, alt: file.name }).run();
      }
    },
    [editor, uploadFile],
  );

  // 드래그 & 드롭 / 붙여넣기 핸들러
  useEffect(() => {
    if (!editor) return;
    const root = editor.view.dom;

    const onDrop = async (e: DragEvent) => {
      const files = Array.from(e.dataTransfer?.files ?? []);
      const images = files.filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) return;
      e.preventDefault();
      for (const f of images) await insertImageFromFile(f);
    };
    const onPaste = async (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItems = items.filter((i) => i.type.startsWith("image/"));
      if (imageItems.length === 0) return;
      e.preventDefault();
      for (const it of imageItems) {
        const f = it.getAsFile();
        if (f) await insertImageFromFile(f);
      }
    };

    root.addEventListener("drop", onDrop);
    root.addEventListener("paste", onPaste);
    return () => {
      root.removeEventListener("drop", onDrop);
      root.removeEventListener("paste", onPaste);
    };
  }, [editor, insertImageFromFile]);

  // ===== 저장/취소 =====
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  const triggerSave = useCallback(() => {
    if (!editor || saving) return;
    const storage = editor.storage as unknown as { markdown: { getMarkdown: () => string } };
    const md = storage.markdown.getMarkdown();
    void onSave({ title: title.trim() || initialTitle, content: md });
    dirtyRef.current = false;
  }, [editor, saving, title, onSave, initialTitle]);

  const triggerCancel = useCallback(() => {
    if (dirtyRef.current) {
      if (!window.confirm("저장하지 않은 변경 사항이 있습니다. 취소할까요?")) return;
    }
    onCancel();
  }, [onCancel]);

  // 전역 단축키 (Cmd+S, Esc)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        triggerSave();
      } else if (e.key === "Escape") {
        // 다른 인풋·프롬프트·다이얼로그가 열려있으면 그쪽에서 처리 (window 단까지 안 옴)
        // 본문에서 누른 경우만 취소 처리
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || target?.isContentEditable) {
          // 인풋에서 Esc는 해당 인풋이 처리 (blur 등). 글로벌 취소 X
          return;
        }
        e.preventDefault();
        triggerCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [triggerSave, triggerCancel]);

  if (!editor) {
    return (
      <div className="flex-1 grid place-items-center text-text-faint text-sm">
        에디터 로딩 중…
      </div>
    );
  }

  const containerWidth = device === "desktop" ? "max-w-[720px]" : "max-w-[400px]";

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* 상단 모드/디바이스 토글 + 닫기 */}
      <div className="px-6 py-2.5 border-b border-border flex items-center gap-2 bg-white">
        <ModeBtn active={mode === "edit"} onClick={() => setMode("edit")}>
          <Pencil size={12} strokeWidth={2.2} />
          편집
        </ModeBtn>
        <ModeBtn active={mode === "preview"} onClick={() => setMode("preview")}>
          <Eye size={12} strokeWidth={2.2} />
          발행 미리보기
        </ModeBtn>

        {mode === "preview" && (
          <div className="ml-3 flex gap-1 bg-surface rounded-md p-0.5">
            <DeviceBtn active={device === "desktop"} onClick={() => setDevice("desktop")}>
              <Monitor size={12} strokeWidth={2.2} />
            </DeviceBtn>
            <DeviceBtn active={device === "mobile"} onClick={() => setDevice("mobile")}>
              <Smartphone size={12} strokeWidth={2.2} />
            </DeviceBtn>
          </div>
        )}

        <div className="ml-auto text-xs text-text-faint">
          {uploading && "이미지 업로드 중…"}
        </div>
      </div>

      {/* 편집 툴바 (편집 모드에서만) */}
      {mode === "edit" && <Toolbar editor={editor} onInsertImage={() => imageFileDialog().then((f) => f && insertImageFromFile(f))} />}

      {/* 콘텐츠 영역 */}
      <div className={`flex-1 overflow-y-auto ${mode === "preview" ? "bg-neutral-100" : "bg-white"}`}>
        <article
          className={`${containerWidth} mx-auto px-6 py-10 naver-content ${
            device === "mobile" ? "naver-mobile" : ""
          } ${mode === "preview" ? "bg-white shadow-md min-h-full" : ""}`}
        >
          {mode === "edit" ? (
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                dirtyRef.current = true;
              }}
              placeholder="제목"
              className="w-full text-[28px] font-extrabold leading-snug mb-6 outline-none border-b border-transparent focus:border-neutral-300 pb-2 bg-transparent"
            />
          ) : (
            <h1 className="text-[28px] font-extrabold leading-snug mb-2 text-text">
              {title}
            </h1>
          )}
          {mode === "preview" && (
            <div className="text-sm text-neutral-400 mb-8">
              {new Date().toLocaleString("ko-KR", { dateStyle: "long" })}
            </div>
          )}
          <EditorContent editor={editor} />
        </article>
      </div>

      {/* 하단 푸터 */}
      <div className="px-6 py-3 border-t border-border bg-white flex items-center gap-3">
        <div className="text-sm text-text-faint">
          {mode === "preview" ? "👁 미리보기 — 발행 시 이 모습 그대로" : "✏️ 편집 모드"}
        </div>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={triggerCancel}
            disabled={saving}
            className="px-4 py-1.5 rounded-md text-sm border border-border bg-white text-text-soft hover:bg-surface disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={triggerSave}
            disabled={saving}
            className="px-5 py-1.5 rounded-md text-sm font-semibold bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "저장 중…" : "저장 (Cmd+S)"}
          </button>
        </div>
      </div>

      {toast && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-text text-white px-4 py-2 rounded-md text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

// === 툴바 ===
function Toolbar({
  editor,
  onInsertImage,
}: {
  editor: Editor;
  onInsertImage: () => void;
}) {
  const isActive = (name: string, attrs?: Record<string, unknown>) =>
    editor.isActive(name, attrs);

  return (
    <div className="px-6 py-1.5 border-b border-border flex items-center gap-1 flex-wrap bg-surface-2/40">
      <TBtn title="굵게 (Cmd+B)" active={isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold size={13} strokeWidth={2.2} />
      </TBtn>
      <TBtn title="기울임 (Cmd+I)" active={isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic size={13} strokeWidth={2.2} />
      </TBtn>
      <TBtn title="밑줄 (Cmd+U)" active={isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UIcon size={13} strokeWidth={2.2} />
      </TBtn>
      <Sep />
      <TBtn title="대제목 H2" active={isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 size={13} strokeWidth={2.2} />
      </TBtn>
      <TBtn title="소제목 H3" active={isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 size={13} strokeWidth={2.2} />
      </TBtn>
      <Sep />
      <TBtn title="글머리 기호" active={isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List size={13} strokeWidth={2.2} />
      </TBtn>
      <TBtn title="번호 매기기" active={isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered size={13} strokeWidth={2.2} />
      </TBtn>
      <Sep />
      <TBtn
        title="링크 (Cmd+K)"
        active={isActive("link")}
        onClick={() => {
          if (isActive("link")) {
            editor.chain().focus().unsetLink().run();
            return;
          }
          const url = window.prompt("링크 URL");
          if (url) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
        }}
      >
        <Link2 size={13} strokeWidth={2.2} />
      </TBtn>
      <TBtn title="인용구" active={isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote size={13} strokeWidth={2.2} />
      </TBtn>
      <TBtn title="구분선" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus size={13} strokeWidth={2.2} />
      </TBtn>
      <TBtn title="이미지 (또는 본문에 끌어다 놓기/붙여넣기)" onClick={onInsertImage}>
        <ImageIcon size={13} strokeWidth={2.2} />
      </TBtn>
    </div>
  );
}

function TBtn({
  title,
  onClick,
  active,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`h-7 px-2 rounded-md flex items-center text-text-soft border ${
        active
          ? "bg-accent-soft border-accent text-accent"
          : "border-transparent hover:bg-surface hover:border-border"
      }`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="w-px h-4 bg-border mx-1" />;
}

function ModeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 px-3 rounded-md text-sm font-medium flex items-center gap-1.5 border ${
        active
          ? "bg-text text-white border-text"
          : "bg-white text-text-soft border-border hover:bg-surface"
      }`}
    >
      {children}
    </button>
  );
}

function DeviceBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-6 px-2 rounded text-xs flex items-center ${
        active ? "bg-white shadow-sm text-text" : "text-text-soft"
      }`}
    >
      {children}
    </button>
  );
}

// 파일 다이얼로그 헬퍼 — oncancel은 Safari 16↓ 등에서 미지원이라
// focus 복귀 + change 미발생을 cancel 신호로 사용 (timeout fallback)
function imageFileDialog(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    let settled = false;
    const settle = (f: File | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("focus", onFocus);
      resolve(f);
    };
    input.onchange = () => settle(input.files?.[0] ?? null);
    input.oncancel = () => settle(null);
    const onFocus = () => {
      // 다이얼로그 닫고 포커스 복귀 → change 안 떴으면 cancel로 간주
      setTimeout(() => {
        if (!input.files?.length) settle(null);
      }, 300);
    };
    window.addEventListener("focus", onFocus, { once: true });
    input.click();
  });
}
