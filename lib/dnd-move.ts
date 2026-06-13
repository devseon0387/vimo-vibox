import type { DragEvent } from "react";

/**
 * 비박스 내부 파일/폴더 "이동" 드래그앤드롭 공용 유틸.
 *
 * 외부 OS 파일 업로드 드래그(DropZone)와 구분하기 위해 커스텀 dataTransfer 타입을 쓴다.
 * DropZone은 types에 "Files"가 있을 때만 반응하고, 내부 드래그는 VIBOX_MOVE_TYPE만 실으므로
 * 자연히 분리된다(추가로 DropZone에서 명시적 bail 가드도 둠).
 *
 * dragover 단계에서는 보안상 dataTransfer.getData()를 못 읽으므로(타입 목록만 노출),
 * 드래그 중인 경로는 모듈 레벨 activeDrag에 보관해 드롭 타깃 유효성 검사에 쓴다.
 * (same-document 드래그라 안전)
 */

export const VIBOX_MOVE_TYPE = "application/x-vibox-move";

let activeDrag: string[] | null = null;

/** 드래그 시작 — 드래그된 항목이 다중선택에 포함되면 선택 전체, 아니면 단일 항목만 운반. */
export function startInternalDrag(
  e: DragEvent,
  draggedPath: string,
  selectedPaths?: Set<string>,
): void {
  const paths =
    selectedPaths && selectedPaths.has(draggedPath) && selectedPaths.size > 1
      ? [...selectedPaths]
      : [draggedPath];
  activeDrag = paths;
  try {
    e.dataTransfer.setData(VIBOX_MOVE_TYPE, JSON.stringify(paths));
    // 일부 브라우저는 빈 dataTransfer 드래그를 무시 → text/plain도 함께 실어 둠
    e.dataTransfer.setData("text/plain", paths.map((p) => p.split("/").pop()).join("\n"));
    e.dataTransfer.effectAllowed = "move";
  } catch {
    /* setData 실패해도 activeDrag로 동작 */
  }
}

export function endInternalDrag(): void {
  activeDrag = null;
}

/** 현재 드래그 중인 내부 경로들 (dragover에서 유효성 검사용). */
export function getActiveDrag(): string[] | null {
  return activeDrag;
}

/** 이 드래그가 내부 이동 드래그인가? (dragover/drop 둘 다에서 호출 가능 — 타입 목록만 확인) */
export function isInternalDrag(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes(VIBOX_MOVE_TYPE);
}

/** drop 단계에서만 호출 — 페이로드를 읽는다. 내부 드래그가 아니면 null. */
export function readInternalDragPaths(e: DragEvent): string[] | null {
  if (!isInternalDrag(e)) return activeDrag;
  try {
    const raw = e.dataTransfer.getData(VIBOX_MOVE_TYPE);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
      return parsed as string[];
    }
  } catch {
    /* fall through */
  }
  return activeDrag;
}

/**
 * destDir(폴더 FULL 경로 또는 "/")로 srcPaths를 옮길 수 있는가?
 * - 자기 자신/자손 폴더로 이동 금지(순환 방지)
 * - 모든 src가 이미 destDir 직속이면(순수 no-op) false → 하이라이트/드롭 안 함
 */
export function isValidDropTarget(srcPaths: string[], destDir: string): boolean {
  if (srcPaths.length === 0) return false;
  for (const src of srcPaths) {
    if (destDir === src || destDir.startsWith(src + "/")) return false;
  }
  const allInDest = srcPaths.every((src) => {
    const parent = src.split("/").slice(0, -1).join("/") || "/";
    return parent === destDir;
  });
  if (allInDest) return false;
  return true;
}

/**
 * srcPaths를 destDir로 이동. 항목별 PATCH(이름충돌·부분실패 가능).
 * 이미 destDir에 있는 항목은 skip.
 */
export async function movePathsTo(
  srcPaths: string[],
  destDir: string,
  apiBase = "/api/files",
): Promise<{ success: number; failed: number; skipped: number }> {
  let success = 0;
  let failed = 0;
  let skipped = 0;
  for (const src of srcPaths) {
    const name = src.split("/").pop()!;
    const to = (destDir === "/" ? "" : destDir) + "/" + name;
    if (to === src) {
      skipped++;
      continue;
    }
    try {
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: src, to }),
      });
      if (res.ok) success++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { success, failed, skipped };
}
