"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  HardDrive,
  Share2,
  House,
  Folder,
  FolderOpen,
  ChevronRight,
  Plus,
  Link2,
  Star,
} from "lucide-react";
import type { PartnerPanelData, PanelFolder } from "@/lib/dashboard/queries";

/**
 * 파트너 컨텍스트 패널 — 사이드바 오른쪽 "관련 메뉴".
 * 활성 공간에 따라 내용이 바뀜: My box→폴더 트리, 비모→프로젝트, 공유→링크, 홈→바로가기.
 * 선택/활성 표시는 배경 채움 + 글자색으로만 (좌측 띠/바 사용 금지). 들여쓰기도 좌측 선 없이 패딩만.
 */

const MYBOX = "var(--mybox)"; // My box = 무채색 중립 (v6.1: 주황은 비모 전용)
const FOLDER_ICON = "#9ca3af"; // 비활성 폴더 아이콘 (중립 그레이)
const TEAM_ROOT = "/team?path=/Rendering";
const FAV_KEY = "vibox.mybox.favFolders"; // 폴더 즐겨찾기 (클라 로컬, Phase1)

function section(pathname: string): "home" | "team" | "mybox" | "shares" {
  if (pathname.startsWith("/team")) return "team";
  if (pathname.startsWith("/my")) return "mybox";
  if (pathname.startsWith("/shares")) return "shares";
  return "home";
}

function PanelHeader({ icon, title, addHref }: { icon: ReactNode; title: string; addHref?: string }) {
  return (
    <div className="flex items-center gap-2 px-2.5 pt-4 pb-2 font-extrabold text-md">
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
    <div className="text-2xs font-bold text-text-faint tracking-wide px-2.5 pt-3 pb-1">{children}</div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-text-faint px-2.5 py-4">{children}</p>;
}

// My box 폴더 모션 — 스프링 결(폴더 열기·아이콘 morph·별 팝/반짝·빈상태). reduced-motion 가드.
const MBX_CSS = `
.mbx-kids{display:grid;grid-template-rows:0fr;transition:grid-template-rows .34s cubic-bezier(.34,1.4,.5,1)}
.mbx-kids.open{grid-template-rows:1fr}
.mbx-kids>div{overflow:hidden;min-height:0}
.mbx-ch{opacity:0;transform:translateY(-7px);transition:opacity .2s cubic-bezier(.34,1.4,.5,1),transform .26s cubic-bezier(.34,1.4,.5,1)}
.mbx-kids.open .mbx-ch{opacity:1;transform:none}
.mbx-chev{transition:transform .34s cubic-bezier(.34,1.4,.5,1)}
.mbx-chev.open{transform:rotate(90deg)}
.mbx-fi{position:relative;display:inline-block;width:16px;height:16px;flex:none}
.mbx-fi svg{position:absolute;inset:0;transition:opacity .3s cubic-bezier(.34,1.4,.5,1),transform .3s cubic-bezier(.34,1.4,.5,1)}
.mbx-fi .open-i{opacity:0;transform:scale(.7)}
.mbx-fi.open .shut-i{opacity:0;transform:scale(.7)}
.mbx-fi.open .open-i{opacity:1;transform:none}
.mbx-star svg{transition:transform .2s}
.mbx-star.pop svg{animation:mbxpop .42s cubic-bezier(.34,1.56,.64,1)}
@keyframes mbxpop{0%{transform:scale(1)}35%{transform:scale(1.5) rotate(-12deg)}70%{transform:scale(.9)}100%{transform:scale(1)}}
.mbx-spark{position:absolute;inset:0;pointer-events:none}
.mbx-spark i{position:absolute;left:50%;top:50%;width:3px;height:3px;border-radius:99px;background:var(--mybox-ink);opacity:0}
.mbx-star.pop .mbx-spark i{animation:mbxspk .5s ease-out}
.mbx-spark i:nth-child(1){--tx:0px;--ty:-11px}
.mbx-spark i:nth-child(2){--tx:10px;--ty:-5px}
.mbx-spark i:nth-child(3){--tx:8px;--ty:7px}
.mbx-spark i:nth-child(4){--tx:-8px;--ty:7px}
.mbx-spark i:nth-child(5){--tx:-10px;--ty:-5px}
@keyframes mbxspk{0%{opacity:0;transform:translate(-50%,-50%) scale(.4)}30%{opacity:.9}100%{opacity:0;transform:translate(calc(-50% + var(--tx)),calc(-50% + var(--ty))) scale(1)}}
.mbx-empty{display:flex;flex-direction:column;align-items:center;gap:13px;padding:34px 16px;text-align:center}
.mbx-ef{position:relative;width:62px;height:50px}
.mbx-ef .body{position:absolute;left:0;right:0;bottom:0;height:36px;background:var(--mybox-line);border-radius:6px}
.mbx-ef .lid{position:absolute;left:0;right:0;bottom:0;height:32px;background:#d4d4d8;border-radius:6px;transform-origin:bottom;animation:mbxlid 2.8s ease-in-out infinite}
@keyframes mbxlid{0%,100%{transform:rotateX(0)}50%{transform:rotateX(-32deg)}}
.mbx-ef .pl{position:absolute;left:50%;top:8px;color:#a1a1aa;animation:mbxpl 2.8s ease-in-out infinite}
@keyframes mbxpl{0%,40%,100%{opacity:0;transform:translate(-50%,4px) scale(.6)}60%,80%{opacity:1;transform:translate(-50%,-4px) scale(1)}}
@media (prefers-reduced-motion:reduce){.mbx-kids,.mbx-ch,.mbx-chev,.mbx-fi svg{transition:none}.mbx-star.pop svg,.mbx-star.pop .mbx-spark i,.mbx-ef .lid,.mbx-ef .pl{animation:none}}
`;

function StarToggle({ fav, onToggle }: { fav: boolean; onToggle: () => void }) {
  const [pop, setPop] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const willFav = !fav;
        onToggle();
        if (willFav) {
          setPop(true);
          window.setTimeout(() => setPop(false), 480);
        }
      }}
      aria-label={fav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
      aria-pressed={fav}
      className={`mbx-star relative ml-auto w-6 h-6 grid place-items-center rounded-md hover:bg-hover transition-opacity shrink-0 ${
        pop ? "pop" : ""
      } ${fav ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
      style={{ color: fav ? "var(--mybox-ink)" : "var(--text-faint)" }}
    >
      <span className="mbx-spark" aria-hidden>
        <i /><i /><i /><i /><i />
      </span>
      <Star size={13} strokeWidth={2} fill={fav ? "currentColor" : "none"} />
    </button>
  );
}

export function PartnerContextPanel({ data }: { data: PartnerPanelData }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const sec = section(pathname);
  const curPath = params.get("path") ?? "";

  return (
    <div className="hidden md:flex w-[248px] shrink-0 self-start sticky top-0 bg-white border-r border-border flex-col h-screen overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: MBX_CSS }} />
      {sec === "mybox" && <MyBoxPanel folders={data.folders} curPath={curPath} />}
      {sec === "team" && <TeamPanel projects={data.projects} curPath={curPath} />}
      {sec === "shares" && <SharesPanel shares={data.shares} />}
      {sec === "home" && <HomePanel folders={data.folders} projects={data.projects} />}
    </div>
  );
}

function MyBoxPanel({ folders, curPath }: { folders: PanelFolder[]; curPath: string }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // 폴더 즐겨찾기 — Phase1: 클라 로컬(localStorage, 브라우저별). 추후 DB로 승격 가능.
  const [favs, setFavs] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAV_KEY);
      if (raw) setFavs(JSON.parse(raw) as string[]);
    } catch {}
    setHydrated(true);
  }, []);
  const toggleFav = (name: string) =>
    setFavs((prev) => {
      const next = prev.includes(name)
        ? prev.filter((n) => n !== name)
        : [...prev, name];
      try {
        window.localStorage.setItem(FAV_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  const isFav = (name: string) => favs.includes(name);
  const isSel = (name: string) =>
    curPath === `/${name}` || curPath.startsWith(`/${name}/`);
  // 존재하는 폴더 중 즐겨찾기된 것 (hydration 전엔 빈 배열 → SSR 일치)
  const favFolders = hydrated ? folders.filter((f) => isFav(f.name)) : [];

  const selStyle = {
    background: "var(--mybox-soft)",
    color: "var(--mybox-ink)",
    fontWeight: 700,
  } as const;

  return (
    <>
      <PanelHeader
        icon={<HardDrive size={16} strokeWidth={2.1} style={{ color: MYBOX }} />}
        title="My box"
        addHref="/my/box?upload=1"
      />
      <div className="px-2 overflow-y-auto flex-1 pb-3">
        {folders.length === 0 ? (
          <div className="mbx-empty">
            <div className="mbx-ef" aria-hidden>
              <div className="body" />
              <div className="lid" />
              <Plus size={15} strokeWidth={2.6} className="pl" />
            </div>
            <p className="text-sm text-text-faint leading-relaxed">
              아직 폴더가 없어요.
              <br />새 폴더를 만들어 정리해 보세요.
            </p>
          </div>
        ) : (
          <>
            {/* 즐겨찾기 — 자주 쓰는 폴더 빠른 접근 */}
            {favFolders.length > 0 && (
              <>
                <SecLabel>
                  <span className="inline-flex items-center gap-1.5">
                    <Star size={11} strokeWidth={2.2} style={{ color: FOLDER_ICON }} />
                    즐겨찾기
                  </span>
                </SecLabel>
                {favFolders.map((f) => {
                  const selected = isSel(f.name);
                  return (
                    <div
                      key={`fav-${f.name}`}
                      className="group flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-base hover:bg-surface-2 transition-colors"
                      style={selected ? selStyle : undefined}
                    >
                      <Link
                        href={`/my/box?path=/${encodeURIComponent(f.name)}`}
                        className="flex items-center gap-2 flex-1 min-w-0"
                      >
                        <Folder
                          size={16}
                          style={{ color: selected ? "var(--mybox-ink)" : FOLDER_ICON }}
                          className="shrink-0"
                        />
                        <span className="truncate">{f.name}</span>
                      </Link>
                      <StarToggle fav={isFav(f.name)} onToggle={() => toggleFav(f.name)} />
                    </div>
                  );
                })}
              </>
            )}

            {/* 전체 폴더 — 트리 */}
            <SecLabel>전체 폴더</SecLabel>
            {folders.map((f) => {
              const expanded = !!open[f.name];
              const hasKids = f.children.length > 0;
              const selected = isSel(f.name);
              return (
                <div key={f.name}>
                  <div
                    className="group flex items-center gap-1.5 px-1.5 py-1.5 rounded-lg text-base hover:bg-surface-2 transition-colors"
                    style={selected ? selStyle : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => hasKids && setOpen((o) => ({ ...o, [f.name]: !o[f.name] }))}
                      className="w-4 grid place-items-center text-text-faint shrink-0"
                      aria-label={expanded ? "접기" : "펼치기"}
                      aria-expanded={hasKids ? expanded : undefined}
                    >
                      {hasKids ? (
                        <ChevronRight
                          size={13}
                          className={`mbx-chev ${expanded ? "open" : ""}`}
                        />
                      ) : null}
                    </button>
                    <Link
                      href={`/my/box?path=/${encodeURIComponent(f.name)}`}
                      className="flex items-center gap-2 flex-1 min-w-0"
                    >
                      <span
                        className={`mbx-fi ${expanded && hasKids ? "open" : ""}`}
                        style={{ color: selected ? "var(--mybox-ink)" : FOLDER_ICON }}
                      >
                        <Folder size={16} className="shut-i" />
                        <FolderOpen size={16} className="open-i" />
                      </span>
                      <span className="truncate">{f.name}</span>
                    </Link>
                    <StarToggle fav={isFav(f.name)} onToggle={() => toggleFav(f.name)} />
                  </div>
                  {hasKids && (
                    <div className={`mbx-kids ${expanded ? "open" : ""}`}>
                      <div>
                        {f.children.map((c, i) => (
                          <Link
                            key={c}
                            href={`/my/box?path=/${encodeURIComponent(f.name)}/${encodeURIComponent(c)}`}
                            className="mbx-ch flex items-center gap-2 pl-[34px] pr-2 py-1.5 rounded-lg text-base text-text-soft hover:bg-surface-2"
                            style={{ transitionDelay: expanded ? `${i * 45}ms` : "0ms" }}
                          >
                            <Folder size={15} style={{ color: FOLDER_ICON }} className="shrink-0" />
                            <span className="truncate">{c}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </>
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
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-base hover:bg-surface-2 transition-colors"
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
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-base hover:bg-surface-2 transition-colors"
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
            className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-base hover:bg-surface-2 transition-colors"
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
            className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-base hover:bg-surface-2 transition-colors"
          >
            <Folder size={16} style={{ color: MYBOX }} className="shrink-0" />
            <span className="truncate">{f.name}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
