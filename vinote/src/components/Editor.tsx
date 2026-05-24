"use client";

import { useEditor, EditorContent, type Editor as TiptapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { Markdown } from "tiptap-markdown";
import { useEffect } from "react";

export type EditorMount = (editor: TiptapEditor) => void;

export type EditorProps = {
  initialMarkdown: string;
  onChange: (markdown: string) => void;
  onSaveShortcut?: () => void;
  onAiShortcut?: () => void;
  onMount?: EditorMount;
  placeholder?: string;
};

type MdStorage = { markdown?: { getMarkdown: () => string } };

export function getEditorMarkdown(editor: TiptapEditor): string {
  return (editor.storage as MdStorage).markdown?.getMarkdown() ?? "";
}

export function Editor({
  initialMarkdown,
  onChange,
  onSaveShortcut,
  onAiShortcut,
  onMount,
  placeholder = "여기서부터 시작하세요…",
}: EditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder }),
      Markdown.configure({ transformPastedText: true, transformCopiedText: true }),
    ],
    content: initialMarkdown,
    autofocus: "end",
    editorProps: {
      attributes: {
        class:
          "prose prose-zinc max-w-none focus:outline-none text-[16px] leading-[1.85] min-h-[60vh]",
      },
      handleKeyDown(_view, event) {
        const mod = event.metaKey || event.ctrlKey;
        if (mod && event.key.toLowerCase() === "s") {
          event.preventDefault();
          onSaveShortcut?.();
          return true;
        }
        if (mod && event.key === "/") {
          event.preventDefault();
          onAiShortcut?.();
          return true;
        }
        return false;
      },
    },
    onUpdate({ editor }) {
      onChange(getEditorMarkdown(editor));
    },
  });

  // mount callback (편집 페이지가 editor 인스턴스에 접근)
  useEffect(() => {
    if (editor && onMount) onMount(editor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // initialMarkdown 변경 시 한 번 동기 (다른 노트로 전환 등)
  useEffect(() => {
    if (editor) {
      const current = getEditorMarkdown(editor);
      if (initialMarkdown !== current) {
        editor.commands.setContent(initialMarkdown, { emitUpdate: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (!editor) return <div className="h-screen" />;

  return <EditorContent editor={editor} />;
}
