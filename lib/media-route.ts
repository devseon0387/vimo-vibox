"use client";

import { useSyncExternalStore } from "react";

// 미디어(썸네일·영상)를 u1/u2 직결(:8443/:18443)로 보내 Cloudflare(한국→LAX 경유) 우회.
//
// 페이지(vibox.cloud)는 CF에 그대로 두고, 무거운 미디어 "리소스"만 직결로 백그라운드 로드한다.
// 주소창엔 vibox.cloud(포트 없음)만 보이고, <img>/<video> 가 뒤에서 u1:8443 으로 받아온다.
// 직결 오리진은 lib/upload.ts(청크 업로드)가 쓰는 것과 동일하다 — 인증서·포워딩·CORS·쿠키
// (COOKIE_DOMAIN=.vibox.cloud) 가 이미 검증돼 있어 같은 길에 숟가락만 얹는 셈.
//
// 외부 파트너 망이 8443 아웃바운드를 막을 수 있으므로:
//  1) 앱에서 u1:8443 도달성을 1회 프로브 → 막혔으면(directOk=false) 이후 전부 CF 로 (개별 hang 방지)
//  2) 도달돼도 개별 리소스 실패 시 CF 로 2차 폴백 (ThumbImg onError)
// 내부망은 업로드가 이미 8443 으로 도니 사실상 항상 열려 있다.

const DIRECT_ORIGINS = [
  "https://u1.vibox.cloud:8443",
  "https://u2.vibox.cloud:8443",
  "https://u1.vibox.cloud:18443",
  "https://u2.vibox.cloud:18443",
];
const PROBE_URL = "https://u1.vibox.cloud:8443/api/health";
const SS_KEY = "vibox.directOk";

// null = 판정 전(낙관적으로 직결 시도), true/false = 프로브 결과
let directOk: boolean | null = null;
let probed = false;

// 프로브 결과가 바뀌면 구독 중인 컴포넌트(useDirectOk)가 재렌더 → 막힘 확인 즉시 CF 전환
const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}

function isProdHost(): boolean {
  return (
    typeof window !== "undefined" && window.location.hostname === "vibox.cloud"
  );
}

/** 앱에서 1회 호출. u1:8443 도달성을 비동기로 판정해 directOk 갱신. */
export function ensureDirectProbe(): void {
  if (probed || !isProdHost()) return;
  probed = true;
  // 같은 세션에서 이미 판정했으면 재사용
  try {
    const cached = sessionStorage.getItem(SS_KEY);
    if (cached === "1") {
      directOk = true;
      emit();
      return;
    }
    if (cached === "0") {
      directOk = false;
      emit();
      return;
    }
  } catch {
    /* sessionStorage 불가 — 그냥 프로브 */
  }
  // no-cors 도달성 프로브: 포트가 열려 응답하면 resolve, 막혀있으면 abort/throw.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  fetch(PROBE_URL, {
    mode: "no-cors",
    cache: "no-store",
    redirect: "manual",
    signal: ctrl.signal,
  })
    .then(() => {
      directOk = true;
    })
    .catch(() => {
      directOk = false;
    })
    .finally(() => {
      clearTimeout(timer);
      try {
        sessionStorage.setItem(SS_KEY, directOk ? "1" : "0");
      } catch {
        /* ignore */
      }
      emit();
    });
}

/** path 기반 안정 샤드 — 같은 파일은 늘 같은 오리진(브라우저 캐시·연결 재사용 친화). */
function shardFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return DIRECT_ORIGINS[Math.abs(h) % DIRECT_ORIGINS.length];
}

/**
 * 직결 미디어 오리진(예: "https://u1.vibox.cloud:8443"). 호출부는 여기에 "/api/..." 를 붙인다.
 * null 이면 직결 불가(비프로덕션 or 프로브가 막힘 확인) → 호출부는 상대경로(CF) 사용.
 * 판정 전(null 단계)에는 낙관적으로 직결을 반환 — 내부 사용자는 거의 항상 열려 있으므로.
 */
export function directBase(key: string): string | null {
  if (!isProdHost()) return null;
  if (directOk === false) return null;
  return shardFor(key);
}

/**
 * 상대 /api/ URL 을 직결 오리진으로 변환. (낙관적 — 프로브 전이면 직결 시도)
 * onError 폴백이 있는 요소(<img>, <video>)용. 직결 불가면 상대경로(CF) 그대로.
 *   directMediaUrl("/api/thumb?path=..&t=5", filePath) → "https://u1.vibox.cloud:8443/api/thumb?..."
 */
export function directMediaUrl(relUrl: string, key: string): string {
  const base = directBase(key);
  return base ? base + relUrl : relUrl;
}

/**
 * 다운로드(네비게이션)용 — onError 폴백이 없어 프로브가 직결을 "확정(true)" 했을 때만 직결.
 * 프로브 전(null)이면 안전하게 CF. (대부분 파일 브라우징 중 프로브가 이미 끝나 있음)
 */
export function directDownloadUrl(relUrl: string, key: string): string {
  if (directOk !== true) return relUrl;
  const base = directBase(key);
  return base ? base + relUrl : relUrl;
}

/**
 * HLS 매니페스트 직결용 오리진 — 프로브가 직결을 "확정(true)" 했을 때만 반환(strict).
 * hls.js 가 크로스오리진으로 세그먼트를 받으므로, 도달 불확실(null) 단계에선 CF 로 두어
 * 재생이 멈추지 않게 한다. null 이면 호출부는 CF(상대) 매니페스트 사용.
 */
export function directStreamBase(key: string): string | null {
  if (directOk !== true) return null;
  return directBase(key);
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function getSnapshot(): boolean | null {
  return directOk;
}
function getServerSnapshot(): boolean | null {
  return null;
}

/**
 * 직결 도달성 판정값을 구독. 프로브가 막힘(false)을 확인하면 재렌더 → 호출부가 즉시 CF 로 전환.
 * 값 자체보다 "바뀌면 재렌더" 용도. 실제 URL 결정은 directBase()로.
 */
export function useDirectOk(): boolean | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
