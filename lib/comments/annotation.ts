// 주석 데이터 모델
// - 자막 수정형 (bbox + original + suggestion): OCR 기반 자막 교정
// - 도형형 (shapes): 화살표 / 원 / 펜 드로잉 등 시각 마커
// 기존 row 호환: bbox만 있는 저장본도 유효

export type ShapeArrow = {
  kind: "arrow";
  x1: number; // 0~1
  y1: number;
  x2: number;
  y2: number;
};

export type ShapeEllipse = {
  kind: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
};

export type ShapePen = {
  kind: "pen";
  points: Array<[number, number]>; // 0~1 정규화된 좌표
};

export type Shape = ShapeArrow | ShapeEllipse | ShapePen;

export type Annotation = {
  // 자막 교정형 (legacy — 옵셔널로 완화)
  bbox?: { x: number; y: number; w: number; h: number }; // 비율 (0~1)
  original?: string;
  suggestion?: string;
  // 도형형 (신규)
  shapes?: Shape[];
  // 공통
  note?: string;
  startMs?: number;
  endMs?: number;
};

function isNorm(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= -0.5 && n <= 1.5;
}

function isValidShape(v: unknown): v is Shape {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  if (s.kind === "arrow") {
    return isNorm(s.x1) && isNorm(s.y1) && isNorm(s.x2) && isNorm(s.y2);
  }
  if (s.kind === "ellipse") {
    return (
      isNorm(s.cx) &&
      isNorm(s.cy) &&
      typeof s.rx === "number" &&
      s.rx >= 0 &&
      s.rx <= 1.5 &&
      typeof s.ry === "number" &&
      s.ry >= 0 &&
      s.ry <= 1.5
    );
  }
  if (s.kind === "pen") {
    if (!Array.isArray(s.points) || s.points.length < 2) return false;
    if (s.points.length > 2000) return false; // 과다 입력 방지
    return s.points.every(
      (p) =>
        Array.isArray(p) && p.length === 2 && isNorm(p[0]) && isNorm(p[1]),
    );
  }
  return false;
}

export function isValidAnnotation(v: unknown): v is Annotation {
  if (!v || typeof v !== "object") return false;
  const a = v as Record<string, unknown>;
  if (a.note !== undefined && typeof a.note !== "string") return false;
  if (a.startMs !== undefined && typeof a.startMs !== "number") return false;
  if (a.endMs !== undefined && typeof a.endMs !== "number") return false;

  const hasBbox = a.bbox !== undefined;
  const hasShapes = a.shapes !== undefined;
  if (!hasBbox && !hasShapes) return false;

  if (hasBbox) {
    const b = a.bbox as Record<string, unknown>;
    if (!b || typeof b !== "object") return false;
    for (const k of ["x", "y", "w", "h"]) {
      const n = b[k];
      if (typeof n !== "number" || n < 0 || n > 1.5) return false;
    }
    if (a.original !== undefined && typeof a.original !== "string") return false;
    if (a.suggestion !== undefined && typeof a.suggestion !== "string") return false;
  }

  if (hasShapes) {
    if (!Array.isArray(a.shapes)) return false;
    if (a.shapes.length === 0 || a.shapes.length > 50) return false;
    if (!a.shapes.every(isValidShape)) return false;
  }

  return true;
}

function round4(n: number) {
  return +n.toFixed(4);
}

function serializeShape(s: Shape): Shape {
  if (s.kind === "arrow") {
    return { kind: "arrow", x1: round4(s.x1), y1: round4(s.y1), x2: round4(s.x2), y2: round4(s.y2) };
  }
  if (s.kind === "ellipse") {
    return { kind: "ellipse", cx: round4(s.cx), cy: round4(s.cy), rx: round4(s.rx), ry: round4(s.ry) };
  }
  // 펜: 점 수 축약 (너무 촘촘한 점 샘플링)
  const pts = s.points.map(([x, y]) => [round4(x), round4(y)] as [number, number]);
  return { kind: "pen", points: pts };
}

export function serializeAnnotation(a: Annotation): string {
  const out: Record<string, unknown> = {};
  if (a.bbox) {
    out.bbox = {
      x: round4(a.bbox.x),
      y: round4(a.bbox.y),
      w: round4(a.bbox.w),
      h: round4(a.bbox.h),
    };
    if (typeof a.original === "string") out.original = a.original.trim();
    if (typeof a.suggestion === "string") out.suggestion = a.suggestion.trim();
  }
  if (a.shapes && a.shapes.length > 0) {
    out.shapes = a.shapes.map(serializeShape);
  }
  if (a.note?.trim()) out.note = a.note.trim();
  if (typeof a.startMs === "number") out.startMs = a.startMs;
  if (typeof a.endMs === "number") out.endMs = a.endMs;
  return JSON.stringify(out);
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

// 도형들의 경계를 포함하는 bbox 계산 (overlay 충돌/호버 계산용)
export function shapesBounds(
  shapes: Shape[],
): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of shapes) {
    if (s.kind === "arrow") {
      minX = Math.min(minX, s.x1, s.x2);
      minY = Math.min(minY, s.y1, s.y2);
      maxX = Math.max(maxX, s.x1, s.x2);
      maxY = Math.max(maxY, s.y1, s.y2);
    } else if (s.kind === "ellipse") {
      minX = Math.min(minX, s.cx - s.rx);
      minY = Math.min(minY, s.cy - s.ry);
      maxX = Math.max(maxX, s.cx + s.rx);
      maxY = Math.max(maxY, s.cy + s.ry);
    } else {
      for (const [x, y] of s.points) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
