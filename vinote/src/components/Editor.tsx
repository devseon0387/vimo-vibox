"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { Markdown } from "tiptap-markdown";
import { useEffect } from "react";

export type EditorProps = {
  initialMarkdown: string;
  onChange: (markdown: string) => void;
  onSaveShortcut?: () => void;
  placeholder?: string;
};

export function Editor({
  initialMarkdown,
  onChange,
  onSaveShortcut,
  placeholder = "여기서부터 시작하세요…",
}: EditorProps) {
  const editor = useEditor({
    immediatelyRender: false, // Next.js SSR 호환
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
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          onSaveShortcut?.();
          return true;
        }
        return false;
      },
    },
    onUpdate({ editor }) {
      // tiptap-markdown: editor.storage.markdown.getMarkdown()
      const md = (editor.storage as { markdown?: { getMarkdown: () => string } }).markdown?.getMarkdown() ?? "";
      onChange(md);
    },
  });

  // 부모가 외부에서 initialMarkdown을 바꿔도 한 번 갱신
  useEffect(() => {
    if (editor) {
      const current = (editor.storage as MdStorage).markdown?.getMarkdown() ?? "";
      if (initialMarkdown !== current) {
        editor.commands.setContent(initialMarkdown, { emitUpdate: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (!editor) return <div className="h-screen" />;

  return <EditorContent editor={editor} />;
}

type MdStorage = { markdown?: { getMarkdown: () => string } };
