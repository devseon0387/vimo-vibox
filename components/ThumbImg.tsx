"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ensureDirectProbe, directBase, useDirectOk } from "@/lib/media-route";

/**
 * 영상 썸네일 <img>. u1/u2 직결(:8443)로 먼저 받아 CF(LAX) 지연을 우회하고,
 * 실패하면 CF(상대경로)로, 그것도 실패하면 fallback(아이콘)을 보여준다.
 *
 *  stage 0 = 직결 시도 / 1 = CF 폴백 / 2 = 최종 실패
 *
 * - SSR 단계엔 window가 없어 직결 여부를 모름 → ready=false 동안 이미지를 안 내보낸다
 *   (서버가 CF src를 박았다가 클라가 직결로 바꾸면 hydration 불일치 + 이중 로드).
 * - useDirectOk(): 프로브가 "막힘(false)"을 확인하면 재렌더되어, 직결로 떠 있던(=멈춰 있을 수
 *   있는) 썸네일이 TCP 타임아웃을 기다리지 않고 즉시 CF(상대경로)로 전환된다.
 * - 비프로덕션·외부 8443 차단 망에서는 directBase()가 null → 곧장 CF. 기존과 동일.
 */
export function ThumbImg({
  path,
  className,
  fallback,
}: {
  path: string;
  className?: string;
  fallback: ReactNode;
}) {
  useDirectOk(); // 프로브 결과 변동 구독(재렌더 트리거)
  const [ready, setReady] = useState(false);
  const [stage, setStage] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    ensureDirectProbe();
    setReady(true);
  }, []);

  if (!ready || stage === 2) return <>{fallback}</>;

  const cf = `/api/thumb?path=${encodeURIComponent(path)}`;
  const base = directBase(path); // 직결 막힘 확인되면 null → CF
  const src = stage === 0 && base ? base + cf : cf;
  return (
    <img
      key={src}
      src={src}
      alt=""
      loading="lazy"
      className={className}
      onError={() => setStage((s) => (s === 0 ? 1 : 2))}
    />
  );
}
