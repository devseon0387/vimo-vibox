"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Clock,
  Star,
  Tag,
  Folder,
  ExternalLink,
  Inbox,
  FileText,
  HardDrive,
  Plus,
  Pencil,
  X,
  Check,
} from "lucide-react";
import { MenuShell, MenuSearch, MenuSection } from "./MenuShell";
import type { NoteFolder } from "@/lib/notes";

export function DevMenu() {
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const sp = useSearchParams();
  const view = sp.get("view") === "files" ? "files" : "notes";

  const refetch = () =>
    fetch("/api/dev/notes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.folders) setFolders(d.folders);
      })
      .catch(() => {});

  useEffect(() => {
    refetch();
  }, []);

  const onCreate = async (name: string) => {
    setError(null);
    const res = await fetch("/api/dev/notes/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "생성 실패");
      return;
    }
    const created = await res.json();
    setCreating(false);
    await refetch();
    router.push(`/dev/notes?folder=${encodeURIComponent(created.name)}`);
    router.refresh();
  };

  const onRename = async (oldName: string, newName: string) => {
    setError(null);
    if (oldName === newName) {
      setRenaming(null);
      return;
    }
    const res = await fetch("/api/dev/notes/folders", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ oldName, newName }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "이름 변경 실패");
      return;
    }
    const renamed = await res.json();
    setRenaming(null);
    await refetch();
    if (sp.get("folder") === oldName) {
      router.push(`/dev/notes?folder=${encodeURIComponent(renamed.newName)}`);
    }
    router.refresh();
  };

  return (
    <MenuShell
      title="개발"
      headerExtra={
        process.env.NEXT_PUBLIC_SEON_HUB_URL ? (
          <a
            href={`${process.env.NEXT_PUBLIC_SEON_HUB_URL}/notes`}
            target="_blank"
            rel="noopener noreferrer"
            title="SEON Hub에서 편집"
            className="text-text-faint hover:text-accent w-6 h-6 grid place-items-center rounded hover:bg-hover"
          >
            <ExternalLink size={13} strokeWidth={2.2} />
          </a>
        ) : null
      }
    >
      <div className="mx-3 mb-2 grid grid-cols-2 gap-1 p-1 bg-surface rounded-md">
        <Link
          href="/dev/notes"
          className={`flex items-center justify-center gap-1.5 py-1.5 rounded text-[12px] font-medium transition-colors ${
            view === "notes"
              ? "bg-white text-text shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              : "text-text-soft hover:text-text"
          }`}
        >
          <FileText size={12} strokeWidth={2.2} />
          노트
        </Link>
        <Link
          href="/dev/notes?view=files"
          className={`flex items-center justify-center gap-1.5 py-1.5 rounded text-[12px] font-medium transition-colors ${
            view === "files"
              ? "bg-white text-text shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              : "text-text-soft hover:text-text"
          }`}
        >
          <HardDrive size={12} strokeWidth={2.2} />
          파일
        </Link>
      </div>

      <MenuSearch placeholder={view === "files" ? "파일 검색" : "노트 검색"} />

      {view === "notes" ? (
        <>
          <MenuSection label="빠른 접근" />
          <DevMenuLink href="/dev/notes" icon={Clock} label="전체 노트" />
          <DevMenuLink href="/dev/notes?starred=1" icon={Star} label="즐겨찾기" />
          <DevMenuLink href="/dev/notes?tags=1" icon={Tag} label="태그" />

          <div className="px-4 pt-3 pb-1.5 flex items-center justify-between">
            <span className="text-[10.5px] font-semibold tracking-widest text-text-faint uppercase">
              폴더
            </span>
            <button
              type="button"
              onClick={() => {
                setCreating(true);
                setError(null);
              }}
              title="새 폴더"
              className="w-5 h-5 grid place-items-center rounded text-text-faint hover:text-accent hover:bg-hover"
            >
              <Plus size={12} strokeWidth={2.4} />
            </button>
          </div>

          {creating && (
            <FolderInput
              initial=""
              onSubmit={onCreate}
              onCancel={() => {
                setCreating(false);
                setError(null);
              }}
              placeholder="폴더 이름…"
            />
          )}
          {error && (
            <div className="mx-3 my-1 px-2 py-1 text-[11px] text-danger bg-danger-soft rounded">
              {error}
            </div>
          )}

          {folders.length === 0 && !creating ? (
            <div className="px-4 py-2 text-[12px] text-text-faint">불러오는 중…</div>
          ) : (
            folders.map((f) =>
              renaming === f.name ? (
                <FolderInput
                  key={f.name}
                  initial={f.name}
                  onSubmit={(newName) => onRename(f.name, newName)}
                  onCancel={() => {
                    setRenaming(null);
                    setError(null);
                  }}
                  placeholder="폴더 이름…"
                />
              ) : (
                <FolderRow
                  key={f.name}
                  folder={f}
                  onRename={() => {
                    setRenaming(f.name);
                    setError(null);
                  }}
                />
              ),
            )
          )}
        </>
      ) : (
        <>
          <MenuSection label="저장 위치" />
          <div className="mx-3 mb-2 px-3 py-2 rounded-md bg-surface text-[11.5px] text-text-soft font-mono">
            <div className="text-text-faint mb-0.5">root</div>
            <div className="text-text">/Volumes/Vibox Storage A/Notes/</div>
          </div>
          <div className="px-4 py-2 text-[11.5px] text-text-faint leading-relaxed">
            외장 SSD에 저장된 raw 파일을 보여줍니다.
            SEON Hub가 어떤 경로에 저장하는지 확인할 때 사용.
          </div>
        </>
      )}
    </MenuShell>
  );
}

function FolderRow({
  folder,
  onRename,
}: {
  folder: NoteFolder;
  onRename: () => void;
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const onNotes = pathname === "/dev/notes";
  const active = onNotes && sp.get("folder") === folder.name;
  const Icon = folder.name === "_inbox" ? Inbox : Folder;
  const label = folder.name === "_inbox" ? "수신함" : folder.name;

  return (
    <div
      className={`group mx-2 my-px relative rounded-md ${
        active ? "bg-accent-soft" : "hover:bg-surface"
      }`}
    >
      <Link
        href={`/dev/notes?folder=${encodeURIComponent(folder.name)}`}
        className={`flex items-center gap-2.5 pl-3 pr-9 py-1.5 text-[13.5px] ${
          active ? "text-accent font-medium" : "text-text-soft"
        }`}
      >
        <Icon size={14} strokeWidth={2} className="shrink-0 opacity-90" />
        <span className="truncate">{label}</span>
        <span
          className={`ml-auto text-[11px] ${
            active ? "text-accent" : "text-text-faint"
          }`}
        >
          {folder.count}
        </span>
      </Link>
      <button
        type="button"
        onClick={onRename}
        title="이름 변경"
        className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 grid place-items-center rounded text-text-faint hover:text-accent hover:bg-white opacity-0 group-hover:opacity-100"
      >
        <Pencil size={11} strokeWidth={2.2} />
      </button>
    </div>
  );
}

function FolderInput({
  initial,
  onSubmit,
  onCancel,
  placeholder,
}: {
  initial: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      onCancel();
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <div className="mx-2 my-px flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-accent">
      <Folder size={14} strokeWidth={2} className="shrink-0 text-accent" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          else if (e.key === "Escape") onCancel();
        }}
        placeholder={placeholder}
        className="flex-1 bg-transparent border-0 outline-none text-[13.5px] text-text min-w-0"
      />
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          submit();
        }}
        title="저장"
        className="w-5 h-5 grid place-items-center rounded text-accent hover:bg-accent-soft"
      >
        <Check size={12} strokeWidth={2.4} />
      </button>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          onCancel();
        }}
        title="취소"
        className="w-5 h-5 grid place-items-center rounded text-text-faint hover:bg-hover"
      >
        <X size={12} strokeWidth={2.4} />
      </button>
    </div>
  );
}

type LinkProps = {
  href: string;
  icon: typeof Folder;
  label: string;
};

function DevMenuLink({ href, icon: Icon, label }: LinkProps) {
  const pathname = usePathname();
  const sp = useSearchParams();

  const onNotes = pathname === "/dev/notes";
  const folderParam = sp.get("folder");
  const starredParam = sp.get("starred");
  const tagsParam = sp.get("tags");

  let active = false;
  if (href === "/dev/notes") {
    active = onNotes && !folderParam && !starredParam && !tagsParam;
  } else if (href === "/dev/notes?starred=1") {
    active = onNotes && starredParam === "1";
  } else if (href === "/dev/notes?tags=1") {
    active = onNotes && tagsParam === "1";
  }

  return (
    <Link
      href={href}
      className={`mx-2 my-px flex items-center gap-2.5 pl-3 pr-3 py-1.5 rounded-md text-[13.5px] transition-colors ${
        active
          ? "bg-accent-soft text-accent font-medium"
          : "text-text-soft hover:bg-surface"
      }`}
    >
      <Icon size={14} strokeWidth={2} className="shrink-0 opacity-90" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
