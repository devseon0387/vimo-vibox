export type Annotation = {
  bbox: { x: number; y: number; w: number; h: number }; // 비율 (0~1)
  original: string; // 원본 텍스트 (드래그로 선택된 자막)
  suggestion: string; // 수정 제안
  note?: string; // 부가 설명 (선택)
  startMs?: number; // 자막이 처음 감지된 시각 (AI 검수용)
  endMs?: number; // 자막이 마지막으로 감지된 시각 (AI 검수용)
};

export function isValidAnnotation(v: unknown): v is Annotation {
  if (!v || typeof v !== "object") return false;
  const a = v as Record<string, unknown>;
  if (typeof a.original !== "string") return false;
  if (typeof a.suggestion !== "string") return false;
  if (a.note !== undefined && typeof a.note !== "string") return false;
  if (a.startMs !== undefined && typeof a.startMs !== "number") return false;
  if (a.endMs !== undefined && typeof a.endMs !== "number") return false;
  const b = a.bbox as Record<string, unknown> | undefined;
  if (!b || typeof b !== "object") return false;
  for (const k of ["x", "y", "w", "h"]) {
    const n = b[k];
    if (typeof n !== "number" || n < 0 || n > 1.5) return false;
  }
  return true;
}

export function serializeAnnotation(a: Annotation): string {
  return JSON.stringify({
    bbox: {
      x: +a.bbox.x.toFixed(4),
      y: +a.bbox.y.toFixed(4),
      w: +a.bbox.w.toFixed(4),
      h: +a.bbox.h.toFixed(4),
    },
    original: a.original.trim(),
    suggestion: a.suggestion.trim(),
    ...(a.note?.trim() ? { note: a.note.trim() } : {}),
    ...(typeof a.startMs === "number" ? { startMs: a.startMs } : {}),
    ...(typeof a.endMs === "number" ? { endMs: a.endMs } : {}),
  });
}

export function parseAnnotation(s: string | null | undefined): Annotation | null {
  if (!s) return null;
  try {
    const parsed = JSON.parse(s);
    if (isValidAnnotation(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}
