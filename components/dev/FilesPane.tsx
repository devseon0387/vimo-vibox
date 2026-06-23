"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  Copy,
  Check,
  HardDrive,
} from "lucide-react";
import type { FileTreeFolder } from "@/lib/notes";

type RawFile = {
  raw: string;
  size: number;
  mtime: number;
  path: string;
};

type Props = {
  initialTree: FileTreeFolder[];
  initialPath: string | null;
  initialFile: RawFile | null;
};

export function FilesPane({ initialTree, initialPath, initialFile }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const currentPath = sp.get("path") ?? initialPath;

  const [file, setFile] = useState<RawFile | null>(initialFile);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const f of initialTree) init[f.name] = true;
    return init;
  });

  // initialTree 변경 시 새 폴더는 기본 펼침, 기존 사용자 토글 유지
  useEffect(() => {
    setExpanded((cur) => {
      const next = { ...cur };
      for (const f of initialTree) {
        if (next[f.name] === undefined) next[f.name] = true;
      }
      return next;
    });
  }, [initialTree]);

  useEffect(() => {
    if (!currentPath) {
      setFile(null);
      return;
    }
    if (initialFile && currentPath === initialPath) {
      setFile(initialFile);
      return;
    }
    let aborted = false;
    setLoading(true);
    fetch(`/api/dev/files/raw?path=${encodeURIComponent(currentPath)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: RawFile | null) => {
        if (!aborted) setFile(d);
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, [currentPath, initialFile, initialPath]);

  const select = (p: string) => {
    const next = new URLSearchParams(sp.toString());
    next.set("path", p);
    router.push(`/dev/notes?${next.toString()}`);
  };

  const totals = useMemo(() => {
    let count = 0;
    let bytes = 0;
    for (const f of initialTree) {
      count += f.files.length;
      for (const file of f.files) bytes += file.size;
    }
    return { count, bytes };
  }, [initialTree]);

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-[340px] flex-shrink-0 border-r border-border bg-white flex flex-col min-h-0">
        <div className="px-5 pt-5 pb-3 border-b border-border bg-white">
          <div className="flex items-center gap-2 mb-1">
            <HardDrive size={14} strokeWidth={2.2} className="text-text-soft" />
            <div className="text-lg font-bold text-text">파일 트리</div>
          </div>
          <div className="text-xs text-text-faint font-mono">
            notes/
          </div>
          <div className="text-xs text-text-faint mt-1">
            {initialTree.length}개 폴더 · {totals.count}개 파일 · {(totals.bytes / 1024).toFixed(1)} KB
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {initialTree.map((folder) => {
            const open = expanded[folder.name] ?? false;
            return (
              <div key={folder.name}>
                <button
                  type="button"
                  onClick={() => setExpanded((s) => ({ ...s, [folder.name]: !open }))}
                  className="w-full px-3 py-1.5 flex items-center gap-1.5 text-base text-text-soft hover:bg-surface text-left font-mono"
                >
                  {open ? (
                    <ChevronDown size={12} strokeWidth={2.4} className="text-text-faint" />
                  ) : (
                    <ChevronRight size={12} strokeWidth={2.4} className="text-text-faint" />
                  )}
                  {open ? (
                    <FolderOpen size={13} strokeWidth={2} className="text-text-soft" />
                  ) : (
                    <Folder size={13} strokeWidth={2} className="text-text-soft" />
                  )}
                  <span className="truncate">{folder.name}/</span>
                  <span className="ml-auto text-2xs text-text-faint font-sans">
                    {folder.files.length}
                  </span>
                </button>
                {open &&
                  folder.files.map((f) => {
                    const sel = currentPath === f.path;
                    return (
                      <button
                        key={f.path}
                        type="button"
                        onClick={() => select(f.path)}
                        className={`w-full pl-9 pr-3 py-1 flex items-center gap-1.5 text-left font-mono text-sm ${
                          sel
                            ? "bg-accent-soft text-accent"
                            : "text-text-soft hover:bg-surface"
                        }`}
                      >
                        <FileText size={12} strokeWidth={2} className="opacity-70" />
                        <span className="truncate">{f.name}</span>
                        <span
                          className={`ml-auto text-2xs font-sans ${
                            sel ? "text-accent" : "text-text-faint"
                          }`}
                        >
                          {(f.size / 1024).toFixed(1)} KB
                        </span>
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </aside>

      <section className="flex-1 min-w-0 min-h-0 bg-white flex flex-col relative">
        {!file ? (
          <div className="flex-1 grid place-items-center text-text-faint text-base p-10 text-center">
            <div>
              <div className="w-16 h-16 rounded-full bg-surface mx-auto mb-4 grid place-items-center">
                <FileText size={26} strokeWidth={1.6} />
              </div>
              <div className="font-semibold text-text mb-1.5 text-lg">
                파일을 선택하세요
              </div>
              <div className="max-w-[280px] mx-auto leading-relaxed">
                왼쪽 트리에서 파일을 클릭하면 디스크의 raw 내용이 그대로 표시됩니다.
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="px-6 pt-3.5 pb-3 border-b border-border flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(file.path);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1400);
                    } catch {}
                  }}
                  className="group flex items-center gap-2 text-sm text-text font-mono hover:text-accent transition-colors"
                  title="경로 복사"
                >
                  <FileText size={13} strokeWidth={2} className="text-text-soft" />
                  <span className="font-semibold">{file.path}</span>
                  {copied ? (
                    <Check size={13} strokeWidth={2.4} className="text-accent" />
                  ) : (
                    <Copy size={13} strokeWidth={2} className="opacity-0 group-hover:opacity-70" />
                  )}
                </button>
                <div className="ml-auto flex items-center gap-3 text-xs text-text-faint font-mono">
                  <span>{file.size.toLocaleString()} B</span>
                  <span>·</span>
                  <span>{new Date(file.mtime).toLocaleString("ko-KR")}</span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-surface-2">
              <pre className="p-6 text-sm leading-[1.65] font-mono text-text whitespace-pre">
                {numberedLines(file.raw)}
              </pre>
            </div>
            {loading && (
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

function numberedLines(raw: string): React.ReactNode {
  const lines = raw.split("\n");
  const width = String(lines.length).length;
  return lines.map((line, i) => (
    <div key={i} className="flex">
      <span className="select-none text-text-faint pr-4 text-right" style={{ width: `${width}ch` }}>
        {i + 1}
      </span>
      <span className="flex-1 whitespace-pre-wrap break-words">{line || " "}</span>
    </div>
  ));
}
