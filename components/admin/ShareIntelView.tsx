"use client";

import { useState } from "react";
import {
  Eye,
  CheckCircle2,
  Clock,
  Users,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import type { ShareIntel } from "@/lib/admin-share-intel";

function formatSec(s: number): string {
  if (s < 60) return `${Math.round(s)}초`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  if (m < 60) return `${m}분 ${sec}초`;
  const h = Math.floor(m / 60);
  return `${h}시간 ${m % 60}분`;
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

function progressPct(max: number, dur: number | null): number {
  if (!dur || dur <= 0) return 0;
  return Math.min(100, (max / dur) * 100);
}

function uaShort(ua: string | null): string {
  if (!ua) return "—";
  if (/iPhone|iPad/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "기타";
}

export function ShareIntelView({ intel }: { intel: ShareIntel[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (intel.length === 0) {
    return (
      <div className="border border-border rounded-xl bg-white px-6 py-16 text-center text-text-faint text-[13px]">
        아직 시청 기록이 없습니다.
        <br />
        공유 링크를 받은 사람이 영상을 열면 여기에 표시됩니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {intel.map((s) => {
        const key = `${s.shareToken}::${s.filePath}`;
        const open = expanded[key] ?? false;
        const fname = s.filePath.split("/").pop() ?? s.filePath;
        const stale = s.expired;
        return (
          <div
            key={key}
            className={`border rounded-xl bg-white overflow-hidden ${
              stale ? "border-text-faint/30 opacity-70" : "border-border"
            }`}
          >
            <button
              type="button"
              onClick={() => setExpanded((m) => ({ ...m, [key]: !open }))}
              className="w-full px-5 py-4 flex items-center gap-3 text-left hover:bg-surface"
            >
              {open ? (
                <ChevronDown size={14} strokeWidth={2.4} className="text-text-faint shrink-0" />
              ) : (
                <ChevronRight size={14} strokeWidth={2.4} className="text-text-faint shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[14.5px] font-bold text-text truncate">
                    {s.title || fname}
                  </span>
                  {s.mode && (
                    <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-px rounded bg-surface text-text-faint">
                      {s.mode}
                    </span>
                  )}
                  {stale && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-px rounded bg-danger-soft text-danger">
                      <AlertTriangle size={9} /> 만료/회수
                    </span>
                  )}
                </div>
                <div className="text-[11.5px] text-text-faint font-mono truncate">
                  {s.filePath}
                </div>
              </div>

              <div className="hidden md:flex items-center gap-5 text-[12px] text-text-soft shrink-0">
                <Stat icon={Users} value={`${s.totalVisitors}명`} hint="방문자" />
                <Stat icon={Eye} value={formatSec(s.totalWatchSec)} hint="누적 시청" />
                <Stat icon={CheckCircle2} value={`${s.completedCount}명`} hint="끝까지 본 사람" />
                <Stat icon={Clock} value={relativeTime(s.lastEventAt)} hint="최근" />
              </div>

              <a
                href={`/s/${s.shareToken}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-text-faint hover:text-accent w-7 h-7 grid place-items-center rounded hover:bg-hover shrink-0"
                title="공유 링크 열기"
              >
                <ExternalLink size={12} strokeWidth={2.2} />
              </a>
            </button>

            {open && (
              <div className="border-t border-border bg-surface px-5 py-4">
                <div className="text-[10.5px] font-semibold uppercase tracking-widest text-text-faint mb-2">
                  방문자 {s.visitors.length}명
                </div>
                <div className="space-y-2">
                  {s.visitors.map((v) => {
                    const pct = progressPct(v.maxPositionSec, v.durationSec);
                    return (
                      <div
                        key={v.visitorId}
                        className="bg-white border border-border rounded-lg px-4 py-3"
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-8 h-8 rounded-full bg-accent-soft text-accent grid place-items-center text-[10px] font-bold">
                            {uaShort(v.userAgent).slice(0, 2)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12.5px] text-text font-mono truncate">
                              {v.ip ?? "ip 알 수 없음"} · {uaShort(v.userAgent)}
                            </div>
                            <div className="text-[11px] text-text-faint">
                              첫 접속 {relativeTime(v.openedAt)} · 마지막 활동 {relativeTime(v.lastEventAt)}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-text-soft shrink-0">
                            <span title="실제 누적 시청">
                              <Eye size={11} strokeWidth={2.2} className="inline mr-1 -mt-px" />
                              {formatSec(v.totalWatchSec)}
                            </span>
                            {v.completed && (
                              <span className="inline-flex items-center gap-1 text-success font-semibold">
                                <CheckCircle2 size={11} strokeWidth={2.4} />
                                완료
                              </span>
                            )}
                          </div>
                        </div>
                        {v.durationSec && v.durationSec > 0 && (
                          <>
                            <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                              <div
                                className={`h-full ${v.completed ? "bg-success" : "bg-accent"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="flex items-center justify-between text-[10.5px] text-text-faint mt-1">
                              <span>가장 멀리 본 지점: {formatSec(v.maxPositionSec)}</span>
                              <span>{pct.toFixed(0)}% / {formatSec(v.durationSec)}</span>
                            </div>
                          </>
                        )}
                        {(!v.durationSec || v.durationSec <= 0) && (
                          <div className="text-[11px] text-text-faint">
                            영상 길이 정보 없음 (이미지·문서 등)
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Stat({
  icon: Icon,
  value,
  hint,
}: {
  icon: typeof Eye;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center gap-1.5">
        <Icon size={12} strokeWidth={2.2} className="text-text-faint" />
        <span className="font-semibold text-text">{value}</span>
      </div>
      <div className="text-[10px] text-text-faint">{hint}</div>
    </div>
  );
}
