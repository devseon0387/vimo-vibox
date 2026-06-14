"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  HardDrive,
  Share2,
  House,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Plus,
  Link2,
} from "lucide-react";
import type { PartnerPanelData, PanelFolder } from "@/lib/dashboard/queries";

/**
 * 파트너 컨텍스트 패널 — 사이드바 오른쪽 "관련 메뉴".
 * 활성 공간에 따라 내용이 바뀜: My box→폴더 트리, 비모→프로젝트, 공유→링크, 홈→바로가기.
 * 선택/활성 표시는 배경 채움 + 글자색으로만 (좌측 띠/바 사용 금지). 들여쓰기도 좌측 선 없이 패딩만.
 */

const MYBOX = "#f97316";
const TEAM_ROOT = "/team?path=/Rendering";

function section(pathname: string): "home" | "team" | "mybox" | "shares" {
  if (pathname.startsWith("/team")) return "team";
  if (pathname.startsWith("/my")) return "mybox";
  if (pathname.startsWith("/shares")) return "shares";
  return "home";
}

function PanelHeader({ icon, title, addHref }: { icon: ReactNode; title: string; addHref?: string }) {
  return (
    <div className="flex items-center gap-2 px-2.5 pt-4 pb-2 font-extrabold text-[14px]">
      {icon}
      <span className="truncate">{title}</span>
      {addHref && (
        <Link
          href={addHref}
          className="ml-auto w-6 h-6 rounded-lg grid place-items-center text-text-muted bg-surface-2 hover:bg-hover transition-colors"
        >
          <Plus size={14} strokeWidth={2.2} />
        </Link>
      )}
    </div>
  );
}

function SecLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] font-bold text-text-faint tracking-wide px-2.5 pt-3 pb-1">{children}</div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[12px] text-text-faint px-2.5 py-4">{children}</p>;
}

export function PartnerContextPanel({ data }: { data: PartnerPanelData }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const sec = section(pathname);
  const curPath = params.get("path") ?? "";

  return (
    <div className="hidden md:flex w-[248px] bg-white border-r border-border flex-col h-screen overflow-hidden">
      {sec === "mybox" && <MyBoxPanel folders={data.folders} curPath={curPath} />}
      {sec === "team" && <TeamPanel projects={data.projects} curPath={curPath} />}
      {sec === "shares" && <SharesPanel shares={data.shares} />}
      {sec === "home" && <HomePanel folders={data.folders} projects={data.projects} />}
    </div>
  );
}

function MyBoxPanel({ folders, curPath }: { folders: PanelFolder[]; curPath: string }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <>
      <PanelHeader
        icon={<HardDrive size={16} strokeWidth={2.1} style={{ color: MYBOX }} />}
        title="My box"
        addHref="/my/box?upload=1"
      />
      <div className="px-2 overflow-y-auto flex-1 pb-3">
        {folders.length === 0 ? (
          <Empty>폴더가 없습니다. 새 폴더를 만들어 보세요.</Empty>
        ) : (
          folders.map((f) => {
            const expanded = !!open[f.name];
            const hasKids = f.children.length > 0;
            const selected = curPath === `/${f.name}` || curPath.startsWith(`/${f.name}/`);
            return (
              <div key={f.name}>
                <div
                  className="flex items-center gap-1.5 px-1.5 py-1.5 rounded-lg text-[13px]"
                  style={selected ? { background: "#fff3ea", color: MYBOX, fontWeight: 700 } : undefined}
                >
                  <button
                    type="button"
                    onClick={() => hasKids && setOpen((o) => ({ ...o, [f.name]: !o[f.name] }))}
                    className="w-4 grid place-items-center text-text-faint shrink-0"
                    aria-label={expanded ? "접기" : "펼치기"}
                  >
                    {hasKids ? (
                      expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />
                    ) : null}
                  </button>
                  <Link
                    href={`/my/box?path=/${encodeURIComponent(f.name)}`}
                    className="flex items-center gap-2 flex-1 min-w-0"
                  >
                    {expanded && hasKids ? (
                      <FolderOpen size={16} style={{ color: selected ? MYBOX : "#a98e6a" }} className="shrink-0" />
                    ) : (
                      <Folder size={16} style={{ color: selected ? MYBOX : "#a98e6a" }} className="shrink-0" />
                    )}
                    <span className="truncate">{f.name}</span>
                  </Link>
                </div>
                {expanded &&
                  f.children.map((c) => (
                    <Link
                      key={c}
                      href={`/my/box?path=/${encodeURIComponent(f.name)}/${encodeURIComponent(c)}`}
                      className="flex items-center gap-2 pl-[34px] pr-2 py-1.5 rounded-lg text-[13px] text-text-soft hover:bg-surface-2 transition-colors"
                    >
                      <Folder size={15} style={{ color: "#a98e6a" }} className="shrink-0" />
                      <span className="truncate">{c}</span>
                    </Link>
                  ))}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

function TeamPanel({ projects, curPath }: { projects: string[]; curPath: string }) {
  return (
    <>
      <PanelHeader
        // eslint-disable-next-line @next/next/no-img-element
        icon={<img src="/vimo-mark.svg" alt="" style={{ width: 16, height: "auto" }} />}
        title="비모와의 작업"
      />
      <div className="px-2 overflow-y-auto flex-1 pb-3">
        {projects.length === 0 ? (
          <Empty>아직 비모 작업이 없습니다.</Empty>
        ) : (
          projects.map((p) => {
            const selected = curPath.includes(p);
            return (
              <Link
                key={p}
                href={TEAM_ROOT}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] hover:bg-surface-2 transition-colors"
                style={selected ? { background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 700 } : undefined}
              >
                <Folder size={16} style={{ color: selected ? "var(--accent)" : "#a98e6a" }} className="shrink-0" />
                <span className="truncate">{p}</span>
              </Link>
            );
          })
        )}
      </div>
    </>
  );
}

function SharesPanel({ shares }: { shares: { name: string; token: string }[] }) {
  return (
    <>
      <PanelHeader icon={<Share2 size={16} strokeWidth={2.1} className="text-text-soft" />} title="내 공유 링크" />
      <div className="px-2 overflow-y-auto flex-1 pb-3">
        {shares.length === 0 ? (
          <Empty>공유 링크가 없습니다.</Empty>
        ) : (
          shares.map((s) => (
            <Link
              key={s.token}
              href="/shares"
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] hover:bg-surface-2 transition-colors"
            >
              <Link2 size={15} className="text-text-soft shrink-0" />
              <span className="truncate flex-1">{s.name}</span>
            </Link>
          ))
        )}
      </div>
    </>
  );
}

function HomePanel({ folders, projects }: { folders: PanelFolder[]; projects: string[] }) {
  const empty = folders.length === 0 && projects.length === 0;
  return (
    <>
      <PanelHeader icon={<House size={16} strokeWidth={2.1} style={{ color: "var(--accent)" }} />} title="바로가기" />
      <div className="px-2 overflow-y-auto flex-1 pb-3">
        {empty && <Empty>최근 항목이 여기에 모입니다.</Empty>}
        {projects.length > 0 && <SecLabel>비모 프로젝트</SecLabel>}
        {projects.slice(0, 4).map((p) => (
          <Link
            key={p}
            href={TEAM_ROOT}
            className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] hover:bg-surface-2 transition-colors"
          >
            <Folder size={16} style={{ color: "var(--accent)" }} className="shrink-0" />
            <span className="truncate">{p}</span>
          </Link>
        ))}
        {folders.length > 0 && <SecLabel>My box 폴더</SecLabel>}
        {folders.slice(0, 6).map((f) => (
          <Link
            key={f.name}
            href={`/my/box?path=/${encodeURIComponent(f.name)}`}
            className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] hover:bg-surface-2 transition-colors"
          >
            <Folder size={16} style={{ color: MYBOX }} className="shrink-0" />
            <span className="truncate">{f.name}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
